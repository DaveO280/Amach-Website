// File: types/healthData.ts

// Define available time frames for data selection
export type TimeFrame = "3mo" | "6mo" | "1yr" | "2yr";

// Add this to your healthData.ts file
export type HealthData = HealthDataPoint;

// Define the structure of a health metric
export interface Metric {
  id: string; // Unique identifier (typically matches Apple Health identifier)
  name: string; // Display name
  unit: string; // Unit of measurement (e.g., "bpm", "steps", etc.)
  category: "vitals" | "activity" | "recovery" | "body"; // Category for organization
}

// Define the structure of a health data point
export interface HealthDataPoint {
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  value: string; // The value as a string (can be parsed to number if needed)
  unit?: string; // Optional unit info
  source?: string; // Optional source info (e.g., "Apple Watch")
  device?: string; // Optional device info
  type?: string; // Type of health data
  chartData?: {
    average: number;
    min?: number;
    max?: number;
    total?: number;
    count: number;
    dailyData?: any[];
    phases?: {
      deep: number;
      rem: number;
      light: number;
      awake: number;
    };
  };
}

// Define the mapping of metric IDs to their data points
export interface HealthDataByType {
  [key: string]: HealthDataPoint[];
}

// Processing state for tracking data imports
export interface ProcessingState {
  isProcessing: boolean;
  progress: number;
  status: string;
  error: string | null;
}

// Structure for the health data store
export interface HealthDataState {
  metricData: HealthDataByType;
  processingState: ProcessingState;
}

// Structure for the selection store
export interface SelectionState {
  timeFrame: TimeFrame;
  selectedMetrics: string[];
  uploadedFile: File | null;
}
