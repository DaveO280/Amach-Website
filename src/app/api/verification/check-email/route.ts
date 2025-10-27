import { isEmailWhitelisted } from "@/lib/sharedDatabase";
import { NextRequest, NextResponse } from "next/server";

// Force Node.js runtime for API access
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let email: string | undefined;

  try {
    console.log("🔍 API: check-email endpoint called (using shared database)");

    const body = await request.json();
    email = body.email;
    console.log("📧 API: Received email:", email);

    if (!email) {
      console.log("❌ API: Email is required");
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log("❌ API: Invalid email format");
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }

    console.log("📡 API: Checking whitelist via admin app API...");

    // Check if email is whitelisted using admin app API
    const isWhitelisted = await isEmailWhitelisted(email);

    // For now, we'll assume email is not "in use" since we're not tracking that in the database
    // In the future, this could be enhanced to check verification records
    const isInUse = false;

    const result = {
      email,
      isWhitelisted,
      isInUse,
      canProceed: isWhitelisted && !isInUse,
      source: "shared_database",
    };

    console.log("✅ API: Database check successful");
    console.log("📤 API: Returning result:", result);

    return NextResponse.json(result);
  } catch (error) {
    console.error("❌ API: Failed to check email:", error);
    console.error("❌ API: Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });

    // Fallback: return not whitelisted if database access fails
    return NextResponse.json({
      email: email || "unknown",
      isWhitelisted: false,
      isInUse: false,
      canProceed: false,
      source: "database_error",
      error: "Database access failed",
    });
  }
}
