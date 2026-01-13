/**
 * API route for executing health data queries via tools
 */

import { NextRequest, NextResponse } from "next/server";
import { IndexedDBDataSource } from "@/data/sources/IndexedDBDataSource";
import { ToolExecutor, ToolCall } from "@/ai/tools/ToolExecutor";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { tool, params } = body as ToolCall;

    // Validate request
    if (!tool || !params) {
      return NextResponse.json(
        { error: "Missing tool or params" },
        { status: 400 },
      );
    }

    // Create data source (IndexedDB for now, will add Storj later)
    const dataSource = new IndexedDBDataSource();

    // Execute tool
    const executor = new ToolExecutor(dataSource);
    const result = await executor.execute({ tool, params });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      tool,
      data: result.data,
    });
  } catch (error) {
    console.error("[API /health/query] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
