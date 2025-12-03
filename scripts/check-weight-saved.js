/**
 * Check if weight was saved for a user
 */

const hre = require("hardhat");

async function main() {
  const userAddress =
    process.argv[2] || "0x58147e61cc2683295c6eD00D5daeB8052B3D0c87";

  console.log("🔍 Checking weight for address:", userAddress);
  console.log("");

  const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";

  const SecureHealthProfileV3 = await hre.ethers.getContractFactory(
    "SecureHealthProfileV3_FromV1",
  );
  const contract = SecureHealthProfileV3.attach(PROXY_ADDRESS);

  try {
    const weight = await contract.getWeight(userAddress);
    console.log("Weight value:", weight);
    console.log(
      "Weight saved:",
      weight.length > 0 ? "✅ YES" : "❌ NO (empty)",
    );
    console.log("");

    if (weight.length > 0) {
      console.log("✅ Weight was successfully saved on-chain!");
      console.log(
        "   The React error is a frontend issue, not a contract issue",
      );
    } else {
      console.log("❌ Weight not saved");
      console.log("   Transaction may have used old createProfile() function");
    }
  } catch (error) {
    console.log("❌ Error checking weight:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
