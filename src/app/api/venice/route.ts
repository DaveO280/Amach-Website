import axios, { AxiosError } from "axios";
import { NextRequest, NextResponse } from "next/server";

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
        maxTokens: body.max_tokens,
      },
    });

    if (!apiKey) {
      throw new Error("API key is not configured");
    }

    // Forward the request to Venice API, but use our model name
    const requestBody = {
      ...body,
      model: modelName, // Override the model name from the request
    };

    const response = await axios.post(
      `${apiEndpoint}/chat/completions`,
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    // Log successful response
    console.log("[Venice API Route] Success:", {
      status: response.status,
      hasChoices: Boolean(response.data?.choices),
      choiceCount: response.data?.choices?.length || 0,
    });

    // Return the response to the client with CORS headers
    return NextResponse.json(response.data, {
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
      axiosError: axios.isAxiosError(error)
        ? {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            headers: error.response?.headers,
          }
        : undefined,
    });

    // Type-safe error handling
    let errorMessage = "Unknown error";
    let errorStatus = 500;
    let errorDetails = null;

    if (error instanceof Error) {
      errorMessage = error.message;
    }

    // Check if it's an Axios error
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      errorStatus = axiosError.response?.status || 500;
      errorDetails = axiosError.response?.data;
    }

    // Provide detailed error information for debugging
    const errorResponse = {
      message: "Error connecting to Venice API",
      status: errorStatus,
      details: errorDetails || errorMessage,
      environment: process.env.NODE_ENV,
      hasApiKey: Boolean(process.env.VENICE_API_KEY),
      apiEndpoint: process.env.VENICE_API_ENDPOINT,
    };

    return NextResponse.json(errorResponse, {
      status: errorStatus,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }
}
