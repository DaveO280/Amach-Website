// src/services/ConversationMemoryService.ts
// Orchestrates memory operations: extraction, storage, pruning, and cloud sync

import { conversationMemoryStore } from "@/data/store/conversationMemoryStore";
import {
  getStorjConversationService,
  StorjConversationService,
} from "@/storage/StorjConversationService";
import type {
  ConversationMemory,
  CriticalFact,
  SessionSummary,
} from "@/types/conversationMemory";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import {
  ConversationMessage,
  ExtractionResult,
  MemoryExtractionService,
} from "./MemoryExtractionService";

export interface ProcessConversationOptions {
  threadId: string;
  userId: string;
  skipExtraction?: boolean;
  forceSync?: boolean;
}

export interface MemorySyncOptions {
  userAddress: string;
  encryptionKey: WalletEncryptionKey;
  force?: boolean;
}

export interface ConversationMemoryServiceConfig {
  // Minimum messages before extraction is attempted
  minMessagesForExtraction: number;
  // Minimum time (ms) between cloud syncs
  syncDebounceMs: number;
  // Maximum facts to keep per category
  maxFactsPerCategory: number;
  // Days after which inactive facts are pruned
  inactiveFactPruneDays: number;
  // Auto-sync to cloud after processing
  autoSyncToCloud: boolean;
}

const DEFAULT_CONFIG: ConversationMemoryServiceConfig = {
  minMessagesForExtraction: 4,
  syncDebounceMs: 5 * 60 * 1000, // 5 minutes
  maxFactsPerCategory: 20,
  inactiveFactPruneDays: 90,
  autoSyncToCloud: true,
};

/**
 * ConversationMemoryService orchestrates memory operations
 * - Processes conversation endings to extract facts and summaries
 * - Manages memory pruning and consolidation
 * - Triggers cloud sync when appropriate
 */
export class ConversationMemoryService {
  private extractionService: MemoryExtractionService;
  private storjService: StorjConversationService;
  private config: ConversationMemoryServiceConfig;
  private lastSyncTime: Map<string, number> = new Map();
  private pendingSyncs: Map<string, NodeJS.Timeout> = new Map();

  constructor(config?: Partial<ConversationMemoryServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.extractionService = new MemoryExtractionService();
    this.storjService = getStorjConversationService();
  }

  /**
   * Process a conversation when it ends (thread closed or inactivity)
   * Extracts facts, generates summary, updates memory, and optionally syncs
   */
  async processConversationEnd(
    messages: ConversationMessage[],
    options: ProcessConversationOptions,
  ): Promise<ExtractionResult | null> {
    const { threadId, userId, skipExtraction, forceSync } = options;

    console.log(
      `[MemoryService] Processing conversation end for thread ${threadId}`,
    );

    // Check if extraction should happen
    if (
      skipExtraction ||
      !this.extractionService.shouldExtractMemory(messages)
    ) {
      console.log("[MemoryService] Skipping extraction - insufficient content");
      return null;
    }

    try {
      // Extract facts and generate summary
      const extraction = await this.extractionService.processConversation(
        messages,
        threadId,
      );

      console.log(
        `[MemoryService] Extracted ${extraction.facts.length} facts, topics: ${extraction.topics.join(", ")}`,
      );

      // Save to local memory store
      await this.saveExtractionToMemory(userId, extraction);

      // Prune old/inactive data
      await this.pruneMemory(userId);

      // Schedule cloud sync if configured
      if (this.config.autoSyncToCloud || forceSync) {
        this.scheduleSyncToCloud(userId);
      }

      return extraction;
    } catch (error) {
      console.error("[MemoryService] Error processing conversation:", error);
      return null;
    }
  }

  /**
   * Manually add a critical fact to memory
   */
  async addFact(
    userId: string,
    fact: Omit<CriticalFact, "id" | "dateIdentified">,
  ): Promise<void> {
    const fullFact: CriticalFact = {
      ...fact,
      id: `fact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dateIdentified: new Date().toISOString(),
      isActive: fact.isActive ?? true,
    };

    await conversationMemoryStore.addCriticalFact(userId, fullFact);
    console.log(`[MemoryService] Added fact: ${fact.category} - ${fact.value}`);
  }

  /**
   * Update a fact (mark inactive, update context, etc.)
   */
  async updateFact(
    userId: string,
    factId: string,
    updates: Partial<CriticalFact>,
  ): Promise<void> {
    await conversationMemoryStore.updateCriticalFact(userId, factId, updates);
  }

  /**
   * Mark a fact as inactive (soft delete)
   */
  async deactivateFact(userId: string, factId: string): Promise<void> {
    await this.updateFact(userId, factId, { isActive: false });
  }

  /**
   * Get current memory for a user
   */
  async getMemory(userId: string): Promise<ConversationMemory | null> {
    return conversationMemoryStore.getMemory(userId);
  }

  /**
   * Get active facts by category
   */
  async getFactsByCategory(
    userId: string,
    category: CriticalFact["category"],
  ): Promise<CriticalFact[]> {
    return conversationMemoryStore.getCriticalFactsByCategory(userId, category);
  }

  /**
   * Get all active goals
   */
  async getActiveGoals(userId: string): Promise<CriticalFact[]> {
    return this.getFactsByCategory(userId, "goal");
  }

  /**
   * Get all active concerns
   */
  async getActiveConcerns(userId: string): Promise<CriticalFact[]> {
    return this.getFactsByCategory(userId, "concern");
  }

  /**
   * Sync memory to Storj cloud storage
   */
  async syncToCloud(options: MemorySyncOptions): Promise<boolean> {
    const { userAddress, encryptionKey, force } = options;

    // Check debounce
    const lastSync = this.lastSyncTime.get(userAddress) || 0;
    const timeSinceLastSync = Date.now() - lastSync;

    if (!force && timeSinceLastSync < this.config.syncDebounceMs) {
      console.log(
        `[MemoryService] Skipping sync - last sync was ${Math.round(timeSinceLastSync / 1000)}s ago`,
      );
      return false;
    }

    try {
      const memory = await this.getMemory(userAddress);
      if (!memory) {
        console.log("[MemoryService] No memory to sync");
        return false;
      }

      const result = await this.storjService.syncMemoryToStorj(
        memory,
        userAddress,
        encryptionKey,
      );

      if (result.success) {
        this.lastSyncTime.set(userAddress, Date.now());
        console.log(
          `[MemoryService] Memory synced to cloud: ${result.storjUri}`,
        );
      }

      return result.success;
    } catch (error) {
      console.error("[MemoryService] Error syncing to cloud:", error);
      return false;
    }
  }

  /**
   * Pull memory from Storj and merge with local
   */
  async pullFromCloud(
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<boolean> {
    try {
      // Get list of history snapshots
      const snapshots = await this.storjService.listUserConversationHistory(
        userAddress,
        encryptionKey,
      );

      if (snapshots.length === 0) {
        console.log("[MemoryService] No cloud memory found");
        return false;
      }

      // Get the most recent snapshot
      const latestSnapshot = snapshots.sort(
        (a, b) => b.uploadedAt - a.uploadedAt,
      )[0];

      // Retrieve the full history
      const cloudHistory = await this.storjService.retrieveConversationHistory(
        latestSnapshot.storjUri,
        encryptionKey,
      );

      if (!cloudHistory) {
        console.log("[MemoryService] Could not retrieve cloud history");
        return false;
      }

      // Get local memory
      const localMemory = await this.getMemory(userAddress);

      // Merge cloud into local
      const mergedMemory = this.mergeMemory(
        localMemory,
        cloudHistory,
        userAddress,
      );

      // Save merged memory
      await conversationMemoryStore.saveMemory(mergedMemory);
      console.log("[MemoryService] Cloud memory merged with local");

      return true;
    } catch (error) {
      console.error("[MemoryService] Error pulling from cloud:", error);
      return false;
    }
  }

  /**
   * Prune old sessions and inactive facts
   */
  async pruneMemory(userId: string): Promise<void> {
    const memory = await this.getMemory(userId);
    if (!memory) return;

    let modified = false;

    // Prune inactive facts older than configured days
    const cutoffDate = new Date();
    cutoffDate.setDate(
      cutoffDate.getDate() - this.config.inactiveFactPruneDays,
    );
    const cutoffIso = cutoffDate.toISOString();

    const originalFactCount = memory.criticalFacts.length;
    memory.criticalFacts = memory.criticalFacts.filter((fact) => {
      // Keep active facts
      if (fact.isActive) return true;
      // Keep recently deactivated facts
      return fact.dateIdentified > cutoffIso;
    });

    if (memory.criticalFacts.length !== originalFactCount) {
      modified = true;
      console.log(
        `[MemoryService] Pruned ${originalFactCount - memory.criticalFacts.length} old inactive facts`,
      );
    }

    // Limit facts per category
    const factsByCategory = new Map<string, CriticalFact[]>();
    for (const fact of memory.criticalFacts) {
      const existing = factsByCategory.get(fact.category) || [];
      existing.push(fact);
      factsByCategory.set(fact.category, existing);
    }

    const prunedFacts: CriticalFact[] = [];
    for (const [category, facts] of factsByCategory) {
      // Sort by date (newest first) and keep only the limit
      const sorted = facts.sort(
        (a, b) =>
          new Date(b.dateIdentified).getTime() -
          new Date(a.dateIdentified).getTime(),
      );
      const kept = sorted.slice(0, this.config.maxFactsPerCategory);
      prunedFacts.push(...kept);

      if (sorted.length > this.config.maxFactsPerCategory) {
        modified = true;
        console.log(
          `[MemoryService] Pruned ${sorted.length - kept.length} excess facts in category ${category}`,
        );
      }
    }

    memory.criticalFacts = prunedFacts;

    // Sessions are already limited by conversationMemoryStore
    // (20 important, 5 recent)

    if (modified) {
      await conversationMemoryStore.saveMemory(memory);
    }
  }

  /**
   * Consolidate similar facts (merge duplicates)
   */
  async consolidateFacts(userId: string): Promise<number> {
    const memory = await this.getMemory(userId);
    if (!memory) return 0;

    const originalCount = memory.criticalFacts.length;
    const consolidated: CriticalFact[] = [];
    const seen = new Set<string>();

    for (const fact of memory.criticalFacts) {
      // Create a normalized key for duplicate detection
      const normalizedValue = fact.value.toLowerCase().trim();
      const key = `${fact.category}:${normalizedValue}`;

      if (seen.has(key)) {
        // Skip duplicate
        continue;
      }

      seen.add(key);
      consolidated.push(fact);
    }

    const mergedCount = originalCount - consolidated.length;

    if (mergedCount > 0) {
      memory.criticalFacts = consolidated;
      await conversationMemoryStore.saveMemory(memory);
      console.log(
        `[MemoryService] Consolidated ${mergedCount} duplicate facts`,
      );
    }

    return mergedCount;
  }

  /**
   * Clear all memory for a user
   */
  async clearMemory(userId: string): Promise<void> {
    await conversationMemoryStore.clearMemory(userId);
    console.log(`[MemoryService] Cleared memory for user ${userId}`);
  }

  /**
   * Get memory statistics
   */
  async getMemoryStats(userId: string): Promise<{
    totalFacts: number;
    activeFacts: number;
    factsByCategory: Record<string, number>;
    totalSessions: number;
    importantSessions: number;
    recentSessions: number;
    lastUpdated: string | null;
  } | null> {
    const memory = await this.getMemory(userId);
    if (!memory) return null;

    const factsByCategory: Record<string, number> = {};
    let activeFacts = 0;

    for (const fact of memory.criticalFacts) {
      factsByCategory[fact.category] =
        (factsByCategory[fact.category] || 0) + 1;
      if (fact.isActive) activeFacts++;
    }

    return {
      totalFacts: memory.criticalFacts.length,
      activeFacts,
      factsByCategory,
      totalSessions: memory.totalSessions,
      importantSessions: memory.importantSessions.length,
      recentSessions: memory.recentSessions.length,
      lastUpdated: memory.lastUpdated,
    };
  }

  // Private methods

  private async saveExtractionToMemory(
    userId: string,
    extraction: ExtractionResult,
  ): Promise<void> {
    // Add facts
    for (const fact of extraction.facts) {
      await conversationMemoryStore.addCriticalFact(userId, fact);
    }

    // Add session summary
    await conversationMemoryStore.addSessionSummary(userId, extraction.summary);
  }

  private scheduleSyncToCloud(userId: string): void {
    // Cancel any existing scheduled sync
    const existing = this.pendingSyncs.get(userId);
    if (existing) {
      clearTimeout(existing);
    }

    // Schedule a new sync after debounce period
    // Note: Actual sync requires wallet credentials, so this just logs intent
    const timeout = setTimeout(() => {
      console.log(
        `[MemoryService] Cloud sync ready for user ${userId} (credentials needed)`,
      );
      this.pendingSyncs.delete(userId);
    }, this.config.syncDebounceMs);

    this.pendingSyncs.set(userId, timeout);
  }

  private mergeMemory(
    local: ConversationMemory | null,
    cloud: {
      userId: string;
      sessions: Array<{
        id: string;
        summary?: string;
        topics?: string[];
        messageCount?: number;
        importance?: string;
        extractedFacts?: string[];
        startedAt?: number;
      }>;
      criticalFacts: Array<{
        id: string;
        category: string;
        value: string;
        context?: string;
        dateIdentified: string;
        isActive: boolean;
        storageLocation?: "local" | "blockchain" | "both";
        blockchainTxHash?: string;
        source?: "ai-extracted" | "user-input" | "blockchain";
      }>;
      preferences?: Record<string, unknown>;
    },
    userId: string,
  ): ConversationMemory {
    // Helper to convert cloud fact to CriticalFact
    const convertCloudFact = (
      cf: (typeof cloud.criticalFacts)[0],
    ): CriticalFact => ({
      id: cf.id,
      category: cf.category as CriticalFact["category"],
      value: cf.value,
      context: cf.context,
      dateIdentified: cf.dateIdentified,
      isActive: cf.isActive,
      source: cf.source || "ai-extracted",
      storageLocation: cf.storageLocation || "local",
      blockchainTxHash: cf.blockchainTxHash,
    });

    // If no local memory, convert cloud to local format
    if (!local) {
      return {
        userId,
        criticalFacts: (cloud.criticalFacts || []).map(convertCloudFact),
        importantSessions: [],
        recentSessions:
          cloud.sessions?.map((s) => ({
            id: s.id,
            date: s.startedAt
              ? new Date(s.startedAt).toISOString()
              : new Date().toISOString(),
            summary: s.summary || "",
            topics: s.topics || [],
            messageCount: s.messageCount || 0,
            extractedFacts: s.extractedFacts || [],
            importance:
              (s.importance as SessionSummary["importance"]) || "medium",
          })) || [],
        preferences: (cloud.preferences ||
          {}) as ConversationMemory["preferences"],
        lastUpdated: new Date().toISOString(),
        totalSessions: cloud.sessions?.length || 0,
        totalFactsExtracted: cloud.criticalFacts?.length || 0,
      };
    }

    // Merge facts (cloud wins for newer facts with same ID)
    const mergedFacts = new Map<string, CriticalFact>();

    // Add local facts first
    for (const fact of local.criticalFacts) {
      mergedFacts.set(fact.id, fact);
    }

    // Add/override with cloud facts
    for (const cloudFact of cloud.criticalFacts || []) {
      const existing = mergedFacts.get(cloudFact.id);
      if (
        !existing ||
        new Date(cloudFact.dateIdentified) > new Date(existing.dateIdentified)
      ) {
        mergedFacts.set(cloudFact.id, convertCloudFact(cloudFact));
      }
    }

    // Merge sessions (dedupe by ID)
    const mergedSessions = new Map<string, SessionSummary>();

    for (const session of [
      ...local.importantSessions,
      ...local.recentSessions,
    ]) {
      mergedSessions.set(session.id, session);
    }

    for (const cloudSession of cloud.sessions || []) {
      if (!mergedSessions.has(cloudSession.id)) {
        mergedSessions.set(cloudSession.id, {
          id: cloudSession.id,
          date: cloudSession.startedAt
            ? new Date(cloudSession.startedAt).toISOString()
            : new Date().toISOString(),
          summary: cloudSession.summary || "",
          topics: cloudSession.topics || [],
          messageCount: cloudSession.messageCount || 0,
          extractedFacts: cloudSession.extractedFacts || [],
          importance:
            (cloudSession.importance as SessionSummary["importance"]) ||
            "medium",
        });
      }
    }

    // Sort sessions by date and split into important/recent
    const allSessions = Array.from(mergedSessions.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const importantSessions = allSessions
      .filter((s) => s.importance === "high" || s.importance === "critical")
      .slice(0, 20);

    const recentSessions = allSessions
      .filter((s) => s.importance !== "high" && s.importance !== "critical")
      .slice(0, 5);

    return {
      userId,
      criticalFacts: Array.from(mergedFacts.values()),
      importantSessions,
      recentSessions,
      preferences: {
        ...local.preferences,
        ...(cloud.preferences || {}),
      } as ConversationMemory["preferences"],
      lastUpdated: new Date().toISOString(),
      totalSessions: Math.max(local.totalSessions, cloud.sessions?.length || 0),
      totalFactsExtracted: Math.max(
        local.totalFactsExtracted,
        mergedFacts.size,
      ),
    };
  }
}

// Singleton instance
let _memoryService: ConversationMemoryService | null = null;

export function getConversationMemoryService(): ConversationMemoryService {
  if (!_memoryService) {
    _memoryService = new ConversationMemoryService();
  }
  return _memoryService;
}

export function createConversationMemoryService(
  config?: Partial<ConversationMemoryServiceConfig>,
): ConversationMemoryService {
  return new ConversationMemoryService(config);
}
