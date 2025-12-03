import { NextResponse } from "next/server";

// Force Node.js runtime for ethers.js compatibility
// This prevents ethers from using the web version (fetch/XHR) which causes "missing response" errors
export const runtime = "nodejs";

import { ethers } from "ethers";

/**
 * Test endpoint to verify RPC connection
 * GET /api/test-rpc
 */
export async function GET(): Promise<NextResponse> {
  try {
    // Try multiple RPC endpoints
    const rpcUrls = [
      process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL,
      "https://sepolia.era.zksync.dev",
      "https://rpc.ankr.com/zksync_era_sepolia",
      "https://zksync-era-sepolia.blockpi.network/v1/rpc/public",
    ].filter(Boolean) as string[];

    console.log(`🔍 Testing RPC connections to: ${rpcUrls.join(", ")}`);

    // Try each RPC URL - use exact same pattern as allocation-info route that works
    let workingRpcUrl: string | null = null;
    let provider: ethers.providers.JsonRpcProvider | null = null;
    const rpcResults: Array<{
      url: string;
      status: string;
      error?: string;
      responseTime?: number;
    }> = [];

    for (const rpcUrl of rpcUrls) {
      try {
        console.log(`🔍 Testing: ${rpcUrl}`);
        const testProvider = new ethers.providers.JsonRpcProvider(rpcUrl, {
          name: "zksync-sepolia",
          chainId: 300,
        });
        const startTime = Date.now();

        // Quick test with timeout
        await Promise.race([
          testProvider.getBlockNumber(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Timeout after 5 seconds")),
              5000,
            ),
          ),
        ]);

        const responseTime = Date.now() - startTime;
        console.log(`✅ ${rpcUrl} is working (${responseTime}ms)`);

        workingRpcUrl = rpcUrl;
        provider = testProvider;
        rpcResults.push({ url: rpcUrl, status: "✅ Working", responseTime });
        break; // Use the first working one
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`❌ ${rpcUrl} failed: ${errorMsg}`);
        rpcResults.push({ url: rpcUrl, status: "❌ Failed", error: errorMsg });
        continue;
      }
    }

    if (!provider || !workingRpcUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "All RPC endpoints failed",
          rpcResults,
          message:
            "None of the tested RPC endpoints are responding. The zkSync Sepolia testnet RPC may be experiencing issues.",
        },
        { status: 503 },
      );
    }

    // Test 1: Get block number (simple, fast call)
    console.log("📊 Test 1: Getting block number...");
    const startTime = Date.now();
    const blockNumber = await Promise.race([
      provider.getBlockNumber(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout after 10 seconds")), 10000),
      ),
    ]);
    const blockTime = Date.now() - startTime;

    // Test 2: Get chain ID
    console.log("📊 Test 2: Getting chain ID...");
    const chainIdStart = Date.now();
    const networkInfo = await Promise.race([
      provider.getNetwork(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout after 10 seconds")), 10000),
      ),
    ]);
    const chainIdTime = Date.now() - chainIdStart;

    // Test 3: Get latest block
    console.log("📊 Test 3: Getting latest block...");
    const blockStart = Date.now();
    const block = await Promise.race([
      provider.getBlock(blockNumber),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout after 10 seconds")), 10000),
      ),
    ]);
    const blockFetchTime = Date.now() - blockStart;

    // Test 4: Get gas price
    console.log("📊 Test 4: Getting gas price...");
    const gasStart = Date.now();
    const gasPrice = await Promise.race([
      provider.getGasPrice(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout after 10 seconds")), 10000),
      ),
    ]);
    const gasTime = Date.now() - gasStart;

    const results = {
      success: true,
      rpcUrl: workingRpcUrl,
      rpcResults, // Show results for all tested endpoints
      network: {
        chainId: networkInfo.chainId,
        name: networkInfo.name,
      },
      tests: {
        blockNumber: {
          value: blockNumber,
          responseTime: `${blockTime}ms`,
          status: "✅ Pass",
        },
        chainId: {
          value: networkInfo.chainId,
          responseTime: `${chainIdTime}ms`,
          status: "✅ Pass",
        },
        latestBlock: {
          blockNumber: block?.number,
          timestamp: block?.timestamp,
          transactionCount: block?.transactions.length,
          responseTime: `${blockFetchTime}ms`,
          status: "✅ Pass",
        },
        gasPrice: {
          value: ethers.utils.formatUnits(gasPrice, "gwei") + " gwei",
          raw: gasPrice.toString(),
          responseTime: `${gasTime}ms`,
          status: "✅ Pass",
        },
      },
      summary: {
        allTestsPassed: true,
        averageResponseTime: `${Math.round((blockTime + chainIdTime + blockFetchTime + gasTime) / 4)}ms`,
        fastestTest: `${Math.min(blockTime, chainIdTime, blockFetchTime, gasTime)}ms`,
        slowestTest: `${Math.max(blockTime, chainIdTime, blockFetchTime, gasTime)}ms`,
      },
    };

    console.log("✅ All RPC tests passed!");
    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ RPC test failed:", errorMessage);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        rpcUrl:
          process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
          "https://sepolia.era.zksync.dev",
        details:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack?.split("\n").slice(0, 5), // First 5 lines of stack
              }
            : undefined,
      },
      { status: 500 },
    );
  }
}
