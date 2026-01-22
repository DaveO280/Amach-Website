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
import {
  extractConcernsFromConversation,
  extractGoalsFromConversation,
} from "@/utils/contextExtractor";

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

// Create context with a default value that matches the interface
const AiContext = createContext<AiContextType | null>(null);

const sanitizeAssistantResponse = (raw: string): string => {
  if (!raw) {
    return raw;
  }

  // First, try to strip <think> tags and keep content outside them
  let withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Handle any unmatched <think> tags just in case
  withoutThink = withoutThink.replace(/<think>[\s\S]*$/gi, "");
  withoutThink = withoutThink.replace(/<\/?think>/gi, "");

  // If stripping <think> leaves nothing, extract content FROM <think> tags
  // (Qwen sometimes puts entire response in <think> tags)
  if (withoutThink.trim().length === 0 && raw.includes("<think>")) {
    console.log(
      "[aiStore] Response is ALL <think> tags - extracting content from within",
    );
    console.log("[aiStore] Full raw response:", raw);
    console.log("[aiStore] Has closing tag?", raw.includes("</think>"));

    const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/i);
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
    return raw.replace(/<\/?think>/gi, "").trim();
  }

  return withoutThink.trimStart();
};

const AiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    metricData,
    metrics,
    uploadedFiles,
    userProfile,
    chatHistory,
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

  // Function to send a message to the AI
  const sendMessage = async (
    message: string,
    forceInitialAnalysis?: boolean,
  ): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const userId = address || "local-anon";

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
        timestamp: new Date().toISOString(),
      });

      // Persist to IndexedDB thread store (non-blocking but awaited so prompt context is correct)
      let threadInfo: {
        threadId: string;
        startedNewThread: boolean;
        previousThreadId?: string;
      } | null = null;
      try {
        threadInfo = await chatHistoryStore.appendMessage({
          userId,
          role: "user",
          content: message,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        console.warn(
          "[aiStore] Failed to persist user message to IndexedDB:",
          e,
        );
      }

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

      const conversationHistoryToSend = [
        ...(await chatHistoryStore
          .buildConversationHistoryForPrompt({
            userId,
            newUserMessage: message,
            maxChars: useMultiAgent ? 4500 : 2200,
          })
          .then((r) => {
            if (process.env.NODE_ENV === "development") {
              const totalChars = r.messages.reduce(
                (sum, m) => sum + (m.content?.length || 0),
                0,
              );
              console.log("[ChatContext] Selected history for prompt", {
                threadId: r.threadId,
                sameTopic: r.sameTopic,
                messageCount: r.messages.length,
                totalChars,
              });
            }
            // Ensure we don't accidentally include the current user message in history;
            // CosaintAiService appends it once as "User: ...".
            const msgs = r.messages;
            if (
              msgs.length > 0 &&
              msgs[msgs.length - 1]?.role === "user" &&
              msgs[msgs.length - 1]?.content === message
            ) {
              return msgs.slice(0, -1);
            }
            return msgs;
          })
          .catch(() => [
            ...chatHistory.map(({ role, content }) => ({ role, content })),
            { role: "user" as const, content: message },
          ])),
      ];

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
        timestamp: new Date().toISOString(),
      });

      // Persist assistant response to IndexedDB thread store
      try {
        await chatHistoryStore.appendMessage({
          userId,
          role: "assistant",
          content: finalResponse,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        console.warn(
          "[aiStore] Failed to persist assistant message to IndexedDB:",
          e,
        );
      }

      // Compact conversation memory updates (IndexedDB) — keep it small to avoid prompt bloat.
      // We update memory when a new thread starts (meaning we likely shifted topics / closed a session).
      if (threadInfo?.startedNewThread && threadInfo.previousThreadId) {
        try {
          const prev = await chatHistoryStore.getThreadById(
            threadInfo.previousThreadId,
          );
          if (prev && prev.messages.length > 0) {
            // Build a tiny "session summary" from the tail of the previous thread.
            const tail = prev.messages.slice(-10);
            const tailText = tail
              .map((m) => `${m.role}: ${m.content}`)
              .join("\n");
            const goals = extractGoalsFromConversation(
              tail.map((m) => ({
                role: m.role,
                content: m.content,
                timestamp: m.timestamp,
              })),
            );
            const concerns = extractConcernsFromConversation(
              tail.map((m) => ({
                role: m.role,
                content: m.content,
                timestamp: m.timestamp,
              })),
            );

            await conversationMemoryStore.initialize();
            // Store goals/concerns as deduped critical facts (small, stable strings).
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

            const topics = Array.from(
              new Set(
                prev.topicKeywords
                  .slice(0, 8)
                  .map((t) => t.toLowerCase())
                  .filter(Boolean),
              ),
            );
            const summaryText = tailText.slice(0, 420);
            await conversationMemoryStore.addSessionSummary(userId, {
              id: uuidv4(),
              date: new Date().toISOString(),
              summary: summaryText,
              topics,
              importance: "medium",
              extractedFacts: [],
              messageCount: prev.messages.length,
            });
          }
        } catch (e) {
          console.warn("[aiStore] Failed to update conversation memory:", e);
        }
      }

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
            await fetch("/api/storj", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "conversation/sync",
                userAddress: address,
                encryptionKey,
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
