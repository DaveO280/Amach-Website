// src/store/aiStore.tsx
import {
  SummarizedData,
  useHealthSummary,
} from "@/components/ai/HealthDataProvider";
import { CosaintAiService } from "@/services/CosaintAiService";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { v4 as uuidv4 } from "uuid";

// Define types for our messages and context
interface Message {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: string;
}

interface MessageContext {
  healthData?: SummarizedData;
  [key: string]: any; // Allow for other context properties
}

interface AiContextType {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (
    messageText: string,
    context?: MessageContext,
  ) => Promise<Message | undefined>;
  clearMessages: () => void;
}

// Create context with a default value that matches the interface
const AiContext = createContext<AiContextType | null>(null);

// Create our AI service instance
let aiService: CosaintAiService | null = null;

export function AiProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { summarizedData } = useHealthSummary();

  // Initialize the AI service
  useEffect(() => {
    const initializeAiService = async () => {
      try {
        // Debug log to check environment variables
        console.log("[AiProvider] Environment variables:", {
          NODE_ENV: process.env.NODE_ENV,
          VENICE_API_KEY: process.env.VENICE_API_KEY ? "Set" : "Not set",
          USE_MOCK_AI: process.env.USE_MOCK_AI,
        });

        // Initialize the AI service if it hasn't been created yet
        if (!aiService) {
          // In a development environment, you might want to use a mock
          if (
            process.env.NODE_ENV === "development" &&
            !process.env.VENICE_API_KEY &&
            process.env.USE_MOCK_AI !== "false"
          ) {
            console.log("[AiProvider] Using mock AI service for development");
            // We'll implement real service later when API keys are available
            aiService = {
              generateResponse: async (message, history) => {
                return `[DEV MODE] This is a simulated response to: "${message}"`;
              },
            } as CosaintAiService;
          } else {
            // In production, use the real service
            aiService = CosaintAiService.createFromEnv();
            console.log("[AiProvider] Venice AI service initialized");
          }
        }
      } catch (err) {
        console.error("[AiProvider] Failed to initialize AI service:", err);
        setError("Failed to initialize AI service. Please try again later.");
      }
    };

    initializeAiService();
  }, []);

  // Add logging when summarized data changes
  useEffect(() => {
    console.log("[AiProvider] Health summary data:", {
      available: Boolean(summarizedData),
      metrics: summarizedData?.stats.metrics
        ? Object.entries(summarizedData.stats.metrics)
            .filter(([_, data]) => data.available)
            .map(([key]) => key)
        : "none",
      days: summarizedData?.daily.length || 0,
    });
  }, [summarizedData]);

  // Function to send a message to the AI
  const sendMessage = async (
    messageText: string,
    context: MessageContext = {},
  ): Promise<Message | undefined> => {
    if (!messageText.trim()) return;
    if (!aiService) {
      setError("AI service is not initialized. Please try again later.");
      return;
    }

    setIsLoading(true);
    setError(null);

    // Add user message to chat
    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content: messageText,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      // Format message history for the AI service
      const messageHistory = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-10) // Last 10 messages for context
        .map((m) => ({
          role: m.role === "system" ? "assistant" : m.role,
          content: m.content,
        }));

      // Use the detailed health data if available
      const healthData = summarizedData || context.healthData;

      // Call the AI service with the detailed health data
      const aiResponse = await aiService.generateResponse(
        messageText,
        messageHistory,
        healthData,
      );

      // Add AI response to chat
      const assistantMessage: Message = {
        id: uuidv4(),
        role: "assistant",
        content: aiResponse,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      return assistantMessage;
    } catch (err) {
      console.error("[AiProvider] Error sending message to AI:", err);
      setError("Failed to get a response. Please try again.");
      return undefined;
    } finally {
      setIsLoading(false);
    }
  };

  // Clear all messages
  const clearMessages = () => {
    setMessages([]);
    setError(null);
  };

  const value: AiContextType = {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
  };

  return <AiContext.Provider value={value}>{children}</AiContext.Provider>;
}

// Custom hook to use the AI context
export function useAi(): AiContextType {
  const context = useContext(AiContext);
  if (!context) {
    throw new Error("useAi must be used within an AiProvider");
  }
  return context;
}
