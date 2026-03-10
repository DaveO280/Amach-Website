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
    restingHeartRate?: HealthMetricSummary;
    vo2Max?: HealthMetricSummary;
    respiratoryRate?: HealthMetricSummary;
  };
  profile?: {
    age?: number;
    sex?: string;
  };
  dateRange?: {
    start: string;
    end: string;
  };
  /**
   * Pre-formatted context blocks assembled on iOS.
   * Each block is injected verbatim as a system message.
   * When present, these replace the individual typed fields above.
   * Adding a new data source (CGM, Whoop, Oura) = new block on iOS, no backend change needed.
   */
  contextBlocks?: Array<{ type: string; content: string }>;
}

/**
 * Lab/report data that iOS fetches from Storj and forwards to the chat endpoint.
 * Each entry represents a parsed report (bloodwork, DEXA, etc.).
 */
interface LabDataEntry {
  type: string; // "bloodwork" | "dexa" | etc.
  title?: string;
  date?: string;
  content: string; // Pre-formatted report text
}

interface ChatRequestBody {
  message: string;
  context?: HealthContext;
  history?: ChatMessage[];
  /**
   * Lab/report data retrieved from Storj by the iOS app.
   * Accepts either an array of structured entries or a raw string.
   */
  labData?: LabDataEntry[] | string;
  options?: {
    mode?: "quick" | "deep";
    maxTokens?: number;
    temperature?: number;
  };
}

const SYSTEM_PROMPT = `You are Luma, a knowledgeable and supportive AI health assistant for the Amach health app. Your role is to help users understand their health data, identify patterns, and provide actionable insights.

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
    // iOS sends sleep in hours already
    parts.push(
      `- Sleep: ${sleep.latest?.toFixed(1) ?? "N/A"} hrs last night, avg ${sleep.average?.toFixed(1) ?? "N/A"} hrs/night (trend: ${sleep.trend ?? "N/A"})`,
    );
  }

  if (context.metrics.exercise) {
    const ex = context.metrics.exercise;
    parts.push(`- Exercise: ${ex.latest ?? "N/A"} mins today`);
  }

  if (context.metrics.restingHeartRate) {
    const rhr = context.metrics.restingHeartRate;
    parts.push(`- Resting Heart Rate: ${rhr.latest ?? "N/A"} bpm`);
  }

  if (context.metrics.vo2Max) {
    const vo2 = context.metrics.vo2Max;
    parts.push(`- VO2 Max: ${vo2.latest?.toFixed(1) ?? "N/A"} mL/kg/min`);
  }

  if (context.metrics.respiratoryRate) {
    const rr = context.metrics.respiratoryRate;
    parts.push(
      `- Respiratory Rate: ${rr.latest?.toFixed(1) ?? "N/A"} breaths/min`,
    );
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
      // Diagnostic: log what keys iOS is actually sending so we can verify contextBlocks arrive
      const ctxKeys = Object.keys(body.context);
      const hasBlocks = Array.isArray(body.context.contextBlocks);
      const blockCount = hasBlocks ? body.context.contextBlocks!.length : 0;
      console.log(
        `[AI Chat] context keys: [${ctxKeys.join(", ")}], contextBlocks: ${hasBlocks} (${blockCount})`,
      );

      if (body.context.contextBlocks?.length) {
        // iOS sends pre-formatted context blocks — inject each verbatim as a system message.
        // This is the preferred path: iOS owns all formatting, backend is a pass-through.
        // New data sources (CGM, Whoop, Oura) require no backend changes — just new blocks.
        for (const block of body.context.contextBlocks) {
          console.log(
            `[AI Chat] injecting block type="${block.type}" (${block.content.length} chars)`,
          );
          messages.push({ role: "system", content: block.content });
        }
      } else {
        // Fallback: legacy typed-field formatting (web app or older iOS builds)
        console.log("[AI Chat] using legacy buildContextMessage fallback");
        const contextMessage = buildContextMessage(body.context);
        if (contextMessage) {
          messages.push({ role: "system", content: contextMessage });
        }
      }
    }

    // Add lab/report data if provided (fetched from Storj by iOS)
    // iOS may send labData at top-level OR nested inside context
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const rawLabData =
      body.labData ??
      (body.context as Record<string, any> | undefined)?.labData;

    if (rawLabData) {
      // Diagnostic: dump the shape of what arrived so we can debug mismatches
      const labType = typeof rawLabData;
      const isArr = Array.isArray(rawLabData);
      console.log(
        `[AI Chat] labData received — type: ${labType}, isArray: ${isArr}, ` +
          `preview: ${JSON.stringify(rawLabData).slice(0, 500)}`,
      );

      let labContent: string;

      if (typeof rawLabData === "string") {
        labContent = rawLabData;
      } else if (isArr) {
        labContent = (rawLabData as Record<string, any>[])
          .map((entry, i) => {
            // Log each entry's keys so we can see what iOS actually sends
            console.log(
              `[AI Chat] labData[${i}] keys: [${Object.keys(entry).join(", ")}]`,
            );

            // Try multiple possible content fields that iOS might use
            const text =
              entry.content ??
              entry.data ??
              entry.report ??
              entry.rawText ??
              entry.text ??
              entry.summary ??
              entry.formattedContent;

            // If the content field is an object (e.g. FHIR), stringify it
            const contentStr =
              typeof text === "string"
                ? text
                : text != null
                  ? JSON.stringify(text, null, 2)
                  : "";

            if (!contentStr) {
              console.warn(
                `[AI Chat] labData[${i}] has no recognized content field. ` +
                  `Keys: ${Object.keys(entry).join(", ")}. ` +
                  `Full entry: ${JSON.stringify(entry).slice(0, 300)}`,
              );
              // Last resort: stringify the entire entry so we don't lose data
              return `### Report ${i + 1}\n${JSON.stringify(entry, null, 2)}`;
            }

            const header = [
              entry.title,
              entry.type ?? entry.reportType,
              entry.date ?? entry.reportDate,
            ]
              .filter(Boolean)
              .join(" — ");
            return header ? `### ${header}\n${contentStr}` : contentStr;
          })
          .join("\n\n");
      } else if (typeof rawLabData === "object" && rawLabData !== null) {
        // Single object — stringify it
        console.log(
          `[AI Chat] labData is a single object, keys: [${Object.keys(rawLabData).join(", ")}]`,
        );
        labContent = JSON.stringify(rawLabData, null, 2);
      } else {
        labContent = "";
      }

      if (labContent) {
        console.log(`[AI Chat] injecting labData (${labContent.length} chars)`);
        messages.push({
          role: "system",
          content: `The following lab and report data was retrieved from the user's encrypted health vault. Use this data to inform your responses:\n\n${labContent}`,
        });
      }
    } else {
      console.log(
        `[AI Chat] no labData found. Top-level keys: [${Object.keys(body).join(", ")}]` +
          (body.context
            ? `, context keys: [${Object.keys(body.context).join(", ")}]`
            : ""),
      );
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

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
    // GLM-4.7 uses thinking tokens before responding; budget must cover both.
    // With health context, thinking alone can consume 600-800 tokens — so
    // quick mode needs at least 2000 to leave room for a real response.
    const maxTokens =
      body.options?.maxTokens ?? (mode === "deep" ? 4000 : 2000);
    const temperature =
      body.options?.temperature ?? (mode === "deep" ? 0.7 : 0.6);

    const modelName =
      process.env.NEXT_PUBLIC_VENICE_MODEL_NAME ||
      process.env.VENICE_MODEL_NAME ||
      "zai-org-glm-4.7";

    // Log message summary before calling Venice
    const systemMsgCount = messages.filter((m) => m.role === "system").length;
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    console.log(
      `[AI Chat] sending ${messages.length} messages (${systemMsgCount} system, ${totalChars} total chars) to ${modelName}`,
    );

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
          venice_parameters: {
            strip_thinking_response: true,
            include_venice_system_prompt: false,
          },
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
