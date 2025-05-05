import { NextRequest, NextResponse } from "next/server";

// Add Edge Runtime configuration
export const runtime = "edge";

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
    const modelName = process.env.VENICE_MODEL_NAME || "llama-3.1-405b";

    // Enhanced logging for debugging
    console.log("[Venice API Route] Environment check:", {
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

    // Forward the request to Venice API
    const requestBody = {
      messages: body.messages || [],
      max_tokens: body.maxTokens || body.max_tokens || 2000,
      temperature: body.temperature || 0.7,
      model: modelName,
      stream: false,
    };

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

    console.log("[Venice API Route] Sending request to Venice:", {
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - startTime,
      endpoint: `${apiEndpoint}/chat/completions`,
      model: modelName,
      messageCount: requestBody.messages?.length || 0,
      maxTokens: requestBody.max_tokens,
    });

    try {
      const fetchStartTime = Date.now();
      // Forward the request to Venice API
      const response = await fetch(`${apiEndpoint}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log("[Venice API Route] Venice API response received:", {
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
      console.log("[Venice API Route] Response processed:", {
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

      return NextResponse.json(data);
    } catch (error) {
      console.error("[Venice API Route] Error:", {
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });
      return NextResponse.json(
        {
          error: "Failed to connect to Venice API",
          details: error instanceof Error ? error.message : "Unknown error",
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
