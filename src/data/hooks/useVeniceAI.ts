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

  let withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  withoutThink = withoutThink.replace(/<think>[\s\S]*$/gi, "");
  withoutThink = withoutThink.replace(/<\/?think>/gi, "");

  return withoutThink.trimStart();
};

async function fetchVeniceAI({
  prompt,
  maxTokens = 600, // Reduced from 2000 to stay within 60s Vercel timeout
}: VeniceAIRequest): Promise<VeniceAIResponse> {
  // Use environment variable or fallback to default
  const modelName =
    process.env.NEXT_PUBLIC_VENICE_MODEL_NAME || "zai-org-glm-4.7";
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
}

export function useVeniceAI(): ReturnType<
  typeof useMutation<VeniceAIResponse, Error, VeniceAIRequest>
> {
  return useMutation({
    mutationFn: fetchVeniceAI,
  });
}
