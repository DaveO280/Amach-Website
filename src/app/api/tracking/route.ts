import { NextRequest, NextResponse } from "next/server";

// This endpoint handles tracking requests from the frontend tracking service
// It proxies to the admin tracking API to record user actions

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    console.log("📊 Main app tracking API received:", body);

    // Proxy to the admin tracking API
    const response = await fetch("http://localhost:3001/api/tracking", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `❌ Admin tracking API error (${response.status}):`,
        errorText,
      );
      throw new Error(
        `Admin tracking API responded with ${response.status}: ${errorText}`,
      );
    }

    const data = await response.json();
    console.log("✅ Successfully processed tracking via admin app");

    return NextResponse.json(data);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Failed to process tracking via admin app:", errorMessage);
    return NextResponse.json(
      { error: "Failed to process tracking", details: errorMessage },
      { status: 500 },
    );
  }
}
