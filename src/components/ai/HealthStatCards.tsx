"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHealthData } from "@/my-health-app/store/healthDataStore/provider";
import { extractDatePart } from "@/my-health-app/utils/dataDeduplicator";
import { processSleepData } from "@/my-health-app/utils/sleepDataProcessor";
import {
  Activity,
  Footprints,
  Heart,
  HeartPulse,
  Moon,
  Timer,
  Wind,
} from "lucide-react";
import React, { useMemo } from "react";

interface DailyData {
  day: string;
  date: Date;
  value: number;
  count: number;
  values: number[];
}

interface HeartRateData extends DailyData {
  avg: number;
  min: number;
  max: number;
}

interface StatCardProps {
  title: string;
  icon: React.ReactNode;
  average: number;
  total?: number;
  unit: string;
  efficiency?: number;
  high?: number | string;
  low?: number | string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  icon,
  average,
  total,
  unit,
  efficiency,
  high,
  low,
}): JSX.Element => {
  return (
    <Card className="bg-white/60 backdrop-blur-sm border-amber-100">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-emerald-800">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {title === "Sleep" ? (
          <>
            <div className="text-2xl font-bold text-emerald-900">{unit}</div>
            {efficiency !== undefined && (
              <p className="text-xs text-emerald-600">
                Efficiency: {efficiency.toFixed(1)}%
              </p>
            )}
            {(high !== undefined || low !== undefined) && (
              <div className="flex justify-between text-xs text-emerald-600 mt-1">
                {low !== undefined && (
                  <span>
                    Low: {typeof low === "number" ? low.toFixed(0) : low}
                  </span>
                )}
                {high !== undefined && (
                  <span>
                    High: {typeof high === "number" ? high.toFixed(0) : high}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-2xl font-bold text-emerald-900">
              {average.toFixed(0)}
              <span className="text-sm text-emerald-600 ml-1">{unit}</span>
            </div>
            {total !== undefined && (
              <p className="text-xs text-emerald-600">
                Total: {total.toFixed(0)} {unit}
              </p>
            )}
            {(high !== undefined || low !== undefined) && (
              <div className="flex justify-between text-xs text-emerald-600 mt-1">
                {low !== undefined && (
                  <span>
                    Low: {typeof low === "number" ? low.toFixed(0) : low} {unit}
                  </span>
                )}
                {high !== undefined && (
                  <span>
                    High: {typeof high === "number" ? high.toFixed(0) : high}{" "}
                    {unit}
                  </span>
                )}
              </div>
            )}
            {efficiency !== undefined && (
              <p className="text-xs text-emerald-600">
                Efficiency: {efficiency.toFixed(1)}%
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

const HealthStatCards: React.FC = (): JSX.Element => {
  const { metricData } = useHealthData();

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

    // Process each metric type
    const processNumericData = (
      data: { startDate: string; value: string }[],
      transform: (value: number) => number = (v) => v,
    ): DailyData[] => {
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
      data: { startDate: string; value: string }[],
    ): HeartRateData[] => {
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

    const processRespiratoryData = (
      data: { startDate: string; value: string }[],
    ): DailyData[] => {
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

    // Process each metric
    const steps = processNumericData(stepsData);
    console.log(
      "Exercise raw data:",
      exerciseData.map((point) => ({
        value: point.value,
        unit: point.unit,
        startDate: point.startDate,
      })),
    );
    const exercise = processNumericData(exerciseData);
    const heartRate = processHeartRateData(heartRateData);
    const hrv = processHeartRateData(hrvData);
    const restingHR = processNumericData(restingHRData);
    const respiratory = processRespiratoryData(respiratoryData);
    const activeEnergy = processNumericData(activeEnergyData);

    return {
      steps: {
        average:
          steps.length > 0
            ? Math.round(
                steps.reduce((sum, day) => sum + (day.value ?? 0), 0) /
                  steps.length,
              )
            : 0,
        high: Math.max(...steps.map((day) => day.value ?? 0)),
        low: Math.min(...steps.map((day) => day.value ?? 0)),
      },
      exercise: {
        average:
          exercise.length > 0
            ? Math.round(
                exercise.reduce((sum, day) => sum + (day.value ?? 0), 0) /
                  exercise.length,
              )
            : 0,
        high: Math.max(...exercise.map((day) => day.value ?? 0)),
        low: Math.min(...exercise.map((day) => day.value ?? 0)),
      },
      heartRate: {
        average:
          heartRate.length > 0
            ? Math.round(
                heartRate.reduce((sum, day) => sum + (day.avg ?? 0), 0) /
                  heartRate.length,
              )
            : 0,
        high: Math.max(...heartRate.map((day) => day.max ?? 0)),
        low: Math.min(...heartRate.map((day) => day.min ?? 0)),
      },
      hrv: {
        average:
          hrv.length > 0
            ? Math.round(
                hrv.reduce((sum, day) => sum + (day.avg ?? 0), 0) / hrv.length,
              )
            : 0,
        high: Math.max(...hrv.map((day) => day.max ?? 0)),
        low: Math.min(...hrv.map((day) => day.min ?? 0)),
      },
      restingHR: {
        average:
          restingHR.length > 0
            ? Math.round(
                restingHR.reduce((sum, day) => sum + (day.value ?? 0), 0) /
                  restingHR.length,
              )
            : 0,
        high: Math.max(...restingHR.map((day) => day.value ?? 0)),
        low: Math.min(...restingHR.map((day) => day.value ?? 0)),
      },
      respiratory: {
        average:
          respiratory.length > 0
            ? Math.round(
                respiratory.reduce((sum, day) => sum + (day.value ?? 0), 0) /
                  respiratory.length,
              )
            : 0,
        high: Math.max(...respiratory.map((day) => day.value ?? 0)),
        low: Math.min(...respiratory.map((day) => day.value ?? 0)),
      },
      activeEnergy: {
        average:
          activeEnergy.length > 0
            ? Math.round(
                activeEnergy.reduce((sum, day) => sum + (day.value ?? 0), 0) /
                  activeEnergy.length,
              )
            : 0,
        high: Math.max(...activeEnergy.map((day) => day.value ?? 0)),
        low: Math.min(...activeEnergy.map((day) => day.value ?? 0)),
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
              ),
              low: Math.min(
                ...processedSleepData.map((day) => day.sleepDuration),
              ),
            }
          : { average: 0, efficiency: 0, high: 0, low: 0 },
    };
  }, [metricData, processedSleepData]);

  // Format sleep time to hours and minutes
  const formatSleepTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const metricsData = metrics;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Steps"
        icon={<Footprints className="h-4 w-4 text-emerald-600" />}
        average={metricsData.steps?.average || 0}
        unit="steps"
        high={metricsData.steps?.high}
        low={metricsData.steps?.low}
      />
      <StatCard
        title="Exercise Time"
        icon={<Timer className="h-4 w-4 text-emerald-600" />}
        average={metricsData.exercise?.average || 0}
        unit="min"
        high={metricsData.exercise?.high}
        low={metricsData.exercise?.low}
      />
      <StatCard
        title="Heart Rate"
        icon={<Heart className="h-4 w-4 text-emerald-600" />}
        average={metricsData.heartRate?.average || 0}
        unit="bpm"
        high={metricsData.heartRate?.high}
        low={metricsData.heartRate?.low}
      />
      <StatCard
        title="HRV"
        icon={<HeartPulse className="h-4 w-4 text-emerald-600" />}
        average={metricsData.hrv?.average || 0}
        unit="ms"
        high={metricsData.hrv?.high}
        low={metricsData.hrv?.low}
      />
      <StatCard
        title="Resting HR"
        icon={<Heart className="h-4 w-4 text-emerald-600" />}
        average={metricsData.restingHR?.average || 0}
        unit="bpm"
        high={metricsData.restingHR?.high}
        low={metricsData.restingHR?.low}
      />
      <StatCard
        title="Respiratory Rate"
        icon={<Wind className="h-4 w-4 text-emerald-600" />}
        average={metricsData.respiratory?.average || 0}
        unit="BrPM"
        high={metricsData.respiratory?.high}
        low={metricsData.respiratory?.low}
      />
      <StatCard
        title="Active Energy"
        icon={<Activity className="h-4 w-4 text-emerald-600" />}
        average={metricsData.activeEnergy?.average || 0}
        unit="kcal"
        high={metricsData.activeEnergy?.high}
        low={metricsData.activeEnergy?.low}
      />
      <StatCard
        title="Sleep"
        icon={<Moon className="h-4 w-4 text-emerald-600" />}
        average={0}
        unit={formatSleepTime(metricsData.sleep?.average || 0)}
        efficiency={metricsData.sleep?.efficiency}
        high={formatSleepTime(metricsData.sleep?.high || 0)}
        low={formatSleepTime(metricsData.sleep?.low || 0)}
      />
    </div>
  );
};

export default HealthStatCards;
