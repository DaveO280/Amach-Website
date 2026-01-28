import { NextRequest, NextResponse } from "next/server";

// Use Node.js runtime for longer timeout
export const runtime = "nodejs";
// Vercel Hobby plan: max 60s, Pro plan: max 300s
// Note: Deep analysis with multiple agents can exceed 60s. Consider:
// - Upgrading to Pro plan (allows 300s)
// - Moving agent calls client-side
// - Using background jobs/queues for long-running analysis
export const maxDuration = 60; // 60 seconds - maximum allowed on Hobby plan

// Remove artificial timeout limits - let Venice API handle its own timeouts
// Only use timeout if explicitly set in environment variable
const REQUEST_TIMEOUT_MS = process.env.VENICE_REQUEST_TIMEOUT_MS
  ? Number(process.env.VENICE_REQUEST_TIMEOUT_MS)
  : undefined; // No timeout by default

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  try {
    const body = await request.json();
    console.log("[Venice API Route] Request received", {
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - startTime,
    });

    // Get API credentials from environment variables (server-side only)
    const apiKey = process.env.VENICE_API_KEY;
    const apiEndpoint = "https://api.venice.ai/api/v1";
    // Read from NEXT_PUBLIC_ var first for consistency with client, fallback to server-only var
    const modelName =
      process.env.NEXT_PUBLIC_VENICE_MODEL_NAME ||
      process.env.VENICE_MODEL_NAME ||
      "zai-org-glm-4.7";

    // Enhanced logging for debugging - using console.error to ensure visibility in production
    console.error("[Venice API Route] Environment check:", {
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - startTime,
      hasApiKey: Boolean(apiKey),
      environment: process.env.NODE_ENV,
      modelName,
      requestBody: {
        model: body.model,
        messageCount: body.messages?.length || 0,
        maxTokens: body.maxTokens || body.max_tokens,
      },
    });

    if (!apiKey) {
      console.error("[Venice API Route] API key is missing");
      return NextResponse.json(
        { error: "API key is not configured" },
        { status: 500 },
      );
    }

    type VeniceChatRequestBody = {
      messages: unknown[];
      max_tokens: number;
      temperature: number;
      model: string;
      stream: boolean;
      response_format?: unknown;
      venice_parameters?: Record<string, unknown>;
      top_p?: number;
      frequency_penalty?: number;
      presence_penalty?: number;
      seed?: number;
    };

    // Forward the request to Venice API
    const requestBody: VeniceChatRequestBody = {
      messages: body.messages || [],
      // Use nullish coalescing so callers can intentionally pass 0 (e.g., temperature: 0)
      max_tokens: (body.maxTokens ?? body.max_tokens ?? 4000) as number, // Increased default token limit
      temperature: (body.temperature ?? 0.7) as number,
      model: modelName,
      stream: false,
    };

    // Venice-specific parameters (server-side defaults with pass-through override).
    // Docs: https://docs.venice.ai/overview/about-venice
    const incomingVeniceParams =
      (body.venice_parameters as Record<string, unknown> | undefined) ??
      (body.veniceParameters as Record<string, unknown> | undefined);
    requestBody.venice_parameters =
      incomingVeniceParams ??
      ({
        // Hide reasoning/thinking output when supported by the model.
        strip_thinking_response: true,
        // Avoid including Venice system prompts in responses when supported.
        include_venice_system_prompt: false,
      } satisfies Record<string, unknown>);

    // Dev-only: log the exact venice_parameters we are forwarding.
    if (process.env.NODE_ENV === "development") {
      console.error("[Venice API Route] venice_parameters (effective):", {
        venice_parameters: requestBody.venice_parameters,
      });
    }

    // Optional JSON-mode / structured outputs (OpenAI-compatible)
    // Pass through if provided by caller.
    if (body.response_format) {
      requestBody.response_format = body.response_format;
    } else if (body.responseFormat) {
      requestBody.response_format = body.responseFormat;
    }

    // Optional sampling params (pass-through)
    if (typeof body.top_p === "number") requestBody.top_p = body.top_p;
    if (typeof body.frequency_penalty === "number")
      requestBody.frequency_penalty = body.frequency_penalty;
    if (typeof body.presence_penalty === "number")
      requestBody.presence_penalty = body.presence_penalty;
    if (typeof body.seed === "number") requestBody.seed = body.seed;

    // Validate request body
    if (
      !requestBody.messages ||
      !Array.isArray(requestBody.messages) ||
      requestBody.messages.length === 0
    ) {
      return NextResponse.json(
        { error: "Invalid request: messages array is required" },
        { status: 400 },
      );
    }

    // Validate max_tokens
    if (!requestBody.max_tokens || requestBody.max_tokens < 1) {
      return NextResponse.json(
        { error: "Invalid request: max_tokens must be a positive number" },
        { status: 400 },
      );
    }

    console.error("[Venice API Route] Sending request to Venice:", {
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - startTime,
      endpoint: `${apiEndpoint}/chat/completions`,
      model: modelName,
      messageCount: requestBody.messages?.length || 0,
      maxTokens: requestBody.max_tokens,
      hasVeniceParams: Boolean(requestBody.venice_parameters),
    });

    try {
      const fetchStartTime = Date.now();

      // Add request size check for production
      const requestSize = JSON.stringify(requestBody).length;
      if (requestSize > 1000000) {
        // 1MB limit
        console.warn("[Venice API Route] Large request detected:", {
          size: requestSize,
          messageCount: requestBody.messages?.length || 0,
        });
      }

      // Forward the request to Venice API
      // Only add timeout signal if explicitly configured
      const fetchOptions: RequestInit = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(requestBody),
      };

      // Only add timeout if explicitly set
      if (REQUEST_TIMEOUT_MS) {
        fetchOptions.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      }

      const response = await fetch(
        `${apiEndpoint}/chat/completions`,
        fetchOptions,
      );

      console.error("[Venice API Route] Venice API response received:", {
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - startTime,
        fetchDuration: Date.now() - fetchStartTime,
        status: response.status,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Venice API Route] API Error Response:", {
          timestamp: new Date().toISOString(),
          elapsedMs: Date.now() - startTime,
          status: response.status,
          statusText: response.statusText,
          errorText,
        });
        return NextResponse.json(
          {
            error: `Venice API error: ${response.status} ${response.statusText}`,
            details: errorText,
          },
          { status: response.status },
        );
      }

      const data = await response.json();
      console.error("[Venice API Route] Response processed - SUCCESS:", {
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - startTime,
        hasChoices: Boolean(data?.choices),
        choiceCount: data?.choices?.length || 0,
      });

      // Validate the response format
      if (
        !data.choices ||
        !Array.isArray(data.choices) ||
        data.choices.length === 0
      ) {
        console.error("[Venice API Route] Invalid response format:", {
          timestamp: new Date().toISOString(),
          elapsedMs: Date.now() - startTime,
          data,
        });
        return NextResponse.json(
          { error: "Invalid response format from Venice API" },
          { status: 500 },
        );
      }

      // Dev-only: echo back the effective venice_parameters to confirm thinking is disabled/stripped.
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json({
          ...data,
          __debug_venice_parameters: requestBody.venice_parameters,
        });
      }

      return NextResponse.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const name = error instanceof Error ? error.name : "UnknownError";
      const domTimeout =
        typeof DOMException !== "undefined" &&
        error instanceof DOMException &&
        error.name === "TimeoutError";
      const lowerMessage = message.toLowerCase();
      const isTimeout =
        domTimeout ||
        name === "TimeoutError" ||
        name === "AbortError" ||
        lowerMessage.includes("aborted") ||
        lowerMessage.includes("timeout");

      console.error("[Venice API Route] Error:", {
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - startTime,
        error: message,
        name,
        stack: error instanceof Error ? error.stack : undefined,
        isTimeout,
      });

      if (isTimeout) {
        return NextResponse.json(
          {
            error: "Venice API request timed out",
            details: REQUEST_TIMEOUT_MS
              ? `No response within ${Math.round(REQUEST_TIMEOUT_MS / 1000)} seconds.`
              : "Request was aborted.",
          },
          { status: 504 },
        );
      }

      return NextResponse.json(
        {
          error: "Failed to connect to Venice API",
          details: message,
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("[Venice API Route] Error:", {
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        error: "Failed to process request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
