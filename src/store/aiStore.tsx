// src/store/aiStore.tsx
"use client";

import { useHealthData } from "@/my-health-app/store/healthDataStore/provider";
import { extractDatePart } from "@/my-health-app/utils/dataDeduplicator";
import { processSleepData } from "@/my-health-app/utils/sleepDataProcessor";
import { CosaintAiService } from "@/services/CosaintAiService";
import React, { createContext, useContext, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";

// Define types for our messages and context
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface HealthDataPoint {
  startDate: string;
  value: string;
}

interface Metrics {
  steps: {
    average: number;
    total: number;
    high: number;
    low: number;
  };
  exercise: {
    average: number;
    total: number;
    high: number;
    low: number;
  };
  heartRate: {
    average: number;
    total: number;
    high: number;
    low: number;
  };
  hrv: {
    average: number;
    total: number;
    high: number;
    low: number;
  };
  restingHR: {
    average: number;
    total: number;
    high: number;
    low: number;
  };
  respiratory: {
    average: number;
    total: number;
    high: number;
    low: number;
  };
  activeEnergy: {
    average: number;
    total: number;
    high: number;
    low: number;
  };
  sleep: {
    average: number;
    efficiency: number;
    high: number;
    low: number;
  };
}

interface AiContextType {
  messages: Message[];
  sendMessage: (message: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  clearMessages: () => void;
  healthData: Metrics;
}

// Create context with a default value that matches the interface
const AiContext = createContext<AiContextType | null>(null);

// Define explicit types for the return values
interface NumericDayData {
  day: string;
  date: Date;
  value: number;
  count: number;
  values: number[];
}

interface HeartRateDayData {
  day: string;
  date: Date;
  avg: number;
  min: number;
  max: number;
  count: number;
}

const AiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { metricData } = useHealthData();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [aiService, setAiService] = useState<CosaintAiService | null>(null);

  // Process sleep data
  const processedSleepData = useMemo(() => {
    const sleepData = metricData["HKCategoryTypeIdentifierSleepAnalysis"] || [];
    return processSleepData(sleepData);
  }, [metricData]);

  // Calculate metrics using the same format as charts
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

    console.log("[AiStore] Raw metric data counts:", {
      steps: stepsData.length,
      exercise: exerciseData.length,
      heartRate: heartRateData.length,
      hrv: hrvData.length,
      restingHR: restingHRData.length,
      respiratory: respiratoryData.length,
      activeEnergy: activeEnergyData.length,
      sleep: metricData["HKCategoryTypeIdentifierSleepAnalysis"]?.length || 0,
    });

    // Process each metric type
    const processNumericData = (
      data: HealthDataPoint[],
      transform: (value: number) => number = (v) => v,
    ): NumericDayData[] => {
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
            dailyData[dayKey].total += transform(value);
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

    const processHeartRateData = (
      data: HealthDataPoint[],
    ): HeartRateDayData[] => {
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
            data.values.reduce((sum: number, val: number) => sum + val, 0) /
              data.values.length,
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

    return {
      steps: {
        average:
          steps.length > 0
            ? Math.round(
                steps.reduce(
                  (sum: number, day: NumericDayData) => sum + day.value,
                  0,
                ) / steps.length,
              )
            : 0,
        total: steps.reduce(
          (sum: number, day: NumericDayData) => sum + day.value,
          0,
        ),
        high: steps.length > 0 ? Math.max(...steps.map((day) => day.value)) : 0,
        low: steps.length > 0 ? Math.min(...steps.map((day) => day.value)) : 0,
      },
      exercise: {
        average:
          exercise.length > 0
            ? Math.round(
                exercise.reduce(
                  (sum: number, day: NumericDayData) => sum + day.value,
                  0,
                ) / exercise.length,
              )
            : 0,
        total: exercise.reduce(
          (sum: number, day: NumericDayData) => sum + day.value,
          0,
        ),
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
                heartRate.reduce(
                  (sum: number, day: HeartRateDayData) => sum + day.avg,
                  0,
                ) / heartRate.length,
              )
            : 0,
        total: heartRate.reduce(
          (sum: number, day: HeartRateDayData) => sum + day.avg,
          0,
        ),
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
                hrv.reduce(
                  (sum: number, day: HeartRateDayData) => sum + day.avg,
                  0,
                ) / hrv.length,
              )
            : 0,
        total: hrv.reduce(
          (sum: number, day: HeartRateDayData) => sum + day.avg,
          0,
        ),
        high: hrv.length > 0 ? Math.max(...hrv.map((day) => day.max)) : 0,
        low: hrv.length > 0 ? Math.min(...hrv.map((day) => day.min)) : 0,
      },
      restingHR: {
        average:
          restingHR.length > 0
            ? Math.round(
                restingHR.reduce(
                  (sum: number, day: NumericDayData) => sum + day.value,
                  0,
                ) / restingHR.length,
              )
            : 0,
        total: restingHR.reduce(
          (sum: number, day: NumericDayData) => sum + day.value,
          0,
        ),
        high:
          restingHR.length > 0
            ? Math.max(...restingHR.map((day) => day.value))
            : 0,
        low:
          restingHR.length > 0
            ? Math.min(...restingHR.map((day) => day.value))
            : 0,
      },
      respiratory: {
        average:
          respiratory.length > 0
            ? Math.round(
                respiratory.reduce(
                  (sum: number, day: NumericDayData) =>
                    sum +
                    day.values.reduce((s: number, v: number) => s + v, 0) /
                      day.values.length,
                  0,
                ) / respiratory.length,
              )
            : 0,
        total: respiratory.reduce(
          (sum: number, day: NumericDayData) =>
            sum + day.values.reduce((s: number, v: number) => s + v, 0),
          0,
        ),
        high:
          respiratory.length > 0
            ? Math.max(...respiratory.map((day) => Math.max(...day.values)))
            : 0,
        low:
          respiratory.length > 0
            ? Math.min(...respiratory.map((day) => Math.min(...day.values)))
            : 0,
      },
      activeEnergy: {
        average:
          activeEnergy.length > 0
            ? Math.round(
                activeEnergy.reduce(
                  (sum: number, day: NumericDayData) => sum + day.value,
                  0,
                ) / activeEnergy.length,
              )
            : 0,
        total: activeEnergy.reduce(
          (sum: number, day: NumericDayData) => sum + day.value,
          0,
        ),
        high:
          activeEnergy.length > 0
            ? Math.max(...activeEnergy.map((day) => day.value))
            : 0,
        low:
          activeEnergy.length > 0
            ? Math.min(...activeEnergy.map((day) => day.value))
            : 0,
      },
      sleep:
        processedSleepData.length > 0
          ? {
              average: Math.round(
                processedSleepData.reduce(
                  (sum: number, day: { sleepDuration: number }) =>
                    sum + day.sleepDuration,
                  0,
                ) / processedSleepData.length,
              ),
              efficiency: Math.round(
                processedSleepData.reduce(
                  (
                    sum: number,
                    day: { metrics: { sleepEfficiency: number } },
                  ) => sum + day.metrics.sleepEfficiency,
                  0,
                ) / processedSleepData.length,
              ),
              high: Math.round(
                Math.max(...processedSleepData.map((day) => day.sleepDuration)),
              ),
              low: Math.round(
                Math.min(...processedSleepData.map((day) => day.sleepDuration)),
              ),
            }
          : { average: 0, efficiency: 0, high: 0, low: 0 },
    };
  }, [metricData, processedSleepData]);

  // Initialize the AI service
  const getAIService = async (): Promise<CosaintAiService> => {
    if (!aiService) {
      const service = CosaintAiService.createFromEnv();
      setAiService(service);
      return service;
    }
    return aiService;
  };

  // Function to send a message to the AI
  const sendMessage = async (message: string): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      // Create a new message
      const newMessage: Message = {
        id: uuidv4(),
        content: message,
        role: "user",
        timestamp: new Date(),
      };

      // Add the message to the list
      setMessages((prev) => [...prev, newMessage]);

      // Get the AI service
      const service = await getAIService();

      // Prepare the context with health data
      const context = {
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        healthData: metrics,
      };

      // Send the message to the AI
      const response = await service.generateResponse(
        message,
        context.messages,
        context.healthData,
      );

      // Add the response to the messages
      setMessages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          content: response,
          role: "assistant",
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  // Function to clear messages
  const clearMessages = (): void => {
    setMessages([]);
    setError(null);
  };

  const value: AiContextType = {
    messages,
    sendMessage,
    isLoading,
    error,
    clearMessages,
    healthData: metrics,
  };

  return <AiContext.Provider value={value}>{children}</AiContext.Provider>;
};

// Custom hook to use the AI context
export function useAi(): AiContextType {
  const context = useContext(AiContext);
  if (!context) {
    throw new Error("useAi must be used within an AiProvider");
  }
  return context;
}

export default AiProvider;
