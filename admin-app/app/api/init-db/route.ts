import { NextResponse } from "next/server";
import { initializeDatabase } from "@/lib/database";

export const runtime = "nodejs";

// POST - Initialize the database
export async function POST(): Promise<NextResponse> {
  try {
    console.log("🗄️ Initializing admin database...");
    initializeDatabase();

    return NextResponse.json({
      success: true,
      message: "Database initialized successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to initialize database:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to initialize database",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
