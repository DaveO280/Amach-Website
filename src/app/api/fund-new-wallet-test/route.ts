import { NextResponse } from "next/server";

/**
 * Simple test endpoint to verify API routes are logging correctly in Vercel
 * Call this to check if logs appear in Vercel dashboard
 */
export async function GET(): Promise<NextResponse> {
  const timestamp = new Date().toISOString();
  const requestId = `test-${Date.now()}`;

  // Use console.error for better visibility in Vercel logs
  console.error(`========================================`);
  console.error(`[${requestId}] 🧪 TEST ENDPOINT CALLED`);
  console.error(`[${requestId}] Time: ${timestamp}`);
  console.error(`[${requestId}] Path: /api/fund-new-wallet-test`);
  console.error(`========================================`);

  return NextResponse.json({
    success: true,
    message: "Test endpoint working",
    requestId,
    timestamp,
    instructions: [
      "1. Check Vercel Dashboard → Logs",
      "2. Filter by '/api/fund-new-wallet-test'",
      "3. You should see the test logs above",
      "4. If you see these logs, API route logging works",
      "5. If not, check Vercel log filters or function configuration",
    ],
  });
}
