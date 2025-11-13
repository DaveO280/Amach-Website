import type { VeniceApiService } from "@/api/venice/VeniceApiService";

export interface AgentFinding {
  observation: string;
  evidence: string;
  significance: string;
  confidence: number;
}

export interface AgentTrend {
  pattern: string;
  timeframe: string;
  direction: "improving" | "declining" | "stable" | string;
  magnitude: string;
  confidence: number;
}

export interface AgentConcern {
  issue: string;
  severity: "low" | "moderate" | "high" | string;
  evidence: string;
  recommendation: string;
}

export interface AgentCorrelation {
  metric1: string;
  metric2: string;
  relationship: string;
  strength: "weak" | "moderate" | "strong" | string;
  confidence: number;
}

export interface AgentRecommendation {
  action: string;
  priority: "high" | "medium" | "low" | string;
  rationale: string;
  timeframe: string;
}

export interface AgentInsight {
  agentId: string;
  relevance: number;
  confidence: number;
  findings: AgentFinding[];
  trends: AgentTrend[];
  concerns: AgentConcern[];
  correlations: AgentCorrelation[];
  recommendations: AgentRecommendation[];
  dataLimitations: string[];
  dataPoints: string[];
  note?: string;
  rawResponse?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentDataAvailabilitySummary {
  availableMetrics: string[];
  missingMetrics: string[];
  sampleCoverageDays?: number;
}

export interface MetricSample {
  timestamp: Date;
  value: number;
  unit?: string;
  metadata?: Record<string, unknown>;
}

export type AppleHealthMetricMap = Record<string, MetricSample[]>;

import type { ParsedReportSummary } from "@/types/reportData";

export interface AgentAvailableData {
  appleHealth?: AppleHealthMetricMap;
  reports?: ParsedReportSummary[];
  [key: string]: unknown;
}

export interface AgentProfile {
  birthDate?: string;
  sex?: string;
  heightCm?: number;
  weightKg?: number;
  heightIn?: number;
  weightLbs?: number;
  ageYears?: number;
  bmi?: number;
}

export interface AgentTimeWindow {
  start: Date;
  end: Date;
}

export interface AgentDataQualityAssessment {
  score: number;
  dayCount: number;
  sampleFrequency: string;
  dateRange?: { start: Date; end: Date };
  strengths: string[];
  limitations: string[];
  missing: string[];
}

export interface AgentExecutionContext {
  query: string;
  timeWindow: AgentTimeWindow;
  availableData: AgentAvailableData;
  dataAvailability?: AgentDataAvailabilitySummary;
  profile?: AgentProfile;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface AgentAnalysisRequest {
  context: AgentExecutionContext;
  veniceService: VeniceApiService;
}
