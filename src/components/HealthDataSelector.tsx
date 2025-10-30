"use client";

import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import {
  useClearHealthDataMutation,
  useSaveHealthDataMutation,
} from "@/data/hooks/useHealthDataMutations";
import { deduplicateData } from "@/utils/dataDeduplicator";
import React from "react";
import { coreMetrics, timeFrameOptions } from "../core/metricDefinitions";
import {
  validateHealthExportFile,
  XMLStreamParser,
  preScanHealthExport,
} from "../data/parsers/XMLStreamParser";
import {
  ActiveEnergyMetric,
  DataSource,
  ExerciseTimeMetric,
  HealthMetric,
  HeartRateMetric,
  HRVMetric,
  MetricType,
  RespiratoryRateMetric,
  RestingHeartRateMetric,
  SleepAnalysisMetric,
  SleepStage,
  StepCountMetric,
} from "../data/types/healthMetrics";
import { useSelection } from "../store/selectionStore";
import { TimeFrame } from "../types/healthData";

const HealthDataSelector: () => React.ReactElement = () => {
  const {
    timeFrame,
    setTimeFrame,
    selectedMetrics,
    toggleMetric,
    getAllSelectedMetrics,
    uploadedFile,
    setUploadedFile,
  } = useSelection();

  const {
    processingState,
    updateProcessingProgress,
    setProcessingError,
    clearData,
    hasData,
  } = useHealthDataContext();

  const { mutate: saveHealthData } = useSaveHealthDataMutation();
  const { mutate: clearHealthDataMutation } = useClearHealthDataMutation();

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      setProcessingError("No file selected");
      setUploadedFile(null);
      return;
    }

    if (!validateHealthExportFile(file)) {
      setProcessingError(
        "Please select the export.xml file from your Apple Health Export",
      );
      setUploadedFile(null);
      return;
    }

    // Quick pre-scan for better UX on mobile (detect CDA/ZIP/empty records)
    try {
      const scan = await preScanHealthExport(file);
      if (scan.isZip) {
        setProcessingError(
          "This appears to be a zipped export. Please extract and select export.xml",
        );
        setUploadedFile(null);
        return;
      }
      if (scan.isCDA) {
        setProcessingError(
          "This looks like export_cda.xml (clinical document). Please select export.xml",
        );
        setUploadedFile(null);
        return;
      }
      if (!scan.hasHealthDataTag || scan.recordCountEstimate === 0) {
        setProcessingError(
          "No <Record> entries found. Confirm this is export.xml from Apple Health",
        );
        setUploadedFile(null);
        return;
      }
      setUploadedFile(file);
      updateProcessingProgress(
        0,
        `File selected: ${file.name} · ~${scan.recordCountEstimate} records · sample types: ${scan.sampleTypes.join(", ")}`,
      );
    } catch (e) {
      // If pre-scan fails, still allow selection but warn
      console.warn("Pre-scan failed", e);
      setUploadedFile(file);
      updateProcessingProgress(0, `File selected: ${file.name}`);
    }
  };

  const convertToSleepStage = (rawValue: string): SleepStage => {
    // Map Apple Health sleep stage values to our internal format
    const sleepStageMap: Record<string, SleepStage> = {
      HKCategoryValueSleepAnalysisInBed: "inBed",
      HKCategoryValueSleepAnalysisAsleepCore: "core",
      HKCategoryValueSleepAnalysisAsleepDeep: "deep",
      HKCategoryValueSleepAnalysisAsleepREM: "rem",
      HKCategoryValueSleepAnalysisAwake: "awake",
      // Handle short format values
      inBed: "inBed",
      core: "core",
      deep: "deep",
      rem: "rem",
      awake: "awake",
      // Handle numeric values
      "0": "inBed",
      "1": "core",
      "2": "deep",
      "3": "rem",
      "4": "awake",
    };

    const stage = sleepStageMap[rawValue];
    if (!stage) {
      console.warn(`Unknown sleep stage value: ${rawValue}`);
      return "inBed"; // Default to inBed for unknown values
    }
    return stage;
  };

  const handleClearData = (): void => {
    updateProcessingProgress(0, "Clearing data...");
    clearHealthDataMutation(undefined, {
      onSuccess: () => {
        clearData();
        setUploadedFile(null);
        updateProcessingProgress(100, "Data cleared successfully");
      },
      onError: (error: unknown) => {
        if (error && typeof error === "object" && "message" in error) {
          setProcessingError(
            (error as { message?: string }).message || "Error clearing data",
          );
        } else {
          setProcessingError("Error clearing data");
        }
      },
    });
  };

  const handleProcess = async (): Promise<void> => {
    if (!uploadedFile || selectedMetrics.length === 0) return;

    updateProcessingProgress(0, "Starting file processing...");

    try {
      const selectedMetrics = getAllSelectedMetrics();
      const parser = new XMLStreamParser({
        selectedMetrics,
        timeFrame,
        onProgress: (progress): void => {
          updateProcessingProgress(
            progress.progress,
            `Processing: ${progress.progress}% complete (${progress.recordCount} records)`,
          );
        },
      });

      const results = await parser.parseFile(uploadedFile);
      const healthDataResults: Partial<Record<MetricType, HealthMetric[]>> = {};

      for (const [metricType, dataPoints] of Object.entries(results)) {
        const metricTypeKey = metricType as MetricType;
        const source = (dataPoints[0]?.source || "Apple Health") as DataSource;

        // Apply proper deduplication for each metric type
        const processedPoints = deduplicateData(dataPoints, metricTypeKey);

        const metrics = processedPoints.map((point) => {
          const baseMetric = {
            type: metricTypeKey,
            startDate: point.startDate,
            endDate: point.endDate,
            value: point.value,
            source,
            device: point.device,
          };

          switch (metricTypeKey) {
            case "HKQuantityTypeIdentifierStepCount":
              return { ...baseMetric, unit: "count" } as StepCountMetric;
            case "HKQuantityTypeIdentifierHeartRate":
              return { ...baseMetric, unit: "bpm" } as HeartRateMetric;
            case "HKQuantityTypeIdentifierHeartRateVariabilitySDNN":
              return { ...baseMetric, unit: "ms" } as HRVMetric;
            case "HKQuantityTypeIdentifierRespiratoryRate":
              return {
                ...baseMetric,
                unit: "count/min",
              } as RespiratoryRateMetric;
            case "HKQuantityTypeIdentifierAppleExerciseTime":
              return { ...baseMetric, unit: "min" } as ExerciseTimeMetric;
            case "HKQuantityTypeIdentifierRestingHeartRate":
              return { ...baseMetric, unit: "bpm" } as RestingHeartRateMetric;
            case "HKQuantityTypeIdentifierActiveEnergyBurned":
              return { ...baseMetric, unit: "kcal" } as ActiveEnergyMetric;
            case "HKCategoryTypeIdentifierSleepAnalysis":
              return {
                ...baseMetric,
                value: convertToSleepStage(point.value),
                unit: "hr",
              } as SleepAnalysisMetric;
            default:
              return { ...baseMetric, unit: "count" } as HealthMetric;
          }
        });

        healthDataResults[metricTypeKey] = metrics;
      }

      saveHealthData(healthDataResults as Record<MetricType, HealthMetric[]>);

      // Convert to CSV format
      const headers = ["Date", "Metric", "Value", "Unit", "Source", "Device"];
      const rows = Object.entries(healthDataResults).flatMap(
        ([metricType, metrics]) => {
          return metrics.map((metric) => [
            metric.startDate,
            metricType,
            metric.value,
            metric.unit || "",
            metric.source || "",
            metric.device || "",
          ]);
        },
      );

      const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
          row
            .map((field) =>
              field.includes(",") || field.includes('"') || field.includes("\n")
                ? `"${String(field).replace(/"/g, '""')}"`
                : field,
            )
            .join(","),
        ),
      ].join("\n");

      // Create and download CSV file
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `HealthData(${new Date().toISOString().split("T")[0]}).csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      updateProcessingProgress(100, "Processing complete");
    } catch (error) {
      setProcessingError(
        error instanceof Error ? error.message : "Error processing file",
      );
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="border-none shadow-lg bg-transparent p-6">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-emerald-900">
            Health Data Selector
          </h2>
        </div>

        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4 text-emerald-700">
            Select Time Frame
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {timeFrameOptions.map((option) => (
              <button
                key={option.value}
                onClick={(e) => {
                  e.stopPropagation();
                  setTimeFrame(option.value as TimeFrame);
                }}
                className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                  timeFrame === option.value
                    ? "bg-[#006B4F] text-white border-b-2 border-[#005540]"
                    : "bg-white/80 text-[#006B4F] hover:bg-[#E8F5F0]/30 border border-[#006B4F]/30"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-emerald-700">
              Health Metrics
            </h3>
            <span className="text-sm text-amber-800/80">
              (
              {
                selectedMetrics.filter((id) =>
                  coreMetrics.some((m) => m.id === id),
                ).length
              }
              /{coreMetrics.length} selected)
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {coreMetrics.map((metric) => (
              <button
                key={metric.id}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMetric(metric.id);
                }}
                disabled={processingState.isProcessing}
                className={`p-3 rounded-lg text-sm transition-colors ${
                  selectedMetrics.includes(metric.id)
                    ? "bg-[#006B4F] text-white border-b-2 border-[#005540]"
                    : "bg-white/80 text-[#006B4F] hover:bg-[#E8F5F0]/30 border border-[#006B4F]/30"
                }`}
              >
                {metric.name}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-amber-50/20 pt-6">
          <h3 className="text-xl font-semibold mb-4 text-emerald-700">
            Upload Health Export
          </h3>
          <div className="space-y-4">
            <input
              type="file"
              accept=".xml"
              onChange={handleFileSelect}
              disabled={processingState.isProcessing}
              className="file-input w-full p-2 border border-amber-100 rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />

            <div className="flex gap-4">
              <button
                onClick={handleProcess}
                disabled={
                  processingState.isProcessing ||
                  !uploadedFile ||
                  selectedMetrics.length === 0
                }
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-lg transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingState.isProcessing
                  ? "Processing..."
                  : "Process Selected Data"}
              </button>

              <button
                onClick={handleClearData}
                disabled={processingState.isProcessing || !hasData()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear All Data
              </button>
            </div>

            <div className="mt-2 text-center text-sm text-gray-600">
              {selectedMetrics.length === 0 ? (
                <span className="text-red-500">
                  Please select at least one metric to process
                </span>
              ) : (
                <span>
                  Processing {selectedMetrics.length} selected metric(s)
                </span>
              )}
            </div>

            {processingState.status && (
              <div className="p-3 rounded-lg text-sm bg-emerald-50 text-emerald-800">
                {processingState.status}
              </div>
            )}

            {processingState.isProcessing && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-300 bg-emerald-600"
                  style={{
                    width: `${processingState.progress}%`,
                  }}
                />
              </div>
            )}

            {processingState.error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center">
                  <svg
                    className="w-5 h-5 text-red-600 mr-2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-red-700">{processingState.error}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HealthDataSelector;
