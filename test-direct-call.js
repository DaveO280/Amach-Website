const { ethers } = require("ethers");

async function main() {
  const RPC_URL = "https://sepolia.era.zksync.dev";
  const CONTRACT_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const abi = [
    {
      inputs: [
        { name: "searchTag", type: "bytes32" },
        { name: "storjUri", type: "string" },
        { name: "contentHash", type: "bytes32" },
        { name: "eventHash", type: "bytes32" },
      ],
      name: "addHealthEventV2",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
  ];

  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

  const searchTag =
    "0x0258aee730f0d40290ba2490fe526c4d9e1f69374eeb5b29d897e25907428eca";
  const storjUri =
    "storj://amach-health-464a2ccf9897e268/timeline-event/1765402088738-c3bdc4b0.enc";
  const contentHash =
    "0x67c36b832e0742a229e9b46f3941766254cdb8db00f750ecd9b02a24ee38a8a7";
  const eventHash =
    "0x23640b9189fb4567f21e140fdc2b9924d94f7a0f02699e74299770bf193165f7";

  console.log("🧪 Attempting to call addHealthEventV2...\n");
  console.log("Args:", { searchTag, storjUri, contentHash, eventHash });

  try {
    // First, estimate gas to see if it would succeed
    console.log("\n1️⃣ Estimating gas...");
    const gasEstimate = await contract.estimateGas.addHealthEventV2(
      searchTag,
      storjUri,
      contentHash,
      eventHash,
    );
    console.log("✅ Gas estimate:", gasEstimate.toString());
    console.log("✅ Function should succeed!");

    // If gas estimation works, try the actual call
    console.log("\n2️⃣ Sending transaction...");
    const tx = await contract.addHealthEventV2(
      searchTag,
      storjUri,
      contentHash,
      eventHash,
      { gasLimit: gasEstimate.mul(2) },
    );
    console.log("✅ Transaction sent:", tx.hash);

    console.log("\n3️⃣ Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed!");
    console.log("   Block:", receipt.blockNumber);
    console.log("   Status:", receipt.status === 1 ? "Success" : "Failed");
  } catch (error) {
    console.log("\n❌ Transaction would fail:");
    console.log("Error:", error.message);

    if (error.reason) {
      console.log("\n📝 Revert reason:", error.reason);
    }

    if (error.error?.message) {
      console.log("\n📝 Error message:", error.error.message);
    }

    // Check for common issues
    if (error.message.includes("insufficient funds")) {
      console.log("\n💡 Issue: Insufficient funds for gas");
    } else if (error.message.includes("nonce")) {
      console.log("\n💡 Issue: Nonce problem");
    } else if (error.message.includes("execution reverted")) {
      console.log(
        "\n💡 Issue: Contract execution reverted (check contract logic)",
      );
    }
  }
}

main().catch(console.error);
