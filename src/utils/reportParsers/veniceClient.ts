/**
 * Venice AI client abstraction.
 *
 * - Server-side (VENICE_API_KEY available): calls Venice API directly.
 * - Client-side (no API key): proxies through /api/venice route.
 */

const VENICE_API_URL = "https://api.venice.ai/api/v1/chat/completions";

function getModelName(): string {
  return (
    (typeof process !== "undefined" &&
      (process.env.NEXT_PUBLIC_VENICE_MODEL_NAME ||
        process.env.VENICE_MODEL_NAME)) ||
    "zai-org-glm-4.7"
  );
}

export async function callVenice(
  body: Record<string, unknown>,
): Promise<unknown> {
  const apiKey =
    typeof process !== "undefined" ? process.env.VENICE_API_KEY : undefined;

  if (apiKey) {
    // Server-side: call Venice API directly (mirrors route.ts logic)
    const modelName = getModelName();

    const requestBody: Record<string, unknown> = {
      messages: body.messages || [],
      max_tokens: (body.maxTokens ?? body.max_tokens ?? 16000) as number,
      temperature: (body.temperature ?? 0.7) as number,
      model: modelName,
      stream: false,
    };

    // Venice-specific parameters
    const incomingVeniceParams =
      (body.venice_parameters as Record<string, unknown> | undefined) ??
      (body.veniceParameters as Record<string, unknown> | undefined);
    requestBody.venice_parameters = incomingVeniceParams ?? {
      strip_thinking_response: true,
      include_venice_system_prompt: false,
    };

    // Optional JSON-mode / structured outputs
    if (body.response_format) {
      requestBody.response_format = body.response_format;
    } else if (body.responseFormat) {
      requestBody.response_format = body.responseFormat;
    }

    // Optional sampling params
    if (typeof body.top_p === "number") requestBody.top_p = body.top_p;
    if (typeof body.frequency_penalty === "number")
      requestBody.frequency_penalty = body.frequency_penalty;
    if (typeof body.presence_penalty === "number")
      requestBody.presence_penalty = body.presence_penalty;
    if (typeof body.seed === "number") requestBody.seed = body.seed;

    const response = await fetch(VENICE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Venice API error: ${response.status} ${response.statusText} — ${errorText}`,
      );
    }

    return response.json();
  }

  // Client-side: proxy through Next.js route
  const response = await fetch("/api/venice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}
