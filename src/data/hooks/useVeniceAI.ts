import { useMutation } from "@tanstack/react-query";
import axios, { type AxiosResponse } from "axios";
import { shouldDisableVeniceThinking } from "@/utils/veniceThinking";

interface VeniceAIRequest {
  prompt: string;
  maxTokens?: number;
}

interface VeniceAIResponse {
  content: string;
  // Add more fields as needed
  rawContent?: string;
  rawReasoningContent?: string;
}

const extractThinkInner = (raw: string): string | null => {
  const match = raw.match(/<think>([\s\S]*?)<\/think>/i);
  if (!match) return null;
  return match[1]?.trim() || null;
};

const sanitizeAssistantResponse = (raw: string): string => {
  if (!raw) {
    return raw;
  }

  // Remove <think> tags
  let sanitized = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  sanitized = sanitized.replace(/<think>[\s\S]*$/gi, "");
  sanitized = sanitized.replace(/<\/?think>/gi, "");

  // Remove LaTeX math formatting (inline: $...$ and display: $$...$$)
  sanitized = sanitized.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
    // For display math, extract content and return plain text
    return match
      .slice(2, -2)
      .replace(/\\text\{([^}]+)\}/g, "$1")
      .replace(/[\\{}^_]/g, "");
  });
  sanitized = sanitized.replace(/\$([^$]+)\$/g, (_match, content) => {
    // For inline math, extract content and return plain text
    return content
      .replace(/\\text\{([^}]+)\}/g, "$1")
      .replace(/[\\{}^_]/g, "")
      .trim();
  });

  const trimmed = sanitized.trim();

  // If stripping <think> removed everything, fall back to the inner think content
  // (some models incorrectly put the *entire* answer inside <think>).
  if (trimmed.length === 0) {
    const thinkInner = extractThinkInner(raw);
    if (thinkInner) {
      return thinkInner.trim();
    }
  }

  return trimmed;
};

const extractExpectedPrefixFromPrompt = (prompt: string): string | null => {
  const match = prompt.match(
    /Start the paragraph with the exact phrase\s+"([^"]+)"/i,
  );
  return match?.[1]?.trim() || null;
};

const looksLikeReasoningDump = (text: string): boolean => {
  const t = text.trim();
  if (!t) return false;
  return (
    /^the user\b/i.test(t) ||
    /\bconstraint checklist\b/i.test(t) ||
    /\b(i need to|let me|i should)\b/i.test(t)
  );
};

const extractFinalParagraphByPrefix = (
  raw: string,
  prefix: string,
): string | null => {
  const idx = raw.toLowerCase().indexOf(prefix.toLowerCase());
  if (idx === -1) return null;
  const fromPrefix = raw.slice(idx).trim();

  // Stop at common "meta" markers if present
  const stopMarkers = [
    "\n\nactivity analysis",
    "\n\nsleep analysis",
    "\n\nheart analysis",
    "\n\nenergy analysis",
    "\n\nconstraint checklist",
    "\n\nrules:",
  ];
  const lower = fromPrefix.toLowerCase();
  let stopAt = fromPrefix.length;
  for (const m of stopMarkers) {
    const j = lower.indexOf(m);
    if (j !== -1) stopAt = Math.min(stopAt, j);
  }

  const candidate = fromPrefix.slice(0, stopAt).trim();

  // Take just the first paragraph if multiple paragraphs exist
  const firstPara = candidate.split(/\n\s*\n/)[0]?.trim() || "";
  return firstPara.length > 0 ? firstPara : null;
};

type VeniceChoiceMessage = {
  content?: string | null;
  reasoning_content?: string | null;
};

const extractVeniceText = (
  responseData: unknown,
): { content: string; reasoning: string } => {
  const data = responseData as {
    choices?: Array<{
      message?: VeniceChoiceMessage;
      text?: string | null;
      delta?: { content?: string | null };
    }>;
  };

  const first = data?.choices?.[0];
  const msg = first?.message;

  const content =
    (typeof msg?.content === "string" ? msg.content : "") ||
    (typeof first?.text === "string" ? first.text : "") ||
    (typeof first?.delta?.content === "string" ? first.delta.content : "");

  const reasoning =
    typeof msg?.reasoning_content === "string" ? msg.reasoning_content : "";

  return { content, reasoning };
};

async function fetchVeniceAI({
  prompt,
  maxTokens = 2000,
}: VeniceAIRequest): Promise<VeniceAIResponse> {
  // Use environment variable or fallback to default
  const modelName =
    process.env.NEXT_PUBLIC_VENICE_MODEL_NAME || "zai-org-glm-4.7";

  console.log("[useVeniceAI] Making request to Venice API", {
    promptLength: prompt.length,
    maxTokens,
    modelName,
  });

  try {
    const expectedPrefix = extractExpectedPrefixFromPrompt(prompt);
    let lastRawContent = "";
    let lastRawReasoning = "";
    let lastSanitized = "";

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const isRetryableStatus = (status: number | undefined) =>
      status === 429 || status === 503 || status === 502 || status === 504;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const attemptPrompt =
        attempt === 1
          ? prompt
          : `${prompt}\n\nIMPORTANT: Return a non-empty answer in plain text. Do not include <think> tags.`;

      let response: AxiosResponse<unknown>;
      try {
        response = await axios.post("/api/venice", {
          messages: [
            {
              role: "system",
              content:
                "You are a helpful health companion. Return plain-text answers only. Do NOT output empty content. Avoid <think> tags.",
            },
            { role: "user", content: attemptPrompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
          model: modelName,
          stream: false,
          venice_parameters: {
            strip_thinking_response: true,
            include_venice_system_prompt: false,
            ...(shouldDisableVeniceThinking("analysis")
              ? { disable_thinking: true }
              : {}),
          },
        });
      } catch (error) {
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;
        if (isRetryableStatus(status) && attempt < 3) {
          const ra = axios.isAxiosError(error)
            ? (error.response?.headers?.["retry-after"] as string | undefined)
            : undefined;
          const retryAfterMs =
            typeof ra === "string" && ra.trim().length > 0
              ? Number(ra) * 1000
              : NaN;
          const base = 800 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 300);
          const delay = Number.isFinite(retryAfterMs)
            ? Math.min(retryAfterMs + jitter, 15000)
            : Math.min(base + jitter, 15000);

          console.warn("[useVeniceAI] Retryable Venice error, backing off", {
            attempt,
            status,
            delay,
          });
          await sleep(delay);
          continue;
        }
        throw error;
      }

      const { content, reasoning } = extractVeniceText(response.data);
      lastRawContent = content ?? "";
      lastRawReasoning = reasoning ?? "";

      // Prefer content; fall back to reasoning_content when content is empty
      const candidateRaw =
        (lastRawContent && lastRawContent.trim().length > 0
          ? lastRawContent
          : lastRawReasoning) || "";

      let sanitized = sanitizeAssistantResponse(candidateRaw);

      // If we had to use reasoning (or we got a reasoning dump), try extracting just the final paragraph.
      if (
        expectedPrefix &&
        (candidateRaw === lastRawReasoning || looksLikeReasoningDump(sanitized))
      ) {
        const extracted = extractFinalParagraphByPrefix(
          candidateRaw,
          expectedPrefix,
        );
        if (extracted) {
          sanitized = sanitizeAssistantResponse(extracted);
        }
      }
      lastSanitized = sanitized;

      console.log("[useVeniceAI] Response received", {
        attempt,
        expectedPrefix,
        hasRawContent: Boolean(lastRawContent),
        rawContentLength: lastRawContent.length,
        hasRawReasoning: Boolean(lastRawReasoning),
        rawReasoningLength: lastRawReasoning.length,
        sanitizedContentLength: sanitized.length,
        isEmpty: sanitized.trim().length === 0,
        rawPreview: candidateRaw.substring(0, 100),
      });

      if (sanitized.trim().length > 0) {
        return {
          content: sanitized,
          rawContent: lastRawContent,
          rawReasoningContent: lastRawReasoning,
        };
      }

      console.warn("[useVeniceAI] ⚠️ Empty response from Venice API", {
        attempt,
        rawContentLength: lastRawContent.length,
        rawReasoningLength: lastRawReasoning.length,
        hasChoices: Boolean(
          (response.data as { choices?: unknown[] } | undefined)?.choices,
        ),
      });
    }

    if (
      process.env.NODE_ENV === "development" &&
      lastSanitized !== lastRawContent
    ) {
      console.debug("[useVeniceAI] Sanitized response", {
        rawPreview: (lastRawContent || lastRawReasoning).slice(0, 200),
        sanitizedPreview: lastSanitized.slice(0, 200),
      });
    }

    // If we get here, we couldn't recover a non-empty answer.
    return {
      content: "",
      rawContent: lastRawContent,
      rawReasoningContent: lastRawReasoning,
    };
  } catch (error) {
    console.error("[useVeniceAI] ❌ Error fetching from Venice API", {
      error: error instanceof Error ? error.message : String(error),
      isAxiosError: axios.isAxiosError(error),
      responseStatus: axios.isAxiosError(error)
        ? error.response?.status
        : undefined,
      responseData: axios.isAxiosError(error)
        ? error.response?.data
        : undefined,
    });
    throw error;
  }
}

export function useVeniceAI(): ReturnType<
  typeof useMutation<VeniceAIResponse, Error, VeniceAIRequest>
> {
  return useMutation({
    mutationFn: fetchVeniceAI,
  });
}
