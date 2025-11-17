import type { ChatMessage, HealthGoal } from "@/types/HealthContext";
import type { ParsedReportSummary } from "@/types/reportData";
import type { NormalizedUserProfile } from "@/utils/userProfileUtils";

export interface MonthlyScoreSnapshot {
  /**
   * ISO month identifier, e.g. "2025-11"
   */
  month: string;
  /**
   * Aggregated scores by category (overall, activity, sleep, etc.)
   */
  scores: Record<string, number>;
  /**
   * Optional month-over-month or year-over-year deltas expressed in percentage points.
   */
  trends?: Record<string, number>;
}

export interface VaultPinnedInsight {
  id: string;
  title: string;
  summary: string;
  source: "chat" | "analysis" | "goal" | "metric";
  createdAt: string;
  tags?: string[];
  relatedReferences?: string[];
}

export interface VaultOffchainReference {
  kind: "apple-health" | "chat-archive" | "report-archive" | "custom";
  uri: string;
  hash: string;
  sizeBytes?: number;
  updatedAt: string;
  description?: string;
}

export interface WalletContextVault {
  version: number;
  savedAt: string;
  profile?: NormalizedUserProfile;
  goals?: HealthGoal[];
  monthlyScores?: MonthlyScoreSnapshot[];
  pinnedInsights?: VaultPinnedInsight[];
  recentMessages?: ChatMessage[];
  reports?: ParsedReportSummary[];
  offchainReferences?: VaultOffchainReference[];
  metadata?: Record<string, unknown>;
}
