import axios, { AxiosError } from "axios";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.VENICE_API_KEY;
    const apiEndpoint =
      process.env.VENICE_API_ENDPOINT || "https://api.venice.ai/v1";

    // Log environment check
    console.log("[Venice API Test] Environment check:", {
      hasApiKey: Boolean(apiKey),
      apiKeyLength: apiKey?.length || 0,
      apiEndpoint,
      environment: process.env.NODE_ENV,
      model: process.env.VENICE_MODEL_NAME || "venice-xl",
    });

    if (!apiKey) {
      throw new Error("API key is not configured");
    }

    const response = await axios.post(
      `${apiEndpoint}/chat/completions`,
      {
        messages: [{ role: "user", content: "Hello, this is a server test" }],
        max_tokens: 50,
        model: process.env.VENICE_MODEL_NAME || "venice-xl",
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    // Log successful response
    console.log("[Venice API Test] Success:", {
      status: response.status,
      hasChoices: Boolean(response.data?.choices),
      choiceCount: response.data?.choices?.length || 0,
    });

    return NextResponse.json({
      success: true,
      data: response.data,
      environment: process.env.NODE_ENV,
      apiEndpoint,
      model: process.env.VENICE_MODEL_NAME || "venice-xl",
    });
  } catch (error) {
    // Enhanced error logging
    console.error("[Venice API Test] Error details:", {
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

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: errorDetails,
        environment: process.env.NODE_ENV,
        hasApiKey: Boolean(process.env.VENICE_API_KEY),
        apiEndpoint: process.env.VENICE_API_ENDPOINT,
        model: process.env.VENICE_MODEL_NAME || "venice-xl",
      },
      { status: errorStatus },
    );
  }
}
