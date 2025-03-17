"use client";

import {
  ActivitySquare,
  Dumbbell,
  Footprints,
  Heart,
  HeartPulse,
  Info,
  Moon,
  Stethoscope,
  Zap,
} from "lucide-react";
import React from "react";
import { useHealthSummary } from "./HealthDataProvider";

interface StatCardProps {
  title: string;
  icon: React.ReactNode;
  average: number | string;
  unit: string;
  high?: number | string;
  low?: number | string;
  highDate?: string;
  lowDate?: string;
  efficiency?: number;
  secondaryValue?: number | string;
  secondaryLabel?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  icon,
  average,
  unit,
  high,
  low,
  highDate,
  lowDate,
  efficiency,
  secondaryValue,
  secondaryLabel,
}) => {
  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-center mb-2">
        <div className="mr-2 text-emerald-600">{icon}</div>
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>

      <div className="flex items-baseline mb-1">
        <div className="text-2xl font-bold text-emerald-700">{average}</div>
        <div className="ml-1 text-sm text-gray-500">{unit}</div>
        <div className="ml-1 text-xs text-gray-500">(avg)</div>
      </div>

      {(high !== undefined || low !== undefined) && (
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          {low !== undefined && (
            <div>
              Low: {low}
              {lowDate && <span className="ml-1">({lowDate})</span>}
            </div>
          )}
          {high !== undefined && (
            <div>
              High: {high}
              {highDate && <span className="ml-1">({highDate})</span>}
            </div>
          )}
        </div>
      )}

      {secondaryValue !== undefined && secondaryLabel && (
        <div className="text-xs text-gray-600">
          {secondaryLabel}: {secondaryValue}
        </div>
      )}

      {efficiency !== undefined && (
        <div className="mt-1">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600">Efficiency</span>
            <span
              className={`font-medium ${
                efficiency >= 85
                  ? "text-green-600"
                  : efficiency >= 70
                    ? "text-amber-600"
                    : "text-red-600"
              }`}
            >
              {efficiency}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${
                efficiency >= 85
                  ? "bg-green-500"
                  : efficiency >= 70
                    ? "bg-amber-500"
                    : "bg-red-500"
              }`}
              style={{ width: `${Math.min(efficiency, 100)}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
};

// Format numbers with commas
const formatNumber = (num: number | undefined): string => {
  if (num === undefined || num === null) return "N/A";
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

// Format value with fixed decimal places
const formatDecimal = (
  num: number | undefined,
  decimals: number = 1,
): string => {
  if (num === undefined || num === null) return "N/A";
  return num.toFixed(decimals);
};

// Helper function to get date string
const getFormattedDate = (dateStr: string | undefined): string | undefined => {
  if (!dateStr) return undefined;
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

// Helper function to find min/max values in daily data
const findMinMaxWithDates = (
  daily: any[],
  metricName: string,
): {
  min?: number;
  max?: number;
  minDate?: string;
  maxDate?: string;
} => {
  let min: number | undefined;
  let max: number | undefined;
  let minDate: string | undefined;
  let maxDate: string | undefined;

  daily.forEach((day) => {
    const metric = day[metricName];
    if (!metric) return;

    if (metric.min !== null && (min === undefined || metric.min < min)) {
      min = metric.min;
      minDate = getFormattedDate(day.date);
    }

    if (metric.max !== null && (max === undefined || metric.max > max)) {
      max = metric.max;
      maxDate = getFormattedDate(day.date);
    }
  });

  return { min, max, minDate, maxDate };
};

const HealthStatCards: React.FC = () => {
  const { summarizedData } = useHealthSummary();

  if (!summarizedData) {
    return (
      <div className="p-4 bg-amber-50 rounded-lg">
        <p className="text-amber-800 flex items-center">
          <Info className="w-4 h-4 mr-2" />
          No health data available. Please process your health data first.
        </p>
      </div>
    );
  }

  const { metrics } = summarizedData.stats;
  const { daily } = summarizedData;

  // Calculate sleep efficiency
  let sleepEfficiency: number | undefined;
  if (metrics.sleep && metrics.sleep.available) {
    const sleepTime = metrics.sleep.avgDaily;
    const inBedTime = sleepTime * 1.2; // Estimate in-bed time
    sleepEfficiency = Math.round((sleepTime / inBedTime) * 100);
  }

  // Find min/max values for each metric
  const heartRateStats = findMinMaxWithDates(daily, "heartRate");
  const hrvStats = findMinMaxWithDates(daily, "heartRateVariability");
  const respRateStats = findMinMaxWithDates(daily, "respiratoryRate");
  const restingHRStats = findMinMaxWithDates(daily, "restingHeartRate");
  const stepStats = findMinMaxWithDates(daily, "steps");
  const activeEnergyStats = findMinMaxWithDates(daily, "activeEnergy");
  const exerciseTimeStats = findMinMaxWithDates(daily, "exerciseTime");
  const sleepStats = findMinMaxWithDates(daily, "sleep");

  // Define all cards with consistent data access
  const cards: React.ReactNode[] = [];

  // Heart Rate
  if (metrics.heartRate && metrics.heartRate.available) {
    cards.push(
      <StatCard
        key="heartRate"
        title="Heart Rate"
        icon={<Heart className="w-5 h-5" />}
        average={formatDecimal(metrics.heartRate.avgDaily, 0)}
        unit="bpm"
        low={formatDecimal(heartRateStats.min, 0)}
        high={formatDecimal(heartRateStats.max, 0)}
        lowDate={heartRateStats.minDate}
        highDate={heartRateStats.maxDate}
      />,
    );
  }

  // Heart Rate Variability
  if (metrics.heartRateVariability && metrics.heartRateVariability.available) {
    cards.push(
      <StatCard
        key="heartRateVariability"
        title="HRV"
        icon={<Dumbbell className="w-5 h-5" />}
        average={formatDecimal(metrics.heartRateVariability.avgDaily, 1)}
        unit="ms"
        low={formatDecimal(hrvStats.min, 1)}
        high={formatDecimal(hrvStats.max, 1)}
        lowDate={hrvStats.minDate}
        highDate={hrvStats.maxDate}
        secondaryLabel="Recovery metric"
        secondaryValue="Higher is better"
      />,
    );
  }

  // Respiratory Rate
  if (metrics.respiratoryRate && metrics.respiratoryRate.available) {
    cards.push(
      <StatCard
        key="respiratoryRate"
        title="Respiratory Rate"
        icon={<Stethoscope className="w-5 h-5" />}
        average={formatDecimal(metrics.respiratoryRate.avgDaily, 1)}
        unit="BrPM"
        low={formatDecimal(respRateStats.min, 1)}
        high={formatDecimal(respRateStats.max, 1)}
        lowDate={respRateStats.minDate}
        highDate={respRateStats.maxDate}
        secondaryLabel="Normal range"
        secondaryValue="12-20 BrPM"
      />,
    );
  }

  // Resting Heart Rate
  if (metrics.restingHeartRate && metrics.restingHeartRate.available) {
    cards.push(
      <StatCard
        key="restingHeartRate"
        title="Resting Heart Rate"
        icon={<HeartPulse className="w-5 h-5" />}
        average={formatDecimal(metrics.restingHeartRate.avgDaily, 0)}
        unit="bpm"
        low={formatDecimal(restingHRStats.min, 0)}
        high={formatDecimal(restingHRStats.max, 0)}
        lowDate={restingHRStats.minDate}
        highDate={restingHRStats.maxDate}
        secondaryLabel="Indicates fitness"
        secondaryValue="Lower is better"
      />,
    );
  }

  // Steps
  if (metrics.steps && metrics.steps.available) {
    cards.push(
      <StatCard
        key="steps"
        title="Daily Steps"
        icon={<Footprints className="w-5 h-5" />}
        average={formatNumber(metrics.steps.avgDaily)}
        unit="steps"
        low={formatNumber(stepStats.min)}
        high={formatNumber(stepStats.max)}
        lowDate={stepStats.minDate}
        highDate={stepStats.maxDate}
      />,
    );
  }

  // Active Energy
  if (metrics.activeEnergy && metrics.activeEnergy.available) {
    cards.push(
      <StatCard
        key="activeEnergy"
        title="Active Energy"
        icon={<Zap className="w-5 h-5" />}
        average={formatNumber(metrics.activeEnergy.avgDaily)}
        unit="kcal"
        low={formatNumber(activeEnergyStats.min)}
        high={formatNumber(activeEnergyStats.max)}
        lowDate={activeEnergyStats.minDate}
        highDate={activeEnergyStats.maxDate}
      />,
    );
  }

  // Exercise Time
  if (metrics.exerciseTime && metrics.exerciseTime.available) {
    cards.push(
      <StatCard
        key="exerciseTime"
        title="Exercise Time"
        icon={<ActivitySquare className="w-5 h-5" />}
        average={formatDecimal(metrics.exerciseTime.avgDaily, 0)}
        unit="min"
        low={formatDecimal(exerciseTimeStats.min, 0)}
        high={formatDecimal(exerciseTimeStats.max, 0)}
        lowDate={exerciseTimeStats.minDate}
        highDate={exerciseTimeStats.maxDate}
      />,
    );
  }

  // Sleep
  if (metrics.sleep && metrics.sleep.available) {
    cards.push(
      <StatCard
        key="sleep"
        title="Sleep"
        icon={<Moon className="w-5 h-5" />}
        average={formatDecimal(metrics.sleep.avgDaily / 60, 1)}
        unit="hrs"
        low={sleepStats.min ? formatDecimal(sleepStats.min / 60, 1) : undefined}
        high={
          sleepStats.max ? formatDecimal(sleepStats.max / 60, 1) : undefined
        }
        lowDate={sleepStats.minDate}
        highDate={sleepStats.maxDate}
        secondaryLabel="Recommended"
        secondaryValue="7-9 hrs"
        efficiency={sleepEfficiency}
      />,
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
      {cards}
    </div>
  );
};

export default HealthStatCards;
