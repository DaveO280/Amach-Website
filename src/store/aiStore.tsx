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
  sendMessage: (message: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  clearMessages: () => void;
}

// Create context with a default value that matches the interface
const AiContext = createContext<AiContextType | null>(null);

const AiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { metrics, uploadedFiles, userProfile } = useHealthDataContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [aiService, setAiService] = useState<CosaintAiService | null>(null);

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
  const sendMessage = async (message: string): Promise<void> => {
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

      // Get the AI service
      const service = await getAIService();

      // Prepare the context with health data
      const context = {
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        healthData: metrics,
        trends: {},
        uploadedFiles,
        userProfile,
      };

      // Send the message to the AI
      const response = await service.generateResponseWithFiles(
        message,
        context.messages,
        context.healthData,
        context.uploadedFiles,
        context.userProfile,
      );

      // Add the response to the messages
      setMessages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          content: response,
          role: "assistant",
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      console.error("AI Chat Error:", err);
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
