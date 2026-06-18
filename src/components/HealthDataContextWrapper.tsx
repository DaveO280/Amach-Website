"use client";

import { useHealthDataQuery } from "@/data/hooks/useHealthDataQuery";
import { useStorjAppleHealthQuery } from "@/data/hooks/useStorjAppleHealthQuery";
import { HealthDataResults } from "@/data/types/healthMetrics";
import {
  ChatMessage,
  HealthContext,
  HealthGoal,
  HealthScore,
  UploadedFileSummary,
} from "@/types/HealthContext";
import {
  HealthDataByType,
  HealthDataPoint,
  ProcessingState,
} from "@/types/healthData";
import { calculateDailyHealthScores } from "@/utils/dailyHealthScoreCalculator";
import { extractDatePart } from "@/utils/dataDeduplicator";
import { processSleepData } from "@/utils/sleepDataProcessor";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { healthDataProcessor } from "@/data/processors/HealthDataProcessor";
import {
  normalizeUserProfile,
  type NormalizedUserProfile,
  type RawUserProfileInput,
} from "@/utils/userProfileUtils";
import type { ParsedReportSummary } from "@/types/reportData";
import type {
  MonthlyScoreSnapshot,
  VaultOffchainReference,
  VaultPinnedInsight,
  WalletContextVault,
} from "@/types/contextVault";
import { buildContextVaultSnapshot } from "@/utils/contextVault";
import { useWalletService } from "@/hooks/useWalletService";
import { useStorjHealthSync } from "@/hooks/useStorjHealthSync";

// Profile type
interface ProfileData extends NormalizedUserProfile {}

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
  reports: ParsedReportSummary[];
  addParsedReports: (reports: ParsedReportSummary[]) => void;
  clearReports: () => void;
  removeReport: (index: number) => void;
  updateReport: (index: number, patch: Partial<ParsedReportSummary>) => void;
  userProfile: HealthContext["userProfile"];
  setUserProfile: (profile: HealthContext["userProfile"]) => void;
  chatHistory: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  clearChatHistory: () => void;
  setHealthContext: React.Dispatch<React.SetStateAction<HealthContext>>;
  buildContextVault: (options?: {
    monthlyScores?: MonthlyScoreSnapshot[];
    pinnedInsights?: VaultPinnedInsight[];
    offchainReferences?: VaultOffchainReference[];
    recentMessagesLimit?: number;
    metadata?: Record<string, unknown>;
  }) => WalletContextVault;
  saveContextVault: (options?: {
    monthlyScores?: MonthlyScoreSnapshot[];
    pinnedInsights?: VaultPinnedInsight[];
    offchainReferences?: VaultOffchainReference[];
    recentMessagesLimit?: number;
    metadata?: Record<string, unknown>;
  }) => Promise<{ success: boolean; error?: string }>;
  loadContextVault: () => Promise<WalletContextVault | null>;
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
  reports: [],
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
  const walletService = useWalletService();
  // Sync Apple Health data from Storj into IndexedDB when local data is absent
  useStorjHealthSync();
  // Health data state — IndexedDB is primary; Storj fills any gaps
  const {
    data: indexedDbMetricData = {},
    isPending,
    error,
  } = useHealthDataQuery();
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

  // Get wallet service (includes blockchain profile loading)
  const {
    isConnected,
    address,
    loadHealthProfileFromBlockchain,
    getDecryptedProfile,
  } = walletService;

  // Fetch Apple Health + breathing sessions from Storj (background, non-blocking).
  // Only fires when the wallet encryption key is already cached (no popup).
  const { data: storjHealthData } = useStorjAppleHealthQuery(
    isConnected ? (address ?? undefined) : undefined,
  );

  // Storj is the canonical full history (2+ years from iOS uploads).
  // Stat card averages and agent context come directly from storjHealthData —
  // no merging with IndexedDB. Double-counting is eliminated because there is
  // exactly one data source for the numbers shown on screen.
  // Falls back to IndexedDB while Storj is still loading or for manual-import
  // users who have never synced via iOS.
  //
  // Dirty-data guard: old Storj uploads (before the per-source dedup fix) can
  // contain doubled cumulative totals (Watch + iPhone both summed into daily
  // summaries). We detect this by comparing the 7-day step average from Storj
  // against IndexedDB. If Storj is >1.5x IDB the upload is pre-dedup and we
  // fall back to IndexedDB until a clean upload runs (PR #88 + fresh import).
  const metricData = useMemo((): HealthDataByType => {
    if (!storjHealthData || Object.keys(storjHealthData).length === 0) {
      return indexedDbMetricData;
    }

    if (Object.keys(indexedDbMetricData).length > 0) {
      const STEP_KEY = "HKQuantityTypeIdentifierStepCount";
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const recentDailyAvg = (points: HealthDataPoint[]): number => {
        const byDay: Record<string, number> = {};
        for (const p of points) {
          const t = new Date(p.startDate).getTime();
          if (isNaN(t) || t < sevenDaysAgo) continue;
          const day = p.startDate.substring(0, 10);
          const v = parseFloat(p.value);
          if (!isNaN(v) && v > 0) byDay[day] = (byDay[day] ?? 0) + v;
        }
        const vals = Object.values(byDay);
        return vals.length > 0
          ? vals.reduce((a, b) => a + b, 0) / vals.length
          : 0;
      };

      const storjAvg = recentDailyAvg(storjHealthData[STEP_KEY] ?? []);
      const idbAvg = recentDailyAvg(indexedDbMetricData[STEP_KEY] ?? []);

      if (storjAvg > 0 && idbAvg > 0 && storjAvg > idbAvg * 1.5) {
        console.warn(
          `[HealthDataContext] Storj 7d step avg (${Math.round(storjAvg)}) is >1.5× IDB avg (${Math.round(idbAvg)}) — Storj data appears doubled (pre-dedup upload). Falling back to IndexedDB until a clean Storj upload runs.`,
        );
        return indexedDbMetricData;
      }
    }

    return storjHealthData;
  }, [indexedDbMetricData, storjHealthData]);

  // Load long-range processed aggregates on startup (enables fast charts / tool-use without reprocessing raw data).
  useEffect(() => {
    void healthDataProcessor.loadFromDb();
  }, []);

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

  // Load user profile from blockchain when wallet is connected (only once)
  const profileLoadedRef = React.useRef<string | null>(null);
  useEffect(() => {
    const loadProfileFromBlockchain = async (): Promise<void> => {
      if (!isConnected || !address) {
        profileLoadedRef.current = null;
        return;
      }

      // Prevent re-loading if we've already loaded for this address
      if (profileLoadedRef.current === address) {
        return;
      }

      try {
        // Load encrypted profile from blockchain
        const loadResult = await loadHealthProfileFromBlockchain();

        if (!loadResult.success || !loadResult.profile) {
          console.warn(
            "⚠️ Failed to load profile from blockchain:",
            loadResult.error,
          );
          return;
        }

        // Decrypt the profile
        const walletProfile = await getDecryptedProfile(loadResult.profile);

        if (!walletProfile) {
          console.warn("⚠️ Failed to decrypt profile from blockchain");
          return;
        }

        const rawProfile: RawUserProfileInput = {
          birthDate: walletProfile.birthDate,
          sex: walletProfile.sex,
          height: walletProfile.height,
          heightIn: (walletProfile as { heightIn?: number }).heightIn,
          heightCm: (walletProfile as { heightCm?: number }).heightCm,
          weight: walletProfile.weight,
          weightKg: (walletProfile as { weightKg?: number }).weightKg,
          weightLbs: (walletProfile as { weightLbs?: number }).weightLbs,
          age: (walletProfile as { age?: number }).age,
          name: (walletProfile as { name?: string }).name,
        };

        const normalizedProfile = normalizeUserProfile(rawProfile);

        setHealthContext((prev) => ({
          ...prev,
          userProfile: normalizedProfile,
        }));

        setProfile(normalizedProfile);

        // Mark as loaded for this address
        profileLoadedRef.current = address;

        console.log(
          "✅ Updated user profile from blockchain:",
          normalizedProfile,
        );
      } catch (error) {
        console.error("❌ Failed to load profile from blockchain:", error);
      }
    };

    void loadProfileFromBlockchain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]); // Only depend on isConnected and address, not the functions

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

    // Helper: process numeric data for cumulative metrics (sum daily totals).
    // For Storj-native metricData (one pre-summed point per day at T12:00 UTC),
    // the sum loop is a no-op (single-point days), but remains correct for
    // IndexedDB raw records which may have many intraday entries per day.
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

    // Helper: process heart rate data (average daily values).
    // For Storj-native metricData, storjAppleHealthConverter.extractNumericValue
    // passes avg only (not min/max), so min/max will equal avg for Storj days.
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
    // NOTE: Data is already deduplicated during upload in HealthDataSelector
    // No need to deduplicate again here - this was causing redundant processing
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

    // Days with value=0 for cumulative metrics (steps, exercise) represent days
    // with no recorded device activity — Apple Watch simply omits records for
    // unworn days, so a 0 in the dataset signals missing data, not genuine rest.
    // Including them inflates the denominator and depresses the displayed average.
    const stepsActive = steps.filter((d) => (d.value ?? 0) > 0);
    const exerciseActive = exercise.filter((d) => (d.value ?? 0) > 0);

    console.log("[HealthDataContextWrapper] metrics computation:", {
      stepDaysTotal: steps.length,
      stepDaysActive: stepsActive.length,
      stepRawAvgAllDays:
        steps.length > 0
          ? Math.round(
              steps.reduce((s, d) => s + (d.value ?? 0), 0) / steps.length,
            )
          : 0,
      stepAvgActiveDays:
        stepsActive.length > 0
          ? Math.round(
              stepsActive.reduce((s, d) => s + (d.value ?? 0), 0) /
                stepsActive.length,
            )
          : 0,
      exerciseDaysTotal: exercise.length,
      exerciseDaysActive: exerciseActive.length,
    });

    // Calculate metrics from processed data
    const metrics = {
      steps: {
        average:
          stepsActive.length > 0
            ? Math.round(
                stepsActive.reduce((sum, day) => sum + (day.value ?? 0), 0) /
                  stepsActive.length,
              )
            : 0,
        high: Math.max(...steps.map((day) => day.value ?? 0), 0),
        low:
          stepsActive.length > 0
            ? Math.min(...stepsActive.map((day) => day.value ?? 0))
            : 0,
      },
      exercise: {
        average:
          exerciseActive.length > 0
            ? Math.round(
                exerciseActive.reduce((sum, day) => sum + (day.value ?? 0), 0) /
                  exerciseActive.length,
              )
            : 0,
        high: Math.max(...exercise.map((day) => day.value ?? 0), 0),
        low:
          exerciseActive.length > 0
            ? Math.min(...exerciseActive.map((day) => day.value ?? 0))
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
                // Cap at 900 min (15h) — values above this are double-counted uploads
                // from multiple devices. Upload path now deduplicates; cap guards old data.
                ...processedSleepData
                  .filter((day) => day.sleepDuration <= 900)
                  .map((day) => day.sleepDuration),
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
  }, [metricData, healthContext.userProfile]);

  // --- Compute healthScores from Storj metricData (context fallback for components
  //     that don't use useStorjHealthScores directly, e.g. HealthReport) ---
  useEffect((): void => {
    if (!metricData || Object.keys(metricData).length === 0) {
      setHealthContext((prev) => ({ ...prev, healthScores: [] }));
      return;
    }

    const healthDataResults = Object.entries(metricData).reduce(
      (acc: Record<string, unknown[]>, [metricType, dataPoints]) => {
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
      {},
    );

    const dailyScores = calculateDailyHealthScores(
      healthDataResults as HealthDataResults,
      healthContext.userProfile || {},
    );

    if (dailyScores.length === 0) {
      setHealthContext((prev) => ({ ...prev, healthScores: [] }));
      return;
    }

    const scoreTypes = ["overall", "activity", "sleep", "heart", "energy"];
    const averages: Record<string, number> = {};
    for (const scoreType of scoreTypes) {
      const values = dailyScores
        .map((day) => day.scores.find((s) => s.type === scoreType)?.value)
        .filter(
          (v): v is number => typeof v === "number" && !isNaN(v) && v > 0,
        );
      averages[scoreType] =
        values.length > 0
          ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
          : 0;
    }

    setHealthContext((prev) => ({
      ...prev,
      healthScores: scoreTypes.map((type) => ({
        type,
        value: averages[type],
        date: new Date().toISOString(),
      })),
    }));
  }, [metricData, healthContext.userProfile]);

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
    setHealthContext((prev) => {
      const updatedFiles = [...prev.uploadedFiles, file];
      const aggregatedReports = updatedFiles.flatMap(
        (entry) => entry.parsedReports ?? [],
      );
      return {
        ...prev,
        uploadedFiles: updatedFiles,
        reports: aggregatedReports,
      };
    });
  };
  const removeUploadedFile = (index: number): void => {
    setHealthContext((prev) => {
      const updatedFiles = prev.uploadedFiles.filter((_, i) => i !== index);
      const aggregatedReports = updatedFiles.flatMap(
        (entry) => entry.parsedReports ?? [],
      );
      return {
        ...prev,
        uploadedFiles: updatedFiles,
        reports: aggregatedReports,
      };
    });
  };
  const clearUploadedFiles = (): void => {
    setHealthContext((prev) => ({ ...prev, uploadedFiles: [], reports: [] }));
  };
  const addParsedReports = (reports: ParsedReportSummary[]): void => {
    if (!reports.length) return;
    setHealthContext((prev) => ({
      ...prev,
      reports: [...(prev.reports ?? []), ...reports],
    }));
  };
  const clearReports = (): void => {
    setHealthContext((prev) => ({ ...prev, reports: [] }));
  };
  const removeReport = (index: number): void => {
    setHealthContext((prev) => ({
      ...prev,
      reports: (prev.reports ?? []).filter((_, i) => i !== index),
    }));
  };
  const updateReport = (
    index: number,
    patch: Partial<ParsedReportSummary>,
  ): void => {
    setHealthContext((prev) => ({
      ...prev,
      reports: (prev.reports ?? []).map((r, i) =>
        i === index ? { ...r, ...patch } : r,
      ),
    }));
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
  const clearChatHistory = (): void => {
    setHealthContext((prev) => ({ ...prev, chatHistory: [] }));
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
        reports: healthContext.reports ?? [],
        addParsedReports,
        clearReports,
        removeReport,
        updateReport,
        userProfile: healthContext.userProfile,
        setUserProfile,
        chatHistory: healthContext.chatHistory,
        addChatMessage,
        clearChatHistory,
        setHealthContext,
        profile,
        setProfile,
        isDashboardOpen,
        setIsDashboardOpen,
        isAiCompanionOpen,
        setIsAiCompanionOpen,
        buildContextVault: (options) =>
          buildContextVaultSnapshot({
            healthContext,
            monthlyScores: options?.monthlyScores,
            pinnedInsights: options?.pinnedInsights,
            offchainReferences: options?.offchainReferences,
            recentMessagesLimit: options?.recentMessagesLimit,
            metadata: options?.metadata,
          }),
        saveContextVault: async (options) => {
          const vault = buildContextVaultSnapshot({
            healthContext,
            monthlyScores: options?.monthlyScores,
            pinnedInsights: options?.pinnedInsights,
            offchainReferences: options?.offchainReferences,
            recentMessagesLimit: options?.recentMessagesLimit,
            metadata: options?.metadata,
          });
          return walletService.saveContextVault(vault);
        },
        loadContextVault: () => walletService.loadContextVault(),
      }}
    >
      {children}
    </HealthDataContext.Provider>
  );
}
