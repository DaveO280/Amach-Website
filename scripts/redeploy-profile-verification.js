/**
 * Redeploy ProfileVerification Contract
 *
 * This script redeploys a fresh ProfileVerification contract with no existing registrations.
 * After deployment, you'll need to update the contract address in:
 * - src/lib/networkConfig.ts
 * - All API routes will automatically pick up the new address from there
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const RPC_URL = process.env.ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";

async function redeployProfileVerification() {
  console.log("\n🚀 ProfileVerification Contract Redeployment");
  console.log("============================================\n");

  try {
    // Check for private key
    const privateKey =
      process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      console.error("❌ Error: PRIVATE_KEY not found in .env file");
      process.exit(1);
    }

    // Initialize provider and wallet (ethers v5)
    const network = { name: "zksync-sepolia", chainId: 300 };
    const provider = new ethers.providers.StaticJsonRpcProvider(
      RPC_URL,
      network,
    );
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`📝 Deployer wallet: ${wallet.address}`);
    const balance = await wallet.getBalance();
    console.log(`💰 Balance: ${ethers.utils.formatEther(balance)} ETH\n`);

    if (balance.lt(ethers.utils.parseEther("0.01"))) {
      console.error(
        "❌ Insufficient balance for deployment (need at least 0.01 ETH)",
      );
      process.exit(1);
    }

    // Read the contract artifact
    const artifactPath = path.join(
      __dirname,
      "../artifacts/contracts/ProfileVerification.sol/ProfileVerification.json",
    );

    if (!fs.existsSync(artifactPath)) {
      console.error("❌ Contract artifact not found. Please compile first:");
      console.error("   npx hardhat compile");
      process.exit(1);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    console.log("✅ Contract artifact loaded\n");

    // Create contract factory
    const factory = new ethers.ContractFactory(
      artifact.abi,
      artifact.bytecode,
      wallet,
    );

    // Get gas price and set higher fees for zkSync
    const gasPrice = await provider.getGasPrice();
    const maxFeePerGas = gasPrice.mul(150).div(100); // 50% buffer
    const maxPriorityFeePerGas = gasPrice.mul(10).div(100); // 10% tip

    console.log("📤 Deploying ProfileVerification contract...");
    console.log(
      `   Gas Price: ${ethers.utils.formatUnits(gasPrice, "gwei")} gwei`,
    );
    console.log(
      `   Max Fee Per Gas: ${ethers.utils.formatUnits(maxFeePerGas, "gwei")} gwei\n`,
    );

    // Deploy contract
    const contract = await factory.deploy({
      gasLimit: 2000000, // Higher gas limit for contract deployment
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    console.log(`⏳ Transaction sent: ${contract.deployTransaction.hash}`);
    console.log("   Waiting for confirmation...\n");

    await contract.deployed();

    console.log("✅ ProfileVerification deployed successfully!");
    console.log(`📍 Contract address: ${contract.address}\n`);

    // Verify deployment
    console.log("🔍 Verifying deployment...");
    const owner = await contract.owner();
    const allocationConfig = await contract.getAllocationConfig();
    const totalVerifiedUsers = await contract.getTotalVerifiedUsers();

    console.log(`   Owner: ${owner}`);
    console.log(
      `   Max Allocations: ${allocationConfig.maxAllocations.toString()}`,
    );
    console.log(
      `   Allocation Per User: ${ethers.utils.formatEther(allocationConfig.allocationPerUser)} AHP`,
    );
    console.log(
      `   Total Allocated: ${allocationConfig.totalAllocated.toString()}`,
    );
    console.log(`   Total Verified Users: ${totalVerifiedUsers.toString()}`);
    console.log(`   Is Active: ${allocationConfig.isActive}\n`);

    // Save deployment info
    const deploymentInfo = {
      network: "zksync-sepolia",
      deployedAt: new Date().toISOString(),
      deployer: wallet.address,
      transactionHash: contract.deployTransaction.hash,
      contracts: {
        profileVerification: {
          address: contract.address,
          features: [
            "Email whitelist management",
            "Token allocation (1000 AHP per user)",
            "Profile verification",
            "ZKsync SSO integration",
          ],
        },
      },
      configuration: {
        maxAllocations: 5000,
        allocationPerUser: "1000 AHP",
        totalAllocated: 0,
        totalVerifiedUsers: 0,
      },
    };

    const timestamp = Date.now();
    const deploymentPath = path.join(
      __dirname,
      `../deployments/profile-verification-${timestamp}.json`,
    );
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(
      `💾 Deployment info saved to: deployments/profile-verification-${timestamp}.json\n`,
    );

    // Instructions for updating the codebase
    console.log("📝 NEXT STEPS:");
    console.log("=============");
    console.log(
      "\n1. Update the contract address in src/lib/networkConfig.ts:",
    );
    console.log(
      `   OLD: PROFILE_VERIFICATION_CONTRACT: "0xA2D3b1b8080895C5bE335d8352D867e4b6e51ab3"`,
    );
    console.log(`   NEW: PROFILE_VERIFICATION_CONTRACT: "${contract.address}"`);
    console.log("\n2. Restart your development server");
    console.log(
      "\n3. (Optional) Set the health token contract address if needed:",
    );
    console.log(
      `   node scripts/set-health-token.js ${contract.address} <HEALTH_TOKEN_ADDRESS>`,
    );
    console.log("\n4. Your email will now be available for registration!\n");

    console.log("🔗 View on zkSync Explorer:");
    console.log(
      `   https://sepolia.explorer.zksync.io/address/${contract.address}\n`,
    );

    // Show quick update command
    console.log("💡 Quick update command:");
    console.log(
      `   node scripts/update-contract-address.js ${contract.address}`,
    );
    console.log("   (This will automatically update networkConfig.ts)\n");
  } catch (error) {
    console.error("\n❌ Deployment failed:", error.message);
    if (error.transaction) {
      console.error("Transaction:", error.transaction);
    }
    if (error.receipt) {
      console.error("Receipt:", error.receipt);
    }
    process.exit(1);
  }
}

redeployProfileVerification();
