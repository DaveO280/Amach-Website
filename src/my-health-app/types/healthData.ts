// File: types/healthData.ts

/**
 * This file contains the raw data types used during initial data processing.
 * These types represent the unvalidated, flexible data structure that comes directly
 * from the Apple Health XML export.
 *
 * For validated, type-safe health metrics, see src/my-health-app/data/types/healthMetrics.ts
 * which contains the HealthMetric type and its specific implementations.
 */

// Define available time frames for data selection
export type TimeFrame = "3mo" | "6mo" | "1yr" | "2yr";

// Define the structure of a health metric
export interface Metric {
  id: string; // Unique identifier (typically matches Apple Health identifier)
  name: string; // Display name
  unit: string; // Unit of measurement (e.g., "bpm", "steps", etc.)
  category: "vitals" | "activity" | "recovery" | "body"; // Category for organization
}

/**
 * Represents a raw health data point as it comes from the Apple Health XML export.
 * This is the flexible, unvalidated type used during initial parsing.
 *
 * After validation and type checking, these are converted to HealthMetric types
 * (see src/my-health-app/data/types/healthMetrics.ts) which provide:
 * - Strict typing for specific metric types
 * - Required fields for unit and source
 * - Type-safe unit definitions
 * - Validation rules
 */
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
    dailyData?: unknown[];
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

// Updated HealthData interface to include optional min, max, unit, type, and endDate properties
export interface HealthData {
  startDate: string;
  endDate?: string;
  value: string;
  min?: string;
  max?: string;
  unit?: string;
  type?: string;
}
