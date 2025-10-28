const hre = require("hardhat");

async function main() {
  const emailToAdd = process.argv[2] || "ogara.d@gmail.com";

  console.log("🔗 Adding email to blockchain whitelist...");
  console.log("📧 Email:", emailToAdd);

  // Contract address
  const PROFILE_VERIFICATION_CONTRACT =
    "0x915f200D15906b70D0047BB72076eEDc4d1944E4";

  // Get the contract
  const ProfileVerification = await hre.ethers.getContractFactory(
    "ProfileVerification",
  );
  const contract = ProfileVerification.attach(PROFILE_VERIFICATION_CONTRACT);

  // Check if already whitelisted
  console.log("\n🔍 Checking current whitelist status...");
  const isWhitelisted = await contract.isEmailWhitelisted(emailToAdd);
  console.log(
    "Current status:",
    isWhitelisted ? "✅ Already whitelisted" : "❌ Not whitelisted",
  );

  if (isWhitelisted) {
    console.log("\n✅ Email is already whitelisted on blockchain!");
    console.log("🎉 Production should work!");
    return;
  }

  // Add to whitelist
  console.log("\n📤 Adding email to blockchain...");
  const tx = await contract.addEmailToWhitelist(emailToAdd);
  console.log("Transaction sent:", tx.hash);

  console.log("⏳ Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed!");
  console.log("Block:", receipt.blockNumber);
  console.log("Gas used:", receipt.gasUsed.toString());

  // Verify it was added
  console.log("\n🔍 Verifying...");
  const nowWhitelisted = await contract.isEmailWhitelisted(emailToAdd);
  console.log("New status:", nowWhitelisted ? "✅ Whitelisted!" : "❌ Failed");

  console.log("\n🎉 Done! Email is now on blockchain.");
  console.log("🌍 Production will now accept this email!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
