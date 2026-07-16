/**
 * Generates a cached, plain-language clinical narrative from a structured
 * health report (DEXA, bloodwork, gut health, or any future report type).
 *
 * Design: the clinical intelligence lives in this ONE generic narrative —
 * generated once at upload time and cached on Storj alongside the
 * structured data — not in per-type instructions baked into Luma's system
 * prompt. A new report type just needs a new parser/schema; this generator
 * and the prompt template stay the same.
 *
 * Server-only: calls the Venice API directly using the server-side API key
 * (this runs inside Next.js API routes, not the browser, so it talks to
 * Venice directly instead of going through the client-facing `/api/venice`
 * proxy that `VeniceApiService` uses).
 */

import { shouldDisableVeniceThinking } from "@/utils/veniceThinking";
import { getModelChain } from "@/config/aiModels";
import { callVeniceWithFallback } from "@/lib/venice/callVeniceWithFallback";

const VENICE_API_BASE = "https://api.venice.ai/api/v1";
const MIN_NARRATIVE_LENGTH = 50;
// GLM-4.7 is a "thinking" model: when thinking isn't disabled, it can spend
// the entire max_tokens budget on internal <think> reasoning and never reach
// the actual narrative, leaving an empty `content` after stripping (same
// failure mode documented in LumaAiService's quick-mode token comments).
// disable_thinking avoids burning the budget on reasoning in the first
// place; the generous max_tokens is a safety margin on top of that.
const NARRATIVE_MAX_TOKENS = 2200;

const NARRATIVE_SYSTEM_PROMPT = `You are a clinical analyst briefing an AI health assistant (Luma) on a patient's health report. You will be given the report type and its structured data as JSON.

Write a single rich clinical narrative, 500-800 words, in flowing prose — no headers, no bullet points, no markdown formatting. Explain:
- What each flagged or abnormal finding means clinically and why it matters
- The key risks suggested by the data
- The key strengths and positive findings in the data
- How findings relate to each other when clinically relevant

Reference specific values, names, and numbers from the data — be concrete, not generic. Do not invent data that isn't present in the JSON. Write as a briefing for the AI assistant (refer to "the user's ..."), not addressed directly to the patient.`;

function stripThinkingBlocks(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, "")
    .trim();
}

/**
 * Generate a clinical narrative for any structured health report.
 * Returns null (fail-soft) if generation fails — callers should treat the
 * structured data as already safely stored and the narrative as a
 * best-effort enhancement, not a blocker.
 */
export async function generateClinicalNarrative(
  reportType: string,
  structuredData: unknown,
): Promise<string | null> {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) {
    console.error(
      "[ClinicalNarrativeService] VENICE_API_KEY not configured; skipping narrative generation",
    );
    return null;
  }

  const userPrompt = `Report type: ${reportType}

Structured data:
${JSON.stringify(structuredData, null, 2)}

Write the clinical narrative now.`;

  try {
    // Narrative is quality-critical PHI prose → chat tier (enclave-first with
    // fallback). Previously called Venice directly on a hardcoded model.
    const fb = await callVeniceWithFallback({
      apiKey,
      endpoint: VENICE_API_BASE,
      baseBody: {
        messages: [
          { role: "system", content: NARRATIVE_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: NARRATIVE_MAX_TOKENS,
        temperature: 0.4,
        stream: false,
        venice_parameters: {
          strip_thinking_response: true,
          include_venice_system_prompt: false,
          ...(shouldDisableVeniceThinking("analysis")
            ? { disable_thinking: true }
            : {}),
        },
      },
      chain: getModelChain("chat"),
      label: "clinical-narrative",
    });
    const data = fb.data as {
      choices?: Array<{
        message?: { content?: string; reasoning_content?: string };
        finish_reason?: string;
      }>;
    };
    const message = data?.choices?.[0]?.message;
    const content = message?.content;
    if (typeof content !== "string") {
      console.error(
        `[ClinicalNarrativeService] No narrative content in response for ${reportType}`,
      );
      return null;
    }

    const narrative = stripThinkingBlocks(content);
    if (narrative.length < MIN_NARRATIVE_LENGTH) {
      console.error(
        `[ClinicalNarrativeService] Narrative too short for ${reportType} (${narrative.length} chars); treating as failed generation`,
        {
          finishReason: data?.choices?.[0]?.finish_reason,
          reasoningContentLength:
            typeof message?.reasoning_content === "string"
              ? message.reasoning_content.length
              : undefined,
        },
      );
      return null;
    }

    return narrative;
  } catch (error) {
    console.error(
      `[ClinicalNarrativeService] Failed to generate narrative for ${reportType}:`,
      error,
    );
    return null;
  }
}
