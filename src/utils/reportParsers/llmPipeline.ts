/**
 * Generic LLM extraction pipeline shared by all health report parsers.
 *
 * Handles the common plumbing — Venice call, JSON-mode enforcement, markdown
 * fence stripping — so individual parsers only define a prompt schema and a
 * result mapper.  Adding a new report type means: define a schema, write a
 * mapper, call callLlmExtractor().  No new pipeline code required.
 */

import { callVenice } from "./veniceClient";
import { VENICE_PARSE_TEXT_MODEL } from "./parseConfig";

// ── Shared anti-hallucination rules ─────────────────────────────────────────

/**
 * Include in every extraction prompt.  Health data: a missing field is far
 * safer than a plausible-but-wrong one.
 */
export const ANTI_HALLUCINATION_RULES = `
CRITICAL — HEALTH DATA ACCURACY (non-negotiable):
1. Return null for ANY field whose exact value does not appear in the text.
2. Do NOT estimate, infer, or interpolate missing values.
3. Do NOT substitute typical or average values for fields absent from this document.
4. Do NOT derive one field's value from another field's data.
5. If you are not certain a value came from this specific document, return null.
6. A null field is correct and safe.  A fabricated value is a patient safety risk.`.trim();

// ── Pipeline ─────────────────────────────────────────────────────────────────

export interface LlmPipelineOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  /** Tag used in log messages (e.g. "gutHealthLlmExtractor"). */
  logTag?: string;
  /** Disable the JSON-parse-failure retry (used to avoid recursive retries). */
  skipRetry?: boolean;
}

/**
 * Call Venice with JSON-mode enforced and return the parsed object.
 * Returns null on any failure — network error, empty response, or parse failure.
 * Strips markdown fences automatically if the model ignored JSON-mode instructions.
 */
export async function callLlmExtractor(
  systemPrompt: string,
  userPrompt: string,
  options: LlmPipelineOptions = {},
): Promise<Record<string, unknown> | null> {
  const tag = options.logTag ?? "llmPipeline";

  try {
    const response = (await callVenice({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: options.maxTokens ?? 8000,
      temperature: options.temperature ?? 0.1,
      model: options.model ?? VENICE_PARSE_TEXT_MODEL,
      response_format: { type: "json_object" },
      venice_parameters: {
        disable_thinking: true,
        strip_thinking_response: true,
        include_venice_system_prompt: false,
      },
    })) as { choices?: Array<{ message?: { content?: string } }> };

    const content = response?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.warn(`[${tag}] Empty response from Venice`);
      return null;
    }

    // Direct parse (model respected JSON mode)
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      // Step 1: strip markdown fences
      let candidate =
        content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? content;

      // Step 2: extract the outermost {...} by finding first { and last }
      const firstBrace = candidate.indexOf("{");
      const lastBrace = candidate.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        candidate = candidate.slice(firstBrace, lastBrace + 1);
      }

      try {
        return JSON.parse(candidate) as Record<string, unknown>;
      } catch {
        // Step 3: ask Venice to re-return just the JSON
        if (!options.skipRetry) {
          console.warn(
            `[${tag}] JSON parse failed — retrying with JSON-only instruction`,
          );
          const retryResponse = (await callVenice({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
              {
                role: "user",
                content:
                  "Your previous response could not be parsed as JSON. Return ONLY the raw JSON object. Start with { and end with }. No markdown, no explanation.",
              },
            ],
            max_tokens: options.maxTokens ?? 8000,
            temperature: 0,
            model: options.model ?? VENICE_PARSE_TEXT_MODEL,
            response_format: { type: "json_object" },
            venice_parameters: {
              disable_thinking: true,
              strip_thinking_response: true,
              include_venice_system_prompt: false,
            },
          })) as { choices?: Array<{ message?: { content?: string } }> };

          const retryContent =
            retryResponse?.choices?.[0]?.message?.content?.trim();
          if (retryContent) {
            const rf = retryContent.indexOf("{");
            const rl = retryContent.lastIndexOf("}");
            const retryCandidate =
              rf !== -1 && rl > rf
                ? retryContent.slice(rf, rl + 1)
                : retryContent;
            try {
              return JSON.parse(retryCandidate) as Record<string, unknown>;
            } catch {
              /* fall through */
            }
          }
        }

        console.warn(`[${tag}] JSON parse failed even after retry`);
        return null;
      }
    }
  } catch (err) {
    console.error(`[${tag}] Pipeline error:`, err);
    return null;
  }
}
