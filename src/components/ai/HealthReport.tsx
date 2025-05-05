"use client";

import { VeniceApiService } from "@/api/VeniceApiService";
import { Button } from "@/components/ui/button";
import { useHealthData } from "@/my-health-app/store/healthDataStore/provider";
import { extractDatePart } from "@/my-health-app/utils/dataDeduplicator";
import { processSleepData } from "@/my-health-app/utils/sleepDataProcessor";
import { useHealthScoreCalculator } from "@/utils/healthScoreCalculator";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { HealthScoreCards } from "./HealthScoreCards";
import { ProfileInputModal } from "./ProfileInputModal";

interface HealthReportProps {
  profileData?: {
    age: number;
    sex: "male" | "female";
    height: number;
    weight: number;
  };
}

interface AnalysisSection {
  title: string;
  score: number;
  content: string;
}

type HealthScoreKey = "overall" | "activity" | "sleep" | "heart" | "energy";

type HealthDataPoint = { startDate: string; value: string };

// Define Metrics interface for generateSectionAnalysis
interface Metrics {
  steps: { average: number; total?: number; high: number; low: number };
  exercise: { average: number; total?: number; high: number; low: number };
  heartRate: { average: number; total?: number; high: number; low: number };
  hrv: { average: number; total?: number; high: number; low: number };
  restingHR: { average: number; total?: number; high: number; low: number };
  respiratory: { average: number; total?: number; high: number; low: number };
  activeEnergy: { average: number; total?: number; high: number; low: number };
  sleep: {
    average: string | number;
    efficiency: number;
    high: string | number;
    low: string | number;
  };
}

const HealthReport: React.FC<HealthReportProps> = ({
  profileData: initialProfileData,
}) => {
  const { metricData } = useHealthData();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisSection[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [profileData, setProfileData] = useState(initialProfileData);

  // Always call the hook with a valid object
  const healthScores = useHealthScoreCalculator({
    age: profileData?.age || 0,
    sex: profileData?.sex || "male",
    height: profileData?.height || 0,
    weight: profileData?.weight || 0,
  });

  // Check if health data is available
  const hasHealthData = Object.keys(metricData).length > 0;

  // Add useEffect to track analysis state changes
  useEffect(() => {
    console.log("Analysis state changed:", {
      hasAnalysis: Boolean(analysis),
      analysisLength: analysis?.length,
      isGenerating,
      hasHealthScores: Boolean(healthScores),
      healthScores,
    });
  }, [analysis, isGenerating, healthScores]);

  // Process sleep data
  const processedSleepData = useMemo(() => {
    const sleepData = metricData["HKCategoryTypeIdentifierSleepAnalysis"] || [];
    return processSleepData(sleepData);
  }, [metricData]);

  // Calculate metrics
  const metrics = useMemo(() => {
    const stepsData = metricData["HKQuantityTypeIdentifierStepCount"] || [];
    const exerciseData =
      metricData["HKQuantityTypeIdentifierAppleExerciseTime"] || [];
    const heartRateData = metricData["HKQuantityTypeIdentifierHeartRate"] || [];
    const hrvData =
      metricData["HKQuantityTypeIdentifierHeartRateVariabilitySDNN"] || [];
    const restingHRData =
      metricData["HKQuantityTypeIdentifierRestingHeartRate"] || [];
    const respiratoryData =
      metricData["HKQuantityTypeIdentifierRespiratoryRate"] || [];
    const activeEnergyData =
      metricData["HKQuantityTypeIdentifierActiveEnergyBurned"] || [];

    // Process numeric data
    const processNumericData = (
      data: HealthDataPoint[],
    ): {
      day: string;
      date: Date;
      value: number;
      count: number;
      values: number[];
    }[] => {
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
            dailyData[dayKey].total += value;
            dailyData[dayKey].count += 1;
            dailyData[dayKey].values.push(value);
          }
        } catch (e) {
          console.error("Error processing data point:", e);
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

    // Process heart rate type data
    const processHeartRateData = (
      data: HealthDataPoint[],
    ): {
      day: string;
      date: Date;
      avg: number;
      min: number;
      max: number;
      count: number;
    }[] => {
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
          avg: Math.round(
            data.values.reduce((sum, val) => sum + val, 0) / data.values.length,
          ),
          min: Math.round(data.min),
          max: Math.round(data.max),
          count: data.values.length,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    };

    // Process each metric
    const steps = processNumericData(stepsData);
    const exercise = processNumericData(exerciseData);
    const heartRate = processHeartRateData(heartRateData);
    const hrv = processHeartRateData(hrvData);
    const restingHR = processNumericData(restingHRData);
    const respiratory = processNumericData(respiratoryData);
    const activeEnergy = processNumericData(activeEnergyData);

    // Format sleep time to hours and minutes
    const formatSleepTime = (minutes: number): string => {
      const hours = Math.floor(minutes / 60);
      const mins = Math.round(minutes % 60);
      return `${hours}h ${mins}m`;
    };

    return {
      steps: {
        average:
          steps.length > 0
            ? Math.round(
                steps.reduce((sum, day) => sum + day.value, 0) / steps.length,
              )
            : 0,
        total: steps.reduce((sum, day) => sum + day.value, 0),
        high: steps.length > 0 ? Math.max(...steps.map((day) => day.value)) : 0,
        low: steps.length > 0 ? Math.min(...steps.map((day) => day.value)) : 0,
      },
      exercise: {
        average:
          exercise.length > 0
            ? Math.round(
                exercise.reduce((sum, day) => sum + day.value, 0) /
                  exercise.length,
              )
            : 0,
        total: exercise.reduce((sum, day) => sum + day.value, 0),
        high:
          exercise.length > 0
            ? Math.max(...exercise.map((day) => day.value))
            : 0,
        low:
          exercise.length > 0
            ? Math.min(...exercise.map((day) => day.value))
            : 0,
      },
      heartRate: {
        average:
          heartRate.length > 0
            ? Math.round(
                heartRate.reduce((sum, day) => sum + day.avg, 0) /
                  heartRate.length,
              )
            : 0,
        total: heartRate.reduce((sum, day) => sum + day.avg, 0),
        high:
          heartRate.length > 0
            ? Math.max(...heartRate.map((day) => day.max))
            : 0,
        low:
          heartRate.length > 0
            ? Math.min(...heartRate.map((day) => day.min))
            : 0,
      },
      hrv: {
        average:
          hrv.length > 0
            ? Math.round(
                hrv.reduce((sum, day) => sum + day.avg, 0) / hrv.length,
              )
            : 0,
        total: hrv.reduce((sum, day) => sum + day.avg, 0),
        high: hrv.length > 0 ? Math.max(...hrv.map((day) => day.max)) : 0,
        low: hrv.length > 0 ? Math.min(...hrv.map((day) => day.min)) : 0,
      },
      restingHR: {
        average:
          restingHR.length > 0
            ? Math.round(
                restingHR.reduce((sum, day) => sum + day.value, 0) /
                  restingHR.length,
              )
            : 0,
        high: Math.max(...restingHR.map((day) => day.value)),
        low: Math.min(...restingHR.map((day) => day.value)),
      },
      respiratory: {
        average:
          respiratory.length > 0
            ? Math.round(
                respiratory.reduce(
                  (sum, day) =>
                    sum +
                    day.values.reduce((s, v) => s + v, 0) / day.values.length,
                  0,
                ) / respiratory.length,
              )
            : 0,
        high: Math.max(...respiratory.map((day) => Math.max(...day.values))),
        low: Math.min(...respiratory.map((day) => Math.min(...day.values))),
      },
      activeEnergy: {
        average:
          activeEnergy.length > 0
            ? Math.round(
                activeEnergy.reduce((sum, day) => sum + day.value, 0) /
                  activeEnergy.length,
              )
            : 0,
        high: Math.max(...activeEnergy.map((day) => day.value)),
        low: Math.min(...activeEnergy.map((day) => day.value)),
      },
      sleep:
        processedSleepData.length > 0
          ? {
              average: formatSleepTime(
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
              high: formatSleepTime(
                Math.max(...processedSleepData.map((day) => day.sleepDuration)),
              ),
              low: formatSleepTime(
                Math.min(...processedSleepData.map((day) => day.sleepDuration)),
              ),
            }
          : { average: "0h 0m", efficiency: 0, high: "0h 0m", low: "0h 0m" },
    };
  }, [metricData, processedSleepData]);

  const formatHeight = (heightInFeet: number): string => {
    const feet = Math.floor(heightInFeet);
    const inches = Math.round((heightInFeet - feet) * 12);
    return `${feet}' ${inches}"`;
  };

  const generateSectionAnalysis = useCallback(
    async (
      section: HealthScoreKey,
      metrics: Metrics,
    ): Promise<string | null> => {
      if (!healthScores || !profileData) return null;

      // Add more detailed logging
      console.log("Detailed metrics for analysis:", {
        restingHR: {
          value: metrics.restingHR?.average || 0,
          hasData: Boolean(metrics.restingHR?.average),
        },
        respiratory: {
          value: metrics.respiratory?.average || 0,
          hasData: Boolean(metrics.respiratory?.average),
        },
      });

      const formattedHeight = formatHeight(profileData.height);

      const sectionPrompts: Record<HealthScoreKey, string> = {
        overall: `You are a health companion. Write a single, fluid, conversational paragraph that explains the overall health score of ${healthScores.overall} for a ${profileData.age}-year-old ${profileData.sex} (${formattedHeight}, ${profileData.weight}lbs). Seamlessly weave in the following metrics as part of the narrative, not as a list: sleep duration (${metrics.sleep.average}), exercise time (${metrics.exercise.average} min/day), active energy (${metrics.activeEnergy.average} calories/day), resting heart rate (${metrics.restingHR?.average || "N/A"} BPM), respiratory rate (${metrics.respiratory?.average || "N/A"} breaths/min), heart rate (${metrics.heartRate?.average || "N/A"} BPM), heart rate variability (${metrics.hrv?.average || "N/A"} ms), and steps (${metrics.steps.average} steps/day). Do not use bullet points, asterisks, or lists. Make the paragraph warm, encouraging, and easy to read, with all data flowing naturally in the text.`,

        activity: `Write a single, fluid, conversational paragraph that analyzes the activity score of ${healthScores.activity} for a ${profileData.age}-year-old ${profileData.sex} (${formattedHeight}, ${profileData.weight}lbs). Seamlessly include steps (${metrics.steps.average} steps/day), exercise time (${metrics.exercise.average} min/day), and active energy (${metrics.activeEnergy.average} calories/day) as part of the narrative. Do not use bullet points, asterisks, or lists. Make the paragraph warm, encouraging, and easy to read, with all data flowing naturally in the text. Use different language and transitions than in the other sections to keep the report engaging and avoid repetition.`,

        sleep: `Write a single, fluid, conversational paragraph that analyzes the sleep score of ${healthScores.sleep} for a ${profileData.age}-year-old ${profileData.sex} (${formattedHeight}, ${profileData.weight}lbs). Seamlessly include sleep duration (${metrics.sleep.average}) and sleep efficiency (${metrics.sleep.efficiency}%) as part of the narrative. Do not use bullet points, asterisks, or lists. Make the paragraph warm, encouraging, and easy to read, with all data flowing naturally in the text. Use different language and transitions than in the other sections to keep the report engaging and avoid repetition.`,

        heart: `Write a single, fluid, conversational paragraph that analyzes the heart health score of ${healthScores.heart} for a ${profileData.age}-year-old ${profileData.sex} (${formattedHeight}, ${profileData.weight}lbs). Seamlessly include heart rate (${metrics.heartRate?.average || "N/A"} BPM), heart rate variability (${metrics.hrv?.average || "N/A"} ms), resting heart rate (${metrics.restingHR?.average || "N/A"} BPM), and respiratory rate (${metrics.respiratory?.average || "N/A"} breaths/min) as part of the narrative. Do not use bullet points, asterisks, or lists. Make the paragraph warm, encouraging, and easy to read, with all data flowing naturally in the text. Use different language and transitions than in the other sections to keep the report engaging and avoid repetition.`,

        energy: `Write a single, fluid, conversational paragraph that analyzes the energy balance score of ${healthScores.energy} for a ${profileData.age}-year-old ${profileData.sex} (${formattedHeight}, ${profileData.weight}lbs). Seamlessly include active energy (${metrics.activeEnergy.average} calories/day), exercise time (${metrics.exercise.average} min/day), steps (${metrics.steps.average} steps/day), and sleep duration (${metrics.sleep.average}) as part of the narrative. Do not use bullet points, asterisks, or lists. Make the paragraph warm, encouraging, and easy to read, with all data flowing naturally in the text. Use different language and transitions than in the other sections to keep the report engaging and avoid repetition.`,
      };

      const prompt = `As Cosaint, your holistic health companion, provide a detailed analysis of the following health metric:

    ${sectionPrompts[section]}

    For this analysis:
    1. Explain how the specific metrics contribute to the score
    2. Compare the metrics to optimal ranges for someone of your age and sex
    3. Discuss what this reveals about your current health status
    4. Consider how your age, sex, height, and weight affect these metrics
    5. Provide actionable insights for improvement based on your specific profile

    Write in a warm, encouraging tone using second person ("you"). Focus on providing clear, evidence-based insights while maintaining a supportive approach.`;

      const veniceApi = VeniceApiService.fromEnv();
      const response = await veniceApi.generateVeniceResponse(prompt, 1000);
      return response || "Unable to generate analysis for this section.";
    },
    [healthScores, profileData],
  );

  const generateHealthAnalysis = useCallback(async () => {
    if (!profileData || !healthScores) {
      console.error("Health scores not available", {
        hasHealthScores: Boolean(healthScores),
        hasProfileData: Boolean(profileData),
        healthScores,
        profileData,
      });
      throw new Error("Health scores not available");
    }

    setIsGenerating(true);
    setAnalysis(null);

    try {
      const sections: AnalysisSection[] = [];

      // Generate analysis for each section
      for (const [key, score] of Object.entries(healthScores)) {
        const title = key.charAt(0).toUpperCase() + key.slice(1) + " Score";
        const content = await generateSectionAnalysis(
          key as HealthScoreKey,
          metrics,
        );
        if (content) {
          sections.push({ title, score, content });
        }
      }

      setAnalysis(sections);
    } catch (error) {
      console.error("Error generating health analysis:", error);
      setAnalysis(null);
    } finally {
      setIsGenerating(false);
    }
  }, [profileData, healthScores, metrics, generateSectionAnalysis]);

  const formatAnalysis = (sections: AnalysisSection[]): JSX.Element => {
    return (
      <div className="mt-4">
        {sections.map((section, index) => (
          <div key={index} className="mt-4">
            <p className="text-emerald-900 text-lg">
              {section.title}:{" "}
              <span className="font-bold">{section.score}</span>
            </p>
            <div className="mt-2">
              <p className="text-gray-700">{section.content}</p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {!hasHealthData && (
        <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-amber-800">
            No health data available yet. Process your data in the Health
            Dashboard for personalized insights.
          </p>
        </div>
      )}

      {hasHealthData && profileData && (
        <div className="mb-4">
          <HealthScoreCards profileData={profileData} />
          {!analysis && !isGenerating && (
            <Button
              onClick={generateHealthAnalysis}
              className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white w-fit"
            >
              Generate Health Analysis
            </Button>
          )}
          {isGenerating && (
            <div className="mt-4 p-4 bg-emerald-50 rounded-lg">
              <p className="text-emerald-800">
                Generating your personalized health analysis...
              </p>
            </div>
          )}
          {analysis && (
            <div className="mt-4 p-4 bg-white rounded-lg border border-emerald-100">
              {formatAnalysis(analysis)}
            </div>
          )}
        </div>
      )}

      {hasHealthData && !profileData && (
        <div className="flex flex-col space-y-4">
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-amber-800">
              Please enter your profile information to generate a personalized
              health report.
            </p>
          </div>
          <Button
            onClick={() => setShowProfileModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white w-fit"
          >
            Generate Health Report
          </Button>
        </div>
      )}

      <ProfileInputModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onSubmit={(data) => {
          setProfileData(data);
          setShowProfileModal(false);
        }}
      />
    </div>
  );
};

export default HealthReport;
