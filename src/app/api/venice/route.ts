import { NextRequest, NextResponse } from "next/server";
import { getModelChain, type ModelTier } from "@/config/aiModels";
import { callVeniceWithFallback } from "@/lib/venice/callVeniceWithFallback";

// Use Node.js runtime for longer timeout
export const runtime = "nodejs";
// Vercel Hobby plan: max 60s, Pro plan: max 300s
// Set to 300 for Pro plan, or 60 for Hobby
export const maxDuration = 300;

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
    // Model tier + fallback chain (src/config/aiModels.ts). JSON mode
    // (response_format) forces the non-enclave parseText chain — enclave models
    // reject response_format. Otherwise honor an optional body.tier hint
    // (agents pass "agent" for the fast enclave model), defaulting to "chat".
    const hasResponseFormat = Boolean(
      body.response_format || body.responseFormat,
    );
    const requestedTier =
      typeof body.tier === "string" ? (body.tier as string) : undefined;
    const tier: ModelTier = hasResponseFormat
      ? "parseText"
      : requestedTier === "agent" || requestedTier === "memory"
        ? (requestedTier as ModelTier)
        : "chat";
    const modelChain = getModelChain(tier);
    const modelName = modelChain[0]; // primary — for logging only

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
      max_tokens: (body.maxTokens ?? body.max_tokens ?? 16000) as number,
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
      // Request size check for production
      const requestSize = JSON.stringify(requestBody).length;
      if (requestSize > 1000000) {
        console.warn("[Venice API Route] Large request detected:", {
          size: requestSize,
          messageCount: requestBody.messages?.length || 0,
        });
      }

      // Forward to Venice with model fallback. Enclave overload (429) or a
      // per-model parameter/availability rejection (400/404) degrades down the
      // chain, ending at the legacy non-TEE model. Records which model served
      // and whether it was TEE-attested (telemetry inside the helper).
      const fb = await callVeniceWithFallback({
        apiKey,
        endpoint: apiEndpoint,
        baseBody: requestBody as unknown as Record<string, unknown>,
        chain: modelChain,
        label: tier,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
      const data = fb.data as {
        choices?: unknown[];
      };

      console.error("[Venice API Route] Response processed - SUCCESS:", {
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - startTime,
        modelUsed: fb.modelUsed,
        teeServed: fb.teeServed,
        fellBack: fb.fellBack,
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
      const payload =
        process.env.NODE_ENV === "development"
          ? {
              ...data,
              __debug_venice_parameters: requestBody.venice_parameters,
            }
          : data;
      const res = NextResponse.json(payload);
      // Surface TEE attestation to the client (for the "enclave-verified" badge).
      res.headers.set("x-amach-model", fb.modelUsed);
      res.headers.set("x-amach-tee", String(fb.teeServed));
      if (fb.teeProvider)
        res.headers.set("x-amach-tee-provider", fb.teeProvider);
      return res;
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
