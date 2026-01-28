// src/store/aiStore.tsx
"use client";

import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { CosaintAiService } from "@/services/CosaintAiService";
import { chatHistoryStore } from "@/data/store/chatHistoryStore";
import { getCachedWalletEncryptionKey } from "@/utils/walletEncryption";
import React, { createContext, useContext, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useWalletService } from "@/hooks/useWalletService";
import { conversationMemoryStore } from "@/data/store/conversationMemoryStore";
import type { ConversationMemory } from "@/types/conversationMemory";
import { ToolResponseParser } from "@/ai/tools/ToolResponseParser";
import {
  extractConcernsFromConversation,
  extractFreeformGoalsFromConversation,
  extractGoalsFromConversation,
  extractPreferencesFromConversation,
} from "@/utils/contextExtractor";
import type { ChatMessageForContext } from "@/utils/chatContextSelector";
import {
  buildPromptMessages,
  isTopicShift,
  tokenizeForTopic,
} from "@/utils/chatContextSelector";

// Define types for our messages and context
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AiContextType {
  messages: Message[];
  sendMessage: (
    message: string,
    forceInitialAnalysis?: boolean,
  ) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  clearMessages: () => void;
  useMultiAgent: boolean;
  setUseMultiAgent: (value: boolean) => void;
}

const MAX_MESSAGES_PER_THREAD = 250;
const INACTIVITY_NEW_THREAD_MINUTES = 45;

function nowIso(): string {
  return new Date().toISOString();
}

function getThreadRecentText(
  threadMessages: ChatMessageForContext[],
  lastMessages = 12,
): string {
  const slice = threadMessages.slice(-lastMessages);
  return slice.map((m) => m.content).join("\n");
}

function mergeKeywords(existing: string[], nextText: string): string[] {
  const tokens = tokenizeForTopic(nextText).slice(0, 40);
  const next = new Set([...existing, ...tokens]);
  return Array.from(next).slice(0, 40);
}

// Create context with a default value that matches the interface
const AiContext = createContext<AiContextType | null>(null);

const sanitizeAssistantResponse = (raw: string): string => {
  if (!raw) {
    return raw;
  }

  // Remove any tool-call payloads (codefenced JSON, tool_call tags, etc.)
  // This is a safety net: the user should never see raw tool JSON in chat.
  const withoutTools = ToolResponseParser.stripToolCalls(raw);

  // First, try to strip <think> tags and keep content outside them
  let withoutThink = withoutTools.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Handle any unmatched <think> tags just in case
  withoutThink = withoutThink.replace(/<think>[\s\S]*$/gi, "");
  withoutThink = withoutThink.replace(/<\/?think>/gi, "");

  // If stripping <think> leaves nothing, extract content FROM <think> tags
  // (Qwen sometimes puts entire response in <think> tags)
  if (withoutThink.trim().length === 0 && withoutTools.includes("<think>")) {
    console.log(
      "[aiStore] Response is ALL <think> tags - extracting content from within",
    );
    console.log("[aiStore] Full raw response:", withoutTools);
    console.log(
      "[aiStore] Has closing tag?",
      withoutTools.includes("</think>"),
    );

    const thinkMatch = withoutTools.match(/<think>([\s\S]*?)<\/think>/i);
    console.log("[aiStore] Regex match result:", {
      matched: Boolean(thinkMatch),
      contentLength: thinkMatch?.[1]?.length || 0,
      contentPreview: thinkMatch?.[1]?.substring(0, 200),
    });

    if (thinkMatch && thinkMatch[1]) {
      // Extract the content from the first <think> block
      const extracted = thinkMatch[1].trim();
      console.log("[aiStore] Extracted content length:", extracted.length);
      return extracted;
    }

    console.warn(
      "[aiStore] Failed to extract from <think> tags - returning raw",
    );
    // If we can't extract, just return the raw content (better than nothing)
    return withoutTools.replace(/<\/?think>/gi, "").trim();
  }

  return withoutThink.trimStart();
};

const AiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    metricData,
    metrics,
    uploadedFiles,
    userProfile,
    addChatMessage,
    reports,
  } = useHealthDataContext();
  const walletService = useWalletService();
  const { isConnected, address, signMessage } = walletService;
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [aiService, setAiService] = useState<CosaintAiService | null>(null);
  const [useMultiAgent, setUseMultiAgent] = useState<boolean>(false);
  const [conversationMemory, setConversationMemory] =
    useState<ConversationMemory | null>(null);

  // In-memory chat thread for fast prompt context selection (no IndexedDB reads on send).
  // IndexedDB is used for persistence/restore only (write-behind).
  const threadRef = React.useRef<{
    id: string;
    lastMessageAtMs: number;
    topicKeywords: string[];
    messages: ChatMessageForContext[];
  } | null>(null);

  // Throttle background Storj sync so we don't spam uploads.
  // (Module-level would also work, but we keep it instance-local.)
  const [lastConversationSyncAtMs, setLastConversationSyncAtMs] = useState(0);

  // Initialize the AI service
  const getAIService = async (): Promise<CosaintAiService> => {
    if (!aiService) {
      const service = CosaintAiService.createFromEnv();
      setAiService(service);
      return service;
    }
    return aiService;
  };

  // Load conversation memory snapshot (IndexedDB) when address changes.
  React.useEffect(() => {
    let cancelled = false;
    const userId = address || "local-anon";
    void (async (): Promise<void> => {
      try {
        await conversationMemoryStore.initialize();
        const mem = await conversationMemoryStore.getMemory(userId);
        if (!cancelled) setConversationMemory(mem);
      } catch {
        if (!cancelled) setConversationMemory(null);
      }
    })();

    const onUpdated = (): void => {
      void (async (): Promise<void> => {
        try {
          await conversationMemoryStore.initialize();
          const mem = await conversationMemoryStore.getMemory(userId);
          if (!cancelled) setConversationMemory(mem);
        } catch {
          // ignore
        }
      })();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("conversation-memory-updated", onUpdated);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("conversation-memory-updated", onUpdated);
      }
    };
  }, [address]);

  // Function to send a message to the AI
  const sendMessage = async (
    message: string,
    forceInitialAnalysis?: boolean,
  ): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const userId = address || "local-anon";
      const tsIso = nowIso();

      // Create a new message
      const newMessage: Message = {
        id: uuidv4(),
        content: message,
        role: "user",
        timestamp: new Date(),
      };

      // Add the message to the list
      setMessages((prev) => [...prev, newMessage]);
      addChatMessage({
        role: "user",
        content: message,
        timestamp: tsIso,
      });

      // Update in-memory thread + decide if we should start a new thread (topic shift / inactivity).
      const prevThread = threadRef.current;
      const shouldStartNewThread = (() => {
        if (!prevThread) return true;
        const inactivityMs = Date.now() - prevThread.lastMessageAtMs;
        if (inactivityMs > INACTIVITY_NEW_THREAD_MINUTES * 60_000) return true;
        const recentText = getThreadRecentText(prevThread.messages);
        return isTopicShift({
          newMessage: message,
          recentThreadText: recentText,
        });
      })();

      if (
        shouldStartNewThread &&
        prevThread &&
        prevThread.messages.length > 0
      ) {
        // Update conversation memory from the closed thread (write-behind; doesn't block chat UX).
        void (async (): Promise<void> => {
          try {
            const tail = prevThread.messages.slice(-10);
            const userTail = tail.filter((m) => m.role === "user");
            const assistantTail = tail.filter((m) => m.role === "assistant");
            const lastUser = userTail[userTail.length - 1]?.content ?? "";
            const lastAssistant =
              assistantTail[assistantTail.length - 1]?.content ?? "";

            const summaryText = [
              lastUser
                ? `User asked about: ${lastUser.replace(/\s+/g, " ").trim()}`
                : "",
              lastAssistant
                ? `Cosaint advised: ${lastAssistant
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 220)}${lastAssistant.length > 220 ? "…" : ""}`
                : "",
            ]
              .filter(Boolean)
              .join(" ");

            const tailAsChatMessages = tail.map((m) => ({
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
            }));

            const goals = extractGoalsFromConversation(tailAsChatMessages);
            const freeformGoals =
              extractFreeformGoalsFromConversation(tailAsChatMessages);
            const concerns =
              extractConcernsFromConversation(tailAsChatMessages);

            await conversationMemoryStore.initialize();
            for (const g of goals.slice(-5)) {
              await conversationMemoryStore.addCriticalFact(userId, {
                id: uuidv4(),
                category: "goal",
                value: g.text,
                context: "From recent chat",
                dateIdentified: new Date().toISOString(),
                isActive: true,
                source: "ai-extracted",
                storageLocation: "local",
                confidence: 0.6,
              });
            }
            for (const g of freeformGoals.slice(-8)) {
              await conversationMemoryStore.addCriticalFact(userId, {
                id: uuidv4(),
                category: "goal",
                value: g,
                context: "From recent chat",
                dateIdentified: new Date().toISOString(),
                isActive: true,
                source: "ai-extracted",
                storageLocation: "local",
                confidence: 0.55,
              });
            }
            for (const c of concerns.slice(-5)) {
              await conversationMemoryStore.addCriticalFact(userId, {
                id: uuidv4(),
                category: "concern",
                value: c,
                context: "From recent chat",
                dateIdentified: new Date().toISOString(),
                isActive: true,
                source: "ai-extracted",
                storageLocation: "local",
                confidence: 0.6,
              });
            }

            const prefs =
              extractPreferencesFromConversation(tailAsChatMessages);
            if (
              prefs.dietPreferred.length ||
              prefs.dietDisliked.length ||
              prefs.dietRestrictions.length ||
              prefs.exercisePreferred.length
            ) {
              await conversationMemoryStore.updatePreferences(userId, {
                diet: {
                  preferred: prefs.dietPreferred,
                  disliked: prefs.dietDisliked,
                  restrictions: prefs.dietRestrictions,
                },
                exercise: { preferred: prefs.exercisePreferred, disliked: [] },
              });
            }

            const topics = Array.from(
              new Set(
                prevThread.topicKeywords
                  .slice(0, 8)
                  .map((t) => t.toLowerCase())
                  .filter(Boolean),
              ),
            );
            await conversationMemoryStore.addSessionSummary(userId, {
              id: uuidv4(),
              date: new Date().toISOString(),
              summary: summaryText,
              topics,
              importance: "medium",
              extractedFacts: [],
              messageCount: prevThread.messages.length,
            });

            const updated = await conversationMemoryStore.getMemory(userId);
            setConversationMemory(updated);
          } catch (e) {
            console.warn("[aiStore] Failed to update conversation memory:", e);
          }
        })();
      }

      // Start or continue the in-memory thread (this is what we use for prompt context).
      const thread = shouldStartNewThread
        ? {
            id: uuidv4(),
            lastMessageAtMs: Date.now(),
            topicKeywords: tokenizeForTopic(message).slice(0, 40),
            messages: [] as ChatMessageForContext[],
          }
        : (prevThread as NonNullable<typeof prevThread>);

      const userMsgForContext: ChatMessageForContext = {
        role: "user",
        content: message,
        timestamp: tsIso,
      };
      thread.messages = [...thread.messages, userMsgForContext].slice(
        -MAX_MESSAGES_PER_THREAD,
      );
      thread.lastMessageAtMs = Date.now();
      thread.topicKeywords = mergeKeywords(thread.topicKeywords, message);
      threadRef.current = thread;

      // Get the AI service
      console.log("[aiStore] Getting AI service...");
      const service = await getAIService();
      console.log("[aiStore] AI service obtained");

      // Prepare the context with health data
      const context = {
        messages: [...messages, newMessage].map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        healthData: metrics,
        trends: {},
        uploadedFiles,
        userProfile,
      };

      const maxChars = useMultiAgent ? 4500 : 2200;
      const selected = buildPromptMessages({
        threadMessages: thread.messages,
        newUserMessage: userMsgForContext,
        sameTopic: !shouldStartNewThread,
        maxChars,
        includeNewMessage: false,
      });

      if (process.env.NODE_ENV === "development") {
        const totalChars = selected.reduce(
          (sum, m) => sum + (m.content?.length || 0),
          0,
        );
        console.log("[ChatContext] Selected history for prompt (in-memory)", {
          threadId: thread.id,
          sameTopic: !shouldStartNewThread,
          messageCount: selected.length,
          totalChars,
        });
      }

      const conversationHistoryToSend = selected;

      // Persist to IndexedDB thread store (write-behind; no longer blocks prompt context).
      void (async (): Promise<void> => {
        try {
          await chatHistoryStore.appendMessage({
            userId,
            role: "user",
            content: message,
            timestamp: tsIso,
          });
        } catch (e) {
          console.warn(
            "[aiStore] Failed to persist user message to IndexedDB:",
            e,
          );
        }
      })();

      // Send the message to the AI
      console.log("[aiStore] Calling service.generateResponseWithFiles...", {
        messageLength: message.length,
        hasHealthData: Boolean(context.healthData),
        useMultiAgent,
      });

      const response = await service.generateResponseWithFiles(
        message,
        conversationHistoryToSend,
        context.healthData,
        context.uploadedFiles,
        userProfile,
        metricData,
        useMultiAgent,
        reports,
        forceInitialAnalysis || false,
        conversationMemory,
      );

      console.log("[aiStore] Response received from service:", {
        hasResponse: Boolean(response),
        responseLength: response?.length || 0,
      });

      console.log("[aiStore] Raw response from CosaintAiService:", {
        responseLength: response.length,
        responsePreview: response.substring(0, 500),
        hasThinkTags: response.includes("<think>"),
      });

      const sanitizedResponse = sanitizeAssistantResponse(response);

      console.log("[aiStore] After sanitization:", {
        sanitizedLength: sanitizedResponse.length,
        sanitizedPreview: sanitizedResponse.substring(0, 500),
        isEmpty: sanitizedResponse.trim().length === 0,
      });

      const finalResponse =
        sanitizedResponse.trim().length > 0
          ? sanitizedResponse
          : "I'm still digesting that. Could you try asking it a little differently so I can give you something useful?";

      if (finalResponse === sanitizedResponse) {
        console.log("✅ [aiStore] Using actual AI response");
      } else {
        console.warn(
          "⚠️ [aiStore] Using fallback response - sanitized response was empty!",
        );
      }

      // Add the response to the messages
      setMessages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          content: finalResponse,
          role: "assistant",
          timestamp: new Date(),
        },
      ]);
      addChatMessage({
        role: "assistant",
        content: finalResponse,
        timestamp: nowIso(),
      });

      // Append assistant response to in-memory thread
      const assistantTs = nowIso();
      threadRef.current = {
        ...(threadRef.current ?? {
          id: uuidv4(),
          lastMessageAtMs: Date.now(),
          topicKeywords: [],
          messages: [] as ChatMessageForContext[],
        }),
        lastMessageAtMs: Date.now(),
        topicKeywords: mergeKeywords(
          threadRef.current?.topicKeywords ?? [],
          finalResponse,
        ),
        messages: [
          ...(threadRef.current?.messages ?? []),
          {
            role: "assistant" as const,
            content: finalResponse,
            timestamp: assistantTs,
          },
        ].slice(-MAX_MESSAGES_PER_THREAD),
      };

      // Persist assistant response to IndexedDB (write-behind)
      void (async (): Promise<void> => {
        try {
          await chatHistoryStore.appendMessage({
            userId,
            role: "assistant",
            content: finalResponse,
            timestamp: assistantTs,
          });
        } catch (e) {
          console.warn(
            "[aiStore] Failed to persist assistant message to IndexedDB:",
            e,
          );
        }
      })();

      // Opportunistic long-term sync: sync structured conversation memory snapshot to Storj
      // This is intentionally lightweight and non-blocking for chat UX.
      if (isConnected && address) {
        void (async (): Promise<void> => {
          try {
            // throttle to at most once per 5 minutes
            const now = Date.now();
            if (now - lastConversationSyncAtMs < 5 * 60_000) {
              return;
            }
            const encryptionKey = await getCachedWalletEncryptionKey(
              address,
              signMessage,
            );
            // Load latest ConversationMemory snapshot from IndexedDB and send it to the server for upload.
            await conversationMemoryStore.initialize();
            const memory = await conversationMemoryStore.getMemory(address);
            if (!memory) {
              // Nothing to sync yet.
              setLastConversationSyncAtMs(now);
              return;
            }
            await fetch("/api/storj", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "conversation/sync",
                userAddress: address,
                encryptionKey,
                data: memory,
                options: { background: true },
              }),
            });
            setLastConversationSyncAtMs(now);
          } catch (e) {
            console.warn("[aiStore] Conversation sync to Storj failed:", e);
          }
        })();
      }
    } catch (err) {
      console.error("❌ [aiStore] AI Chat Error:", err);
      console.error("❌ [aiStore] Error details:", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      let errorMessage = "An error occurred while processing your message.";

      if (err instanceof Error) {
        if (err.message.includes("timeout")) {
          errorMessage = "The request timed out. Please try again.";
        } else if (err.message.includes("network")) {
          errorMessage =
            "Network error. Please check your connection and try again.";
        } else if (err.message.includes("API")) {
          errorMessage = "API service error. Please try again in a moment.";
        } else {
          errorMessage = err.message;
        }
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to clear messages
  const clearMessages = (): void => {
    setMessages([]);
    setError(null);
  };

  const value: AiContextType = {
    messages,
    sendMessage,
    isLoading,
    error,
    clearMessages,
    useMultiAgent,
    setUseMultiAgent,
  };

  return <AiContext.Provider value={value}>{children}</AiContext.Provider>;
};

// Custom hook to use the AI context
export function useAi(): AiContextType {
  const context = useContext(AiContext);
  if (!context) {
    throw new Error("useAi must be used within an AiProvider");
  }
  return context;
}

export default AiProvider;
