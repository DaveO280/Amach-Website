// src/hooks/useConversationMemory.ts
// React hook for accessing conversation memory services

import { useCallback, useEffect, useState } from "react";
import { conversationMemoryStore } from "@/data/store/conversationMemoryStore";
import {
  ConversationMemoryService,
  getConversationMemoryService,
  MemorySyncOptions,
} from "@/services/ConversationMemoryService";
import type {
  ConversationMemory,
  CriticalFact,
} from "@/types/conversationMemory";
import type { ConversationMessage } from "@/services/MemoryExtractionService";

export interface UseConversationMemoryOptions {
  userId: string;
  autoLoad?: boolean;
}

export interface UseConversationMemoryResult {
  // Memory data
  memory: ConversationMemory | null;
  isLoading: boolean;
  error: string | null;

  // Memory operations
  loadMemory: () => Promise<void>;
  clearMemory: () => Promise<void>;

  // Fact operations
  addFact: (fact: Omit<CriticalFact, "id" | "dateIdentified">) => Promise<void>;
  updateFact: (factId: string, updates: Partial<CriticalFact>) => Promise<void>;
  deactivateFact: (factId: string) => Promise<void>;
  getActiveGoals: () => Promise<CriticalFact[]>;
  getActiveConcerns: () => Promise<CriticalFact[]>;

  // Session operations
  processConversationEnd: (
    messages: ConversationMessage[],
    threadId: string,
  ) => Promise<void>;

  // Sync operations
  syncToCloud: (options: Omit<MemorySyncOptions, "force">) => Promise<boolean>;
  pullFromCloud: (
    encryptionKey: MemorySyncOptions["encryptionKey"],
  ) => Promise<boolean>;

  // Maintenance
  pruneMemory: () => Promise<void>;
  consolidateFacts: () => Promise<number>;

  // Stats
  getStats: () => Promise<{
    totalFacts: number;
    activeFacts: number;
    factsByCategory: Record<string, number>;
    totalSessions: number;
    importantSessions: number;
    recentSessions: number;
    lastUpdated: string | null;
  } | null>;
}

/**
 * React hook for conversation memory management
 * Provides easy access to memory services with React state management
 */
export function useConversationMemory(
  options: UseConversationMemoryOptions,
): UseConversationMemoryResult {
  const { userId, autoLoad = true } = options;

  const [memory, setMemory] = useState<ConversationMemory | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memoryService = getConversationMemoryService();

  // Load memory from IndexedDB
  const loadMemory = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    setError(null);

    try {
      await conversationMemoryStore.initialize();
      const mem = await memoryService.getMemory(userId);
      setMemory(mem);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load memory";
      setError(message);
      console.error("[useConversationMemory] Load error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, memoryService]);

  // Clear memory
  const clearMemory = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    setError(null);

    try {
      await memoryService.clearMemory(userId);
      setMemory(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to clear memory";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [userId, memoryService]);

  // Add a fact
  const addFact = useCallback(
    async (fact: Omit<CriticalFact, "id" | "dateIdentified">) => {
      if (!userId) return;

      try {
        await memoryService.addFact(userId, fact);
        // Reload memory to get updated state
        await loadMemory();
        // Dispatch event for other components
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("conversation-memory-updated"));
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to add fact";
        setError(message);
      }
    },
    [userId, memoryService, loadMemory],
  );

  // Update a fact
  const updateFact = useCallback(
    async (factId: string, updates: Partial<CriticalFact>) => {
      if (!userId) return;

      try {
        await memoryService.updateFact(userId, factId, updates);
        await loadMemory();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("conversation-memory-updated"));
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update fact";
        setError(message);
      }
    },
    [userId, memoryService, loadMemory],
  );

  // Deactivate a fact
  const deactivateFact = useCallback(
    async (factId: string) => {
      if (!userId) return;

      try {
        await memoryService.deactivateFact(userId, factId);
        await loadMemory();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("conversation-memory-updated"));
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to deactivate fact";
        setError(message);
      }
    },
    [userId, memoryService, loadMemory],
  );

  // Get active goals
  const getActiveGoals = useCallback(async () => {
    if (!userId) return [];
    return memoryService.getActiveGoals(userId);
  }, [userId, memoryService]);

  // Get active concerns
  const getActiveConcerns = useCallback(async () => {
    if (!userId) return [];
    return memoryService.getActiveConcerns(userId);
  }, [userId, memoryService]);

  // Process conversation end (AI-powered extraction)
  const processConversationEnd = useCallback(
    async (messages: ConversationMessage[], threadId: string) => {
      if (!userId) return;

      try {
        await memoryService.processConversationEnd(messages, {
          userId,
          threadId,
        });
        await loadMemory();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("conversation-memory-updated"));
        }
      } catch (err) {
        console.error(
          "[useConversationMemory] Process conversation error:",
          err,
        );
      }
    },
    [userId, memoryService, loadMemory],
  );

  // Sync to cloud
  const syncToCloud = useCallback(
    async (syncOptions: Omit<MemorySyncOptions, "force">) => {
      return memoryService.syncToCloud({
        ...syncOptions,
        force: false,
      });
    },
    [memoryService],
  );

  // Pull from cloud
  const pullFromCloud = useCallback(
    async (encryptionKey: MemorySyncOptions["encryptionKey"]) => {
      if (!userId) return false;
      const success = await memoryService.pullFromCloud(userId, encryptionKey);
      if (success) {
        await loadMemory();
      }
      return success;
    },
    [userId, memoryService, loadMemory],
  );

  // Prune memory
  const pruneMemory = useCallback(async () => {
    if (!userId) return;
    await memoryService.pruneMemory(userId);
    await loadMemory();
  }, [userId, memoryService, loadMemory]);

  // Consolidate facts
  const consolidateFacts = useCallback(async () => {
    if (!userId) return 0;
    const count = await memoryService.consolidateFacts(userId);
    if (count > 0) {
      await loadMemory();
    }
    return count;
  }, [userId, memoryService, loadMemory]);

  // Get stats
  const getStats = useCallback(async () => {
    if (!userId) return null;
    return memoryService.getMemoryStats(userId);
  }, [userId, memoryService]);

  // Auto-load on mount and when userId changes
  useEffect(() => {
    if (autoLoad && userId) {
      void loadMemory();
    }
  }, [autoLoad, userId, loadMemory]);

  // Listen for memory updates from other sources (e.g., aiStore)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleUpdate = () => {
      void loadMemory();
    };

    window.addEventListener("conversation-memory-updated", handleUpdate);
    return () => {
      window.removeEventListener("conversation-memory-updated", handleUpdate);
    };
  }, [loadMemory]);

  return {
    memory,
    isLoading,
    error,
    loadMemory,
    clearMemory,
    addFact,
    updateFact,
    deactivateFact,
    getActiveGoals,
    getActiveConcerns,
    processConversationEnd,
    syncToCloud,
    pullFromCloud,
    pruneMemory,
    consolidateFacts,
    getStats,
  };
}

/**
 * Helper hook for just accessing active goals
 */
export function useActiveGoals(userId: string): {
  goals: CriticalFact[];
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const [goals, setGoals] = useState<CriticalFact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const memoryService = getConversationMemoryService();

  const refresh = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const activeGoals = await memoryService.getActiveGoals(userId);
      setGoals(activeGoals);
    } finally {
      setIsLoading(false);
    }
  }, [userId, memoryService]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { goals, isLoading, refresh };
}

/**
 * Helper hook for memory statistics
 */
export function useMemoryStats(userId: string): {
  stats: Awaited<ReturnType<ConversationMemoryService["getMemoryStats"]>>;
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const [stats, setStats] =
    useState<Awaited<ReturnType<ConversationMemoryService["getMemoryStats"]>>>(
      null,
    );
  const [isLoading, setIsLoading] = useState(false);
  const memoryService = getConversationMemoryService();

  const refresh = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const memStats = await memoryService.getMemoryStats(userId);
      setStats(memStats);
    } finally {
      setIsLoading(false);
    }
  }, [userId, memoryService]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { stats, isLoading, refresh };
}
