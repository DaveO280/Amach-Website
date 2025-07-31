export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface HealthScore {
  type: string; // e.g., "glucose", "sleep", "activity"
  value: number;
  date: string;
}

export interface UploadedFileSummary {
  type: string; // e.g., "cgm", "dexa", "blood"
  summary: string;
  date: string;
  rawData?: Record<string, unknown>; // Optional: for future use, use Record<string, unknown> for type safety
}

export interface UserFeedback {
  date: string;
  feedback: string;
}

export interface HealthGoal {
  id: string;
  text: string;
  selected: boolean;
  source: "ai" | "user";
  timeframe?: string; // Optional: timeframe for completion (e.g., '1 week', '2024-07-01')
}

export interface HealthMetricsSummary {
  average: number;
  high: number;
  low: number;
}

export interface SleepMetricsSummary {
  average: number;
  efficiency: number;
  high: number;
  low: number;
}

export interface HealthMetricWithRange {
  average: number;
  high: number;
  low: number;
}

export interface SleepMetricWithRange extends HealthMetricWithRange {
  efficiency: number;
}

export interface HealthContextMetrics {
  steps: HealthMetricWithRange;
  exercise: HealthMetricWithRange;
  heartRate: HealthMetricWithRange;
  hrv: HealthMetricWithRange;
  restingHR: HealthMetricWithRange;
  respiratory: HealthMetricWithRange;
  activeEnergy: HealthMetricWithRange;
  sleep: SleepMetricWithRange;
}

export interface HealthContext {
  version: number;
  userProfile: {
    name?: string;
    age?: number;
    // ...add more as needed
  };
  chatHistory: ChatMessage[];
  healthScores: HealthScore[];
  uploadedFiles: UploadedFileSummary[];
  userFeedback: UserFeedback[];
  goals: HealthGoal[];
  metrics?: {
    steps: HealthMetricsSummary;
    exercise: HealthMetricsSummary;
    heartRate: HealthMetricsSummary;
    hrv: HealthMetricsSummary;
    restingHR: HealthMetricsSummary;
    respiratory: HealthMetricsSummary;
    activeEnergy: HealthMetricsSummary;
    sleep: SleepMetricsSummary;
  };
}
