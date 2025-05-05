import { NextResponse } from "next/server";

// Add Edge Runtime configuration
export const runtime = "edge";

export async function GET(): Promise<NextResponse> {
  try {
    const apiKey = process.env.VENICE_API_KEY;
    // Use the exact base URL from the documentation
    const apiEndpoint = "https://api.venice.ai/api/v1";

    // Enhanced environment check
    if (!apiKey) {
      throw new Error("API key is not configured");
    }

    // Updated request format to match Venice API specification exactly
    const requestBody = {
      model: process.env.VENICE_MODEL_NAME || "llama-3.1-405b",
      messages: [
        {
          role: "user",
          content: "Hello, this is a test message",
        },
      ],
      max_tokens: 50,
      temperature: 0.7,
      stream: false,
    };

    const response = await fetch(`${apiEndpoint}/chat/completions`, {
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
        `API Error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      data,
      environment: process.env.NODE_ENV,
      apiEndpoint,
      model: process.env.VENICE_MODEL_NAME || "llama-3.1-405b",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        environment: process.env.NODE_ENV,
        hasApiKey: Boolean(process.env.VENICE_API_KEY),
        apiEndpoint: process.env.VENICE_API_ENDPOINT,
        model: process.env.VENICE_MODEL_NAME || "llama-3.1-405b",
      },
      { status: 500 },
    );
  }
}
