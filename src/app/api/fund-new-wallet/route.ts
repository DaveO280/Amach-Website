import { NextRequest, NextResponse } from "next/server";

// Force Node.js runtime for ethers.js compatibility
// This prevents ethers from using the web version (fetch/XHR) which causes "missing response" errors
export const runtime = "nodejs";

// Set maximum duration for Vercel
// Hobby plan: max 60s, Pro plan: max 300s
// Note: Funding can take up to 2+ minutes, but we're limited to 60s on Hobby plan
// If funding times out, consider:
// 1. Upgrading to Pro plan (allows 300s)
// 2. Using a queue system (e.g., Vercel Queue or external service)
// 3. Splitting into separate endpoints (send tx, then poll for confirmation separately)
export const maxDuration = 60; // 60 seconds (Hobby plan max, upgrade to Pro for 300s)

import { ethers } from "ethers";

/**
 * API endpoint to fund newly created wallets with a small amount of ETH
 * This allows new users to create their health profile and claim tokens
 * without needing to manually acquire testnet ETH first
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // IMMEDIATE logging - use console.error for better visibility in Vercel
  const requestId = `fund-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const startTime = Date.now();

  console.error(`========================================`);
  console.error(`[${requestId}] 🚀 FUNDING REQUEST RECEIVED`);
  console.error(`[${requestId}] Time: ${new Date().toISOString()}`);
  console.error(`[${requestId}] Path: /api/fund-new-wallet`);
  console.error(`========================================`);

  // Declare variables in outer scope so they're accessible in catch block
  let address: string | undefined;
  let deployerWallet: ethers.Wallet | undefined;

  try {
    console.error(`[${requestId}] 📥 Parsing request body...`);
    const requestData = await request.json();
    address = requestData.address;
    console.error(`[${requestId}] 📬 Address received: ${address}`);

    if (!address || !ethers.utils.isAddress(address)) {
      console.error(`[${requestId}] ❌ Invalid address:`, address);
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 },
      );
    }

    console.error(`[${requestId}] ✅ Address validated: ${address}`);

    // Get deployer private key from environment (using same as hardhat config)
    // Check both PRIVATE_KEY and DEPLOYER_PRIVATE_KEY for compatibility
    console.error(`[${requestId}] 🔑 Checking for PRIVATE_KEY...`);
    const deployerPrivateKey =
      process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;

    if (!deployerPrivateKey) {
      console.error(
        `[${requestId}] ❌ PRIVATE_KEY not configured in environment`,
      );
      console.error(
        `[${requestId}] 💡 Note: Next.js API routes read from .env.local, not .env`,
      );
      console.error(
        `[${requestId}] 💡 Make sure PRIVATE_KEY is in .env.local and restart the dev server`,
      );
      return NextResponse.json(
        {
          error:
            "Funding service not configured. Please set PRIVATE_KEY environment variable in .env.local",
          details:
            "Next.js API routes require environment variables to be in .env.local (not .env). Please add PRIVATE_KEY to .env.local and restart the development server.",
        },
        { status: 500 },
      );
    }

    console.error(
      `[${requestId}] ✅ PRIVATE_KEY found (length: ${deployerPrivateKey.length})`,
    );

    // Get RPC URL from environment
    const rpcUrl =
      process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
      "https://sepolia.era.zksync.dev";

    console.log(`[${requestId}] 📬 Recipient address: ${address}`);
    console.log(`[${requestId}] 🔗 Using RPC URL: ${rpcUrl}`);

    // Create wallet without provider first (we'll use fetch for RPC calls)
    const deployerWalletSigner = new ethers.Wallet(deployerPrivateKey);
    deployerWallet = deployerWalletSigner; // For error logging
    const deployerAddress = deployerWalletSigner.address;
    console.log(
      `[${requestId}] 💰 Deployer wallet address: ${deployerAddress}`,
    );
    console.log(`[${requestId}] ⏱️ Elapsed: ${Date.now() - startTime}ms`);

    // Helper function to make RPC calls using fetch (more reliable in Next.js)
    async function rpcCall(
      method: string,
      params: unknown[],
    ): Promise<unknown> {
      const rpcStartTime = Date.now();
      console.log(`[${requestId}] 🔄 RPC call: ${method}`, {
        params: params.length > 0 ? `${params.length} params` : "no params",
      });

      try {
        const response = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method,
            params,
          }),
        });

        const rpcDuration = Date.now() - rpcStartTime;
        console.log(
          `[${requestId}] ⏱️ RPC ${method} completed in ${rpcDuration}ms`,
        );

        if (!response.ok) {
          console.error(
            `[${requestId}] ❌ RPC request failed: ${response.status} ${response.statusText}`,
          );
          throw new Error(`RPC request failed: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.error) {
          console.error(`[${requestId}] ❌ RPC error response:`, data.error);
          throw new Error(
            `RPC error: ${data.error.message || JSON.stringify(data.error)}`,
          );
        }

        return data.result;
      } catch (error) {
        const rpcDuration = Date.now() - rpcStartTime;
        console.error(
          `[${requestId}] ❌ RPC ${method} failed after ${rpcDuration}ms:`,
          error,
        );
        throw error;
      }
    }

    // Check deployer balance with retry logic
    console.log(`[${requestId}] 🔍 Starting balance check...`);
    let deployerBalance: ethers.BigNumber | undefined;
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `[${requestId}] 🔍 Checking deployer balance... (attempt ${attempt}/${maxRetries})`,
        );
        console.log(`[${requestId}]    Deployer address: ${deployerAddress}`);
        console.log(`[${requestId}]    RPC URL: ${rpcUrl}`);
        console.log(`[${requestId}] ⏱️ Elapsed: ${Date.now() - startTime}ms`);

        const balanceCheckStart = Date.now();
        const balanceHex = await Promise.race([
          rpcCall("eth_getBalance", [deployerAddress, "latest"]),
          new Promise<never>((_, reject) =>
            setTimeout(() => {
              const elapsed = Date.now() - balanceCheckStart;
              console.error(
                `[${requestId}] ⏱️ Balance check timeout after ${elapsed}ms`,
              );
              reject(new Error("Balance check timeout after 30 seconds"));
            }, 30000),
          ),
        ]);

        deployerBalance = ethers.BigNumber.from(balanceHex);
        console.log(
          `✅ Deployer balance retrieved: ${ethers.utils.formatEther(deployerBalance)} ETH`,
        );
        break;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(
          `❌ Balance check failed (attempt ${attempt}/${maxRetries}):`,
          errorMsg,
        );

        if (attempt === maxRetries) {
          // Include the actual error in the thrown error
          throw new Error(
            `Failed to check deployer balance after ${maxRetries} attempts. Last error: ${errorMsg}. RPC URL: ${rpcUrl}`,
          );
        }
        console.warn(`⏳ Retrying in ${2000 * attempt}ms...`);
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }

    if (!deployerBalance) {
      throw new Error("Failed to get deployer balance");
    }

    const fundingAmount = ethers.utils.parseEther("0.001"); // 0.001 ETH
    console.log(
      `💵 Deployer balance: ${ethers.utils.formatEther(deployerBalance)} ETH`,
    );

    if (deployerBalance.lt(fundingAmount)) {
      console.error("Deployer wallet has insufficient balance");
      return NextResponse.json(
        {
          error:
            "Funding service temporarily unavailable - insufficient balance",
        },
        { status: 503 },
      );
    }

    // Check if recipient already has enough balance (with retry)
    // Note: Privy embedded wallets are smart contract wallets that deploy on first transaction.
    // The wallet address exists deterministically, but the contract isn't deployed until first use.
    // We can still send ETH to the address even if the wallet isn't deployed yet.
    let recipientBalance: ethers.BigNumber = ethers.BigNumber.from(0);
    let balanceCheckSucceeded = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `🔍 Checking recipient balance... (attempt ${attempt}/${maxRetries})`,
        );
        const balanceHex = await Promise.race([
          rpcCall("eth_getBalance", [address, "latest"]),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Balance check timeout")), 30000),
          ),
        ]);
        recipientBalance = ethers.BigNumber.from(balanceHex);
        balanceCheckSucceeded = true;
        console.log(
          `✅ Balance check successful: ${ethers.utils.formatEther(recipientBalance)} ETH`,
        );
        break;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // If it's a timeout or network error, retry
        if (
          errorMessage.includes("timeout") ||
          errorMessage.includes("network") ||
          errorMessage.includes("connection")
        ) {
          if (attempt === maxRetries) {
            // On final attempt, proceed anyway - we can still send ETH to the address
            console.warn(
              `⚠️ Balance check failed after ${maxRetries} attempts, but proceeding with funding anyway`,
            );
            console.log(
              `ℹ️ Note: Privy embedded wallets deploy on first transaction. We can send ETH to the address even if the wallet contract isn't deployed yet.`,
            );
            balanceCheckSucceeded = false;
            recipientBalance = ethers.BigNumber.from(0);
            break;
          }
          console.warn(
            `⏳ Balance check failed (attempt ${attempt}), retrying...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
          continue;
        }

        // For other errors, also proceed - the address exists even if wallet isn't deployed
        console.warn(
          `⚠️ Balance check error: ${errorMessage}. Proceeding with funding - wallet may not be deployed yet (this is normal for Privy).`,
        );
        balanceCheckSucceeded = false;
        recipientBalance = ethers.BigNumber.from(0);
        break;
      }
    }

    // If we successfully checked balance and it's sufficient, skip funding
    if (balanceCheckSucceeded && recipientBalance.gte(fundingAmount)) {
      console.log(
        `✅ Recipient already has sufficient balance: ${ethers.utils.formatEther(recipientBalance)} ETH`,
      );
      return NextResponse.json({
        message: "Wallet already has sufficient balance",
        balance: ethers.utils.formatEther(recipientBalance),
        alreadyFunded: true,
      });
    }

    // Log info about Privy wallet deployment
    if (!balanceCheckSucceeded) {
      console.log(`ℹ️ Could not verify balance, but proceeding with funding.`);
      console.log(
        `ℹ️ Privy embedded wallets deploy automatically on first transaction.`,
      );
      console.log(
        `ℹ️ Deployment may be covered by Privy's free tier, but the wallet needs ETH for its own transactions.`,
      );
      console.log(
        `ℹ️ We're funding the wallet so it can pay for transactions (createProfile, verifyProfile, etc.).`,
      );
    } else {
      console.log(
        `💰 Current balance: ${ethers.utils.formatEther(recipientBalance)} ETH. Funding with 0.001 ETH...`,
      );
    }

    // Send transaction with retry logic
    console.log(
      `[${requestId}] 📤 Funding wallet ${address} with 0.001 ETH...`,
    );
    console.log(`[${requestId}] ⏱️ Elapsed: ${Date.now() - startTime}ms`);

    let txHash: string | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `[${requestId}] 🔄 Transaction attempt ${attempt}/${maxRetries}`,
        );
        // Get nonce
        const nonceHex = (await rpcCall("eth_getTransactionCount", [
          deployerAddress,
          "latest",
        ])) as string;
        const nonce = parseInt(nonceHex, 16);
        console.log(`[${requestId}] 📝 Nonce: ${nonce}`);

        // Get gas price
        const gasPriceHex = (await rpcCall("eth_gasPrice", [])) as string;
        const gasPrice = ethers.BigNumber.from(gasPriceHex);
        console.log(
          `[${requestId}] ⛽ Gas price: ${ethers.utils.formatUnits(gasPrice, "gwei")} gwei`,
        );

        // zkSync Era has a quirk: if the recipient is a smart contract wallet (like Privy),
        // and it hasn't been deployed yet, it can't validate incoming transactions.
        // The error "allowed limit: 0" means zkSync is asking the recipient to pay gas,
        // but the wallet has no ETH yet (chicken-and-egg problem).
        //
        // Solution: Use EIP-1559 transaction with high priority to ensure it gets through
        // zkSync will handle the gas payment from the sender

        // Get max fee per gas (zkSync supports EIP-1559)
        const maxFeePerGas = gasPrice.mul(150).div(100); // 50% buffer
        const maxPriorityFeePerGas = gasPrice.mul(10).div(100); // 10% tip

        // Use high gas limit - zkSync needs this for account abstraction
        const zkSyncGasLimit = ethers.BigNumber.from(300000);

        // Create EIP-1559 transaction (type 2)
        const tx = {
          to: address,
          value: fundingAmount,
          nonce,
          gasLimit: zkSyncGasLimit,
          maxFeePerGas,
          maxPriorityFeePerGas,
          chainId: 300, // zkSync Sepolia
          type: 2, // EIP-1559 transaction
        };

        // Sign transaction
        console.log(`[${requestId}] ✍️ Signing transaction...`);
        const signedTx = await deployerWalletSigner.signTransaction(tx);
        console.log(`[${requestId}] ✅ Transaction signed`);

        // Send raw transaction
        console.log(`[${requestId}] 📡 Sending transaction to network...`);
        const sendStartTime = Date.now();
        txHash = await Promise.race([
          rpcCall("eth_sendRawTransaction", [signedTx]) as Promise<string>,
          new Promise<never>((_, reject) =>
            setTimeout(() => {
              const elapsed = Date.now() - sendStartTime;
              console.error(
                `[${requestId}] ⏱️ Transaction send timeout after ${elapsed}ms`,
              );
              reject(new Error("Transaction send timeout"));
            }, 60000),
          ),
        ]);

        console.log(`[${requestId}] ✅ Transaction sent: ${txHash}`);
        console.log(
          `[${requestId}] ⏱️ Send duration: ${Date.now() - sendStartTime}ms`,
        );
        console.log(
          `[${requestId}] ⏱️ Total elapsed: ${Date.now() - startTime}ms`,
        );

        break;
      } catch (error) {
        if (attempt === maxRetries) {
          throw new Error(
            `Failed to send transaction after ${maxRetries} attempts: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
        console.warn(
          `⏳ Transaction send failed (attempt ${attempt}), retrying...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }

    if (!txHash) {
      throw new Error("Failed to send transaction");
    }

    // Wait for transaction confirmation with timeout
    console.log(`[${requestId}] ⏳ Waiting for transaction confirmation...`);
    console.log(`[${requestId}] 📋 Transaction hash: ${txHash}`);
    let receipt: { transactionHash: string; status: string } | null = null;
    const confirmationStartTime = Date.now();
    const confirmationTimeout = 120000; // 2 minutes
    let pollCount = 0;

    while (Date.now() - confirmationStartTime < confirmationTimeout) {
      try {
        pollCount++;
        const elapsed = Date.now() - confirmationStartTime;
        console.log(
          `[${requestId}] 🔍 Polling for receipt (attempt ${pollCount}, ${elapsed}ms elapsed)...`,
        );

        const receiptResult = await rpcCall("eth_getTransactionReceipt", [
          txHash,
        ]);
        if (receiptResult) {
          receipt = receiptResult as {
            transactionHash: string;
            status: string;
          };
          console.log(`[${requestId}] ✅ Receipt received:`, {
            hash: receipt.transactionHash,
            status: receipt.status,
            pollAttempts: pollCount,
            elapsed: Date.now() - confirmationStartTime,
          });
          break;
        }
        // Wait 2 seconds before checking again
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        // Ignore errors during polling, continue waiting
        console.log(
          `[${requestId}] ⚠️ Receipt poll error (continuing):`,
          error instanceof Error ? error.message : String(error),
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    if (!receipt) {
      const elapsed = Date.now() - confirmationStartTime;
      console.error(
        `[${requestId}] ❌ Transaction confirmation timeout after ${elapsed}ms`,
      );
      console.error(`[${requestId}] 📋 Transaction hash: ${txHash}`);
      console.error(
        `[${requestId}] ⏱️ Total elapsed: ${Date.now() - startTime}ms`,
      );
      throw new Error(
        `Transaction confirmation timeout after ${elapsed}ms. Tx: ${txHash}`,
      );
    }

    console.log(
      `[${requestId}] ✅ Successfully funded ${address}. Tx: ${receipt.transactionHash}`,
    );
    console.log(
      `[${requestId}] ⏱️ Total duration: ${Date.now() - startTime}ms`,
    );

    // Get updated balance
    const newBalanceHex = (await rpcCall("eth_getBalance", [
      address,
      "latest",
    ])) as string;
    const newBalance = ethers.BigNumber.from(newBalanceHex);

    return NextResponse.json({
      success: true,
      transactionHash: receipt.transactionHash,
      amount: "0.001",
      newBalance: ethers.utils.formatEther(newBalance),
      message: "Wallet successfully funded",
    });
  } catch (error) {
    // Log the full error for debugging
    const totalElapsed = Date.now() - startTime;
    console.error(
      `[${requestId}] ❌ Error funding wallet after ${totalElapsed}ms:`,
      error,
    );

    if (error instanceof Error) {
      console.error(`[${requestId}] Error details:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
        address,
        deployerAddress: deployerWallet?.address,
      });
    }

    // Provide more specific error messages
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (
        errorMessage.includes("insufficient funds") ||
        errorMessage.includes("insufficient balance")
      ) {
        return NextResponse.json(
          { error: "Deployer wallet has insufficient funds" },
          { status: 503 },
        );
      }
      if (errorMessage.includes("nonce")) {
        return NextResponse.json(
          { error: "Transaction nonce error - please try again" },
          { status: 500 },
        );
      }
      if (
        errorMessage.includes("invalid address") ||
        errorMessage.includes("address")
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid wallet address. The wallet may not be deployed yet. Please wait a moment and try again.",
          },
          { status: 400 },
        );
      }
      if (
        errorMessage.includes("private_key") ||
        errorMessage.includes("private key")
      ) {
        return NextResponse.json(
          {
            error:
              "Funding service not configured. Please set PRIVATE_KEY environment variable.",
          },
          { status: 500 },
        );
      }
      if (
        errorMessage.includes("network") ||
        errorMessage.includes("rpc") ||
        errorMessage.includes("connection") ||
        errorMessage.includes("timeout")
      ) {
        // Include the actual error message for debugging
        const actualError =
          error instanceof Error ? error.message : "Unknown network error";
        console.error("🔴 RPC Network Error Details:", {
          error: actualError,
          rpcUrl:
            process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
            "https://sepolia.era.zksync.dev",
          recipientAddress: address, // The wallet address we're trying to fund
          deployerAddress: deployerWallet?.address || "unknown", // Deployer wallet address (if available)
        });
        return NextResponse.json(
          {
            error:
              "Network error. Please check your RPC connection and try again.",
            details: actualError,
            rpcUrl:
              process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
              "https://sepolia.era.zksync.dev",
          },
          { status: 503 },
        );
      }
    }

    // For any other error, return with full details for debugging
    const actualError =
      error instanceof Error ? error.message : "Unknown error";
    console.error("🔴 Funding Error (not network):", {
      error: actualError,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        error: "Failed to fund wallet. Please try again later.",
        details: actualError,
      },
      { status: 500 },
    );
  }
}

/**
 * GET endpoint to check funding service status
 */
export async function GET(): Promise<NextResponse> {
  try {
    const deployerPrivateKey = process.env.PRIVATE_KEY;
    if (!deployerPrivateKey) {
      return NextResponse.json({
        available: false,
        message: "Funding service not configured - PRIVATE_KEY not set",
      });
    }

    const rpcUrl =
      process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
      "https://sepolia.era.zksync.dev";

    const deployerWallet = new ethers.Wallet(deployerPrivateKey);

    // Helper function to make RPC calls using fetch
    async function rpcCall(
      method: string,
      params: unknown[],
    ): Promise<unknown> {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params,
        }),
      });

      if (!response.ok) {
        throw new Error(`RPC request failed: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(
          `RPC error: ${data.error.message || JSON.stringify(data.error)}`,
        );
      }

      return data.result;
    }

    const balanceHex = (await rpcCall("eth_getBalance", [
      deployerWallet.address,
      "latest",
    ])) as string;
    const balance = ethers.BigNumber.from(balanceHex);
    const balanceInEth = ethers.utils.formatEther(balance);
    const fundingAmount = 0.001;
    const availableFunds = Math.floor(parseFloat(balanceInEth) / fundingAmount);

    return NextResponse.json({
      available: true,
      deployerAddress: deployerWallet.address,
      balance: balanceInEth,
      fundingAmountPerWallet: fundingAmount.toString(),
      estimatedAvailableFunds: availableFunds,
    });
  } catch (error) {
    console.error("Error checking funding service:", error);
    return NextResponse.json({
      available: false,
      message: "Error checking service status",
    });
  }
}
