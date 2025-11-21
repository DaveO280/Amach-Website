"use client";

import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import {
  useClearHealthDataMutation,
  useSaveHealthDataMutation,
} from "@/data/hooks/useHealthDataMutations";
import { deduplicateData } from "@/utils/dataDeduplicator";
import Papa from "papaparse";
import React from "react";
import { coreMetrics, timeFrameOptions } from "../core/metricDefinitions";
import {
  validateHealthExportFile,
  XMLStreamParser,
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
  VO2MaxMetric,
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

  const handleFileSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const file = event.target.files?.[0];
    if (!file) {
      setProcessingError("No file selected");
      setUploadedFile(null);
      return;
    }

    // Check if it's a CSV file
    const isCSV =
      file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";

    // If not CSV, validate as XML
    if (!isCSV && !validateHealthExportFile(file)) {
      setProcessingError("Please select a valid export.xml or .csv file");
      setUploadedFile(null);
      return;
    }

    setUploadedFile(file);
    updateProcessingProgress(0, `File selected: ${file.name}`);
  };

  const convertToSleepStage = (rawValue: string): SleepStage => {
    // Map Apple Health sleep stage values to our internal format
    const sleepStageMap: Record<string, SleepStage> = {
      HKCategoryValueSleepAnalysisInBed: "inBed",
      HKCategoryValueSleepAnalysisAsleepCore: "core",
      HKCategoryValueSleepAnalysisAsleepDeep: "deep",
      HKCategoryValueSleepAnalysisAsleepREM: "rem",
      HKCategoryValueSleepAnalysisAwake: "awake",
      HKCategoryValueSleepAnalysisAsleepUnspecified: "core", // Unspecified sleep maps to core
      HKCategoryValueSleepAnalysisAsleep: "core", // Generic asleep maps to core
      // Handle short format values
      inBed: "inBed",
      core: "core",
      deep: "deep",
      rem: "rem",
      awake: "awake",
      asleep: "core",
      unspecified: "core",
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
      return "core"; // Default to core for unknown sleep values
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

  // Parse CSV file and convert to health data structure
  // Normalize date string to iOS-compatible ISO 8601 format
  const normalizeDate = (dateStr: string): string => {
    // iOS Safari is strict about date formats
    // Convert "2025-08-17 17:38:00 -0400" to "2025-08-17T17:38:00-04:00"
    try {
      let normalized = dateStr;

      // Replace first space with T (date and time separator)
      normalized = normalized.replace(" ", "T");

      // Fix timezone format: " -0400" -> "-04:00"
      // Handle space before timezone and add colon
      normalized = normalized.replace(/ ([+-])(\d{2})(\d{2})$/, "$1$2:$3");

      // Test if it parses correctly
      const testDate = new Date(normalized);
      if (!isNaN(testDate.getTime())) {
        return normalized;
      }

      // If that didn't work, return original
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const parseCSVFile = async (
    file: File,
  ): Promise<Partial<Record<MetricType, HealthMetric[]>>> => {
    return new Promise((resolve, reject) => {
      const healthDataResults: Partial<Record<MetricType, HealthMetric[]>> = {};
      let rowCount = 0;
      let lastProgressUpdate = Date.now();
      const uniqueMetrics = new Set<string>();

      Papa.parse<{
        Date?: string;
        "Start Date"?: string;
        "End Date"?: string;
        Metric?: string;
        Value?: string;
        Unit?: string;
        Source?: string;
        Device?: string;
      }>(file, {
        header: true,
        skipEmptyLines: true,
        step: (row) => {
          try {
            rowCount++;

            // Update progress every 1000 rows or every 500ms
            const now = Date.now();
            if (rowCount % 1000 === 0 || now - lastProgressUpdate > 500) {
              const progress = 25 + Math.min(50, (rowCount / 10000) * 50); // Progress from 25% to 75%
              updateProcessingProgress(
                Math.round(progress),
                `Loading CSV data... (${rowCount.toLocaleString()} rows processed)`,
              );
              lastProgressUpdate = now;
            }

            const data = row.data as {
              Date?: string;
              "Start Date"?: string;
              "End Date"?: string;
              Metric?: string;
              Value?: string;
              Unit?: string;
              Source?: string;
              Device?: string;
            };

            const metricType = data.Metric?.trim() as MetricType;
            // Support both old format (Date) and new format (Start Date/End Date)
            const startDateStr = (data["Start Date"] || data.Date)?.trim();
            const endDateStr = (data["End Date"] || data.Date)?.trim();
            const valueStr = data.Value?.trim();
            const unit = data.Unit?.trim() || "";
            const source = (data.Source?.trim() || "CSV Import") as DataSource;
            const device = data.Device?.trim() || "";

            if (!metricType || !startDateStr || !valueStr) return;

            // Normalize dates for iOS compatibility
            const normalizedStartDate = normalizeDate(startDateStr);
            const normalizedEndDate = normalizeDate(endDateStr || startDateStr);

            // Debug: Log first normalized date to verify iOS compatibility
            if (rowCount === 1) {
              console.log("📅 [Date Debug] Normalization example:", {
                original: startDateStr,
                normalized: normalizedStartDate,
                parsedOk: !isNaN(new Date(normalizedStartDate).getTime()),
              });
            }

            // Track unique metric types
            uniqueMetrics.add(metricType);

            // Initialize array for this metric type if not exists
            if (!healthDataResults[metricType]) {
              healthDataResults[metricType] = [];
            }

            const baseMetric = {
              type: metricType,
              startDate: normalizedStartDate,
              endDate: normalizedEndDate,
              value: valueStr,
              source,
              device,
            };

            // Parse value based on metric type
            let metric: HealthMetric;

            switch (metricType) {
              case "HKQuantityTypeIdentifierStepCount":
                metric = {
                  ...baseMetric,
                  unit: "count",
                } as StepCountMetric;
                break;
              case "HKQuantityTypeIdentifierHeartRate":
                metric = {
                  ...baseMetric,
                  unit: "bpm",
                } as HeartRateMetric;
                break;
              case "HKQuantityTypeIdentifierHeartRateVariabilitySDNN":
                metric = {
                  ...baseMetric,
                  unit: "ms",
                } as HRVMetric;
                break;
              case "HKQuantityTypeIdentifierRespiratoryRate":
                metric = {
                  ...baseMetric,
                  unit: "count/min",
                } as RespiratoryRateMetric;
                break;
              case "HKQuantityTypeIdentifierAppleExerciseTime":
                metric = {
                  ...baseMetric,
                  unit: "min",
                } as ExerciseTimeMetric;
                break;
              case "HKQuantityTypeIdentifierRestingHeartRate":
                metric = {
                  ...baseMetric,
                  unit: "bpm",
                } as RestingHeartRateMetric;
                break;
              case "HKQuantityTypeIdentifierVO2Max":
                metric = {
                  ...baseMetric,
                  unit: "ml/(kg*min)",
                } as VO2MaxMetric;
                break;
              case "HKQuantityTypeIdentifierActiveEnergyBurned":
                metric = {
                  ...baseMetric,
                  unit: "kcal",
                } as ActiveEnergyMetric;
                break;
              case "HKCategoryTypeIdentifierSleepAnalysis":
                metric = {
                  ...baseMetric,
                  value: convertToSleepStage(valueStr),
                  unit: "hr",
                } as SleepAnalysisMetric;
                break;
              default:
                metric = {
                  ...baseMetric,
                  unit,
                } as HealthMetric;
            }

            healthDataResults[metricType]!.push(metric);
          } catch (error) {
            console.error("Error processing CSV row:", error);
          }
        },
        complete: () => {
          updateProcessingProgress(
            75,
            `CSV loaded successfully (${rowCount.toLocaleString()} rows)`,
          );

          // Debug: Log what we found in the CSV
          console.log("📊 [CSV Debug] Parsing complete:");
          console.log(`   - Total rows processed: ${rowCount}`);
          console.log(
            `   - Unique metrics found:`,
            Array.from(uniqueMetrics).sort(),
          );
          console.log(
            `   - Metrics with data:`,
            Object.keys(healthDataResults).sort(),
          );
          Object.entries(healthDataResults).forEach(([metric, data]) => {
            console.log(`   - ${metric}: ${data.length} records`);
            if (data.length > 0) {
              console.log(`     Sample:`, data[0]);
            }
          });

          resolve(healthDataResults);
        },
        error: (error) => {
          reject(new Error(`CSV parse error: ${error.message}`));
        },
      });
    });
  };

  const handleProcess = async (): Promise<void> => {
    if (!uploadedFile || selectedMetrics.length === 0) return;

    updateProcessingProgress(0, "Starting file processing...");

    try {
      const selectedMetrics = getAllSelectedMetrics();
      const isCSV =
        uploadedFile.name.toLowerCase().endsWith(".csv") ||
        uploadedFile.type === "text/csv";

      let healthDataResults: Partial<Record<MetricType, HealthMetric[]>> = {};

      if (isCSV) {
        // Parse CSV file
        updateProcessingProgress(25, "Reading CSV file...");
        healthDataResults = await parseCSVFile(uploadedFile);
      } else {
        // Parse XML file
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

        for (const [metricType, dataPoints] of Object.entries(results)) {
          const metricTypeKey = metricType as MetricType;
          const source = (dataPoints[0]?.source ||
            "Apple Health") as DataSource;

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
              case "HKQuantityTypeIdentifierVO2Max":
                return {
                  ...baseMetric,
                  unit: "ml/(kg*min)",
                } as VO2MaxMetric;
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
      }

      // Debug: Log what we're about to save
      console.log("💾 [Save Debug] About to save health data:");
      console.log(`   - Metrics to save:`, Object.keys(healthDataResults));
      console.log(
        `   - Total records:`,
        Object.values(healthDataResults).reduce(
          (sum, arr) => sum + arr.length,
          0,
        ),
      );

      saveHealthData(healthDataResults as Record<MetricType, HealthMetric[]>);

      console.log("✅ [Save Debug] saveHealthData called successfully");

      // Only export CSV on desktop (not mobile) to avoid interrupting the app
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (!isMobile && !isCSV) {
        // Convert to CSV format (only for XML uploads on desktop)
        const headers = [
          "Start Date",
          "End Date",
          "Metric",
          "Value",
          "Unit",
          "Source",
          "Device",
        ];
        const rows = Object.entries(healthDataResults).flatMap(
          ([metricType, metrics]) => {
            return metrics.map((metric) => [
              metric.startDate,
              metric.endDate,
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
              .map((field) => {
                const fieldStr = String(field);
                return fieldStr.includes(",") ||
                  fieldStr.includes('"') ||
                  fieldStr.includes("\n")
                  ? `"${fieldStr.replace(/"/g, '""')}"`
                  : fieldStr;
              })
              .join(","),
          ),
        ].join("\n");

        // Create and download CSV file
        const blob = new Blob([csvContent], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `HealthData(${new Date().toISOString().split("T")[0]}).csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      updateProcessingProgress(
        100,
        isCSV
          ? "CSV imported successfully!"
          : isMobile
            ? "Data imported successfully!"
            : "Processing complete - CSV exported",
      );
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
          <p className="text-sm text-gray-600 mb-3">
            Upload your Apple Health export.xml file or a previously exported
            CSV file
          </p>

          {/* Warning for XML files */}
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="text-sm">
                <p className="font-semibold text-amber-800 mb-1">
                  File Type Guide:
                </p>
                <ul className="text-amber-700 space-y-1">
                  <li>
                    <strong>XML files:</strong> Must be processed on desktop.
                    Large files may crash mobile browsers.
                  </li>
                  <li>
                    <strong>CSV files:</strong> Fast and mobile-friendly. Upload
                    CSVs exported from this app (includes start/end dates for
                    sleep).
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <input
              type="file"
              accept=".xml,.csv"
              onChange={handleFileSelect}
              disabled={processingState.isProcessing}
              className="file-input w-full p-2 border border-amber-100 rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Dynamic warning for XML files on mobile */}
            {uploadedFile &&
              !uploadedFile.name.toLowerCase().endsWith(".csv") && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg
                      className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="text-sm text-red-700">
                      <p className="font-semibold mb-1">⚠️ XML File Detected</p>
                      <p>
                        Processing large XML files is resource-intensive and may
                        cause performance issues or crashes on mobile devices.
                        For best results, process XML files on a desktop
                        computer, then upload the exported CSV on mobile.
                      </p>
                    </div>
                  </div>
                </div>
              )}

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
