import {
  Activity,
  Footprints,
  Heart,
  HeartPulse,
  Moon,
  Star,
  Timer,
  Wind,
  Zap,
} from "lucide-react";
import React from "react";

export type MetricKey =
  | "steps"
  | "exercise"
  | "heartRate"
  | "hrv"
  | "restingHR"
  | "respiratory"
  | "activeEnergy"
  | "sleep"
  | "overall"
  | "activity"
  | "energy"
  | "heart";

export const getMetricLabel = (key: MetricKey): string => {
  switch (key) {
    case "steps":
      return "Steps";
    case "exercise":
      return "Exercise Time";
    case "heartRate":
      return "Heart Rate";
    case "hrv":
      return "Heart Rate Variability";
    case "restingHR":
      return "Resting Heart Rate";
    case "respiratory":
      return "Respiratory Rate";
    case "activeEnergy":
      return "Active Energy";
    case "sleep":
      return "Sleep";
    case "overall":
      return "Overall Health Score";
    case "activity":
      return "Activity Score";
    case "energy":
      return "Energy Score";
    case "heart":
      return "Heart Score";
    default:
      return key;
  }
};

export const getMetricUnit = (key: MetricKey): string => {
  switch (key) {
    case "steps":
      return "steps";
    case "exercise":
      return "min";
    case "heartRate":
      return "bpm";
    case "hrv":
      return "ms";
    case "restingHR":
      return "bpm";
    case "respiratory":
      return "BrPM";
    case "activeEnergy":
      return "kcal";
    case "sleep":
      return "min";
    default:
      return "";
  }
};

export const getMetricIcon = (key: MetricKey): React.ReactNode => {
  switch (key) {
    case "steps":
      return <Footprints className="h-4 w-4 text-emerald-600" />;
    case "exercise":
      return <Timer className="h-4 w-4 text-emerald-600" />;
    case "heartRate":
      return <Heart className="h-4 w-4 text-emerald-600" />;
    case "hrv":
      return <HeartPulse className="h-4 w-4 text-emerald-600" />;
    case "restingHR":
      return <Heart className="h-4 w-4 text-emerald-600" />;
    case "respiratory":
      return <Wind className="h-4 w-4 text-emerald-600" />;
    case "activeEnergy":
      return <Activity className="h-4 w-4 text-emerald-600" />;
    case "sleep":
      return <Moon className="h-4 w-4 text-emerald-600" />;
    case "overall":
      return <Star className="h-5 w-5 text-emerald-900" />;
    case "activity":
      return <Activity className="h-5 w-5 text-emerald-600" />;
    case "energy":
      return <Zap className="h-5 w-5 text-yellow-500" />;
    case "heart":
      return <Heart className="h-5 w-5 text-red-500" />;
    default:
      return null;
  }
};

export const formatSleepTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
};

export const formatMetricValue = (key: MetricKey, value: number): string => {
  if (key === "sleep") {
    return formatSleepTime(value);
  }
  return value.toFixed(0);
};
