import { NextRequest, NextResponse } from "next/server";

// Add Edge Runtime configuration
export const runtime = "edge";

export async function OPTIONS(request: NextRequest) {
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Get API credentials from environment variables
    const apiKey = process.env.VENICE_API_KEY;
    const apiEndpoint =
      process.env.VENICE_API_ENDPOINT || "https://api.venice.ai/api/v1";
    const modelName = process.env.VENICE_MODEL_NAME || "llama-3.1-405b";

    // Enhanced logging for debugging
    console.log("[Venice API Route] Environment check:", {
      hasApiKey: Boolean(apiKey),
      apiKeyLength: apiKey?.length || 0,
      apiEndpoint,
      environment: process.env.NODE_ENV,
      modelName,
      requestBody: {
        model: body.model,
        messageCount: body.messages?.length || 0,
        maxTokens: body.maxTokens || body.max_tokens,
      },
    });

    if (!apiKey) {
      throw new Error("API key is not configured");
    }

    // Forward the request to Venice API
    const requestBody = {
      messages: body.messages || [],
      max_tokens: body.maxTokens || body.max_tokens || 2000,
      temperature: body.temperature || 0.7,
      model: modelName,
    };

    // Validate request body
    if (
      !requestBody.messages ||
      !Array.isArray(requestBody.messages) ||
      requestBody.messages.length === 0
    ) {
      throw new Error("Invalid request: messages array is required");
    }

    // Validate max_tokens
    if (!requestBody.max_tokens || requestBody.max_tokens < 1) {
      throw new Error("Invalid request: max_tokens must be a positive number");
    }

    console.log("[Venice API Route] Sending request to Venice:", {
      endpoint: `${apiEndpoint}/chat/completions`,
      model: modelName,
      messageCount: requestBody.messages?.length || 0,
      maxTokens: requestBody.max_tokens,
      fullRequestBody: JSON.stringify(requestBody, null, 2),
      headers: {
        Authorization: `Bearer ${apiKey.substring(0, 4)}...`,
        "Content-Type": "application/json",
      },
    });

    // Forward the request to Venice API
    const response = await fetch(`${apiEndpoint}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(
        `Venice API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Log successful response
    console.log("[Venice API Route] Success:", {
      status: response.status,
      hasChoices: Boolean(data?.choices),
      choiceCount: data?.choices?.length || 0,
    });

    // Return the response to the client with CORS headers
    return NextResponse.json(data, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (error) {
    // Enhanced error logging
    console.error("[Venice API Route] Error details:", {
      errorName: error instanceof Error ? error.name : "Unknown",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Type-safe error handling
    let errorMessage = "Unknown error";
    let errorStatus = 500;

    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      {
        message: "Error connecting to Venice API",
        status: errorStatus,
        details: errorMessage,
        environment: process.env.NODE_ENV,
        hasApiKey: Boolean(process.env.VENICE_API_KEY),
        apiEndpoint: process.env.VENICE_API_ENDPOINT,
        modelName: process.env.VENICE_MODEL_NAME,
      },
      {
        status: errorStatus,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  }
}
