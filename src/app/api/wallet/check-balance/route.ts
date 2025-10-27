import { ethers } from "ethers";
import { NextRequest, NextResponse } from "next/server";

/**
 * API endpoint to check wallet balance
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const address = searchParams.get("address");

    if (!address || !ethers.utils.isAddress(address)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 },
      );
    }

    // Get RPC URL from environment
    const rpcUrl =
      process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
      "https://sepolia.era.zksync.dev";
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    // Get balance
    const balance = await provider.getBalance(address);
    const balanceInEth = ethers.utils.formatEther(balance);

    // Determine if balance is sufficient for transactions
    const minRequired = ethers.utils.parseEther("0.001");
    const hasSufficientBalance = balance.gte(minRequired);

    return NextResponse.json({
      address,
      balance: balanceInEth,
      balanceWei: balance.toString(),
      hasSufficientBalance,
      minimumRequired: "0.001",
    });
  } catch (error) {
    console.error("Error checking balance:", error);
    return NextResponse.json(
      { error: "Failed to check balance" },
      { status: 500 },
    );
  }
}
