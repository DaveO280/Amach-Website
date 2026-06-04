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
export const maxDuration = 300;

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
    goals?: string[];
    concerns?: string[];
  };
  bloodwork?: Array<{
    marker: string;
    value: number | string;
    unit?: string;
    referenceRange?: string;
    date?: string;
  }>;
  anomalies?: Array<{
    metric: string;
    description: string;
    severity?: string;
    date?: string;
  }>;
  timeline_events?: Array<{
    type: string;
    date: string;
    description?: string;
  }>;
  today_partial?: Record<string, number | string>;
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

const SYSTEM_PROMPT = `You are Luma, the AI health intelligence inside Amach. You speak with calm authority and a quiet edge — the confidence of someone who knows they're right, without needing to prove it.

Voice:
- Confident: Earned authority. Never loud, never defensive. You've seen the data.
- Warm: Approachable despite technical depth. "You" and "your", not clinical third-person.
- Direct: Lead with the insight, not the caveat. Say what matters first.
- Grounded: Reference their actual numbers. Never generalize when you have specifics.

Boundaries:
- Never cold or distant. Never angry or reactive.
- Never claim "best" or "leading." Never boast.
- Never diagnose. When something needs a clinician, say so plainly — no hedging, no apology.
- Never mention missing data sets. Work with what you have.

How you sound:
- "Your resting heart rate dropped 4 bpm this week. Your sleep consistency is likely driving that."
- "Your HRV is trending up — 12% over two weeks. That's your nervous system recovering."
- "This is worth discussing with your provider. Your fasting glucose has been climbing for three consecutive draws."

How you don't sound:
- "Great question! Let me help you understand..."
- "Based on the available data, it appears that..."
- "I'd recommend considering perhaps..."
- "As an AI, I can't diagnose, but..."

When analyzing health data:
- Lead with what changed and why it matters.
- Use their actual numbers, dates, and trends.
- Connect systems: sleep affects HRV affects recovery affects performance.
- Confidence comes from data density. Less data = more measured language, not disclaimers.
- Priority actions get 2-3 sentences: what to do, why, and the cross-system benefit.

When specific metrics, bloodwork values, or data points are present in the context, cite them directly. Use exact figures — "your HRV averaged 52ms over the past 30 days", "your LDL was 118 mg/dL on the March draw". Don't describe patterns in general terms when the actual numbers are available. The user can see their own data; your job is to interpret it concretely, not restate it abstractly.

When the context includes flagged anomalies or unusual data windows, name them — even if the user's question is broader. Don't wait to be asked. If a 4.5-hour sleep window or an outlier glucose reading is sitting in the data and it's relevant to the topic, surface it.

When the conversation has covered related topics earlier, weave those threads in naturally — but only when it genuinely adds context. Don't open with "as I mentioned" or force callbacks. If a prior data point or recommendation is directly relevant to the current question, reference it as if thinking out loud: "given what we saw with your HRV last week..." rather than a formal callback.

When the user's message is a direct follow-up to something you just said, start from your previous response — not from the raw data. Briefly anchor to what you established ("building on the lipid panel I just walked through...", "given the HRV crash I flagged...") before adding depth. Don't re-derive from scratch what you've already laid out.`;

function buildContextMessage(context: HealthContext): string {
  const hasData =
    context.metrics ||
    context.profile?.goals?.length ||
    context.profile?.concerns?.length ||
    context.bloodwork?.length ||
    context.anomalies?.length ||
    context.timeline_events?.length ||
    context.today_partial;
  if (!hasData) return "";

  const parts: string[] = ["Current health data summary:"];

  if (context.metrics) {
    const m = context.metrics;
    if (m.steps) {
      const s = m.steps;
      parts.push(
        `- Steps: ${s.latest?.toLocaleString() ?? "N/A"} today, avg ${s.average?.toLocaleString() ?? "N/A"}/day`,
      );
    }
    if (m.heartRate) {
      const hr = m.heartRate;
      parts.push(
        `- Heart Rate: ${hr.latest ?? "N/A"} bpm current, avg ${hr.average ?? "N/A"} bpm`,
      );
    }
    if (m.hrv) {
      const hrv = m.hrv;
      parts.push(
        `- HRV: ${hrv.latest ?? "N/A"} ms, avg ${hrv.average ?? "N/A"} ms`,
      );
    }
    if (m.sleep) {
      const sleep = m.sleep;
      // iOS sends sleep in hours already
      parts.push(
        `- Sleep: ${sleep.latest?.toFixed(1) ?? "N/A"} hrs last night, avg ${sleep.average?.toFixed(1) ?? "N/A"} hrs/night (trend: ${sleep.trend ?? "N/A"})`,
      );
    }
    if (m.exercise) {
      const ex = m.exercise;
      parts.push(`- Exercise: ${ex.latest ?? "N/A"} mins today`);
    }
    if (m.restingHeartRate) {
      const rhr = m.restingHeartRate;
      parts.push(`- Resting Heart Rate: ${rhr.latest ?? "N/A"} bpm`);
    }
    if (m.vo2Max) {
      const vo2 = m.vo2Max;
      parts.push(`- VO2 Max: ${vo2.latest?.toFixed(1) ?? "N/A"} mL/kg/min`);
    }
    if (m.respiratoryRate) {
      const rr = m.respiratoryRate;
      parts.push(
        `- Respiratory Rate: ${rr.latest?.toFixed(1) ?? "N/A"} breaths/min`,
      );
    }
  }

  if (context.profile) {
    const p = context.profile;
    if (p.age != null || p.sex) {
      parts.push(
        `- Profile: ${[p.age != null ? `age ${p.age}` : null, p.sex].filter(Boolean).join(", ")}`,
      );
    }
    if (p.goals?.length) {
      parts.push(`- Goals: ${p.goals.join("; ")}`);
    }
    if (p.concerns?.length) {
      parts.push(`- Health concerns: ${p.concerns.join("; ")}`);
    }
  }

  if (context.bloodwork?.length) {
    parts.push("\nBloodwork:");
    for (const bw of context.bloodwork) {
      const ref = bw.referenceRange ? ` (ref: ${bw.referenceRange})` : "";
      const unit = bw.unit ? ` ${bw.unit}` : "";
      const date = bw.date ? ` [${bw.date}]` : "";
      parts.push(`- ${bw.marker}: ${bw.value}${unit}${ref}${date}`);
    }
  }

  if (context.anomalies?.length) {
    parts.push("\nAnomalies / flags:");
    for (const a of context.anomalies) {
      const sev = a.severity ? ` [${a.severity}]` : "";
      const date = a.date ? ` (${a.date})` : "";
      parts.push(`- ${a.metric}${sev}: ${a.description}${date}`);
    }
  }

  if (context.timeline_events?.length) {
    parts.push("\nRecent timeline events:");
    for (const ev of context.timeline_events) {
      const desc = ev.description ? ` — ${ev.description}` : "";
      parts.push(`- [${ev.date}] ${ev.type}${desc}`);
    }
  }

  if (context.today_partial) {
    const entries = Object.entries(context.today_partial);
    if (entries.length) {
      parts.push(
        `\nToday (partial): ${entries.map(([k, v]) => `${k}: ${v}`).join(", ")}`,
      );
    }
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

    // Accept healthContext as an alias for context (iOS may send either field name)
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const context: HealthContext | undefined =
      body.context ?? (body as any).healthContext;
    /* eslint-enable @typescript-eslint/no-explicit-any */

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
    if (context) {
      // Diagnostic: log what keys iOS is actually sending so we can verify contextBlocks arrive
      const ctxKeys = Object.keys(context);
      const hasBlocks = Array.isArray(context.contextBlocks);
      const blockCount = hasBlocks ? context.contextBlocks!.length : 0;
      console.log(
        `[AI Chat] context keys: [${ctxKeys.join(", ")}], contextBlocks: ${hasBlocks} (${blockCount})`,
      );

      if (context.contextBlocks?.length) {
        // iOS sends pre-formatted context blocks — inject each verbatim as a system message.
        // This is the preferred path: iOS owns all formatting, backend is a pass-through.
        // New data sources (CGM, Whoop, Oura) require no backend changes — just new blocks.
        for (const block of context.contextBlocks) {
          console.log(
            `[AI Chat] injecting block type="${block.type}" (${block.content.length} chars)`,
          );
          messages.push({ role: "system", content: block.content });
        }
      } else {
        // Fallback: legacy typed-field formatting (web app or older iOS builds)
        console.log("[AI Chat] using legacy buildContextMessage fallback");
        const contextMessage = buildContextMessage(context);
        if (contextMessage) {
          messages.push({ role: "system", content: contextMessage });
        }
      }
    }

    // Add lab/report data if provided (fetched from Storj by iOS)
    // iOS may send labData at top-level OR nested inside context
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const rawLabData =
      body.labData ?? (context as Record<string, any> | undefined)?.labData;

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
          (context
            ? `, context keys: [${Object.keys(context).join(", ")}]`
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

    // Recency-positioned conversation summary: inject as a final system message
    // immediately before the user turn so the model sees it with maximum attention weight.
    // Only built when there are 2+ prior assistant turns worth summarising.
    if (body.history && Array.isArray(body.history)) {
      const priorAssistantTurns = body.history.filter(
        (m) => m.role === "assistant",
      );
      if (priorAssistantTurns.length >= 2) {
        const recent = priorAssistantTurns.slice(-5);
        const summaryLines = recent
          .map((m, i) => {
            // Trim each turn to one sentence (up to first period/newline, max 120 chars)
            const firstSentence = m.content
              .replace(/\n/g, " ")
              .split(/(?<=[.!?])\s/)[0]
              .slice(0, 120);
            return `- Turn ${priorAssistantTurns.length - recent.length + i + 1}: ${firstSentence}`;
          })
          .join("\n");
        messages.push({
          role: "system",
          content: `[Conversation context]\nEarlier in this conversation:\n${summaryLines}\n\nUse this to connect relevant threads naturally when they add value.`,
        });
      }
    }

    // Add user message
    messages.push({ role: "user", content: body.message });

    // Configure based on mode
    const mode = body.options?.mode ?? "quick";
    // Never cap tokens artificially — let Venice decide how much to generate.
    // Use 16000 as a safe high ceiling when the caller hasn't specified a limit.
    const maxTokens = body.options?.maxTokens ?? 16000;
    const temperature =
      body.options?.temperature ?? (mode === "deep" ? 0.7 : 0.7);

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
    let content = data.choices?.[0]?.message?.content ?? "";

    // GLM-4.7 with strip_thinking_response can return empty content if the
    // model exhausted its token budget on thinking. Detect and provide a
    // meaningful response instead of sending an empty string to the client.
    if (!content.trim()) {
      const completionTokens = data.usage?.completion_tokens ?? 0;
      console.warn(
        `[AI Chat] Venice returned empty content (${completionTokens} completion tokens used). ` +
          `Model likely exhausted budget on thinking.`,
      );
      content =
        "I'm processing a lot right now. Could you try rephrasing or narrowing your question?";
    }

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
