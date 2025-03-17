import axios, { AxiosError } from "axios";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.VENICE_API_KEY;
    const apiEndpoint =
      process.env.VENICE_API_ENDPOINT || "https://api.venice.ai/v1";

    console.log(`Testing direct connection to Venice API at ${apiEndpoint}`);

    const response = await axios.post(
      `${apiEndpoint}/chat/completions`,
      {
        messages: [{ role: "user", content: "Hello, this is a server test" }],
        max_tokens: 50,
        model: process.env.LARGE_VENICE_MODEL || "venice-latest",
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    return NextResponse.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    // Type-safe error handling
    let errorMessage = "Unknown error";
    let errorDetails = null;

    if (error instanceof Error) {
      errorMessage = error.message;
    }

    // Check if it's an Axios error
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      errorDetails = axiosError.response?.data;
    }

    console.error("Direct Venice API test error:", errorMessage, errorDetails);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: errorDetails,
      },
      { status: 500 },
    );
  }
}
