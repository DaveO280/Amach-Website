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

const VENICE_API_BASE = "https://api.venice.ai/api/v1";
const MIN_NARRATIVE_LENGTH = 50;

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

  const modelName =
    process.env.NEXT_PUBLIC_VENICE_MODEL_NAME ||
    process.env.VENICE_MODEL_NAME ||
    "zai-org-glm-4.7";

  const userPrompt = `Report type: ${reportType}

Structured data:
${JSON.stringify(structuredData, null, 2)}

Write the clinical narrative now.`;

  try {
    const response = await fetch(`${VENICE_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: NARRATIVE_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1400,
        temperature: 0.4,
        stream: false,
        venice_parameters: {
          strip_thinking_response: true,
          include_venice_system_prompt: false,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[ClinicalNarrativeService] Venice API error for ${reportType}: ${response.status} ${errorText}`,
      );
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
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
