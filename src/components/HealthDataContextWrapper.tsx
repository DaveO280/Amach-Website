"use client";

import { useHealthDataQuery } from "@/data/hooks/useHealthDataQuery";
import { HealthDataResults } from "@/data/types/healthMetrics";
import {
  ChatMessage,
  HealthContext,
  HealthGoal,
  HealthScore,
  UploadedFileSummary,
} from "@/types/HealthContext";
import { HealthDataByType, ProcessingState } from "@/types/healthData";
import {
  calculateAndStoreDailyHealthScores,
  calculateDailyHealthScores,
  getDailyHealthScores,
} from "@/utils/dailyHealthScoreCalculator";
import { extractDatePart } from "@/utils/dataDeduplicator";
import { processSleepData } from "@/utils/sleepDataProcessor";
import React, { createContext, useContext, useEffect, useState } from "react";

// Profile type
interface ProfileData {
  age: number;
  sex: "male" | "female";
  height: number;
  weight: number;
}

// Locally define MetricTrendSummary since it's not exported from types
interface MetricTrendSummary {
  last7: number[];
  last30: number[];
  last365: number[];
  yearOverYear: {
    thisYear: number[];
    lastYear: number[];
    percentChange: number;
  };
  trend: "increasing" | "decreasing" | "stable";
  outliers: number[];
}

interface HealthDataContextType {
  // Health data
  metricData: HealthDataByType;
  processingState: ProcessingState;
  setProcessingState: (state: ProcessingState) => void;
  updateProcessingProgress: (progress: number, status: string) => void;
  setProcessingError: (error: string) => void;
  addMetricData: () => void;
  clearData: () => void;
  hasData: () => boolean;
  // Health context (old API)
  metrics?: HealthContext["metrics"];
  healthScores: HealthScore[];
  goals: HealthGoal[];
  addGoal: (goal: HealthGoal) => void;
  updateGoal: (goal: HealthGoal) => void;
  toggleGoal: (id: string) => void;
  removeGoal: (id: string) => void;
  clearGoals: () => void;
  uploadedFiles: UploadedFileSummary[];
  addUploadedFile: (file: UploadedFileSummary) => void;
  removeUploadedFile: (index: number) => void;
  clearUploadedFiles: () => void;
  userProfile: HealthContext["userProfile"];
  setUserProfile: (profile: HealthContext["userProfile"]) => void;
  chatHistory: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  setHealthContext: React.Dispatch<React.SetStateAction<HealthContext>>;
  // Profile
  profile: ProfileData | null;
  setProfile: (profile: ProfileData) => void;
  // UI state
  isDashboardOpen: boolean;
  setIsDashboardOpen: (value: boolean) => void;
  isAiCompanionOpen: boolean;
  setIsAiCompanionOpen: (value: boolean) => void;
}

const defaultProcessingState: ProcessingState = {
  isProcessing: false,
  progress: 0,
  status: "",
  error: null,
};

const defaultContext: HealthContext = {
  version: 1,
  userProfile: {},
  chatHistory: [],
  healthScores: [],
  uploadedFiles: [],
  userFeedback: [],
  goals: [],
};

const HealthDataContext = createContext<HealthDataContextType | undefined>(
  undefined,
);

export const useHealthDataContext = (): HealthDataContextType => {
  const context = useContext(HealthDataContext);
  if (!context) {
    throw new Error(
      "useHealthDataContext must be used within a HealthDataContextProvider",
    );
  }
  return context;
};

export default function HealthDataContextWrapper({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  // Health data state
  const { data: metricData = {}, isPending, error } = useHealthDataQuery();
  const [processingState, setProcessingState] = useState<ProcessingState>(
    defaultProcessingState,
  );
  // HealthContext state (old API)
  const [healthContext, setHealthContext] =
    useState<HealthContext>(defaultContext);
  // Profile state
  const [profile, setProfile] = useState<ProfileData | null>(null);
  // UI state
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isAiCompanionOpen, setIsAiCompanionOpen] = useState(false);

  // Optionally, update processingState based on query status
  useEffect(() => {
    if (isPending) {
      setProcessingState((prev) => ({
        ...prev,
        isProcessing: true,
        status: "Loading health data...",
        error: null,
      }));
    } else if (error) {
      setProcessingState((prev) => ({
        ...prev,
        isProcessing: false,
        error: error.message,
        status: "Error loading health data",
      }));
    } else {
      setProcessingState((prev) => ({
        ...prev,
        isProcessing: false,
        status: "",
        error: null,
      }));
    }
  }, [isPending, error]);

  // --- PORTED: Compute metrics, trends, and healthScores from metricData ---
  useEffect((): void => {
    // Skip processing if no metricData (IndexedDB is the single source of truth)
    if (!metricData || Object.keys(metricData).length === 0) {
      setHealthContext((prev) => ({ ...prev, metrics: undefined, trends: {} }));
      return;
    }

    // Process sleep data
    const sleepData = metricData["HKCategoryTypeIdentifierSleepAnalysis"] || [];
    const processedSleepData = processSleepData(sleepData);

    // Helper: process numeric data for cumulative metrics (sum daily totals)
    const processCumulativeData = (
      data: { startDate: string; value: string }[],
    ): Array<{
      day: string;
      date: Date;
      value: number;
      count: number;
      values: number[];
    }> => {
      const dailyData: Record<
        string,
        { total: number; count: number; values: number[] }
      > = {};
      data.forEach((point) => {
        try {
          const dayKey = extractDatePart(point.startDate);
          const value = parseFloat(point.value);
          if (!isNaN(value)) {
            if (!dailyData[dayKey]) {
              dailyData[dayKey] = { total: 0, count: 0, values: [] };
            }
            // For cumulative metrics, sum the values for the day
            dailyData[dayKey].total += value;
            dailyData[dayKey].count += 1;
            dailyData[dayKey].values.push(value);
          }
        } catch (e) {
          console.error("Error processing cumulative data point:", e);
        }
      });
      return Object.entries(dailyData)
        .map(([day, data]) => ({
          day,
          date: new Date(day + "T12:00:00"),
          value: Math.round(data.total),
          count: data.count,
          values: data.values,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    };

    // Helper: process heart rate data (average daily values)
    const processHeartRateData = (
      data: { startDate: string; value: string }[],
    ): Array<{
      day: string;
      date: Date;
      value: number;
      count: number;
      values: number[];
      avg: number;
      min: number;
      max: number;
    }> => {
      const dailyData: Record<
        string,
        { values: number[]; min: number; max: number }
      > = {};
      data.forEach((point) => {
        try {
          const dayKey = extractDatePart(point.startDate);
          const value = parseFloat(point.value);
          if (!isNaN(value)) {
            if (!dailyData[dayKey]) {
              dailyData[dayKey] = {
                values: [],
                min: Number.MAX_SAFE_INTEGER,
                max: Number.MIN_SAFE_INTEGER,
              };
            }
            dailyData[dayKey].values.push(value);
            dailyData[dayKey].min = Math.min(dailyData[dayKey].min, value);
            dailyData[dayKey].max = Math.max(dailyData[dayKey].max, value);
          }
        } catch (e) {
          console.error("Error processing heart rate data point:", e);
        }
      });
      return Object.entries(dailyData)
        .map(([day, data]) => ({
          day,
          date: new Date(day + "T12:00:00"),
          value: Math.round(
            data.values.reduce((sum, val) => sum + val, 0) / data.values.length,
          ),
          count: data.values.length,
          values: data.values,
          avg: Math.round(
            data.values.reduce((sum, val) => sum + val, 0) / data.values.length,
          ),
          min: Math.round(data.min),
          max: Math.round(data.max),
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    };

    // Helper: process respiratory data (average daily values)
    const processRespiratoryData = (
      data: { startDate: string; value: string }[],
    ): Array<{
      day: string;
      date: Date;
      value: number;
      count: number;
      values: number[];
    }> => {
      const dailyData: Record<string, number[]> = {};
      data.forEach((point) => {
        try {
          const dayKey = extractDatePart(point.startDate);
          const value = parseFloat(point.value);
          if (!isNaN(value)) {
            if (!dailyData[dayKey]) {
              dailyData[dayKey] = [];
            }
            dailyData[dayKey].push(value);
          }
        } catch (e) {
          console.error("Error processing respiratory data point:", e);
        }
      });
      return Object.entries(dailyData)
        .map(([day, values]) => ({
          day,
          date: new Date(day + "T12:00:00"),
          value: values.reduce((sum, v) => sum + v, 0) / values.length,
          count: values.length,
          values,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    };

    // Process each metric using IndexedDB data
    const steps = processCumulativeData(
      metricData["HKQuantityTypeIdentifierStepCount"] || [],
    );
    const exercise = processCumulativeData(
      metricData["HKQuantityTypeIdentifierAppleExerciseTime"] || [],
    );
    const heartRate = processHeartRateData(
      metricData["HKQuantityTypeIdentifierHeartRate"] || [],
    );
    const hrv = processHeartRateData(
      metricData["HKQuantityTypeIdentifierHeartRateVariabilitySDNN"] || [],
    );
    const restingHR = processHeartRateData(
      metricData["HKQuantityTypeIdentifierRestingHeartRate"] || [],
    );
    const respiratory = processRespiratoryData(
      metricData["HKQuantityTypeIdentifierRespiratoryRate"] || [],
    );
    const activeEnergy = processCumulativeData(
      metricData["HKQuantityTypeIdentifierActiveEnergyBurned"] || [],
    );

    // Calculate metrics from processed data
    const metrics = {
      steps: {
        average:
          steps.length > 0
            ? Math.round(
                steps.reduce((sum, day) => sum + (day.value ?? 0), 0) /
                  steps.length,
              )
            : 0,
        high: Math.max(...steps.map((day) => day.value ?? 0), 0),
        low:
          steps.length > 0
            ? Math.min(...steps.map((day) => day.value ?? 0))
            : 0,
      },
      exercise: {
        average:
          exercise.length > 0
            ? Math.round(
                exercise.reduce((sum, day) => sum + (day.value ?? 0), 0) /
                  exercise.length,
              )
            : 0,
        high: Math.max(...exercise.map((day) => day.value ?? 0), 0),
        low:
          exercise.length > 0
            ? Math.min(...exercise.map((day) => day.value ?? 0))
            : 0,
      },
      heartRate: {
        average:
          heartRate.length > 0
            ? Math.round(
                heartRate.reduce((sum, day) => sum + (day.avg ?? 0), 0) /
                  heartRate.length,
              )
            : 0,
        high: Math.max(...heartRate.map((day) => day.max ?? 0), 0),
        low:
          heartRate.length > 0
            ? Math.min(...heartRate.map((day) => day.min ?? 0))
            : 0,
      },
      hrv: {
        average:
          hrv.length > 0
            ? Math.round(
                hrv.reduce((sum, day) => sum + (day.avg ?? 0), 0) / hrv.length,
              )
            : 0,
        high: Math.max(...hrv.map((day) => day.max ?? 0), 0),
        low: hrv.length > 0 ? Math.min(...hrv.map((day) => day.min ?? 0)) : 0,
      },
      restingHR: {
        average:
          restingHR.length > 0
            ? Math.round(
                restingHR.reduce((sum, day) => sum + (day.avg ?? 0), 0) /
                  restingHR.length,
              )
            : 0,
        high: Math.max(...restingHR.map((day) => day.max ?? 0), 0),
        low:
          restingHR.length > 0
            ? Math.min(...restingHR.map((day) => day.min ?? 0))
            : 0,
      },
      respiratory: {
        average:
          respiratory.length > 0
            ? Math.round(
                respiratory.reduce((sum, day) => sum + (day.value ?? 0), 0) /
                  respiratory.length,
              )
            : 0,
        high: Math.max(...respiratory.map((day) => day.value ?? 0), 0),
        low:
          respiratory.length > 0
            ? Math.min(...respiratory.map((day) => day.value ?? 0))
            : 0,
      },
      activeEnergy: {
        average:
          activeEnergy.length > 0
            ? Math.round(
                activeEnergy.reduce((sum, day) => sum + (day.value ?? 0), 0) /
                  activeEnergy.length,
              )
            : 0,
        high: Math.max(...activeEnergy.map((day) => day.value ?? 0), 0),
        low:
          activeEnergy.length > 0
            ? Math.min(...activeEnergy.map((day) => day.value ?? 0))
            : 0,
      },
      sleep:
        processedSleepData.length > 0
          ? {
              average: Math.round(
                processedSleepData.reduce(
                  (sum, day) => sum + day.sleepDuration,
                  0,
                ) / processedSleepData.length,
              ),
              efficiency: Math.round(
                processedSleepData.reduce(
                  (sum, day) => sum + day.metrics.sleepEfficiency,
                  0,
                ) / processedSleepData.length,
              ),
              high: Math.max(
                ...processedSleepData.map((day) => day.sleepDuration),
                0,
              ),
              low:
                processedSleepData.length > 0
                  ? Math.min(
                      ...processedSleepData.map((day) => day.sleepDuration),
                    )
                  : 0,
            }
          : { average: 0, efficiency: 0, high: 0, low: 0 },
    };

    // Compute trends for each metric
    const computeMetricTrends = (
      dailyValues: { date: string; value: number }[],
    ): MetricTrendSummary => {
      const values = dailyValues.map((d) => d.value);
      const last7 = values.slice(-7);
      const last30 = values.slice(-30);
      const last365 = values.slice(-365);
      const mean = values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 0;
      const std = Math.sqrt(
        values.length
          ? values.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) /
              values.length
          : 0,
      );
      const outliers = dailyValues
        .filter((d) => Math.abs(d.value - mean) > 2 * std)
        .map((d) => d.value);
      return {
        last7,
        last30,
        last365,
        yearOverYear: { thisYear: [], lastYear: [], percentChange: 0 },
        trend: "stable",
        outliers,
      };
    };

    const trends: Record<string, MetricTrendSummary> = {};
    Object.keys(metricData).forEach((metric) => {
      const daily = (metricData[metric] || [])
        .map((d) => ({
          date: d.startDate.slice(0, 10),
          value: parseFloat(d.value),
        }))
        .filter((d) => !isNaN(d.value));
      if (daily.length > 0) {
        trends[metric] = computeMetricTrends(daily);
      }
    });

    setHealthContext((prev) => ({ ...prev, metrics, trends }));
  }, [metricData]);

  // --- Compute healthScores as averages of daily scores for each metric ---
  useEffect(() => {
    async function updateHealthScoresFromDaily(): Promise<void> {
      const dailyScores = await getDailyHealthScores();
      if (!dailyScores || dailyScores.length === 0) {
        // If no daily scores, calculate from current metric data
        if (metricData && Object.keys(metricData).length > 0) {
          try {
            // Convert metricData to the format expected by calculateDailyHealthScores
            const healthDataResults = Object.entries(metricData).reduce(
              (acc, [metricType, dataPoints]) => {
                acc[metricType] = dataPoints.map((point) => ({
                  startDate: point.startDate,
                  endDate: point.endDate,
                  value: point.value,
                  unit: point.unit,
                  source: point.source,
                  device: point.device,
                  type: metricType,
                }));
                return acc;
              },
              {} as Record<string, unknown[]>,
            );

            // Get user profile
            const profile = healthContext.userProfile || {};

            // Calculate health scores directly from current data
            const dailyScoresFromCurrent = calculateDailyHealthScores(
              healthDataResults as HealthDataResults,
              profile,
            );

            if (dailyScoresFromCurrent.length > 0) {
              // Calculate averages from the daily scores
              const metrics = [
                "overall",
                "activity",
                "sleep",
                "heart",
                "energy",
              ];
              const averages: Record<string, number> = {};
              for (const metric of metrics) {
                const values = dailyScoresFromCurrent
                  .map(
                    (
                      day: import("@/utils/dailyHealthScoreCalculator").DailyHealthScores,
                    ) =>
                      day.scores.find(
                        (s: import("@/types/HealthContext").HealthScore) =>
                          s.type === metric,
                      )?.value,
                  )
                  .filter(
                    (v: number | undefined): v is number =>
                      typeof v === "number" && !isNaN(v),
                  );
                averages[metric] =
                  values.length > 0
                    ? Math.round(
                        values.reduce((a: number, b: number) => a + b, 0) /
                          values.length,
                      )
                    : 0;
              }
              setHealthContext((prev) => ({
                ...prev,
                healthScores: metrics.map((type) => ({
                  type,
                  value: averages[type],
                  date: new Date().toISOString(),
                })),
              }));
              return;
            }
          } catch (error) {
            console.error(
              "❌ Failed to calculate health scores from current data:",
              error,
            );
          }
        }
        setHealthContext((prev) => ({ ...prev, healthScores: [] }));
        return;
      }
      // For each metric, collect all daily values
      const metrics = ["overall", "activity", "sleep", "heart", "energy"];
      const averages: Record<string, number> = {};
      for (const metric of metrics) {
        const values = dailyScores
          .map(
            (
              day: import("@/utils/dailyHealthScoreCalculator").DailyHealthScores,
            ) =>
              day.scores.find(
                (s: import("@/types/HealthContext").HealthScore) =>
                  s.type === metric,
              )?.value,
          )
          .filter(
            (v: number | undefined): v is number =>
              typeof v === "number" && !isNaN(v),
          );
        averages[metric] =
          values.length > 0
            ? Math.round(
                values.reduce((a: number, b: number) => a + b, 0) /
                  values.length,
              )
            : 0;
      }
      setHealthContext((prev) => ({
        ...prev,
        healthScores: metrics.map((type) => ({
          type,
          value: averages[type],
          date: new Date().toISOString(),
        })),
      }));
    }
    updateHealthScoresFromDaily();
  }, [metricData]);

  // Calculate and store daily health scores
  useEffect(() => {
    if (metricData && Object.keys(metricData).length > 0) {
      try {
        // Convert metricData to the format expected by calculateDailyHealthScores
        const healthDataResults = Object.entries(metricData).reduce(
          (acc, [metricType, dataPoints]) => {
            acc[metricType] = dataPoints.map((point) => ({
              startDate: point.startDate,
              endDate: point.endDate,
              value: point.value,
              unit: point.unit,
              source: point.source,
              device: point.device,
              type: metricType,
            }));
            return acc;
          },
          {} as Record<string, unknown[]>,
        );

        // Get user profile
        const profile = healthContext.userProfile || {};

        // Use the async function that handles both calculation and storage
        calculateAndStoreDailyHealthScores(
          healthDataResults as HealthDataResults,
          profile,
        )
          .then((dailyScores: unknown[]) => {
            console.log(
              "✅ [Daily Scores] Daily health scores calculated and stored successfully:",
              dailyScores.length,
            );
          })
          .catch((error: Error) => {
            console.error(
              "❌ [Daily Scores] Failed to calculate and store daily health scores:",
              error,
            );
          });
      } catch (error) {
        console.error(
          "❌ [Daily Scores] Failed to prepare data for daily health scores:",
          error,
        );
      }
    }
  }, [healthContext.userProfile, metricData]);

  const updateProcessingProgress = (progress: number, status: string): void => {
    setProcessingState((prev) => ({ ...prev, progress, status }));
  };

  const setProcessingError = (error: string): void => {
    setProcessingState((prev) => ({ ...prev, error, isProcessing: false }));
  };

  const addMetricData = (): void => {
    // Placeholder for future mutation logic
  };

  const clearData = (): void => {
    // This is a placeholder. In a full migration, you would clear IndexedDB and invalidate the query.
    setProcessingState(defaultProcessingState);
  };

  const hasData = (): boolean => {
    return (
      Object.keys(metricData).length > 0 &&
      Object.values(metricData).some(
        (data) => Array.isArray(data) && data.length > 0,
      )
    );
  };

  // HealthContext methods
  const addGoal = (goal: HealthGoal): void => {
    setHealthContext((prev) => ({ ...prev, goals: [...prev.goals, goal] }));
  };
  const updateGoal = (goal: HealthGoal): void => {
    setHealthContext((prev) => ({
      ...prev,
      goals: prev.goals.map((g) => (g.id === goal.id ? goal : g)),
    }));
  };
  const toggleGoal = (id: string): void => {
    setHealthContext((prev) => ({
      ...prev,
      goals: prev.goals.map((g) =>
        g.id === id ? { ...g, selected: !g.selected } : g,
      ),
    }));
  };
  const removeGoal = (id: string): void => {
    setHealthContext((prev) => ({
      ...prev,
      goals: prev.goals.filter((g) => g.id !== id),
    }));
  };
  const clearGoals = (): void => {
    setHealthContext((prev) => ({ ...prev, goals: [] }));
  };
  const addUploadedFile = (file: UploadedFileSummary): void => {
    setHealthContext((prev) => ({
      ...prev,
      uploadedFiles: [...prev.uploadedFiles, file],
    }));
  };
  const removeUploadedFile = (index: number): void => {
    setHealthContext((prev) => ({
      ...prev,
      uploadedFiles: prev.uploadedFiles.filter((_, i) => i !== index),
    }));
  };
  const clearUploadedFiles = (): void => {
    setHealthContext((prev) => ({ ...prev, uploadedFiles: [] }));
  };
  const setUserProfile = (profile: HealthContext["userProfile"]): void => {
    setHealthContext((prev) => ({ ...prev, userProfile: profile }));
  };
  const addChatMessage = (msg: ChatMessage): void => {
    setHealthContext((prev) => ({
      ...prev,
      chatHistory: [...prev.chatHistory, msg],
    }));
  };

  return (
    <HealthDataContext.Provider
      value={{
        metricData,
        processingState,
        setProcessingState,
        updateProcessingProgress,
        setProcessingError,
        addMetricData,
        clearData,
        hasData,
        metrics: healthContext.metrics,
        healthScores: healthContext.healthScores,
        goals: healthContext.goals,
        addGoal,
        updateGoal,
        toggleGoal,
        removeGoal,
        clearGoals,
        uploadedFiles: healthContext.uploadedFiles,
        addUploadedFile,
        removeUploadedFile,
        clearUploadedFiles,
        userProfile: healthContext.userProfile,
        setUserProfile,
        chatHistory: healthContext.chatHistory,
        addChatMessage,
        setHealthContext,
        profile,
        setProfile,
        isDashboardOpen,
        setIsDashboardOpen,
        isAiCompanionOpen,
        setIsAiCompanionOpen,
      }}
    >
      {children}
    </HealthDataContext.Provider>
  );
}
