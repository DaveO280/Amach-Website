/**
 * Context Extractor - Extracts important context from conversations for AI prompts
 *
 * This service analyzes chat history to extract:
 * - User-stated goals and targets
 * - Active interventions (what user is trying)
 * - Key health concerns mentioned
 * - Progress markers and milestones
 *
 * Extracted context is saved to Context Vault for cross-device persistence
 */

import type { ChatMessage, HealthGoal } from "@/types/HealthContext";
import type { VaultPinnedInsight } from "@/types/contextVault";

export interface ExtractedContext {
  goals: HealthGoal[];
  interventions: Intervention[];
  concerns: string[];
  milestones: Milestone[];
}

export interface Intervention {
  id: string;
  description: string; // "Meditation 10min/day"
  startDate: string; // ISO date
  targetMetric?: string; // "HRV", "stress", etc.
  status: "active" | "paused" | "completed";
}

export interface Milestone {
  id: string;
  description: string; // "HRV improved from 68ms to 75ms"
  achievedDate: string;
  metricType: string;
  beforeValue?: number;
  afterValue?: number;
}

/**
 * Extract goals from conversation history
 * Looks for patterns like:
 * - "I want to improve..."
 * - "My goal is..."
 * - "I'm trying to get to..."
 */
export function extractGoalsFromConversation(
  messages: ChatMessage[],
): HealthGoal[] {
  const goals: HealthGoal[] = [];

  // Goal detection patterns
  const goalPatterns = [
    /(?:want to|trying to|goal is to|aiming to) (?:improve|increase|reduce|reach) (\w+)(?: to| from)? ?(\d+)?/gi,
    /(?:get my|bring my|raise my|lower my) (\w+)(?: to| above| below) (\d+)/gi,
  ];

  const userMessages = messages.filter((msg) => msg.role === "user");

  for (const message of userMessages) {
    const content = message.content.toLowerCase();

    for (const pattern of goalPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const metricName = match[1]; // "hrv", "steps", etc.
        const targetValue = match[2] ? parseInt(match[2]) : undefined;

        // Normalize metric name
        const normalizedMetric = normalizeMetricName(metricName);

        if (normalizedMetric) {
          const unit = getMetricUnit(normalizedMetric);
          const goalText = targetValue
            ? `Improve ${normalizedMetric} to ${targetValue}${unit}`
            : `Improve ${normalizedMetric}`;

          goals.push({
            id: `goal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            text: match[0].trim() || goalText,
            selected: true,
            source: "ai" as const,
            timeframe: message.timestamp,
          });
        }
      }
    }
  }

  return goals;
}

/**
 * Extract "freeform" goals that don't fit numeric/metric patterns.
 * Example: "reduce visceral fat", "improve VO2max", "muscle hypertrophy", "push-up max"
 */
export function extractFreeformGoalsFromConversation(
  messages: ChatMessage[],
): string[] {
  const out = new Set<string>();
  const userMessages = messages.filter((msg) => msg.role === "user");
  const goalPhrases: Array<{ re: RegExp; label: string }> = [
    { re: /\bvo2\s*max\b/i, label: "Improve VO2max" },
    { re: /\bvisceral\s+fat\b/i, label: "Reduce visceral fat" },
    { re: /\bhypertrophy\b/i, label: "Build muscle (hypertrophy)" },
    { re: /\bpush\s*-?\s*ups?\b/i, label: "Improve push-up max" },
    { re: /\bzone\s*2\b/i, label: "Improve aerobic base (Zone 2)" },
    {
      re: /\bjoints?\b|\brecovery\b/i,
      label: "Protect joints / improve recovery",
    },
  ];

  for (const m of userMessages) {
    const text = m.content || "";
    for (const { re, label } of goalPhrases) {
      if (re.test(text)) out.add(label);
    }
  }
  return Array.from(out);
}

/**
 * Lightweight preference extraction for ConversationMemory.preferences.
 * This is intentionally conservative; it only captures explicit statements.
 */
export function extractPreferencesFromConversation(messages: ChatMessage[]): {
  dietPreferred: string[];
  dietDisliked: string[];
  dietRestrictions: string[];
  exercisePreferred: string[];
} {
  const dietPreferred = new Set<string>();
  const dietDisliked = new Set<string>();
  const dietRestrictions = new Set<string>();
  const exercisePreferred = new Set<string>();

  const userMessages = messages.filter((msg) => msg.role === "user");
  for (const m of userMessages) {
    const t = (m.content || "").toLowerCase();

    if (/\bketo\b|\bketogenic\b/.test(t)) dietPreferred.add("keto");
    if (/\bmediterranean\b/.test(t)) dietPreferred.add("mediterranean");
    if (/\bhigh\s*protein\b/.test(t)) dietPreferred.add("high protein");
    if (/\bvegan\b/.test(t)) dietPreferred.add("vegan");
    if (/\bvegetarian\b/.test(t)) dietPreferred.add("vegetarian");

    if (/\bgluten\s*-?\s*free\b/.test(t)) dietRestrictions.add("gluten-free");
    if (/\bdairy\s*-?\s*free\b/.test(t)) dietRestrictions.add("dairy-free");

    if (
      /\bdislike\b|\bdon't like\b|\bcan't stand\b/.test(t) &&
      /\bketo\b/.test(t)
    ) {
      dietDisliked.add("keto");
    }

    if (/\bpush\s*-?\s*ups?\b/.test(t)) exercisePreferred.add("push-ups");
    if (/\bstrength\b|\bhypertrophy\b/.test(t))
      exercisePreferred.add("strength training");
    if (/\bzone\s*2\b/.test(t)) exercisePreferred.add("zone 2");
    if (/\bvo2\s*max\b/.test(t)) exercisePreferred.add("vo2 max intervals");
  }

  return {
    dietPreferred: Array.from(dietPreferred),
    dietDisliked: Array.from(dietDisliked),
    dietRestrictions: Array.from(dietRestrictions),
    exercisePreferred: Array.from(exercisePreferred),
  };
}

/**
 * Extract interventions (things user is actively doing)
 * Looks for patterns like:
 * - "I started..."
 * - "I'm trying..."
 * - "I've been doing..."
 */
export function extractInterventionsFromConversation(
  messages: ChatMessage[],
): Intervention[] {
  const interventions: Intervention[] = [];

  const interventionPatterns = [
    /(?:started|began|trying|been doing) (.+?)(?:\.|,|for|since)/gi,
    /(?:I'm doing|I do) (.+?) (?:daily|every day|each day)/gi,
  ];

  const userMessages = messages.filter((msg) => msg.role === "user");

  for (const message of userMessages) {
    const content = message.content;

    for (const pattern of interventionPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const description = match[1].trim();

        // Only extract if it looks like a health intervention
        const healthKeywords = [
          "meditat",
          "exercise",
          "walk",
          "run",
          "sleep",
          "diet",
          "supplement",
          "yoga",
          "therapy",
          "stretching",
          "breathing",
        ];

        const isHealthRelated = healthKeywords.some((kw) =>
          description.toLowerCase().includes(kw),
        );

        if (isHealthRelated && description.length < 100) {
          interventions.push({
            id: `intervention-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            description,
            startDate: message.timestamp,
            status: "active",
          });
        }
      }
    }
  }

  return interventions;
}

/**
 * Extract health concerns mentioned by user
 */
export function extractConcernsFromConversation(
  messages: ChatMessage[],
): string[] {
  const concerns = new Set<string>();

  const concernPatterns = [
    /(?:worried about|concerned about|struggling with) (.+?)(?:\.|,|$)/gi,
    /(?:I have|I'm experiencing|dealing with) (.+?) (?:issues?|problems?)/gi,
  ];

  const userMessages = messages.filter((msg) => msg.role === "user");

  for (const message of userMessages) {
    for (const pattern of concernPatterns) {
      const matches = message.content.matchAll(pattern);
      for (const match of matches) {
        const concern = match[1].trim().toLowerCase();
        if (concern.length < 50) {
          concerns.add(concern);
        }
      }
    }
  }

  return Array.from(concerns);
}

/**
 * Create pinned insights from important assistant messages
 * These are insights worth remembering across sessions
 */
export function createPinnedInsights(
  messages: ChatMessage[],
): VaultPinnedInsight[] {
  const insights: VaultPinnedInsight[] = [];

  const assistantMessages = messages.filter((msg) => msg.role === "assistant");

  // Look for messages with high information density
  // (mentions specific numbers, comparisons, recommendations)
  for (const message of assistantMessages) {
    const hasNumbers = /\d+/.test(message.content);
    const hasComparison =
      /(higher|lower|better|worse|improved|declined) than/i.test(
        message.content,
      );
    const hasRecommendation = /(recommend|suggest|try|consider)/i.test(
      message.content,
    );

    // Score the message
    let score = 0;
    if (hasNumbers) score += 1;
    if (hasComparison) score += 1;
    if (hasRecommendation) score += 1;

    // If high-value message, extract first 200 chars as insight
    if (score >= 2 && message.content.length > 100) {
      const summary = message.content.substring(0, 200).trim() + "...";

      insights.push({
        id: `insight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: extractInsightTitle(message.content),
        summary,
        source: "chat",
        createdAt: message.timestamp,
        tags: extractTags(message.content),
      });
    }
  }

  // Limit to most recent 10 insights
  return insights.slice(-10);
}

/**
 * Extract a title from message content (first sentence or first 50 chars)
 */
function extractInsightTitle(content: string): string {
  const firstSentence = content.match(/^[^.!?]+[.!?]/)?.[0];
  if (firstSentence && firstSentence.length < 80) {
    return firstSentence.trim();
  }
  return content.substring(0, 50).trim() + "...";
}

/**
 * Extract health-related tags from content
 */
function extractTags(content: string): string[] {
  const tagKeywords = [
    "hrv",
    "heart rate",
    "sleep",
    "steps",
    "exercise",
    "stress",
    "recovery",
    "cardio",
    "respiratory",
  ];

  const tags: string[] = [];
  const lowerContent = content.toLowerCase();

  for (const keyword of tagKeywords) {
    if (lowerContent.includes(keyword)) {
      tags.push(keyword);
    }
  }

  return tags.slice(0, 5); // Max 5 tags
}

/**
 * Normalize metric names to standard format
 */
function normalizeMetricName(name: string): string | null {
  const normalized = name.toLowerCase().trim();

  const metricMap: Record<string, string> = {
    hrv: "hrv",
    "heart rate variability": "hrv",
    steps: "steps",
    sleep: "sleep",
    "heart rate": "heartRate",
    "resting heart rate": "restingHeartRate",
    exercise: "exercise",
    "active energy": "activeEnergy",
    calories: "activeEnergy",
  };

  return metricMap[normalized] || null;
}

/**
 * Get unit for metric type
 */
function getMetricUnit(metricType: string): string {
  const units: Record<string, string> = {
    hrv: "ms",
    steps: "steps",
    sleep: "hours",
    heartRate: "bpm",
    restingHeartRate: "bpm",
    exercise: "min",
    activeEnergy: "kcal",
  };

  return units[metricType] || "";
}

/**
 * Build AI prompt context from extracted data
 */
export function buildPromptContextFromExtraction(
  extracted: ExtractedContext,
): string {
  let context = "";

  if (extracted.goals.length > 0) {
    context += "\n\n🎯 User's Active Goals:\n";
    extracted.goals.forEach((goal) => {
      context += `- ${goal.text}\n`;
    });
  }

  if (extracted.interventions.length > 0) {
    context += "\n\n💪 Active Interventions (What user is trying):\n";
    extracted.interventions.forEach((intervention) => {
      const startDate = new Date(intervention.startDate).toLocaleDateString();
      context += `- ${intervention.description} (started ${startDate})\n`;
    });
  }

  if (extracted.concerns.length > 0) {
    context += "\n\n⚠️ User's Health Concerns:\n";
    extracted.concerns.forEach((concern) => {
      context += `- ${concern}\n`;
    });
  }

  if (extracted.milestones.length > 0) {
    context += "\n\n🎉 Recent Milestones:\n";
    extracted.milestones.forEach((milestone) => {
      context += `- ${milestone.description}\n`;
    });
  }

  return context;
}
