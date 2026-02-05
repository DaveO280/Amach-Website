/**
 * IAiService - Abstract interface for AI health assistant operations
 *
 * Implementations:
 * - VeniceAiService (web): Current Venice API implementation (Cosaint)
 * - AppleIntelligenceService (iOS): Future native iOS Apple Intelligence
 * - MockAiService (tests): Mock AI for unit tests
 *
 * This abstraction allows:
 * - Easy testing with deterministic mock responses
 * - Platform-specific AI backends (Venice vs Apple Intelligence)
 * - Consistent API for AI operations
 */

import type { HealthContextMetrics } from "@/types/HealthContext";
import type { ConversationMemory } from "@/types/conversationMemory";

export interface UserProfile {
  birthDate?: string;
  sex?: string;
  height?: number;
  weight?: number;
}

export interface HealthDataContext {
  /** Current health metrics */
  metrics: HealthContextMetrics;
  /** User profile for personalization */
  profile?: UserProfile;
  /** Parsed reports (bloodwork, DEXA, etc.) */
  reports?: Array<{
    type: string;
    date: string;
    summary: string;
  }>;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

export interface ChatOptions {
  /** Analysis mode: 'quick' for fast responses, 'deep' for comprehensive analysis */
  mode: "quick" | "deep";
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for response variation (0-1) */
  temperature?: number;
  /** Whether to include tool use */
  enableTools?: boolean;
}

export interface ChatResponse {
  /** AI response content */
  content: string;
  /** Analysis results if deep mode */
  analysis?: {
    insights: string[];
    recommendations: string[];
    concerns?: string[];
  };
  /** Tool calls made during response */
  toolCalls?: Array<{
    tool: string;
    input: Record<string, unknown>;
    result: unknown;
  }>;
  /** Token usage */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Whether response was truncated */
  truncated?: boolean;
}

export interface AnalysisRequest {
  /** Type of analysis to perform */
  type: "weekly" | "monthly" | "trend" | "comparison";
  /** Date range for analysis */
  dateRange: {
    start: Date;
    end: Date;
  };
  /** Specific metrics to analyze */
  metrics?: string[];
  /** Focus areas */
  focus?: string[];
}

export interface AnalysisResult {
  /** Summary of findings */
  summary: string;
  /** Detailed insights by category */
  insights: Record<string, string[]>;
  /** Actionable recommendations */
  recommendations: string[];
  /** Concerning trends */
  concerns?: string[];
  /** Positive trends */
  improvements?: string[];
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Abstract interface for AI health assistant operations
 *
 * Handles chat interactions and health data analysis.
 * Implementations should be privacy-aware and not store conversation data externally.
 */
export interface IAiService {
  // ============ Chat ============

  /**
   * Send a chat message and get AI response
   * @param message - User message
   * @param context - Health data context
   * @param history - Conversation history
   * @param options - Chat options
   * @returns AI response
   */
  chat(
    message: string,
    context: HealthDataContext,
    history: ChatMessage[],
    options: ChatOptions,
  ): Promise<ChatResponse>;

  /**
   * Stream a chat response
   * @param message - User message
   * @param context - Health data context
   * @param history - Conversation history
   * @param options - Chat options
   * @param onChunk - Callback for each chunk
   * @returns Final response
   */
  chatStream(
    message: string,
    context: HealthDataContext,
    history: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: string) => void,
  ): Promise<ChatResponse>;

  // ============ Analysis ============

  /**
   * Perform health data analysis
   * @param request - Analysis request
   * @param context - Health data context
   * @returns Analysis results
   */
  analyze(
    request: AnalysisRequest,
    context: HealthDataContext,
  ): Promise<AnalysisResult>;

  /**
   * Get a quick health summary
   * @param context - Health data context
   * @returns Brief summary string
   */
  getSummary(context: HealthDataContext): Promise<string>;

  // ============ Memory (optional) ============

  /**
   * Save conversation memory for context continuity
   * @param memory - Conversation memory to save
   */
  saveMemory?(memory: ConversationMemory): Promise<void>;

  /**
   * Load conversation memory
   * @param userId - User identifier
   * @returns Stored memory or null
   */
  loadMemory?(userId: string): Promise<ConversationMemory | null>;

  // ============ Utility ============

  /**
   * Check if AI service is available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get service capabilities
   */
  getCapabilities(): {
    supportsStreaming: boolean;
    supportsTools: boolean;
    supportsDeepAnalysis: boolean;
    maxContextTokens: number;
  };
}

/**
 * Factory function type for creating AI service instances
 */
export type AiServiceFactory = () => IAiService;
