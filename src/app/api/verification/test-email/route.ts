import { NextRequest, NextResponse } from "next/server";

// Simple test endpoint that bypasses contract calls
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }

    // Hardcoded whitelisted emails for testing
    const whitelistedEmails = [
      "ogara.d@gmail.com",
      "admin@amachhealth.com",
      "test@amachhealth.com",
      "user1@example.com",
      "user2@example.com",
      "user3@example.com",
    ];

    const isWhitelisted = whitelistedEmails.includes(email.toLowerCase());

    // For testing, assume emails are not in use unless they're specific test emails
    const isInUse = email.toLowerCase().includes("used");

    return NextResponse.json({
      email,
      isWhitelisted,
      isInUse,
      canProceed: isWhitelisted && !isInUse,
      message: "Test endpoint - bypassing contract calls",
    });
  } catch (error) {
    console.error("Test email endpoint error:", error);
    return NextResponse.json(
      { error: "Failed to check email status" },
      { status: 500 },
    );
  }
}
