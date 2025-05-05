export interface HealthDataPoint {
  value: number;
  timestamp: string;
  metadata?: {
    fragmentation?: number;
    [key: string]: unknown;
  };
}

export interface MetricData {
  heartRate?: HealthDataPoint[];
  heartRateVariability?: HealthDataPoint[];
  steps?: HealthDataPoint[];
  exerciseTime?: HealthDataPoint[];
  sleep?: HealthDataPoint[];
  restingHeartRate?: HealthDataPoint[];
  [key: string]: HealthDataPoint[] | undefined;
}

export interface HealthMetrics {
  heartRate: number;
  heartRateVariability: number;
  steps: number;
  exerciseTime: number;
  sleep: number;
  restingHeartRate: number;
}

export interface HealthProfile {
  age: number;
  sex: "male" | "female";
  height: number;
  weight: number;
}
