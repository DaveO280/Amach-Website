import { NextRequest, NextResponse } from "next/server";
import { emailService } from "@/lib/emailService";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { emails, verificationUrl } = body;

    // Basic validation
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: "Invalid emails array" },
        { status: 400 },
      );
    }

    // Check if email service is configured
    if (!emailService.isConfigured()) {
      return NextResponse.json(
        {
          error: "Email service not configured",
          message: "Please set EMAIL_USER and EMAIL_PASS environment variables",
        },
        { status: 500 },
      );
    }

    // Send emails
    const results = await emailService.sendBulkWalletCreationEmails(
      emails,
      verificationUrl,
    );

    return NextResponse.json({
      success: true,
      results: {
        total: emails.length,
        successful: results.success.length,
        failed: results.failed.length,
        successfulEmails: results.success,
        failedEmails: results.failed,
      },
    });
  } catch (error) {
    console.error("Error sending wallet emails:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  // Check if email service is configured
  const isConfigured = emailService.isConfigured();

  return NextResponse.json({
    configured: isConfigured,
    message: isConfigured
      ? "Email service is ready"
      : "Email service not configured. Set EMAIL_USER and EMAIL_PASS environment variables.",
  });
}
