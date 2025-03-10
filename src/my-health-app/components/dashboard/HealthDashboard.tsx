"use client";

import { Activity, Download, Heart, Lock, Moon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useHealthData } from "../../store/healthDataStore/provider";
import { useSelection } from "../../store/selectionStore/provider";
import { processSleepData } from "../../utils/sleepDataProcessor";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { MetricSummary } from "./MetricSummary";
import ActiveEnergyChart from "./charts/ActiveEnergyChart";
import DistanceChart from "./charts/DistanceChart";
import ExerciseTimeChart from "./charts/ExerciseTimeChart";
import HRDistributionChart from "./charts/HRDistributionChart";
import HRVChart from "./charts/HRVChart";
import HeartRateChart from "./charts/HeartRateChart";
import SleepAnalysisChart from "./charts/SleepAnalysisChart";
import StepCountChart from "./charts/StepCountChart";

export const HealthDashboard = () => {
  const { metricData: healthData, hasData, processingState } = useHealthData();
  const { timeFrame, selectedOptionalMetrics } = useSelection();
  const [activeTab, setActiveTab] = useState("heart");
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  // Set loading state
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, [healthData, timeFrame, selectedOptionalMetrics]);

  // Check if we have data to display
  const dataAvailable = hasData
    ? hasData()
    : Object.keys(healthData).length > 0 &&
      Object.values(healthData).some(
        (data) => Array.isArray(data) && data.length > 0,
      );

  // Get data for specific metrics
  const heartRateData = healthData["HKQuantityTypeIdentifierHeartRate"] || [];
  const stepCountData = healthData["HKQuantityTypeIdentifierStepCount"] || [];
  const sleepAnalysisData =
    healthData["HKCategoryTypeIdentifierSleepAnalysis"] || [];
  const distanceWalkingRunningData =
    healthData["HKQuantityTypeIdentifierDistanceWalkingRunning"] || [];
  const activeEnergyBurnedData =
    healthData["HKQuantityTypeIdentifierActiveEnergyBurned"] || [];
  const exerciseTimeData =
    healthData["HKQuantityTypeIdentifierAppleExerciseTime"] || [];
  const hrvData =
    healthData["HKQuantityTypeIdentifierHeartRateVariabilitySDNN"] || [];

  // Process sleep sessions
  const processedSleepSessions = useMemo(() => {
    if (!sleepAnalysisData || sleepAnalysisData.length === 0) return [];
    return processSleepData(sleepAnalysisData);
  }, [sleepAnalysisData]);

  // Process data for each metric into daily summaries
  const processedData = useMemo(() => {
    interface DailyHeartRateData {
      values: number[];
      min: number;
      max: number;
    }

    interface DailyStepData {
      total: number;
    }

    interface DailyEnergyData {
      total: number;
    }

    interface DailyExerciseData {
      total: number;
    }

    interface SleepMetrics {
      sleepDuration: number;
      sleepEfficiency: number;
      deepSleepMinutes: number;
      remSleepMinutes: number;
      lightSleepMinutes: number;
      awakeningsCount: number;
    }

    interface ProcessedData {
      heartRate?: Array<{
        date: string;
        avgHeartRate: number;
        minHeartRate: number;
        maxHeartRate: number;
      }>;
      stepCount?: Array<{
        date: string;
        steps: number;
      }>;
      activeEnergy?: Array<{
        date: string;
        activeCalories: number;
      }>;
      exerciseTime?: Array<{
        date: string;
        exerciseMinutes: number;
      }>;
      sleep?: Array<{
        date: string;
        sleepHours: number;
        sleepEfficiency: number;
        deepSleepHours: number;
        remSleepHours: number;
        lightSleepHours: number;
        awakenings: number;
      }>;
    }

    const processed: ProcessedData = {};
    const allDates = new Set<string>();

    // Heart Rate Data
    if (heartRateData.length > 0) {
      const dailyData: Record<string, DailyHeartRateData> = {};
      heartRateData.forEach((point) => {
        try {
          const date = new Date(point.startDate);
          const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          allDates.add(dayKey);
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
        } catch (err) {
          console.error("Error processing heart rate data point:", err);
        }
      });

      processed.heartRate = Object.entries(dailyData).map(([day, data]) => ({
        date: day,
        avgHeartRate: Math.round(
          data.values.reduce((sum, val) => sum + val, 0) / data.values.length,
        ),
        minHeartRate: Math.round(data.min),
        maxHeartRate: Math.round(data.max),
      }));
    }

    // Step Count Data
    if (stepCountData.length > 0) {
      const dailyData: Record<string, DailyStepData> = {};
      stepCountData.forEach((point) => {
        try {
          const date = new Date(point.startDate);
          const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          allDates.add(dayKey);
          const value = parseFloat(point.value);

          if (!isNaN(value)) {
            if (!dailyData[dayKey]) {
              dailyData[dayKey] = { total: 0 };
            }
            dailyData[dayKey].total += value;
          }
        } catch (err) {
          console.error("Error processing step count data point:", err);
        }
      });

      processed.stepCount = Object.entries(dailyData).map(([day, data]) => ({
        date: day,
        steps: Math.round(data.total),
      }));
    }

    // Active Energy Data
    if (activeEnergyBurnedData.length > 0) {
      const dailyData: Record<string, DailyEnergyData> = {};
      activeEnergyBurnedData.forEach((point) => {
        try {
          const date = new Date(point.startDate);
          const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          allDates.add(dayKey);
          const value = parseFloat(point.value);

          if (!isNaN(value)) {
            if (!dailyData[dayKey]) {
              dailyData[dayKey] = { total: 0 };
            }
            dailyData[dayKey].total += value;
          }
        } catch (err) {
          console.error("Error processing active energy data point:", err);
        }
      });

      processed.activeEnergy = Object.entries(dailyData).map(([day, data]) => ({
        date: day,
        activeCalories: Math.round(data.total),
      }));
    }

    // Exercise Time Data
    if (exerciseTimeData.length > 0) {
      const dailyData: Record<string, DailyExerciseData> = {};
      exerciseTimeData.forEach((point) => {
        try {
          const date = new Date(point.startDate);
          const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          allDates.add(dayKey);
          const value = parseFloat(point.value);
          const isSeconds = point.unit?.toLowerCase().includes("sec");

          if (!isNaN(value)) {
            if (!dailyData[dayKey]) {
              dailyData[dayKey] = { total: 0 };
            }
            dailyData[dayKey].total += isSeconds ? value / 60 : value;
          }
        } catch (err) {
          console.error("Error processing exercise time data point:", err);
        }
      });

      processed.exerciseTime = Object.entries(dailyData).map(([day, data]) => ({
        date: day,
        exerciseMinutes: Math.round(data.total),
      }));
    }

    // Sleep Data
    if (processedSleepSessions.length > 0) {
      const sleepMetricsByDate: Record<string, SleepMetrics> = {};

      processedSleepSessions.forEach((session) => {
        const date = session.date;
        allDates.add(date);

        if (!sleepMetricsByDate[date]) {
          sleepMetricsByDate[date] = {
            sleepDuration: 0,
            sleepEfficiency: 0,
            deepSleepMinutes: 0,
            remSleepMinutes: 0,
            lightSleepMinutes: 0,
            awakeningsCount: 0,
          };
        }

        sleepMetricsByDate[date].sleepDuration += session.sleepDuration;

        const currentTotal =
          sleepMetricsByDate[date].sleepDuration - session.sleepDuration;
        const newEfficiency =
          currentTotal > 0
            ? (sleepMetricsByDate[date].sleepEfficiency * currentTotal +
                session.metrics.sleepEfficiency * session.sleepDuration) /
              (currentTotal + session.sleepDuration)
            : session.metrics.sleepEfficiency;

        sleepMetricsByDate[date].sleepEfficiency = newEfficiency;
        sleepMetricsByDate[date].deepSleepMinutes += session.stageData.deep;
        sleepMetricsByDate[date].remSleepMinutes += session.stageData.rem;
        sleepMetricsByDate[date].lightSleepMinutes += session.stageData.core;
        sleepMetricsByDate[date].awakeningsCount += session.metrics.awakenings;
      });

      processed.sleep = Object.entries(sleepMetricsByDate).map(
        ([date, metrics]) => ({
          date,
          sleepHours: Math.round((metrics.sleepDuration / 60) * 10) / 10,
          sleepEfficiency: Math.round(metrics.sleepEfficiency),
          deepSleepHours: Math.round((metrics.deepSleepMinutes / 60) * 10) / 10,
          remSleepHours: Math.round((metrics.remSleepMinutes / 60) * 10) / 10,
          lightSleepHours:
            Math.round((metrics.lightSleepMinutes / 60) * 10) / 10,
          awakenings: metrics.awakeningsCount,
        }),
      );
    }

    // Combine all metrics into a single dataset
    const combinedData = Array.from(allDates)
      .map((date) => {
        const heartRateData = processed.heartRate?.find(
          (d) => d.date === date,
        ) || {
          avgHeartRate: 0,
          minHeartRate: 0,
          maxHeartRate: 0,
        };
        const stepData = processed.stepCount?.find((d) => d.date === date) || {
          steps: 0,
        };
        const energyData = processed.activeEnergy?.find(
          (d) => d.date === date,
        ) || {
          activeCalories: 0,
        };
        const exerciseData = processed.exerciseTime?.find(
          (d) => d.date === date,
        ) || {
          exerciseMinutes: 0,
        };
        const sleepData = processed.sleep?.find((d) => d.date === date) || {
          sleepHours: 0,
          sleepEfficiency: 0,
          deepSleepHours: 0,
          remSleepHours: 0,
          lightSleepHours: 0,
          awakenings: 0,
        };

        return {
          date,
          ...heartRateData,
          ...stepData,
          ...energyData,
          ...exerciseData,
          ...sleepData,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      combined: combinedData,
      metrics: {
        heartRate: processed.heartRate || [],
        stepCount: processed.stepCount || [],
        activeEnergy: processed.activeEnergy || [],
        exerciseTime: processed.exerciseTime || [],
        sleep: processed.sleep || [],
      },
    };
  }, [
    heartRateData,
    stepCountData,
    activeEnergyBurnedData,
    exerciseTimeData,
    processedSleepSessions,
  ]);

  const handleDownloadData = async () => {
    setIsDownloading(true);
    try {
      const data = processedData.combined;
      if (data.length === 0) return;

      // Add headers with descriptions
      const headerDescriptions = [
        "Date",
        "Average Heart Rate (bpm)",
        "Minimum Heart Rate (bpm)",
        "Maximum Heart Rate (bpm)",
        "Steps",
        "Active Calories Burned",
        "Exercise Time (minutes)",
        "Sleep Duration (hours)",
        "Sleep Efficiency (%)",
        "Deep Sleep (hours)",
        "REM Sleep (hours)",
        "Light Sleep (hours)",
        "Awakenings (count)",
      ].join(",");

      // Convert the data to CSV format
      const headers = [
        "date",
        "avgHeartRate",
        "minHeartRate",
        "maxHeartRate",
        "steps",
        "activeCalories",
        "exerciseMinutes",
        "sleepHours",
        "sleepEfficiency",
        "deepSleepHours",
        "remSleepHours",
        "lightSleepHours",
        "awakenings",
      ].join(",");

      const rows = data.map((row) => {
        return [
          row.date,
          row.avgHeartRate || "",
          row.minHeartRate || "",
          row.maxHeartRate || "",
          row.steps || "",
          row.activeCalories || "",
          row.exerciseMinutes || "",
          row.sleepHours || "",
          row.sleepEfficiency || "",
          row.deepSleepHours || "",
          row.remSleepHours || "",
          row.lightSleepHours || "",
          row.awakenings || "",
        ].join(",");
      });

      const csvContent = [headerDescriptions, headers, ...rows].join("\n");

      // Create and trigger download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `health_data_daily_summary.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading data:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
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

  if (!dataAvailable) {
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
                "Driven by Data, Guided by Nature"
              </CardDescription>
            </CardHeader>
            <CardContent className="py-6 bg-white/10 backdrop-blur-sm">
              <Alert className="bg-amber-50/30 border-amber-100 text-amber-900 mt-4">
                <p>To view your health data visualizations, please:</p>
                <ol className="list-decimal ml-5 mt-2 space-y-1">
                  <li>Go to the Data Selector page</li>
                  <li>Upload your Apple Health export.xml file</li>
                  <li>Select the metrics you want to analyze</li>
                  <li>Click "Process Data"</li>
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
                "Driven by Data, Guided by Nature" — {timeFrame} Health Overview
              </CardDescription>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center text-emerald-800 text-xs px-3 py-1 rounded-full bg-emerald-50/30 border border-emerald-100/30">
                <Lock className="w-3 h-3 mr-1" />
                <span>Data Secured</span>
              </div>
              <Button
                onClick={handleDownloadData}
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
          onValueChange={setActiveTab}
          className="w-full"
        >
          <div className="mb-6 grid grid-cols-4 gap-4">
            {/* Heart Tab */}
            <Card className="border-none shadow-lg bg-transparent backdrop-blur-sm p-0 overflow-hidden">
              <TabsList className="w-full p-0 bg-transparent">
                <TabsTrigger
                  value="heart"
                  className="w-full data-[state=active]:bg-white/20 data-[state=active]:text-emerald-800 data-[state=active]:border-b-2 data-[state=active]:border-emerald-600 py-3"
                  disabled={!(heartRateData.length > 0 || hrvData.length > 0)}
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
                  disabled={
                    !(
                      stepCountData.length > 0 ||
                      distanceWalkingRunningData.length > 0 ||
                      activeEnergyBurnedData.length > 0 ||
                      exerciseTimeData.length > 0
                    )
                  }
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
                  disabled={!(sleepAnalysisData.length > 0)}
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
            {heartRateData.length > 0 && (
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
                  <HeartRateChart data={heartRateData} height={400} />
                </CardContent>
              </Card>
            )}

            {heartRateData.length > 0 && (
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
                  <HRDistributionChart data={heartRateData} height={400} />
                </CardContent>
              </Card>
            )}

            {hrvData.length > 0 && (
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
                  <HRVChart data={hrvData} height={400} />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="activity" className="space-y-6">
            {stepCountData.length > 0 && (
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
                  <StepCountChart data={stepCountData} height={400} />
                </CardContent>
              </Card>
            )}

            {distanceWalkingRunningData.length > 0 && (
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
                  <DistanceChart
                    data={distanceWalkingRunningData}
                    height={400}
                  />
                </CardContent>
              </Card>
            )}

            {activeEnergyBurnedData.length > 0 && (
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
                    data={activeEnergyBurnedData}
                    height={400}
                  />
                </CardContent>
              </Card>
            )}

            {exerciseTimeData.length > 0 && (
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
                  <ExerciseTimeChart data={exerciseTimeData} height={400} />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="sleep" className="space-y-6">
            {sleepAnalysisData.length > 0 && (
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
                  <SleepAnalysisChart data={sleepAnalysisData} height={400} />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="overview" className="space-y-6">
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
                <MetricSummary metricData={healthData as any} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default HealthDashboard;
