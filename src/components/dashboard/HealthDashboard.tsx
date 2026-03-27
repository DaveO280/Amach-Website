"use client";

import type { MetricSample } from "@/agents/types";
import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { Alert } from "@/components/ui/alert";
import { healthDataProcessor } from "@/data/processors/HealthDataProcessor";
import type { HealthData, HealthDataPoint } from "@/types/healthData";
import type { DailyProcessedSleepData } from "@/utils/sleepDataProcessor";
import { Activity, Download, Heart, Lock, Moon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HealthScoreCards } from "../ai/HealthScoreCards";
import { HealthScoreTrends } from "../ai/HealthScoreTrends";
import { MetricSummary } from "./MetricSummary";
import ActiveEnergyChart from "./charts/ActiveEnergyChart";
import DistanceChart from "./charts/DistanceChart";
import ExerciseTimeChart from "./charts/ExerciseTimeChart";
import HRDistributionChart from "./charts/HRDistributionChart";
import HRVChart from "./charts/HRVChart";
import HeartRateChart from "./charts/HeartRateChart";
import SleepAnalysisChart from "./charts/SleepAnalysisChart";
import StepCountChart from "./charts/StepCountChart";

const cardClass =
  "rounded-xl border bg-white dark:bg-[#0B140F] border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)] p-5";

export const HealthDashboard: () => JSX.Element = () => {
  const [activeTab, setActiveTab] = useState("heart");
  const [isLoading] = useState(false);
  const [isDownloading] = useState(false);
  const { metrics, metricData, processingState } = useHealthDataContext();

  const toHealthData = useCallback(
    (samples: MetricSample[], metricType: string): HealthData[] => {
      return samples.map((s) => {
        const meta = (s.metadata || {}) as Record<string, unknown>;
        const min = typeof meta.min === "number" ? String(meta.min) : undefined;
        const max = typeof meta.max === "number" ? String(meta.max) : undefined;
        return {
          startDate: s.timestamp.toISOString(),
          endDate: s.timestamp.toISOString(),
          value: String(s.value),
          unit: s.unit,
          type: metricType,
          min,
          max,
        };
      });
    },
    [],
  );

  // Prefer long-range processed aggregates (persisted) when available.
  // Raw IndexedDB data may be trimmed to a recent window for performance.
  const [heartRateForCharts, setHeartRateForCharts] = useState<HealthData[]>(
    (metricData["HKQuantityTypeIdentifierHeartRate"] || []) as HealthData[],
  );

  useEffect(() => {
    const loadHeartRateData = async (): Promise<void> => {
      try {
        // Use getRawHeartRateSamples to load from IndexedDB if needed
        const samples = await healthDataProcessor.getRawHeartRateSamples({});
        if (samples.length > 0) {
          setHeartRateForCharts(
            toHealthData(samples, "HKQuantityTypeIdentifierHeartRate"),
          );
        } else {
          // Fallback to metricData if no processed data
          setHeartRateForCharts(
            (metricData["HKQuantityTypeIdentifierHeartRate"] ||
              []) as HealthData[],
          );
        }
      } catch (error) {
        console.error(
          "[HealthDashboard] Failed to load heart rate data:",
          error,
        );
        // Fallback to metricData on error
        setHeartRateForCharts(
          (metricData["HKQuantityTypeIdentifierHeartRate"] ||
            []) as HealthData[],
        );
      }
    };
    void loadHeartRateData();
  }, [metricData, toHealthData]);

  const hrvForCharts = useMemo(() => {
    const samples = healthDataProcessor.getDataForVisualization(
      "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
      { aggregationLevel: "daily" },
    );
    if (samples.length > 0)
      return toHealthData(
        samples,
        "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
      );
    return (metricData["HKQuantityTypeIdentifierHeartRateVariabilitySDNN"] ||
      []) as HealthData[];
  }, [metricData, toHealthData]);

  const stepCountForCharts = useMemo(() => {
    const samples = healthDataProcessor.getDataForVisualization(
      "HKQuantityTypeIdentifierStepCount",
      { aggregationLevel: "daily" },
    );
    if (samples.length > 0)
      return toHealthData(samples, "HKQuantityTypeIdentifierStepCount");
    return (metricData["HKQuantityTypeIdentifierStepCount"] ||
      []) as HealthData[];
  }, [metricData, toHealthData]);

  const distanceForCharts = useMemo(() => {
    const samples = healthDataProcessor.getDataForVisualization(
      "HKQuantityTypeIdentifierDistanceWalkingRunning",
      { aggregationLevel: "daily" },
    );
    if (samples.length > 0)
      return toHealthData(
        samples,
        "HKQuantityTypeIdentifierDistanceWalkingRunning",
      );
    return (metricData["HKQuantityTypeIdentifierDistanceWalkingRunning"] ||
      []) as HealthData[];
  }, [metricData, toHealthData]);

  const activeEnergyForCharts = useMemo(() => {
    const samples = healthDataProcessor.getDataForVisualization(
      "HKQuantityTypeIdentifierActiveEnergyBurned",
      { aggregationLevel: "daily" },
    );
    if (samples.length > 0)
      return toHealthData(
        samples,
        "HKQuantityTypeIdentifierActiveEnergyBurned",
      );
    return (metricData["HKQuantityTypeIdentifierActiveEnergyBurned"] ||
      []) as HealthData[];
  }, [metricData, toHealthData]);

  const exerciseTimeForCharts = useMemo(() => {
    const samples = healthDataProcessor.getDataForVisualization(
      "HKQuantityTypeIdentifierAppleExerciseTime",
      { aggregationLevel: "daily" },
    );
    if (samples.length > 0)
      return toHealthData(samples, "HKQuantityTypeIdentifierAppleExerciseTime");
    return (metricData["HKQuantityTypeIdentifierAppleExerciseTime"] ||
      []) as HealthData[];
  }, [metricData, toHealthData]);

  const sleepRawCount = (
    metricData["HKCategoryTypeIdentifierSleepAnalysis"] || []
  ).length;

  const [sleepDailyProcessed, setSleepDailyProcessed] = useState<
    DailyProcessedSleepData[]
  >([]);

  useEffect(() => {
    const sleep = healthDataProcessor.getSleepData();
    setSleepDailyProcessed(sleep.length > 0 ? sleep : []);
  }, [sleepRawCount]);

  const sleepRawFallback = useMemo(
    () =>
      (metricData["HKCategoryTypeIdentifierSleepAnalysis"] ||
        []) as HealthDataPoint[],
    [metricData],
  );

  // Memoize tab change handler
  const handleTabChange = useCallback((tab: string) => setActiveTab(tab), []);

  if (isLoading || processingState.isProcessing) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-12">
          <div className={`w-full ${cardClass}`}>
            <div className="mb-4">
              <h2 className="text-2xl font-bold" style={{ color: "#006B4F" }}>
                Loading Health Dashboard
              </h2>
              <p className="text-[#6B8C7A] text-sm mt-1">
                Please wait while we load your health data...
              </p>
            </div>
            <div className="py-8">
              <div className="flex justify-center">
                <div className="animate-pulse-slow rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-600"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-12">
          <div className={`w-full ${cardClass}`}>
            <div className="mb-4">
              <h2 className="text-2xl font-bold" style={{ color: "#006B4F" }}>
                Health Dashboard
              </h2>
              <p className="text-[#6B8C7A] text-sm mt-1 italic">
                &quot;Driven by Data, Guided by Nature&quot;
              </p>
            </div>
            <div className="py-6">
              <Alert className="bg-amber-50/30 border-amber-100 text-amber-900 mt-4">
                <p>To view your health data visualizations, please:</p>
                <ol className="list-decimal ml-5 mt-2 space-y-1">
                  <li>Go to the Data Selector page</li>
                  <li>Upload your Apple Health export.xml file</li>
                  <li>Select the metrics you want to analyze</li>
                  <li>Click &quot;Process Data&quot;</li>
                </ol>
              </Alert>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { value: string; label: string; icon: JSX.Element | null }[] = [
    { value: "heart", label: "Heart", icon: <Heart className="w-4 h-4" /> },
    {
      value: "activity",
      label: "Activity",
      icon: <Activity className="w-4 h-4" />,
    },
    { value: "sleep", label: "Sleep", icon: <Moon className="w-4 h-4" /> },
    { value: "overview", label: "Overview", icon: null },
  ];

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-12">
        {/* Main header card */}
        <div className={`w-full mb-6 ${cardClass}`}>
          <div className="flex flex-row items-center justify-between border-b border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)] pb-4">
            <div>
              <h2 className="text-2xl font-bold" style={{ color: "#006B4F" }}>
                Health Dashboard
              </h2>
              <p className="text-[#6B8C7A] text-sm mt-1 italic">
                &quot;Driven by Data, Guided by Nature&quot; Health Overview
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center text-xs px-3 py-1 rounded-full dashboard-lock-badge">
                <Lock className="w-3 h-3 mr-1" />
                <span>Data Secured</span>
              </div>
              <button
                onClick={() => {
                  // Implement download logic here
                }}
                className="px-4 py-2 rounded-lg border border-[rgba(0,107,79,0.35)] dark:border-[rgba(74,222,128,0.25)] text-[#006B4F] dark:text-[#4ade80] bg-transparent hover:bg-[rgba(0,107,79,0.07)] transition-colors text-sm flex items-center"
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <>
                    <div className="animate-pulse-slow rounded-full h-4 w-4 border-t-2 border-b-2 border-emerald-600 mr-2" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download Summary
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="mb-6 grid grid-cols-4 gap-4">
          {tabs.map(({ value, label, icon }) => (
            <button
              key={value}
              onClick={() => handleTabChange(value)}
              className={`w-full py-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                activeTab === value
                  ? "bg-[#006B4F] text-white border-[#004d38]"
                  : "bg-white dark:bg-[#0B140F] border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)] text-[#6B8C7A] hover:text-[#006B4F]"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* Heart tab content */}
        {activeTab === "heart" && (
          <div className="space-y-6">
            <div className={cardClass}>
              <div className="mb-4">
                <h3 className="text-xl font-bold text-[#0A1A0F] dark:text-[#F0F7F3]">
                  Heart Rate Over Time
                </h3>
                <p className="text-[#6B8C7A] text-sm mt-1">
                  Daily average, minimum, and maximum heart rate
                </p>
              </div>
              <div className="pt-2">
                <HeartRateChart data={heartRateForCharts} height={400} />
              </div>
            </div>

            {heartRateForCharts.length > 0 && (
              <div className={cardClass}>
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-[#0A1A0F] dark:text-[#F0F7F3]">
                    Heart Rate Distribution
                  </h3>
                  <p className="text-[#6B8C7A] text-sm mt-1">
                    Distribution of heart rate readings across different
                    intensity zones
                  </p>
                </div>
                <div className="pt-2">
                  <HRDistributionChart data={heartRateForCharts} height={400} />
                </div>
              </div>
            )}

            {hrvForCharts.length > 0 && (
              <div className={cardClass}>
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-[#0A1A0F] dark:text-[#F0F7F3]">
                    Heart Rate Variability
                  </h3>
                  <p className="text-[#6B8C7A] text-sm mt-1">
                    Daily average heart rate variability (HRV)
                  </p>
                </div>
                <div className="pt-2">
                  <HRVChart data={hrvForCharts} height={400} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Activity tab content */}
        {activeTab === "activity" && (
          <div className="space-y-6">
            <div className={cardClass}>
              <div className="mb-4">
                <h3 className="text-xl font-bold text-[#0A1A0F] dark:text-[#F0F7F3]">
                  Step Count
                </h3>
                <p className="text-[#6B8C7A] text-sm mt-1">
                  Daily step count and trends
                </p>
              </div>
              <div className="pt-2">
                <StepCountChart data={stepCountForCharts} height={400} />
              </div>
            </div>

            {distanceForCharts.length > 0 && (
              <div className={cardClass}>
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-[#0A1A0F] dark:text-[#F0F7F3]">
                    Distance Walking/Running
                  </h3>
                  <p className="text-[#6B8C7A] text-sm mt-1">
                    Daily distance covered
                  </p>
                </div>
                <div className="pt-2">
                  <DistanceChart data={distanceForCharts} height={400} />
                </div>
              </div>
            )}

            {activeEnergyForCharts.length > 0 && (
              <div className={cardClass}>
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-[#0A1A0F] dark:text-[#F0F7F3]">
                    Active Energy Burned
                  </h3>
                  <p className="text-[#6B8C7A] text-sm mt-1">
                    Daily active calories burned
                  </p>
                </div>
                <div className="pt-2">
                  <ActiveEnergyChart
                    data={activeEnergyForCharts}
                    height={400}
                  />
                </div>
              </div>
            )}

            {exerciseTimeForCharts.length > 0 && (
              <div className={cardClass}>
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-[#0A1A0F] dark:text-[#F0F7F3]">
                    Exercise Time
                  </h3>
                  <p className="text-[#6B8C7A] text-sm mt-1">
                    Daily exercise duration
                  </p>
                </div>
                <div className="pt-2">
                  <ExerciseTimeChart
                    data={exerciseTimeForCharts}
                    height={400}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sleep tab content */}
        {activeTab === "sleep" && (
          <div className="space-y-6">
            {(sleepDailyProcessed.length > 0 ||
              sleepRawFallback.length > 0) && (
              <div className={cardClass}>
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-[#0A1A0F] dark:text-[#F0F7F3]">
                    Sleep Analysis
                  </h3>
                  <p className="text-[#6B8C7A] text-sm mt-1">
                    Sleep duration, efficiency, and stage breakdown
                  </p>
                </div>
                <div className="pt-2">
                  <SleepAnalysisChart
                    data={sleepRawFallback}
                    processedData={
                      sleepDailyProcessed.length > 0
                        ? sleepDailyProcessed
                        : undefined
                    }
                    height={400}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Overview tab content */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className={cardClass}>
              <div className="mb-4">
                <h3 className="text-xl font-bold text-[#0A1A0F] dark:text-[#F0F7F3]">
                  Health Score Overview
                </h3>
                <p className="text-[#6B8C7A] text-sm mt-1">
                  Your health scores across different categories
                </p>
              </div>
              <div className="pt-2">
                <HealthScoreCards />
              </div>
            </div>

            <div className={cardClass}>
              <div className="mb-4">
                <h3 className="text-xl font-bold text-[#0A1A0F] dark:text-[#F0F7F3]">
                  Health Score Trends
                </h3>
                <p className="text-[#6B8C7A] text-sm mt-1">
                  Historical trends for your health scores
                </p>
              </div>
              <div className="pt-2">
                <HealthScoreTrends />
              </div>
            </div>

            <div className={cardClass}>
              <div className="mb-4">
                <h3 className="text-xl font-bold text-[#0A1A0F] dark:text-[#F0F7F3]">
                  Health Metrics Summary
                </h3>
                <p className="text-[#6B8C7A] text-sm mt-1">
                  Overview of your selected health metrics
                </p>
              </div>
              <div className="pt-2">
                <MetricSummary metricData={metrics ? metrics : undefined} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Add a global declaration for the health data summary
declare global {
  interface Window {
    __healthDataProviderMounted?: boolean;
    __selectionProviderMounted?: boolean;
    __healthDataSummary?: {
      generatedAt: string;
      timeFrame: string;
      data: Record<string, unknown> | unknown[] | undefined;
    };
  }
}

export default HealthDashboard;
