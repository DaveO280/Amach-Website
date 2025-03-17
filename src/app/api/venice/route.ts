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
    const apiKey = process.env.NEXT_PUBLIC_VENICE_API_KEY;
    const apiEndpoint =
      process.env.NEXT_PUBLIC_VENICE_API_ENDPOINT || "https://api.venice.ai/v1";

    // Log request details
    console.log("[Venice API Route] Request details:", {
      bodySize: JSON.stringify(body).length,
      endpoint: `${apiEndpoint}/chat/completions`,
      hasApiKey: Boolean(apiKey),
    });

    // Forward the request to Venice API
    const response = await axios.post(`${apiEndpoint}/chat/completions`, body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
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

    console.error("Venice API error:", errorMessage, errorDetails);

    // Provide detailed error information for debugging
    const errorResponse = {
      message: "Error connecting to Venice API",
      status: errorStatus,
      details: errorDetails || errorMessage,
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
