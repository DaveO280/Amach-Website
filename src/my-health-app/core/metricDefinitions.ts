import { Metric } from "../types/healthData";

// Define timeframe options
export const timeFrameOptions = [
  { label: "3 Months", value: "3mo" },
  { label: "6 Months", value: "6mo" },
  { label: "1 Year", value: "1yr" },
  { label: "2 Years", value: "2yr" },
];

// Core metrics that most users would want to track
export const coreMetrics: ReadonlyArray<Metric> = [
  {
    id: "HKQuantityTypeIdentifierHeartRate",
    name: "Heart Rate",
    unit: "bpm",
    category: "vitals",
  },
  {
    id: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
    name: "Heart Rate Variability",
    unit: "ms",
    category: "vitals",
  },
  {
    id: "HKQuantityTypeIdentifierRespiratoryRate",
    name: "Respiratory Rate",
    unit: "breaths/min",
    category: "vitals",
  },
  {
    id: "HKQuantityTypeIdentifierAppleExerciseTime",
    name: "Exercise Time",
    unit: "min",
    category: "activity",
  },
  {
    id: "HKQuantityTypeIdentifierRestingHeartRate",
    name: "Resting Heart Rate",
    unit: "bpm",
    category: "vitals",
  },
  {
    id: "HKQuantityTypeIdentifierActiveEnergyBurned",
    name: "Active Energy",
    unit: "kcal",
    category: "activity",
  },
  {
    id: "HKCategoryTypeIdentifierSleepAnalysis",
    name: "Sleep Analysis",
    unit: "hours",
    category: "recovery",
  },
  {
    id: "HKQuantityTypeIdentifierStepCount",
    name: "Step Count",
    unit: "steps",
    category: "activity",
  },
];

// Empty optional metrics array
export const optionalMetrics: ReadonlyArray<Metric> = [];

// Utility function to get a metric by its ID
export const getMetricById = (id: string): Metric | undefined => {
  return [...coreMetrics, ...optionalMetrics].find(
    (metric) => metric.id === id,
  );
};

// Helper function to get the name of a metric by its ID
export const getMetricName = (metricId: string): string => {
  const metric = getMetricById(metricId);
  return metric ? metric.name : metricId;
};

// Helper function to get all metrics organized by category
export const getMetricsByCategory = () => {
  const allMetrics = [...coreMetrics, ...optionalMetrics];
  return {
    vitals: allMetrics.filter((m) => m.category === "vitals"),
    activity: allMetrics.filter((m) => m.category === "activity"),
    recovery: allMetrics.filter((m) => m.category === "recovery"),
    body: allMetrics.filter((m) => m.category === "body"),
  };
};
