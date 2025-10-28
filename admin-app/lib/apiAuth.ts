// API Key Authentication for Admin App
// Validates requests from the main app

import { NextRequest, NextResponse } from "next/server";

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

export function validateApiKey(request: NextRequest): NextResponse | null {
  // Get API key from header
  const apiKey = request.headers.get("x-api-key");

  // Check if API key is configured
  if (!ADMIN_API_KEY) {
    console.error("❌ ADMIN_API_KEY environment variable not set!");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  // Validate API key
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    console.warn("⚠️ Unauthorized API request - invalid or missing API key");
    return NextResponse.json(
      { error: "Unauthorized - Invalid API key" },
      { status: 401 },
    );
  }

  // API key is valid
  return null;
}

export function getAuthHeaders(): HeadersInit {
  const apiKey = process.env.ADMIN_API_KEY;

  if (!apiKey) {
    console.warn("⚠️ ADMIN_API_KEY not configured");
    return {};
  }

  return {
    "x-api-key": apiKey,
  };
}
