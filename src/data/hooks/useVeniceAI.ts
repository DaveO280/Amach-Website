import { useMutation } from "@tanstack/react-query";
import axios from "axios";

interface VeniceAIRequest {
  prompt: string;
  maxTokens?: number;
}

interface VeniceAIResponse {
  content: string;
  // Add more fields as needed
}

async function fetchVeniceAI({
  prompt,
  maxTokens = 2000,
}: VeniceAIRequest): Promise<VeniceAIResponse> {
  const response = await axios.post("/api/venice", {
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens,
    temperature: 0.7,
    model: "llama-3.1-405b",
    stream: false,
  });
  // Adjust this based on your actual API response structure
  return {
    content: response.data.choices?.[0]?.message?.content ?? "",
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
