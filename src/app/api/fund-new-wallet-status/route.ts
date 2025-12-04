import { NextResponse } from "next/server";

// Re-export the activeRequests map from the funding route
// Note: In a real production setup, you'd use Redis or a database for this
// For now, we'll create a simple status endpoint

export async function GET(): Promise<NextResponse> {
  try {
    // This is a placeholder - in production, you'd query a shared store
    // For now, return instructions on how to check Vercel logs
    return NextResponse.json({
      message: "Check Vercel logs for funding request status",
      instructions: [
        "1. Go to Vercel Dashboard → Your Project → Logs",
        "2. Filter by '/api/fund-new-wallet'",
        "3. Look for entries starting with '[fund-...]'",
        "4. The last log entry shows the current status",
        "5. Check for timeout errors or RPC failures",
      ],
      commonIssues: {
        "Balance check timeout": "RPC endpoint may be slow or unresponsive",
        "Transaction send timeout": "Network congestion or RPC issue",
        "Confirmation timeout": "Transaction may be stuck or not mined",
        "No transaction hash": "Transaction failed before being sent",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get status" },
      { status: 500 },
    );
  }
}
