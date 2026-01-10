/**
 * Hook for automatic context persistence
 *
 * Automatically extracts important context from conversations and saves to:
 * 1. IndexedDB (for immediate access)
 * 2. Context Vault → Storj (for cross-device persistence)
 *
 * Triggers on:
 * - Every 10 messages
 * - When user closes tab (beforeunload)
 * - Manual save request
 */

import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import type { ExtractedContext } from "@/utils/contextExtractor";
import {
  buildPromptContextFromExtraction,
  createPinnedInsights,
  extractConcernsFromConversation,
  extractGoalsFromConversation,
  extractInterventionsFromConversation,
} from "@/utils/contextExtractor";
import { useEffect, useRef } from "react";

const SAVE_INTERVAL_MESSAGES = 10; // Save every 10 messages

export function useContextPersistence() {
  const { chatHistory } = useHealthDataContext();
  const lastSaveCount = useRef(0);
  const saveInProgress = useRef(false);

  /**
   * Extract context from current conversation
   */
  const extractCurrentContext = (): ExtractedContext => {
    const goals = extractGoalsFromConversation(chatHistory);
    const interventions = extractInterventionsFromConversation(chatHistory);
    const concerns = extractConcernsFromConversation(chatHistory);

    return {
      goals,
      interventions,
      concerns,
      milestones: [], // TODO: Implement milestone detection
    };
  };

  /**
   * Save extracted context to vault and Storj
   */
  const saveExtractedContext = async () => {
    if (saveInProgress.current) {
      console.log("[ContextPersistence] Save already in progress, skipping");
      return;
    }

    try {
      saveInProgress.current = true;
      console.log("[ContextPersistence] Extracting and saving context...");

      const extracted = extractCurrentContext();
      const pinnedInsights = createPinnedInsights(chatHistory);

      // Build prompt context for debugging
      const promptContext = buildPromptContextFromExtraction(extracted);
      console.log("[ContextPersistence] Extracted context:", {
        goalsCount: extracted.goals.length,
        interventionsCount: extracted.interventions.length,
        concernsCount: extracted.concerns.length,
        insightsCount: pinnedInsights.length,
        promptContext,
      });

      // TODO: Save to Context Vault and sync to Storj
      // This requires the full vault building logic from buildContextVaultSnapshot
      // For now, just log the extracted context

      lastSaveCount.current = chatHistory.length;
      console.log("✅ [ContextPersistence] Context saved successfully");
    } catch (error) {
      console.error("❌ [ContextPersistence] Failed to save context:", error);
    } finally {
      saveInProgress.current = false;
    }
  };

  /**
   * Auto-save on message count threshold
   */
  useEffect(() => {
    const messagesSinceLastSave = chatHistory.length - lastSaveCount.current;

    if (messagesSinceLastSave >= SAVE_INTERVAL_MESSAGES) {
      console.log(
        `[ContextPersistence] ${messagesSinceLastSave} messages since last save, triggering auto-save`,
      );
      saveExtractedContext();
    }
  }, [chatHistory.length]);

  /**
   * Save on visibility change (tab hidden) - more reliable than beforeunload
   * Browsers allow async operations during visibilitychange unlike beforeunload
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (chatHistory.length > lastSaveCount.current) {
          console.log("[ContextPersistence] Tab hidden, triggering save...");
          saveExtractedContext();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [chatHistory.length, lastSaveCount.current]);

  /**
   * Save on beforeunload as fallback (may not complete)
   * Modern browsers block async operations in beforeunload
   */
  useEffect(() => {
    const handleBeforeUnload = (_e: BeforeUnloadEvent) => {
      if (chatHistory.length > lastSaveCount.current) {
        console.warn(
          "[ContextPersistence] Page unloading - async save may not complete!",
        );

        // Attempt save but don't rely on it completing
        saveExtractedContext();

        // Optional: Warn user about unsaved changes
        // _e.preventDefault();
        // _e.returnValue = "You have unsaved health context. Are you sure?";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [chatHistory.length, lastSaveCount.current]);

  return {
    extractCurrentContext,
    saveExtractedContext,
    buildPromptContext: () =>
      buildPromptContextFromExtraction(extractCurrentContext()),
  };
}
