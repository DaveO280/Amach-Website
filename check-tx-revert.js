const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const RPC_URL =
    process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
  const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";
  const USER_ADDRESS = "0x5aE248bAb1B22690d9137B0F27b7fa3A89E01fa3";

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const userWallet = new ethers.Wallet(
    process.env.USER_PRIVATE_KEY || process.env.PRIVATE_KEY,
    provider,
  );

  console.log("👤 User wallet:", userWallet.address);
  console.log("   Expected:", USER_ADDRESS);
  console.log(
    "   Match:",
    userWallet.address.toLowerCase() === USER_ADDRESS.toLowerCase(),
  );

  const abi = [
    "function addHealthEventWithStorj(string encryptedData, bytes32 searchTag, string storjUri, bytes32 contentHash) external",
  ];

  const contract = new ethers.Contract(PROXY_ADDRESS, abi, userWallet);

  const encryptedData = "";
  const searchTag =
    "0x0258aee730f0d40290ba2490fe526c4d9e1f69374eeb5b29d897e25907428eca";
  const storjUri =
    "storj://amach-health-464a2ccf9897e268/timeline-event/1765557810011-d6eca946.enc";
  const contentHash =
    "0xb87e879f1db74466dfa39ebb9527a7961f97eb34d059bbe02559b107ef3ecb50";

  console.log("\n🧪 Estimating gas...");

  try {
    const gasEstimate = await contract.estimateGas.addHealthEventWithStorj(
      encryptedData,
      searchTag,
      storjUri,
      contentHash,
    );
    console.log("✅ Gas estimate:", gasEstimate.toString());

    console.log("\n📤 Sending transaction...");
    const tx = await contract.addHealthEventWithStorj(
      encryptedData,
      searchTag,
      storjUri,
      contentHash,
      { gasLimit: 500000 },
    );

    console.log("✅ Transaction sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
  } catch (e) {
    console.error("\n❌ Error:", e.reason || e.message);
    if (e.error?.data) {
      console.error("📋 Error data:", e.error.data);
    }
  }
}

main().catch(console.error);
