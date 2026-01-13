/**
 * API route to get available tools
 */

import { NextResponse } from "next/server";
import { HEALTH_QUERY_TOOLS } from "@/ai/tools/ToolDefinitions";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    tools: HEALTH_QUERY_TOOLS,
  });
}
