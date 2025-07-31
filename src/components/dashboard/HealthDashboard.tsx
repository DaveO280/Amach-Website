"use client";

import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { Alert } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Download, Heart, Lock, Moon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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

  // Memoize raw data arrays for charts
  const heartRateRaw = useMemo(
    () => metricData["HKQuantityTypeIdentifierHeartRate"] || [],
    [metricData],
  );
  const hrvRaw = useMemo(
    () => metricData["HKQuantityTypeIdentifierHeartRateVariabilitySDNN"] || [],
    [metricData],
  );
  const stepCountRaw = useMemo(
    () => metricData["HKQuantityTypeIdentifierStepCount"] || [],
    [metricData],
  );
  const distanceRaw = useMemo(
    () => metricData["HKQuantityTypeIdentifierDistanceWalkingRunning"] || [],
    [metricData],
  );
  const activeEnergyRaw = useMemo(
    () => metricData["HKQuantityTypeIdentifierActiveEnergyBurned"] || [],
    [metricData],
  );
  const exerciseTimeRaw = useMemo(
    () => metricData["HKQuantityTypeIdentifierAppleExerciseTime"] || [],
    [metricData],
  );
  const sleepRaw = useMemo(
    () => metricData["HKCategoryTypeIdentifierSleepAnalysis"] || [],
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
                <HeartRateChart data={heartRateRaw} height={400} />
              </CardContent>
            </Card>

            {heartRateRaw.length > 0 && (
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
                  <HRDistributionChart data={heartRateRaw} height={400} />
                </CardContent>
              </Card>
            )}

            {hrvRaw.length > 0 && (
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
                  <HRVChart data={hrvRaw} height={400} />
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
                <StepCountChart data={stepCountRaw} height={400} />
              </CardContent>
            </Card>

            {distanceRaw.length > 0 && (
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
                  <DistanceChart data={distanceRaw} height={400} />
                </CardContent>
              </Card>
            )}

            {activeEnergyRaw.length > 0 && (
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
                  <ActiveEnergyChart data={activeEnergyRaw} height={400} />
                </CardContent>
              </Card>
            )}

            {exerciseTimeRaw.length > 0 && (
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
                  <ExerciseTimeChart data={exerciseTimeRaw} height={400} />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="sleep" className="space-y-6">
            {sleepRaw.length > 0 && (
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
                  <SleepAnalysisChart data={sleepRaw} height={400} />
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
