// API Key Authentication for Admin App
// Validates requests from the main app
// Allows internal requests from admin dashboard (same origin)

import { NextRequest, NextResponse } from "next/server";

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

export function validateApiKey(request: NextRequest): NextResponse | null {
  // Check if this is an internal request (from admin dashboard itself)
  const referer = request.headers.get("referer");
  const origin = request.headers.get("origin");

  // Allow requests from the admin dashboard (localhost:3001)
  const isInternalRequest =
    (referer && referer.includes("localhost:3001")) ||
    (origin && origin.includes("localhost:3001")) ||
    (!referer && !origin); // Direct server-side requests

  if (isInternalRequest) {
    console.log("✅ Internal request from admin dashboard - allowed");
    return null; // Allow internal requests without API key
  }

  // For external requests, validate API key
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
    console.warn(
      "⚠️ Unauthorized external API request - invalid or missing API key",
    );
    return NextResponse.json(
      { error: "Unauthorized - Invalid API key" },
      { status: 401 },
    );
  }

  // API key is valid
  console.log("✅ External request with valid API key - allowed");
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
