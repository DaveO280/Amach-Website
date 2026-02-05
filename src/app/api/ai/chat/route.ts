/**
 * AI Chat API Endpoint
 *
 * A cleaner interface for AI health assistant interactions.
 * Wraps the Venice API with health-specific defaults and validation.
 *
 * POST /api/ai/chat
 * Body: {
 *   message: string,           // User's message
 *   context?: HealthContext,   // Optional health data context
 *   history?: ChatMessage[],   // Optional conversation history
 *   options?: {
 *     mode?: 'quick' | 'deep', // Analysis depth
 *     maxTokens?: number,
 *     temperature?: number,
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface HealthMetricSummary {
  average?: number;
  min?: number;
  max?: number;
  latest?: number;
  trend?: "improving" | "stable" | "declining";
}

interface HealthContext {
  metrics?: {
    steps?: HealthMetricSummary;
    heartRate?: HealthMetricSummary;
    hrv?: HealthMetricSummary;
    sleep?: HealthMetricSummary;
    exercise?: HealthMetricSummary;
  };
  profile?: {
    age?: number;
    sex?: string;
  };
  dateRange?: {
    start: string;
    end: string;
  };
}

interface ChatRequestBody {
  message: string;
  context?: HealthContext;
  history?: ChatMessage[];
  options?: {
    mode?: "quick" | "deep";
    maxTokens?: number;
    temperature?: number;
  };
}

const SYSTEM_PROMPT = `You are Cosaint, a knowledgeable and supportive AI health assistant for the Amach health app. Your role is to help users understand their health data, identify patterns, and provide actionable insights.

Guidelines:
- Be conversational but informative
- Reference specific data when available
- Provide actionable suggestions
- Be encouraging but honest
- Never diagnose conditions - recommend consulting healthcare providers for medical concerns
- Focus on lifestyle factors: sleep, exercise, stress, nutrition

When analyzing health data:
- Look for trends over time
- Compare to general healthy ranges
- Consider relationships between metrics (e.g., sleep affecting HRV)
- Highlight both improvements and areas for attention`;

function buildContextMessage(context: HealthContext): string {
  if (!context.metrics) return "";

  const parts: string[] = ["Current health data summary:"];

  if (context.metrics.steps) {
    const s = context.metrics.steps;
    parts.push(
      `- Steps: ${s.latest?.toLocaleString() ?? "N/A"} today, avg ${s.average?.toLocaleString() ?? "N/A"}/day`,
    );
  }

  if (context.metrics.heartRate) {
    const hr = context.metrics.heartRate;
    parts.push(
      `- Heart Rate: ${hr.latest ?? "N/A"} bpm current, avg ${hr.average ?? "N/A"} bpm`,
    );
  }

  if (context.metrics.hrv) {
    const hrv = context.metrics.hrv;
    parts.push(
      `- HRV: ${hrv.latest ?? "N/A"} ms, avg ${hrv.average ?? "N/A"} ms`,
    );
  }

  if (context.metrics.sleep) {
    const sleep = context.metrics.sleep;
    parts.push(
      `- Sleep: ${sleep.latest ? (sleep.latest / 60).toFixed(1) : "N/A"} hrs last night`,
    );
  }

  if (context.metrics.exercise) {
    const ex = context.metrics.exercise;
    parts.push(`- Exercise: ${ex.latest ?? "N/A"} mins today`);
  }

  if (context.dateRange) {
    parts.push(
      `\nData range: ${context.dateRange.start} to ${context.dateRange.end}`,
    );
  }

  return parts.join("\n");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ChatRequestBody;

    // Validate request
    if (!body.message || typeof body.message !== "string") {
      return NextResponse.json(
        { error: "Message is required and must be a string" },
        { status: 400 },
      );
    }

    // Get API key
    const apiKey = process.env.VENICE_API_KEY;
    if (!apiKey) {
      console.error("[AI Chat] Venice API key not configured");
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 500 },
      );
    }

    // Build messages array
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Add health context if provided
    if (body.context) {
      const contextMessage = buildContextMessage(body.context);
      if (contextMessage) {
        messages.push({ role: "system", content: contextMessage });
      }
    }

    // Add conversation history
    if (body.history && Array.isArray(body.history)) {
      // Limit history to last 10 exchanges to manage token usage
      const recentHistory = body.history.slice(-20);
      messages.push(...recentHistory);
    }

    // Add user message
    messages.push({ role: "user", content: body.message });

    // Configure based on mode
    const mode = body.options?.mode ?? "quick";
    const maxTokens = body.options?.maxTokens ?? (mode === "deep" ? 2000 : 800);
    const temperature =
      body.options?.temperature ?? (mode === "deep" ? 0.7 : 0.6);

    const modelName =
      process.env.NEXT_PUBLIC_VENICE_MODEL_NAME ||
      process.env.VENICE_MODEL_NAME ||
      "zai-org-glm-4.7";

    // Call Venice API
    const response = await fetch(
      "https://api.venice.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages,
          max_tokens: maxTokens,
          temperature,
          stream: false,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[AI Chat] Venice API error:", response.status, errorText);
      return NextResponse.json(
        { error: "AI service error", details: response.status },
        { status: 502 },
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    return NextResponse.json({
      content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
      model: modelName,
    });
  } catch (error) {
    console.error("[AI Chat] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return NextResponse.json(
    {},
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  );
}
