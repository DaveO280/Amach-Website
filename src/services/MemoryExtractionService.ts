// src/services/MemoryExtractionService.ts
// AI-powered extraction of facts and session summaries from conversations

import type { CriticalFact, SessionSummary } from "@/types/conversationMemory";
import { VeniceApiService } from "@/api/venice/VeniceApiService";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export interface ExtractionResult {
  facts: CriticalFact[];
  summary: SessionSummary;
  topics: string[];
}

interface ExtractedFactRaw {
  category:
    | "goal"
    | "concern"
    | "condition"
    | "preference"
    | "milestone"
    | "context";
  value: string;
  context?: string;
  importance?: "high" | "medium" | "low";
}

interface ExtractedSummaryRaw {
  summary: string;
  topics: string[];
  reasoning?: string;
  importance: "high" | "medium" | "low";
}

const FACT_EXTRACTION_PROMPT = `You are a health assistant memory system. Analyze the conversation and extract important facts about the user that should be remembered for future conversations.

Extract facts in these categories:
- goal: Health goals the user has mentioned (e.g., "lose 10 pounds", "run a marathon")
- concern: Health concerns or worries (e.g., "worried about blood pressure", "experiencing fatigue")
- condition: Medical conditions or diagnoses mentioned (e.g., "has type 2 diabetes", "takes blood pressure medication")
- preference: User preferences for health advice (e.g., "prefers natural remedies", "vegetarian diet")
- milestone: Achievements or progress mentioned (e.g., "hit 10,000 steps today", "lost 5 pounds this month")
- context: Important context about lifestyle (e.g., "works night shifts", "has two young children")

Rules:
- Only extract facts explicitly stated or strongly implied by the user
- Do not infer or assume facts not in the conversation
- Focus on health-relevant information
- Skip generic greetings or small talk
- Each fact should be self-contained and understandable without the conversation

Return a JSON array of objects with this structure:
{
  "facts": [
    {
      "category": "goal|concern|condition|preference|milestone|context",
      "value": "the fact statement",
      "context": "brief context about when/why this was mentioned",
      "importance": "high|medium|low"
    }
  ]
}

If no facts worth remembering, return: {"facts": []}`;

const SESSION_SUMMARY_PROMPT = `You are a health assistant memory system. Create a brief summary of this conversation for future reference.

The summary should:
- Capture the main topics discussed
- Note any decisions or action items
- Highlight key health insights shared
- Be concise (1-3 sentences)
- Focus on what would be useful context for future conversations

Return JSON with this structure:
{
  "summary": "Brief summary of the conversation",
  "topics": ["topic1", "topic2"],
  "keyPoints": ["key point 1", "key point 2"],
  "importance": "high|medium|low"
}

Importance levels:
- high: User shared significant health info, made important decisions, or discussed serious concerns
- medium: Useful health discussion with actionable advice
- low: General questions or casual health chat`;

export class MemoryExtractionService {
  private veniceApi: VeniceApiService;

  constructor(veniceApi?: VeniceApiService) {
    this.veniceApi =
      veniceApi ??
      new VeniceApiService(
        process.env.NEXT_PUBLIC_VENICE_MODEL_NAME || "zai-org-glm-4.7",
        process.env.NODE_ENV === "development",
      );
  }

  /**
   * Extract critical facts from a conversation
   */
  async extractFacts(messages: ConversationMessage[]): Promise<CriticalFact[]> {
    if (messages.length === 0) return [];

    // Only process user messages for fact extraction
    const userMessages = messages.filter((m) => m.role === "user");
    if (userMessages.length === 0) return [];

    // Format conversation for the prompt
    const conversationText = this.formatConversationForPrompt(messages);

    const prompt = `${FACT_EXTRACTION_PROMPT}

Conversation:
${conversationText}`;

    try {
      const response = await this.veniceApi.generateVeniceResponse(
        prompt,
        1000,
        {
          disable_thinking: true,
          strip_thinking_response: true,
          include_venice_system_prompt: false,
        },
      );

      if (!response) return [];

      const parsed = this.parseJsonResponse<{ facts: ExtractedFactRaw[] }>(
        response,
      );
      if (!parsed?.facts || !Array.isArray(parsed.facts)) return [];

      // Convert to CriticalFact format
      return parsed.facts.map((fact, index) => ({
        id: `fact-${Date.now()}-${index}`,
        category: fact.category as CriticalFact["category"],
        value: fact.value,
        context: fact.context,
        dateIdentified: new Date().toISOString(),
        isActive: true,
        source: "ai-extracted" as const,
        storageLocation: "local" as const,
        confidence: 0.7,
      }));
    } catch (error) {
      console.error("[MemoryExtractionService] Error extracting facts:", error);
      return [];
    }
  }

  /**
   * Generate a summary of a conversation session
   */
  async generateSessionSummary(
    messages: ConversationMessage[],
    threadId: string,
  ): Promise<SessionSummary | null> {
    if (messages.length === 0) return null;

    const conversationText = this.formatConversationForPrompt(messages);

    const prompt = `${SESSION_SUMMARY_PROMPT}

Conversation:
${conversationText}`;

    try {
      const response = await this.veniceApi.generateVeniceResponse(
        prompt,
        500,
        {
          disable_thinking: true,
          strip_thinking_response: true,
          include_venice_system_prompt: false,
        },
      );

      if (!response) return null;

      const parsed = this.parseJsonResponse<ExtractedSummaryRaw>(response);
      if (!parsed?.summary) return null;

      return {
        id: `session-${threadId}-${Date.now()}`,
        date: new Date().toISOString(),
        summary: parsed.summary,
        topics: parsed.topics || [],
        messageCount: messages.length,
        extractedFacts: [], // Will be populated separately
        importance: parsed.importance || "medium",
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      console.error(
        "[MemoryExtractionService] Error generating summary:",
        error,
      );
      return null;
    }
  }

  /**
   * Extract both facts and summary in a single operation
   */
  async processConversation(
    messages: ConversationMessage[],
    threadId: string,
  ): Promise<ExtractionResult> {
    // Run extractions in parallel for efficiency
    const [facts, summary] = await Promise.all([
      this.extractFacts(messages),
      this.generateSessionSummary(messages, threadId),
    ]);

    // Derive topics from facts if summary didn't provide them
    const topics = summary?.topics?.length
      ? summary.topics
      : this.deriveTopicsFromFacts(facts);

    // Link facts to the session summary
    const sessionSummary: SessionSummary = summary ?? {
      id: `session-${threadId}-${Date.now()}`,
      date: new Date().toISOString(),
      summary: this.generateFallbackSummary(messages),
      topics,
      messageCount: messages.length,
      extractedFacts: facts.map((f) => f.id),
      importance: "low",
    };

    // Update session with fact IDs
    sessionSummary.extractedFacts = facts.map((f) => f.id);

    return {
      facts,
      summary: sessionSummary,
      topics,
    };
  }

  /**
   * Identify topics from a conversation without full extraction
   * Lightweight operation for topic continuity tracking
   */
  identifyTopics(messages: ConversationMessage[]): string[] {
    const topicKeywords: Record<string, string[]> = {
      exercise: [
        "exercis",
        "workout",
        "steps",
        "running",
        "walking",
        "gym",
        "fitness",
      ],
      sleep: ["sleep", "rest", "insomnia", "tired", "fatigue", "nap"],
      nutrition: [
        "diet",
        "food",
        "eating",
        "calories",
        "nutrition",
        "meal",
        "keto",
        "fasting",
      ],
      cardiovascular: [
        "heart",
        "cardiovascular",
        "blood pressure",
        "hrv",
        "pulse",
      ],
      weight: ["weight", "bmi", "pounds", "kg", "scale"],
      stress: [
        "stress",
        "anxiety",
        "anxious",
        "mental",
        "meditation",
        "mindfulness",
      ],
      medication: [
        "medication",
        "medicine",
        "prescription",
        "supplement",
        "vitamin",
      ],
      pain: ["pain", "ache", "hurt", "discomfort", "sore"],
      lab_results: [
        "lab",
        "blood test",
        "results",
        "cholesterol",
        "glucose",
        "A1C",
      ],
      goals: ["goal", "target", "aim", "want to", "trying to"],
    };

    const foundTopics = new Set<string>();
    const allText = messages.map((m) => m.content.toLowerCase()).join(" ");

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some((kw) => allText.includes(kw))) {
        foundTopics.add(topic);
      }
    }

    return Array.from(foundTopics);
  }

  /**
   * Check if a conversation has enough substance to warrant memory extraction
   */
  shouldExtractMemory(messages: ConversationMessage[]): boolean {
    // Need at least 2 user messages for meaningful extraction
    const userMessages = messages.filter((m) => m.role === "user");
    if (userMessages.length < 2) return false;

    // Check total content length - skip very short conversations
    const totalLength = userMessages.reduce(
      (sum, m) => sum + m.content.length,
      0,
    );
    if (totalLength < 100) return false;

    // Check if there's health-related content
    const topics = this.identifyTopics(messages);
    return topics.length > 0;
  }

  private formatConversationForPrompt(messages: ConversationMessage[]): string {
    return messages
      .map((m) => {
        const role = m.role === "user" ? "User" : "Assistant";
        return `${role}: ${m.content}`;
      })
      .join("\n\n");
  }

  private parseJsonResponse<T>(response: string): T | null {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
      return null;
    } catch {
      console.warn("[MemoryExtractionService] Failed to parse JSON response");
      return null;
    }
  }

  private deriveTopicsFromFacts(facts: CriticalFact[]): string[] {
    const topicMap: Record<string, string> = {
      goal: "goals",
      concern: "concerns",
      condition: "conditions",
      preference: "preferences",
      milestone: "progress",
      context: "lifestyle",
    };

    const topics = new Set<string>();
    for (const fact of facts) {
      const topic = topicMap[fact.category];
      if (topic) topics.add(topic);
    }

    return Array.from(topics);
  }

  private generateFallbackSummary(messages: ConversationMessage[]): string {
    const userMessages = messages.filter((m) => m.role === "user");
    if (userMessages.length === 0) return "Brief conversation";

    // Use first user message as basis for summary
    const firstMessage = userMessages[0].content;
    const truncated =
      firstMessage.length > 100
        ? firstMessage.substring(0, 97) + "..."
        : firstMessage;

    return `Discussed: ${truncated}`;
  }
}
