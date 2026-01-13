import { useMutation } from "@tanstack/react-query";
import axios from "axios";

interface VeniceAIRequest {
  prompt: string;
  maxTokens?: number;
}

interface VeniceAIResponse {
  content: string;
  // Add more fields as needed
  rawContent?: string;
}

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

  return sanitized.trimStart();
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
    const response = await axios.post("/api/venice", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7,
      model: modelName,
      stream: false,
    });

    // Adjust this based on your actual API response structure
    const rawContent = response.data.choices?.[0]?.message?.content ?? "";
    const sanitizedContent = sanitizeAssistantResponse(rawContent);

    console.log("[useVeniceAI] Response received", {
      hasRawContent: Boolean(rawContent),
      rawContentLength: rawContent.length,
      sanitizedContentLength: sanitizedContent.length,
      isEmpty: sanitizedContent.trim().length === 0,
      rawPreview: rawContent.substring(0, 100),
    });

    if (sanitizedContent.trim().length === 0) {
      console.warn("[useVeniceAI] ⚠️ Empty response from Venice API", {
        rawContentLength: rawContent.length,
        hasChoices: Boolean(response.data?.choices),
        choicesLength: response.data?.choices?.length,
        firstChoice: response.data?.choices?.[0],
      });
    }

    if (
      process.env.NODE_ENV === "development" &&
      sanitizedContent !== rawContent
    ) {
      console.debug("[useVeniceAI] Sanitized response", {
        rawPreview: rawContent.slice(0, 200),
        sanitizedPreview: sanitizedContent.slice(0, 200),
      });
    }

    return {
      content: sanitizedContent,
      rawContent,
      // ...other fields
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
