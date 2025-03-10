import { HealthDataPoint } from "../types/healthData";
import { processSleepData } from "./sleepDataProcessor";

/**
 * List of metrics that should be deduplicated based on date and value
 */
const DEDUPLICATABLE_METRICS = new Set([
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierAppleExerciseTime",
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKCategoryTypeIdentifierSleepAnalysis",
]);

// Define which metrics are cumulative
const CUMULATIVE_METRICS = [
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierAppleExerciseTime", // Added this line
];

// Define debug metrics
const DEBUG_METRICS = [
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierAppleExerciseTime",
  "HKCategoryTypeIdentifierSleepAnalysis",
];

/**
 * Extracts just the date part (YYYY-MM-DD) from a date string
 */
export const extractDatePart = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch (e) {
    console.warn("Date parsing error:", e);
    const parts = dateStr.split(/[\s-/:T]/);
    if (parts.length >= 3) {
      let year, month, day;
      if (parts[0].length === 4) {
        [year, month, day] = parts;
      } else {
        [month, day, year] = parts;
      }
      month = month.padStart(2, "0");
      day = day.padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    if (dateStr.includes("-") && dateStr.length >= 10) {
      return dateStr.substring(0, 10);
    }
    console.error("Could not parse date:", dateStr);
    return "unknown-date";
  }
};

/**
 * Extract the hour from a date string
 */
export const extractHour = (dateStr: string): number => {
  try {
    const date = new Date(dateStr);
    return date.getHours();
  } catch (e) {
    console.warn("Error extracting hour from date:", dateStr);
    return 0;
  }
};

/**
 * Determines if a record is from a watch based on device or source name
 */
export const isWatchData = (record: HealthDataPoint): boolean => {
  const deviceInfo = record.device || "";
  const sourceInfo = record.source || "";
  return (
    deviceInfo.toLowerCase().includes("watch") ||
    sourceInfo.toLowerCase().includes("watch")
  );
};

/**
 * Checks if a metric should be deduplicated
 */
export function isDeduplicatableMetric(metricId: string): boolean {
  return DEDUPLICATABLE_METRICS.has(metricId);
}

/**
 * Check if the metric is sleep data that needs special processing
 */
export const isSleepData = (metricId: string): boolean => {
  return metricId === "HKCategoryTypeIdentifierSleepAnalysis";
};

/**
 * Check if the metric is a cumulative metric that should sum values
 */
export const isCumulativeMetric = (metricId: string): boolean => {
  return CUMULATIVE_METRICS.includes(metricId);
};

/**
 * Deduplicates cumulative metrics (steps, energy, distance, etc.)
 * by segmenting into hourly time blocks and prioritizing watch data.
 *
 * @param data The health data points to deduplicate
 * @param metricId The metric ID to determine if it's cumulative
 * @returns Deduplicated health data points
 */
export const deduplicateCumulativeData = (
  data: HealthDataPoint[],
  metricId: string = "",
): HealthDataPoint[] => {
  const isDebugMetric = DEBUG_METRICS.includes(metricId);
  const shouldSum = isCumulativeMetric(metricId);

  if (isDebugMetric) {
    console.log(
      `[DEBUG] deduplicateCumulativeData called with ${data.length} records for ${metricId}` +
        `${shouldSum ? " (cumulative metric - will sum values)" : ""}`,
    );
  }

  // Group data by day and hour
  const timeBlocks: Record<
    string,
    {
      watch: HealthDataPoint[];
      phone: HealthDataPoint[];
    }
  > = {};

  // Process each record
  data.forEach((record) => {
    try {
      // Skip records with missing or invalid date or value
      if (!record.startDate) {
        if (isDebugMetric) {
          console.log(`[DEBUG] Skipping record with no startDate:`, record);
        }
        return;
      }

      const dateStr = record.startDate;
      if (record.value === undefined || record.value === null) {
        if (isDebugMetric) {
          console.log(`[DEBUG] Skipping record with no value:`, record);
        }
        return;
      }

      // Extract the date part consistently
      const dateOnly = extractDatePart(dateStr);

      // Extract hour
      const hour = extractHour(dateStr);

      // Create a key that combines date and hour
      const blockKey = `${dateOnly}-${hour}`;

      // Create the time block entry if it doesn't exist
      if (!timeBlocks[blockKey]) {
        timeBlocks[blockKey] = {
          watch: [],
          phone: [],
        };
      }

      // Add to the appropriate device category
      if (isWatchData(record)) {
        timeBlocks[blockKey].watch.push(record);
      } else {
        timeBlocks[blockKey].phone.push(record);
      }
    } catch (err) {
      console.error("Error processing record:", err);
    }
  });

  // Select the preferred data source for each time block
  const dedupedRecords: HealthDataPoint[] = [];

  // Process each time block
  Object.entries(timeBlocks).forEach(([blockKey, blockData]) => {
    // Decide whether to use watch or phone data
    const sourceData =
      blockData.watch.length > 0 ? blockData.watch : blockData.phone;

    if (sourceData.length > 0) {
      if (shouldSum) {
        // For cumulative metrics, sum the values
        let totalValue = 0;
        sourceData.forEach((record) => {
          const value = parseFloat(record.value);
          if (!isNaN(value)) {
            totalValue += value;
          }
        });

        // Use the last record as a template
        const template = sourceData[sourceData.length - 1];
        // Create a new record with the summed value
        const newRecord = {
          ...template,
          value: totalValue.toString(),
        };
        dedupedRecords.push(newRecord);
      } else {
        // For non-cumulative metrics, use the most recent record
        const latestRecord = sourceData.reduce((latest, current) => {
          if (!latest) return current;
          return new Date(current.startDate) > new Date(latest.startDate)
            ? current
            : latest;
        });
        dedupedRecords.push(latestRecord);
      }
    }
  });

  if (isDebugMetric) {
    console.log(
      `[DEBUG] deduplicateCumulativeData reduced ${data.length} records to ${dedupedRecords.length} deduplicated records`,
    );
    if (dedupedRecords.length === 0 && data.length > 0) {
      console.log(
        `[DEBUG] WARNING: All records were removed during deduplication!`,
      );
      // For debugging purposes, return a small sample of the original data
      console.log(
        `[DEBUG] Returning small sample of original data for debugging`,
      );
      return data.slice(0, Math.min(10, data.length));
    }
  }

  return dedupedRecords;
};

/**
 * Deduplicates heart rate data by keeping all watch data and deduplicating phone data by minute
 */
export const deduplicateHeartRateData = (
  data: HealthDataPoint[],
): HealthDataPoint[] => {
  // Separate watch and phone data
  const watchData = data.filter(isWatchData);
  const phoneData = data.filter((record) => !isWatchData(record));

  // Group phone data by minute
  const phoneByMinute = phoneData.reduce(
    (acc, record) => {
      const dateStr = record.startDate;
      const date = new Date(dateStr);
      const minuteKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
      if (!acc[minuteKey]) {
        acc[minuteKey] = [];
      }
      acc[minuteKey].push(record);
      return acc;
    },
    {} as Record<string, HealthDataPoint[]>,
  );

  // Keep the most recent value for each minute of phone data
  const dedupedPhoneData = Object.values(phoneByMinute).map((minuteData) => {
    return minuteData.reduce((latest, current) => {
      if (!latest) return current;
      return new Date(current.startDate) > new Date(latest.startDate)
        ? current
        : latest;
    });
  });

  // Combine watch and deduplicated phone data
  return [...watchData, ...dedupedPhoneData];
};

/**
 * Deduplicates health data points based on date and value
 * For each unique date, keeps the most recent value
 */
export function deduplicateData(
  data: HealthDataPoint[],
  metricId: string,
): HealthDataPoint[] {
  if (!data || data.length === 0) return [];

  const isDebugMetric = DEBUG_METRICS.includes(metricId);

  console.log(`Deduplicating ${data.length} records for ${metricId}...`);

  // Special processing for sleep data
  if (isSleepData(metricId)) {
    console.log("Sleep data detected - applying special processing");
    const sleepSessions = processSleepData(data);
    console.log(`Found ${sleepSessions.length} valid sleep sessions`);

    // TEMPORARY FIX: For debugging, if no sessions found, return raw data
    if (sleepSessions.length === 0 && data.length > 0) {
      console.log(
        "[DEBUG] WARNING: No sleep sessions processed but raw data exists!",
      );
      console.log("[DEBUG] Sample raw sleep data:", data.slice(0, 3));

      // Enhanced logging to debug the issue
      try {
        const sampleRecord = data[0];
        console.log("[DEBUG] Sleep Record Structure:", {
          hasValue: "value" in sampleRecord,
          value: sampleRecord.value,
          startDate: sampleRecord.startDate,
          endDate: sampleRecord.endDate,
          source: sampleRecord.source,
          device: sampleRecord.device,
        });

        // Try extracting some key patterns
        if (typeof sampleRecord.value === "string") {
          console.log(
            "[DEBUG] Sleep value pattern:",
            sampleRecord.value.substring(0, 30),
          );
        }
      } catch (e) {
        console.error("[DEBUG] Error inspecting sleep data:", e);
      }

      return data;
    }

    // Standard behavior - return raw data for CSV export
    return data;
  }

  // TEMPORARY: For debug metrics, log sample data before deduplication
  if (isDebugMetric && data.length > 0) {
    console.log(`[DEBUG] ${metricId} sample before deduplication:`, data[0]);
  }

  // Different deduplication strategies based on metric type
  let result: HealthDataPoint[] = [];

  if (metricId === "HKQuantityTypeIdentifierHeartRate") {
    result = deduplicateHeartRateData(data);
  } else {
    // For step counts, energy, distance, etc. we use the hourly block strategy
    result = deduplicateCumulativeData(data, metricId);
  }

  // TEMPORARY: For debug metrics, log result count and sample
  if (isDebugMetric) {
    console.log(
      `[DEBUG] ${metricId} after deduplication: ${result.length} records`,
    );
    if (result.length === 0 && data.length > 0) {
      console.log(
        `[DEBUG] WARNING: All ${metricId} records were removed during deduplication!`,
      );

      // TEMPORARY: For testing, return a sample of original data
      console.log(
        `[DEBUG] TESTING: Returning first 10 original records for ${metricId}`,
      );
      return data.slice(0, 10);
    }
    if (result.length > 0) {
      console.log(`[DEBUG] ${metricId} sample after deduplication:`, result[0]);
    }
  }

  return result;
}

/**
 * Deduplicates health data points based on date and value for a specific metric
 */
export function deduplicateMetricData(
  metricId: string,
  data: HealthDataPoint[],
): HealthDataPoint[] {
  if (!isDeduplicatableMetric(metricId)) {
    return data;
  }
  return deduplicateData(data, metricId);
}

// For backwards compatibility with existing code
export const deduplicateStepData = (
  stepData: HealthDataPoint[],
): HealthDataPoint[] => {
  return deduplicateCumulativeData(
    stepData,
    "HKQuantityTypeIdentifierStepCount",
  );
};

// For backwards compatibility with existing code
export const isStepCountData = (metricId: string): boolean => {
  return metricId === "HKQuantityTypeIdentifierStepCount";
};
