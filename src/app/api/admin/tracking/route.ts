import { NextRequest, NextResponse } from "next/server";

// Since better-sqlite3 has native binding issues in the main app,
// we'll proxy requests to the admin app's API instead
const ADMIN_API_BASE = "http://localhost:3001/api";

// GET - Retrieve tracking data
export async function GET(): Promise<NextResponse> {
  try {
    console.log("🔄 Proxying tracking data request to admin app...");

    // Proxy the request to the admin app
    const response = await fetch(`${ADMIN_API_BASE}/tracking`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Admin API responded with ${response.status}`);
    }

    const data = await response.json();
    console.log("✅ Successfully retrieved tracking data from admin app");

    return NextResponse.json(data);
  } catch (error) {
    console.error("❌ Failed to fetch tracking data from admin app:", error);
    return NextResponse.json(
      { error: "Failed to fetch tracking data" },
      { status: 500 },
    );
  }
}

// POST - Track user actions
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action } = body;

    console.log("🔄 Proxying tracking action to admin app:", action);

    // Proxy the request to the admin app
    const response = await fetch(`${ADMIN_API_BASE}/tracking`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Admin API responded with ${response.status}`);
    }

    const data = await response.json();
    console.log("✅ Successfully processed tracking action via admin app");

    return NextResponse.json(data);
  } catch (error) {
    console.error("❌ Failed to process tracking action via admin app:", error);
    return NextResponse.json(
      { error: "Failed to process tracking action" },
      { status: 500 },
    );
  }
}
