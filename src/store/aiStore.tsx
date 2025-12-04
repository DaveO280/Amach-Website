// src/store/aiStore.tsx
"use client";

import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { CosaintAiService } from "@/services/CosaintAiService";
import React, { createContext, useContext, useState } from "react";
import { v4 as uuidv4 } from "uuid";

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [aiService, setAiService] = useState<CosaintAiService | null>(null);
  const [useMultiAgent, setUseMultiAgent] = useState<boolean>(true);

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
        ...chatHistory.map(({ role, content }) => ({ role, content })),
        { role: "user" as const, content: message },
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
