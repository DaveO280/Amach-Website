import { ethers } from "ethers";
import { NextRequest, NextResponse } from "next/server";

/**
 * API endpoint to fund newly created wallets with a small amount of ETH
 * This allows new users to create their health profile and claim tokens
 * without needing to manually acquire testnet ETH first
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { address } = await request.json();

    if (!address || !ethers.utils.isAddress(address)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 },
      );
    }

    // Get deployer private key from environment (using same as hardhat config)
    const deployerPrivateKey = process.env.PRIVATE_KEY;
    if (!deployerPrivateKey) {
      console.error("PRIVATE_KEY not configured");
      return NextResponse.json(
        {
          error:
            "Funding service not configured. Please set PRIVATE_KEY environment variable.",
          details:
            "The deployer wallet private key is required to fund new user wallets.",
        },
        { status: 500 },
      );
    }

    // Get RPC URL from environment
    const rpcUrl =
      process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
      "https://sepolia.era.zksync.dev";

    // Create provider and wallet
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const deployerWallet = new ethers.Wallet(deployerPrivateKey, provider);

    // Check deployer balance
    const deployerBalance = await provider.getBalance(deployerWallet.address);
    const fundingAmount = ethers.utils.parseEther("0.001"); // 0.001 ETH

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

    // Check if recipient already has enough balance
    const recipientBalance = await provider.getBalance(address);
    if (recipientBalance.gte(fundingAmount)) {
      return NextResponse.json({
        message: "Wallet already has sufficient balance",
        balance: ethers.utils.formatEther(recipientBalance),
        alreadyFunded: true,
      });
    }

    // Send transaction
    console.log(`Funding wallet ${address} with 0.001 ETH...`);
    const tx = await deployerWallet.sendTransaction({
      to: address,
      value: fundingAmount,
    });

    // Wait for transaction confirmation
    const receipt = await tx.wait();

    if (!receipt) {
      throw new Error("Transaction receipt not available");
    }

    console.log(
      `Successfully funded ${address}. Tx: ${receipt.transactionHash}`,
    );

    // Get updated balance
    const newBalance = await provider.getBalance(address);

    return NextResponse.json({
      success: true,
      transactionHash: receipt.transactionHash,
      amount: "0.001",
      newBalance: ethers.utils.formatEther(newBalance),
      message: "Wallet successfully funded",
    });
  } catch (error) {
    console.error("Error funding wallet:", error);

    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes("insufficient funds")) {
        return NextResponse.json(
          { error: "Deployer wallet has insufficient funds" },
          { status: 503 },
        );
      }
      if (error.message.includes("nonce")) {
        return NextResponse.json(
          { error: "Transaction nonce error - please try again" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to fund wallet. Please try again later." },
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
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const deployerWallet = new ethers.Wallet(deployerPrivateKey, provider);

    const balance = await provider.getBalance(deployerWallet.address);
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
