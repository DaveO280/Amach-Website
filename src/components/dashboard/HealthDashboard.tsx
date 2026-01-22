"use client";

import type { MetricSample } from "@/agents/types";
import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { Alert } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { healthDataProcessor } from "@/data/processors/HealthDataProcessor";
import type { HealthData, HealthDataPoint } from "@/types/healthData";
import type { DailyProcessedSleepData } from "@/utils/sleepDataProcessor";
import { Activity, Download, Heart, Lock, Moon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HealthScoreCards } from "../ai/HealthScoreCards";
import { HealthScoreTrends } from "../ai/HealthScoreTrends";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { MetricSummary } from "./MetricSummary";
import ActiveEnergyChart from "./charts/ActiveEnergyChart";
import DistanceChart from "./charts/DistanceChart";
import ExerciseTimeChart from "./charts/ExerciseTimeChart";
import HRDistributionChart from "./charts/HRDistributionChart";
import HRVChart from "./charts/HRVChart";
import HeartRateChart from "./charts/HeartRateChart";
import SleepAnalysisChart from "./charts/SleepAnalysisChart";
import StepCountChart from "./charts/StepCountChart";

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
  const heartRateForCharts = useMemo(() => {
    const samples = healthDataProcessor.getDataForVisualization(
      "HKQuantityTypeIdentifierHeartRate",
      { aggregationLevel: "daily" },
    );
    if (samples.length > 0)
      return toHealthData(samples, "HKQuantityTypeIdentifierHeartRate");
    return (metricData["HKQuantityTypeIdentifierHeartRate"] ||
      []) as HealthData[];
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
    // Loading state display...
    return (
      <div className="min-h-screen bg-[linear-gradient(to_bottom_right,var(--warm-bg)_0%,white_50%,var(--primary-light)_100%)]">
        <div className="container mx-auto px-4 py-12">
          <Card className="w-full border-none shadow-lg bg-transparent backdrop-blur-sm">
            <CardHeader className="border-b border-amber-50/20">
              <CardTitle
                className="text-emerald-900 font-bold"
                style={{ color: "#006B4F" }}
              >
                Loading Health Dashboard
              </CardTitle>
              <CardDescription className="text-emerald-800">
                Please wait while we load your health data...
              </CardDescription>
            </CardHeader>
            <CardContent className="py-8 bg-white/10 backdrop-blur-sm">
              <div className="flex justify-center">
                <div className="animate-pulse-slow rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-600"></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!metrics) {
    // No data display...
    return (
      <div className="min-h-screen bg-[linear-gradient(to_bottom_right,var(--warm-bg)_0%,white_50%,var(--primary-light)_100%)]">
        <div className="container mx-auto px-4 py-12">
          <Card className="w-full border-none shadow-lg bg-transparent backdrop-blur-sm">
            <CardHeader className="border-b border-amber-50/20">
              <CardTitle
                className="text-emerald-900 font-bold"
                style={{ color: "#006B4F" }}
              >
                Health Dashboard
              </CardTitle>
              <CardDescription className="text-emerald-800 italic">
                &quot;Driven by Data, Guided by Nature&quot;
              </CardDescription>
            </CardHeader>
            <CardContent className="py-6 bg-white/10 backdrop-blur-sm">
              <Alert className="bg-amber-50/30 border-amber-100 text-amber-900 mt-4">
                <p>To view your health data visualizations, please:</p>
                <ol className="list-decimal ml-5 mt-2 space-y-1">
                  <li>Go to the Data Selector page</li>
                  <li>Upload your Apple Health export.xml file</li>
                  <li>Select the metrics you want to analyze</li>
                  <li>Click &quot;Process Data&quot;</li>
                </ol>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(to_bottom_right,var(--warm-bg)_0%,white_50%,var(--primary-light)_100%)]">
      <div className="container mx-auto px-4 py-12">
        {/* Main card with transparent background */}
        <Card className="w-full mb-6 border-none shadow-lg bg-transparent backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-amber-50/20">
            <div>
              <CardTitle
                className="text-2xl text-emerald-900 font-bold"
                style={{ color: "#006B4F" }}
              >
                Health Dashboard
              </CardTitle>
              <CardDescription className="text-emerald-800 italic">
                &quot;Driven by Data, Guided by Nature&quot; Health Overview
              </CardDescription>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center text-emerald-800 text-xs px-3 py-1 rounded-full bg-emerald-50/30 border border-emerald-100/30">
                <Lock className="w-3 h-3 mr-1" />
                <span>Data Secured</span>
              </div>
              <Button
                onClick={() => {
                  // Implement download logic here
                }}
                className="bg-emerald-50/30 text-emerald-800 hover:bg-emerald-100/40 border border-emerald-200/30"
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
              </Button>
            </div>
          </CardHeader>
        </Card>

        <Tabs
          defaultValue={activeTab}
          onValueChange={handleTabChange}
          className="w-full"
        >
          <div className="mb-6 grid grid-cols-4 gap-4">
            {/* Heart Tab */}
            <Card className="border-none shadow-lg bg-transparent backdrop-blur-sm p-0 overflow-hidden">
              <TabsList className="w-full p-0 bg-transparent">
                <TabsTrigger
                  value="heart"
                  className="w-full data-[state=active]:bg-white/20 data-[state=active]:text-emerald-800 data-[state=active]:border-b-2 data-[state=active]:border-emerald-600 py-3"
                >
                  <Heart className="w-4 h-4 mr-2" /> Heart
                </TabsTrigger>
              </TabsList>
            </Card>

            {/* Activity Tab */}
            <Card className="border-none shadow-lg bg-transparent backdrop-blur-sm p-0 overflow-hidden">
              <TabsList className="w-full p-0 bg-transparent">
                <TabsTrigger
                  value="activity"
                  className="w-full data-[state=active]:bg-white/20 data-[state=active]:text-emerald-800 data-[state=active]:border-b-2 data-[state=active]:border-emerald-600 py-3"
                >
                  <Activity className="w-4 h-4 mr-2" /> Activity
                </TabsTrigger>
              </TabsList>
            </Card>

            {/* Sleep Tab */}
            <Card className="border-none shadow-lg bg-transparent backdrop-blur-sm p-0 overflow-hidden">
              <TabsList className="w-full p-0 bg-transparent">
                <TabsTrigger
                  value="sleep"
                  className="w-full data-[state=active]:bg-white/20 data-[state=active]:text-emerald-800 data-[state=active]:border-b-2 data-[state=active]:border-emerald-600 py-3"
                >
                  <Moon className="w-4 h-4 mr-2" /> Sleep
                </TabsTrigger>
              </TabsList>
            </Card>

            {/* Overview Tab */}
            <Card className="border-none shadow-lg bg-transparent backdrop-blur-sm p-0 overflow-hidden">
              <TabsList className="w-full p-0 bg-transparent">
                <TabsTrigger
                  value="overview"
                  className="w-full data-[state=active]:bg-white/20 data-[state=active]:text-emerald-800 data-[state=active]:border-b-2 data-[state=active]:border-emerald-600 py-3"
                >
                  Overview
                </TabsTrigger>
              </TabsList>
            </Card>
          </div>

          <TabsContent value="heart" className="space-y-6">
            <Card className="border-none shadow-lg bg-transparent backdrop-blur-sm">
              <CardHeader className="border-b border-amber-50/20">
                <CardTitle className="text-emerald-900 text-xl font-bold">
                  Heart Rate Over Time
                </CardTitle>
                <CardDescription className="text-emerald-800">
                  Daily average, minimum, and maximum heart rate
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 bg-white/10 backdrop-blur-sm">
                <HeartRateChart data={heartRateForCharts} height={400} />
              </CardContent>
            </Card>

            {heartRateForCharts.length > 0 && (
              <Card className="border-none shadow-lg bg-transparent backdrop-blur-sm">
                <CardHeader className="border-b border-amber-50/20">
                  <CardTitle className="text-emerald-900 text-xl font-bold">
                    Heart Rate Distribution
                  </CardTitle>
                  <CardDescription className="text-emerald-800">
                    Distribution of heart rate readings across different
                    intensity zones
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-white/10 backdrop-blur-sm">
                  <HRDistributionChart data={heartRateForCharts} height={400} />
                </CardContent>
              </Card>
            )}

            {hrvForCharts.length > 0 && (
              <Card className="border-none shadow-lg bg-transparent backdrop-blur-sm">
                <CardHeader className="border-b border-amber-50/20">
                  <CardTitle className="text-emerald-900 text-xl font-bold">
                    Heart Rate Variability
                  </CardTitle>
                  <CardDescription className="text-emerald-800">
                    Daily average heart rate variability (HRV)
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-white/10 backdrop-blur-sm">
                  <HRVChart data={hrvForCharts} height={400} />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="activity" className="space-y-6">
            <Card className="border-none shadow-lg bg-transparent backdrop-blur-sm">
              <CardHeader className="border-b border-amber-50/20">
                <CardTitle className="text-emerald-900 text-xl font-bold">
                  Step Count
                </CardTitle>
                <CardDescription className="text-emerald-800">
                  Daily step count and trends
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 bg-white/10 backdrop-blur-sm">
                <StepCountChart data={stepCountForCharts} height={400} />
              </CardContent>
            </Card>

            {distanceForCharts.length > 0 && (
              <Card className="border-none shadow-lg bg-transparent backdrop-blur-sm">
                <CardHeader className="border-b border-amber-50/20">
                  <CardTitle className="text-emerald-900 text-xl font-bold">
                    Distance Walking/Running
                  </CardTitle>
                  <CardDescription className="text-emerald-800">
                    Daily distance covered
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-white/10 backdrop-blur-sm">
                  <DistanceChart data={distanceForCharts} height={400} />
                </CardContent>
              </Card>
            )}

            {activeEnergyForCharts.length > 0 && (
              <Card className="border-none shadow-lg bg-transparent backdrop-blur-sm">
                <CardHeader className="border-b border-amber-50/20">
                  <CardTitle className="text-emerald-900 text-xl font-bold">
                    Active Energy Burned
                  </CardTitle>
                  <CardDescription className="text-emerald-800">
                    Daily active calories burned
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-white/10 backdrop-blur-sm">
                  <ActiveEnergyChart
                    data={activeEnergyForCharts}
                    height={400}
                  />
                </CardContent>
              </Card>
            )}

            {exerciseTimeForCharts.length > 0 && (
              <Card className="border-none shadow-lg bg-transparent backdrop-blur-sm">
                <CardHeader className="border-b border-amber-50/20">
                  <CardTitle className="text-emerald-900 text-xl font-bold">
                    Exercise Time
                  </CardTitle>
                  <CardDescription className="text-emerald-800">
                    Daily exercise duration
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-white/10 backdrop-blur-sm">
                  <ExerciseTimeChart
                    data={exerciseTimeForCharts}
                    height={400}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="sleep" className="space-y-6">
            {(sleepDailyProcessed.length > 0 ||
              sleepRawFallback.length > 0) && (
              <Card className="border-none shadow-lg bg-transparent backdrop-blur-sm">
                <CardHeader className="border-b border-amber-50/20">
                  <CardTitle className="text-emerald-900 text-xl font-bold">
                    Sleep Analysis
                  </CardTitle>
                  <CardDescription className="text-emerald-800">
                    Sleep duration, efficiency, and stage breakdown
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-white/10 backdrop-blur-sm">
                  <SleepAnalysisChart
                    data={sleepRawFallback}
                    processedData={
                      sleepDailyProcessed.length > 0
                        ? sleepDailyProcessed
                        : undefined
                    }
                    height={400}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="overview" className="space-y-6">
            {/* Health Score Cards */}
            <Card className="border-none shadow-lg bg-transparent backdrop-blur-sm">
              <CardHeader className="border-b border-amber-50/20">
                <CardTitle className="text-emerald-900 text-xl font-bold">
                  Health Score Overview
                </CardTitle>
                <CardDescription className="text-emerald-800">
                  Your health scores across different categories
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 bg-white/10 backdrop-blur-sm">
                <HealthScoreCards />
              </CardContent>
            </Card>

            {/* Health Score Trends */}
            <Card className="border-none shadow-lg bg-transparent backdrop-blur-sm">
              <CardHeader className="border-b border-amber-50/20">
                <CardTitle className="text-emerald-900 text-xl font-bold">
                  Health Score Trends
                </CardTitle>
                <CardDescription className="text-emerald-800">
                  Historical trends for your health scores
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 bg-white/10 backdrop-blur-sm">
                <HealthScoreTrends />
              </CardContent>
            </Card>

            {/* Health Metrics Summary */}
            <Card className="border-none shadow-lg bg-transparent backdrop-blur-sm">
              <CardHeader className="border-b border-amber-50/20">
                <CardTitle className="text-emerald-900 text-xl font-bold">
                  Health Metrics Summary
                </CardTitle>
                <CardDescription className="text-emerald-800">
                  Overview of your selected health metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 bg-white/10 backdrop-blur-sm">
                <MetricSummary metricData={metrics ? metrics : undefined} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
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
