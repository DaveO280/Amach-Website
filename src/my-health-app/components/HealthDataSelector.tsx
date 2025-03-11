"use client";

import React, { useEffect } from "react";
import { coreMetrics, timeFrameOptions } from "../core/metricDefinitions";
import {
  XMLStreamParser,
  validateHealthExportFile,
} from "../core/parsers/XMLStreamParser";
import { useHealthData } from "../store/healthDataStore";
import { useSelection } from "../store/selectionStore";
import { HealthDataPoint, TimeFrame } from "../types/healthData";
import {
  deduplicateData,
  isDeduplicatableMetric,
} from "../utils/dataDeduplicator";
import { generateAndDownloadCSV } from "../utils/exportUtils";

const HealthDataSelector = (): React.ReactElement => {
  // Use the selection store for user selections
  const {
    timeFrame,
    setTimeFrame,
    selectedMetrics,
    toggleMetric,
    getAllSelectedMetrics,
    uploadedFile,
    setUploadedFile,
  } = useSelection();

  // Use the health data store for processing state and data
  const {
    processingState,
    setProcessingState,
    updateProcessingProgress,
    setProcessingError,
    addMetricData,
  } = useHealthData();

  // Add debugging effect to log selections
  useEffect(() => {
    console.log("Current selections:", {
      timeFrame,
      selectedMetricsCount: selectedMetrics.length,
      selectedMetricsList: selectedMetrics,
      hasUploadedFile: uploadedFile !== null,
    });
  }, [timeFrame, selectedMetrics, uploadedFile]);

  const handleFileSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const file = event.target.files?.[0];
    if (!file) {
      setProcessingError("No file selected");
      setUploadedFile(null);
      return;
    }

    console.log("File selected:", file.name, file.type, file.size);

    // Check if it looks like a health export
    if (!validateHealthExportFile(file)) {
      setProcessingError(
        "Please select the export.xml file from your Apple Health Export",
      );
      setUploadedFile(null);
      return;
    }

    setUploadedFile(file);
    setProcessingState({
      isProcessing: false,
      progress: 0,
      status: `File selected: ${file.name}`,
      error: null,
    });
  };

  const handleProcess = async (): Promise<void> => {
    if (!uploadedFile) {
      setProcessingError("Please select a file first");
      return;
    }

    // Check if any metrics are selected
    const selected = getAllSelectedMetrics();
    console.log("Starting processing with metrics:", selected);

    if (selected.length === 0) {
      setProcessingError("Please select at least one metric to process");
      return;
    }

    setProcessingState({
      isProcessing: true,
      progress: 0,
      status: "Starting file processing...",
      error: null,
    });

    try {
      const selectedMetrics = getAllSelectedMetrics();

      // Metrics we want to specifically track
      const debugMetrics = [
        "HKQuantityTypeIdentifierStepCount",
        "HKQuantityTypeIdentifierActiveEnergyBurned",
        "HKQuantityTypeIdentifierAppleExerciseTime",
        "HKCategoryTypeIdentifierSleepAnalysis",
      ];

      // Create parser with selected options
      const parser = new XMLStreamParser({
        selectedMetrics,
        timeFrame,
        onProgress: (progress) => {
          updateProcessingProgress(
            progress.progress,
            `Processing: ${progress.progress}% complete (${progress.recordCount} records)`,
          );

          // Log progress to console for debugging
          if (progress.recordCount % 1000 === 0 || progress.progress >= 100) {
            console.log(`Processed ${progress.recordCount} records...`);
            console.log("Current metrics found:", progress.metricCounts);
          }
        },
      });

      // Parse the file
      console.log("Beginning file parse...");
      const results = await parser.parseFile(uploadedFile);

      // Log raw results for tracked metrics
      console.log("Parse complete. Results for tracked metrics:");
      for (const metric of debugMetrics) {
        if (results[metric]) {
          console.log(
            `[DEBUG] Before deduplication - ${metric}: ${results[metric].length} records`,
          );
          if (results[metric].length > 0) {
            console.log(
              `[DEBUG] Sample record for ${metric}:`,
              results[metric][0],
            );
          }
        } else {
          console.log(`[DEBUG] No data found for ${metric}`);
        }
      }

      console.log(
        "Parse complete. Results:",
        Object.keys(results).map(
          (key) => `${key}: ${results[key]?.length || 0} records`,
        ),
      );

      // Apply deduplication to applicable metrics
      for (const [metric, dataArray] of Object.entries(results)) {
        // Add proper type assertion for the data array
        const typedDataArray = dataArray as HealthDataPoint[];

        if (
          isDeduplicatableMetric(metric) &&
          typedDataArray &&
          typedDataArray.length > 0
        ) {
          console.log(
            `Found ${metric} data with ${typedDataArray.length} records, applying deduplication...`,
          );

          // Store original count for tracked metrics
          if (debugMetrics.includes(metric)) {
            console.log(
              `[DEBUG] ${metric} before deduplication: ${typedDataArray.length} records`,
            );
          }

          results[metric] = deduplicateData(typedDataArray, metric);

          // Log after deduplication for tracked metrics
          if (debugMetrics.includes(metric)) {
            console.log(
              `[DEBUG] ${metric} after deduplication: ${results[metric].length} records`,
            );
            if (results[metric].length > 0) {
              console.log(
                `[DEBUG] Sample deduplicated record for ${metric}:`,
                results[metric][0],
              );
            } else {
              console.log(
                `[DEBUG] WARNING: All ${metric} records were removed during deduplication!`,
              );
            }
          }

          console.log(`After deduplication: ${results[metric].length} records`);

          // Update processing status to inform user
          updateProcessingProgress(
            processingState.progress,
            `Deduplicated ${metric} data: ${results[metric].length} records`,
          );
        }
      }

      // Generate CSVs for each metric with data
      let processedFiles = 0;
      for (const [metric, dataArray] of Object.entries(results)) {
        // Add proper type assertion for the data array
        const typedDataArray = dataArray as HealthDataPoint[];

        // Debug for tracked metrics before adding to store
        if (debugMetrics.includes(metric)) {
          console.log(
            `[DEBUG] Adding ${metric} to store with ${typedDataArray?.length || 0} records`,
          );
        }

        console.log(
          `Processing metric ${metric} with ${typedDataArray?.length || 0} records`,
        );
        if (typedDataArray && typedDataArray.length > 0) {
          // Add data to store
          addMetricData(metric, typedDataArray);

          // Generate and download CSV
          try {
            console.log(`Generating CSV for ${metric}`);
            await generateAndDownloadCSV(metric, typedDataArray);
            processedFiles++;
            console.log(`CSV generated for ${metric}`);
          } catch (csvError) {
            console.error(`Error generating CSV for ${metric}:`, csvError);
          }
        } else {
          console.log(`No data found for metric ${metric}`);
        }
      }

      console.log(`Processing complete. Generated ${processedFiles} files.`);
      setProcessingState({
        isProcessing: false,
        progress: 100,
        status: `Processing complete! Generated ${processedFiles} files. Check your downloads folder.`,
        error: null,
      });
    } catch (error) {
      console.error("Processing error:", error);
      setProcessingError(
        error instanceof Error ? error.message : "An unknown error occurred",
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

        {/* Time Frame Selection - UPDATED FOR MOBILE */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4 text-emerald-700">
            Select Time Frame
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {timeFrameOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setTimeFrame(option.value as TimeFrame)}
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

        {/* Core Metrics Section - UPDATED FOR MOBILE */}
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
                onClick={() => toggleMetric(metric.id)}
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

        {/* Upload Section */}
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
            />

            <button
              onClick={handleProcess}
              disabled={
                processingState.isProcessing ||
                !uploadedFile ||
                selectedMetrics.length === 0
              }
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-lg transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processingState.isProcessing
                ? "Processing..."
                : "Process Selected Data"}
            </button>

            {/* Display selected metrics count */}
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
