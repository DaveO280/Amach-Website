// src/components/ai/HealthDataProvider.tsx
"use client";

import { useHealthData } from "@/my-health-app/store/healthDataStore/provider";
import { useSelection } from "@/my-health-app/store/selectionStore/provider";
import {
  processSleepData,
  SleepSession,
} from "@/my-health-app/utils/sleepDataProcessor";
import { createContext, useContext, useEffect, useMemo } from "react";

// Map Apple Health identifiers to friendly internal names
const METRIC_MAPPINGS = {
  HKQuantityTypeIdentifierHeartRate: "heartRate",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "heartRateVariability",
  HKQuantityTypeIdentifierRespiratoryRate: "respiratoryRate",
  HKQuantityTypeIdentifierAppleExerciseTime: "exerciseTime",
  HKQuantityTypeIdentifierRestingHeartRate: "restingHeartRate",
  HKQuantityTypeIdentifierActiveEnergyBurned: "activeEnergy",
  HKCategoryTypeIdentifierSleepAnalysis: "sleep",
  HKQuantityTypeIdentifierStepCount: "steps",
};

// Define default units for each metric
const METRIC_UNITS = {
  heartRate: "bpm",
  heartRateVariability: "ms",
  respiratoryRate: "BrPM",
  exerciseTime: "min",
  restingHeartRate: "bpm",
  activeEnergy: "kcal",
  sleep: "min",
  steps: "steps",
};

// Define which metrics are cumulative vs. status types
const CUMULATIVE_METRICS = ["steps", "activeEnergy", "exerciseTime"];

const isMetricCumulative = (metricType: string): boolean => {
  return CUMULATIVE_METRICS.includes(metricType);
};

interface MetricCardData {
  technicalId: string;
  displayName: string;
  value: {
    avg: number;
    min: number;
    max: number;
    minDate: string;
    maxDate: string;
    count: number;
  };
  unit: string;
  available: boolean;
  additionalData?: {
    efficiency?: number;
    phases?: {
      deep: number;
      rem: number;
      light: number;
      awake: number;
    };
  };
}

// Add this interface to match aiStore's expectations
interface AiStoreMetrics {
  heartRate: {
    available: boolean;
    avgDaily: number;
  };
  heartRateVariability: {
    available: boolean;
    avgDaily: number;
  };
  respiratoryRate: {
    available: boolean;
    avgDaily: number;
  };
  exerciseTime: {
    available: boolean;
    avgDaily: number;
    total: number;
  };
  restingHeartRate: {
    available: boolean;
    avgDaily: number;
  };
  activeEnergy: {
    available: boolean;
    avgDaily: number;
    total: number;
  };
  sleep: {
    available: boolean;
    avgDaily: number;
  };
  steps: {
    available: boolean;
    avgDaily: number;
    total: number;
  };
  [key: string]: any; // Allow any metric key
}

interface DailyMetricData {
  heartRate: {
    avg: number;
    min: number | null;
    max: number | null;
    count: number;
  };
  heartRateVariability: {
    avg: number;
    min: number | null;
    max: number | null;
    count: number;
  };
  respiratoryRate: {
    avg: number;
    min: number | null;
    max: number | null;
    count: number;
  };
  restingHeartRate: {
    avg: number;
    min: number | null;
    max: number | null;
    count: number;
  };
  steps: {
    total: number;
    avg: number;
    min: number | null;
    max: number | null;
    count: number;
  };
  activeEnergy: {
    total: number;
    avg: number;
    min: number | null;
    max: number | null;
    count: number;
  };
  exerciseTime: {
    total: number;
    avg: number;
    min: number | null;
    max: number | null;
    count: number;
  };
  sleep: {
    total: number;
    avg: number;
    min: number | null;
    max: number | null;
    deepSleep: number;
    remSleep: number;
    lightSleep: number;
    awake: number;
    count: number;
    totalHours?: number;
  };
  [key: string]: any; // Allow other metrics
}

interface DailySummary {
  date: string;
  heartRate: {
    avg: number;
    min: number | null;
    max: number | null;
    count: number;
  };
  heartRateVariability: {
    avg: number;
    min: number | null;
    max: number | null;
    count: number;
  };
  respiratoryRate: {
    avg: number;
    min: number | null;
    max: number | null;
    count: number;
  };
  restingHeartRate: {
    avg: number;
    min: number | null;
    max: number | null;
    count: number;
  };
  steps: {
    total: number;
    avg: number;
    min: number | null;
    max: number | null;
    count: number;
  };
  activeEnergy: {
    total: number;
    avg: number;
    min: number | null;
    max: number | null;
    count: number;
  };
  exerciseTime: {
    total: number;
    avg: number;
    min: number | null;
    max: number | null;
    count: number;
  };
  sleep: {
    total: number;
    avg: number;
    min: number | null;
    max: number | null;
    deepSleep: number;
    remSleep: number;
    lightSleep: number;
    awake: number;
    count: number;
    totalHours?: number;
  };
  [key: string]: any; // Allow any other properties
}

export interface SummarizedData {
  stats: {
    metrics: AiStoreMetrics;
    timeFrame: string;
    dateRange: {
      start: string | null;
      end: string | null;
    };
    totalDays: number;
  };
  daily: DailySummary[];
}

interface HealthSummaryContextType {
  summarizedData: SummarizedData | null;
  isProcessing: boolean;
}

const HealthSummaryContext = createContext<HealthSummaryContextType | null>(
  null,
);

// Helper function to calculate average for status-based metrics
const calculateAverage = (data: any[], valueKey: string = "value"): number => {
  if (!data || data.length === 0) return 0;
  const sum = data.reduce((acc, item) => acc + parseFloat(item[valueKey]), 0);
  return sum / data.length;
};

// Helper function to calculate total
const calculateTotal = (data: any[], valueKey: string = "value"): number => {
  if (!data || data.length === 0) return 0;
  return data.reduce((acc, item) => acc + parseFloat(item[valueKey]), 0);
};

// New function to calculate daily metric averages correctly
const calculateDailyMetricAverage = (
  data: any[],
  metricType: string,
): number => {
  if (!data || data.length === 0) return 0;

  // Group by day first
  const dailyValues = new Map<string, { sum: number; count: number }>();

  data.forEach((point) => {
    try {
      const date = new Date(point.startDate);
      const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      const value = parseFloat(point.value);
      if (isNaN(value)) return; // Skip invalid values

      // Initialize the day if it doesn't exist
      if (!dailyValues.has(dayKey)) {
        dailyValues.set(dayKey, { sum: value, count: 1 });
      } else {
        const current = dailyValues.get(dayKey)!;

        // For cumulative metrics, we sum the values directly
        if (isMetricCumulative(metricType)) {
          current.sum += value;
        }
        // For status metrics, we track sum and count for averaging
        else {
          current.sum += value;
          current.count += 1;
        }

        dailyValues.set(dayKey, current);
      }
    } catch (e) {
      console.error(`Error processing ${metricType} data point:`, e);
    }
  });

  // Calculate the average based on metric type
  let totalValue = 0;
  let totalDays = 0;

  dailyValues.forEach((dayData, day) => {
    if (dayData.count === 0) return; // Skip days with no valid data

    if (isMetricCumulative(metricType)) {
      // For cumulative metrics, use the daily sum
      totalValue += dayData.sum;
    } else {
      // For status metrics, use the daily average
      totalValue += dayData.sum / dayData.count;
    }
    totalDays++;
  });

  return totalDays > 0 ? totalValue / totalDays : 0;
};

// Function to calculate average sleep data using the sleep processor
const calculateSleepDailyAverage = (sleepData: any[]): number => {
  if (!sleepData || sleepData.length === 0) return 0;

  try {
    // Process raw sleep data into sessions
    const sleepSessions = processSleepData(sleepData);

    // Calculate average sleep duration across sessions
    const totalSleepDuration = sleepSessions.reduce(
      (sum: number, session: SleepSession) => sum + session.sleepDuration,
      0,
    );
    return sleepSessions.length > 0
      ? totalSleepDuration / sleepSessions.length
      : 0;
  } catch (error) {
    console.error("Error processing sleep data for averaging:", error);

    // Fallback to a simpler calculation
    return calculateDailyMetricAverage(sleepData, "sleep");
  }
};

export function HealthSummaryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { metricData } = useHealthData();
  const { timeFrame } = useSelection();

  const summarizedData = useMemo(() => {
    if (!metricData || Object.keys(metricData).length === 0) {
      return null;
    }

    console.log("Processing health data for summary...");

    // Get the data for each metric type using both Apple Health IDs and friendly names
    const getMetricData = (appleHealthId: string) => {
      return metricData[appleHealthId] || [];
    };

    // Extract data for all metrics
    const heartRateData = getMetricData("HKQuantityTypeIdentifierHeartRate");
    const hrvData = getMetricData(
      "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
    );
    const respiratoryData = getMetricData(
      "HKQuantityTypeIdentifierRespiratoryRate",
    );
    const exerciseTimeData = getMetricData(
      "HKQuantityTypeIdentifierAppleExerciseTime",
    );
    const restingHRData = getMetricData(
      "HKQuantityTypeIdentifierRestingHeartRate",
    );
    const activeEnergyData = getMetricData(
      "HKQuantityTypeIdentifierActiveEnergyBurned",
    );
    const sleepData = getMetricData("HKCategoryTypeIdentifierSleepAnalysis");
    const stepData = getMetricData("HKQuantityTypeIdentifierStepCount");

    // Log available data for each metric
    console.log("Available metrics data:", {
      heartRate: heartRateData.length,
      heartRateVariability: hrvData.length,
      respiratoryRate: respiratoryData.length,
      exerciseTime: exerciseTimeData.length,
      restingHeartRate: restingHRData.length,
      activeEnergy: activeEnergyData.length,
      sleep: sleepData.length,
      steps: stepData.length,
    });

    // Process sleep data using the dedicated processor
    let processedSleepSessions: SleepSession[] = [];
    try {
      if (sleepData && sleepData.length > 0) {
        processedSleepSessions = processSleepData(sleepData);
        console.log(
          `Processed ${processedSleepSessions.length} sleep sessions from ${sleepData.length} records`,
        );
      }
    } catch (error) {
      console.error("Error processing sleep sessions:", error);
    }

    // Debug log to check steps data calculation
    if (stepData && stepData.length > 0) {
      console.log("Steps data calculation:", {
        totalRecords: stepData.length,
        naiveAverage: calculateAverage(stepData),
        dailyAverage: calculateDailyMetricAverage(stepData, "steps"),
        totalSteps: calculateTotal(stepData),
      });
    }

    // Transform metrics into AI store format with correct calculation methods
    const aiMetrics: AiStoreMetrics = {
      heartRate: {
        available: heartRateData.length > 0,
        avgDaily: calculateDailyMetricAverage(heartRateData, "heartRate"),
      },
      heartRateVariability: {
        available: hrvData.length > 0,
        avgDaily: calculateDailyMetricAverage(hrvData, "heartRateVariability"),
      },
      respiratoryRate: {
        available: respiratoryData.length > 0,
        avgDaily: calculateDailyMetricAverage(
          respiratoryData,
          "respiratoryRate",
        ),
      },
      exerciseTime: {
        available: exerciseTimeData.length > 0,
        avgDaily: calculateDailyMetricAverage(exerciseTimeData, "exerciseTime"),
        total: calculateTotal(exerciseTimeData),
      },
      restingHeartRate: {
        available: restingHRData.length > 0,
        avgDaily: calculateDailyMetricAverage(
          restingHRData,
          "restingHeartRate",
        ),
      },
      activeEnergy: {
        available: activeEnergyData.length > 0,
        avgDaily: calculateDailyMetricAverage(activeEnergyData, "activeEnergy"),
        total: calculateTotal(activeEnergyData),
      },
      sleep: {
        available: sleepData.length > 0,
        avgDaily: calculateSleepDailyAverage(sleepData),
      },
      steps: {
        available: stepData.length > 0,
        avgDaily: calculateDailyMetricAverage(stepData, "steps"),
        total: calculateTotal(stepData),
      },
    };

    // Group data by day
    const dailyData = new Map<string, DailyMetricData & { date: string }>();

    // Create a sessionsByDay map for quick lookup of sleep sessions by date
    const sessionsByDay = new Map<string, SleepSession>();
    processedSleepSessions.forEach((session: SleepSession) => {
      sessionsByDay.set(session.date, session);
    });

    // Process ALL metrics' data points into daily summaries for consistency
    const metricsPairs = [
      {
        data: heartRateData,
        key: "heartRate",
        appleName: "HKQuantityTypeIdentifierHeartRate",
      },
      {
        data: hrvData,
        key: "heartRateVariability",
        appleName: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
      },
      {
        data: respiratoryData,
        key: "respiratoryRate",
        appleName: "HKQuantityTypeIdentifierRespiratoryRate",
      },
      {
        data: exerciseTimeData,
        key: "exerciseTime",
        appleName: "HKQuantityTypeIdentifierAppleExerciseTime",
      },
      {
        data: restingHRData,
        key: "restingHeartRate",
        appleName: "HKQuantityTypeIdentifierRestingHeartRate",
      },
      {
        data: activeEnergyData,
        key: "activeEnergy",
        appleName: "HKQuantityTypeIdentifierActiveEnergyBurned",
      },
      {
        data: sleepData,
        key: "sleep",
        appleName: "HKCategoryTypeIdentifierSleepAnalysis",
      },
      {
        data: stepData,
        key: "steps",
        appleName: "HKQuantityTypeIdentifierStepCount",
      },
    ];

    metricsPairs.forEach(({ data, key, appleName }) => {
      if (data.length === 0) {
        console.log(
          `No data for ${key} (${appleName}), skipping daily processing`,
        );
        return;
      }

      console.log(`Processing ${key} with ${data.length} records`);

      data.forEach((point) => {
        try {
          const date = new Date(point.startDate);
          const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

          if (!dailyData.has(dayKey)) {
            dailyData.set(dayKey, {
              date: dayKey,
              // Initialize all metrics with empty structures
              heartRate: { avg: 0, min: null, max: null, count: 0 },
              heartRateVariability: { avg: 0, min: null, max: null, count: 0 },
              respiratoryRate: { avg: 0, min: null, max: null, count: 0 },
              restingHeartRate: { avg: 0, min: null, max: null, count: 0 },
              steps: { total: 0, avg: 0, min: null, max: null, count: 0 },
              activeEnergy: {
                total: 0,
                avg: 0,
                min: null,
                max: null,
                count: 0,
              },
              exerciseTime: {
                total: 0,
                avg: 0,
                min: null,
                max: null,
                count: 0,
              },
              sleep: {
                total: 0,
                avg: 0,
                min: null,
                max: null,
                deepSleep: 0,
                remSleep: 0,
                lightSleep: 0,
                awake: 0,
                count: 0,
              },
            });
          }

          const dayData = dailyData.get(dayKey)!;
          const value = parseFloat(point.value);

          if (isNaN(value)) return; // Skip invalid values

          // Process each metric type appropriately
          switch (key) {
            // For metrics that use average
            case "heartRate":
            case "heartRateVariability":
            case "respiratoryRate":
            case "restingHeartRate":
              // For status metrics, properly average the values
              dayData[key].avg =
                (dayData[key].avg * dayData[key].count + value) /
                (dayData[key].count + 1);
              dayData[key].min =
                dayData[key].min === null
                  ? value
                  : Math.min(dayData[key].min as number, value);
              dayData[key].max =
                dayData[key].max === null
                  ? value
                  : Math.max(dayData[key].max as number, value);
              dayData[key].count++;
              break;

            // For metrics that use total
            case "steps":
            case "activeEnergy":
            case "exerciseTime":
              // For cumulative metrics, sum the values within each day
              dayData[key].total += value;
              // The avg should represent the current total, not an average of individual values
              dayData[key].avg = dayData[key].total;

              // Still track min/max of individual values for reference
              dayData[key].min =
                dayData[key].min === null
                  ? value
                  : Math.min(dayData[key].min as number, value);
              dayData[key].max =
                dayData[key].max === null
                  ? value
                  : Math.max(dayData[key].max as number, value);
              dayData[key].count++;
              break;

            // Special handling for sleep data
            case "sleep":
              // Check if we have processed sleep sessions for this day
              if (sessionsByDay.has(dayKey)) {
                const session = sessionsByDay.get(dayKey)!;

                // Use the sleep session data instead of raw records
                if (dayData[key].count === 0) {
                  dayData[key].total = session.sleepDuration;
                  dayData[key].avg = session.sleepDuration;
                  dayData[key].min = session.sleepDuration;
                  dayData[key].max = session.sleepDuration;
                  dayData[key].deepSleep = session.stageData.deep;
                  dayData[key].remSleep = session.stageData.rem;
                  dayData[key].lightSleep = session.stageData.core;
                  dayData[key].awake = session.stageData.awake;
                  dayData[key].count = 1;
                  dayData[key].totalHours = session.sleepDuration / 60;
                }
                // Don't add more sleep data for this day if we're using session data
              }
              // If no processed session exists, fall back to raw data
              else {
                dayData[key].total += value;
                dayData[key].avg = dayData[key].total; // Use total as the avg for sleep too
                dayData[key].min =
                  dayData[key].min === null
                    ? value
                    : Math.min(dayData[key].min as number, value);
                dayData[key].max =
                  dayData[key].max === null
                    ? value
                    : Math.max(dayData[key].max as number, value);
                dayData[key].count++;
                dayData[key].totalHours = dayData[key].total / 60;

                // Simple approximation of sleep stages if not using session data
                if (value > 0) {
                  dayData[key].deepSleep += value * 0.2; // ~20% deep sleep
                  dayData[key].remSleep += value * 0.25; // ~25% REM sleep
                  dayData[key].lightSleep += value * 0.45; // ~45% light sleep
                  dayData[key].awake += value * 0.1; // ~10% awake time
                }
              }
              break;
          }

          dailyData.set(dayKey, dayData);
        } catch (error) {
          console.error(`Error processing ${key} data point:`, error);
        }
      });
    });

    // Convert to array and sort by date
    const dailyArray = Array.from(dailyData.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    // Calculate total days with data
    const totalDays = dailyArray.length;

    console.log(`Processed ${totalDays} days of health data`);

    return {
      stats: {
        metrics: aiMetrics,
        timeFrame,
        dateRange: {
          start: dailyArray.length > 0 ? dailyArray[0].date : null,
          end:
            dailyArray.length > 0
              ? dailyArray[dailyArray.length - 1].date
              : null,
        },
        totalDays,
      },
      daily: dailyArray,
    };
  }, [metricData, timeFrame]);

  // Debug logging
  useEffect(() => {
    if (summarizedData) {
      console.log("Health data summary created:", {
        availableMetrics: Object.entries(summarizedData.stats.metrics)
          .filter(([_, data]) => data.available)
          .map(([key]) => key),
        timeFrame,
        totalDays: summarizedData.stats.totalDays,
        // Log some key metrics to verify correct calculation
        metricsPreview: {
          steps: summarizedData.stats.metrics.steps.available
            ? `${Math.round(summarizedData.stats.metrics.steps.avgDaily)} avg/day, ${summarizedData.stats.metrics.steps.total} total`
            : "N/A",
          heartRate: summarizedData.stats.metrics.heartRate.available
            ? `${Math.round(summarizedData.stats.metrics.heartRate.avgDaily)} bpm avg`
            : "N/A",
          sleep: summarizedData.stats.metrics.sleep.available
            ? `${Math.round(summarizedData.stats.metrics.sleep.avgDaily)} min avg`
            : "N/A",
        },
      });
    }
  }, [summarizedData, timeFrame]);

  return (
    <HealthSummaryContext.Provider
      value={{
        summarizedData,
        isProcessing: false,
      }}
    >
      {children}
    </HealthSummaryContext.Provider>
  );
}

export function useHealthSummary(): HealthSummaryContextType {
  const context = useContext(HealthSummaryContext);
  if (!context) {
    throw new Error(
      "useHealthSummary must be used within a HealthSummaryProvider",
    );
  }
  return context;
}
