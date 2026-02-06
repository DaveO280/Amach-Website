/**
 * Deploy/Upgrade SecureHealthProfileV4 with Attestation
 *
 * Manual UUPS upgrade (no @openzeppelin/hardhat-upgrades) so we use only
 * @nomiclabs/hardhat-ethers + ethers v5 and avoid getAddress/ethers v6 conflicts.
 *
 * Usage:
 *   pnpm exec hardhat run scripts/deploy-v4-attestation.js --network zksyncSepolia
 *
 * Prerequisites:
 *   - .env has PRIVATE_KEY (deployer = proxy owner, with ETH on zkSync Sepolia for gas)
 *   - Contracts compiled: pnpm exec hardhat compile
 */

const { ethers } = require("hardhat");

// Current proxy address (from contractConfig.ts)
const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";

async function main() {
  console.log("🚀 Deploying SecureHealthProfileV4...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "ETH\n");

  // 1) Deploy new V4 implementation (no proxy)
  const SecureHealthProfileV4 = await ethers.getContractFactory(
    "SecureHealthProfileV4",
  );
  const impl = await SecureHealthProfileV4.deploy();
  await impl.deployed();
  console.log("📦 V4 implementation deployed at:", impl.address);

  // Ensure the new implementation has code (UUPS reverts with "new implementation is not a contract" otherwise)
  const implCode = await ethers.provider.getCode(impl.address);
  if (!implCode || implCode === "0x") {
    console.error(
      "\n❌ New implementation has no code at this RPC. Wait a block and re-run, or try another node.",
    );
    process.exit(1);
  }

  // 2) Call upgradeToAndCall on the proxy (OZ UUPS v5 only has this, not upgradeTo)
  const proxyAbi = [
    "function upgradeToAndCall(address newImplementation, bytes memory data) external payable",
    "function owner() external view returns (address)",
    "function getContractVersion() external view returns (uint8)",
    "function totalAttestations() external view returns (uint256)",
    "function TIER_GOLD_MIN_SCORE() external view returns (uint16)",
    "function TIER_SILVER_MIN_SCORE() external view returns (uint16)",
    "function TIER_BRONZE_MIN_SCORE() external view returns (uint16)",
  ];
  const proxy = new ethers.Contract(PROXY_ADDRESS, proxyAbi, deployer);
  const proxyOwner = await proxy.owner();
  if (proxyOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.error(
      "\n❌ Upgrade failed: only the proxy owner can call upgradeTo.",
    );
    console.error("   Proxy owner:  ", proxyOwner);
    console.error("   Your address: ", deployer.address);
    console.error(
      "\n   Use the wallet that owns the proxy (set PRIVATE_KEY in .env) and try again.",
    );
    process.exit(1);
  }
  console.log("📦 Upgrading proxy to V4...");
  let tx;
  try {
    // Empty data = no post-upgrade call. Use explicit gas limit for zkSync.
    tx = await proxy.upgradeToAndCall(impl.address, "0x", { gasLimit: 400000 });
    await tx.wait();
    console.log("   Tx hash:", tx.hash);
  } catch (err) {
    try {
      await proxy.callStatic.upgradeToAndCall(impl.address, "0x");
    } catch (staticErr) {
      if (staticErr.data) console.error("   Revert data:", staticErr.data);
      if (staticErr.reason) console.error("   Reason:", staticErr.reason);
    }
    throw err;
  }

  // 3) Verify via proxy
  const version = await proxy.getContractVersion();
  console.log("\n✅ Upgrade complete!");
  console.log("   Contract version:", version.toString());
  console.log("   Proxy address:", PROXY_ADDRESS);

  console.log("\n🧪 Verifying attestation functions...");
  try {
    const totalAttestations = await proxy.totalAttestations();
    const goldMin = await proxy.TIER_GOLD_MIN_SCORE();
    const silverMin = await proxy.TIER_SILVER_MIN_SCORE();
    const bronzeMin = await proxy.TIER_BRONZE_MIN_SCORE();
    console.log("   totalAttestations():", totalAttestations.toString());
    console.log(
      "   Tier thresholds: Gold ≥",
      goldMin.toString(),
      "Silver ≥",
      silverMin.toString(),
      "Bronze ≥",
      bronzeMin.toString(),
    );
    console.log("\n✅ All attestation functions verified!");
  } catch (error) {
    console.error("❌ Verification failed:", error.message);
  }

  // Implementation address (same as we deployed; proxy now points to it)
  console.log("\n📋 Addresses for reference:");
  console.log("   Proxy (unchanged):", PROXY_ADDRESS);
  console.log("   New Implementation:", impl.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
