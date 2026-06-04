import { NextRequest, NextResponse } from "next/server";
import { parseHealthReport } from "@/utils/reportParsers";

export const runtime = "nodejs";
export const maxDuration = 300;

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, reportType, sourceName } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing required field: text" },
        { status: 400, headers: corsHeaders },
      );
    }

    const reports = await parseHealthReport(text, {
      inferredType: reportType,
      sourceName,
      useAI: true,
    });

    return NextResponse.json(
      { success: true, reports },
      { headers: corsHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}
