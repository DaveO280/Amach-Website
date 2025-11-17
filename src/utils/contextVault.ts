import type { HealthContext } from "@/types/HealthContext";
import type {
  MonthlyScoreSnapshot,
  VaultOffchainReference,
  VaultPinnedInsight,
  WalletContextVault,
} from "@/types/contextVault";

interface BuildVaultOptions {
  healthContext: HealthContext;
  monthlyScores?: MonthlyScoreSnapshot[];
  pinnedInsights?: VaultPinnedInsight[];
  offchainReferences?: VaultOffchainReference[];
  recentMessagesLimit?: number;
  metadata?: Record<string, unknown>;
}

export function buildContextVaultSnapshot({
  healthContext,
  monthlyScores = [],
  pinnedInsights = [],
  offchainReferences = [],
  recentMessagesLimit = 50,
  metadata,
}: BuildVaultOptions): WalletContextVault {
  const savedAt = new Date().toISOString();
  const recentMessages =
    healthContext.chatHistory.length > recentMessagesLimit
      ? healthContext.chatHistory.slice(-recentMessagesLimit)
      : healthContext.chatHistory;

  return {
    version: 1,
    savedAt,
    profile: healthContext.userProfile,
    goals: healthContext.goals,
    monthlyScores,
    pinnedInsights,
    recentMessages,
    reports: healthContext.reports ?? [],
    offchainReferences,
    metadata,
  };
}
