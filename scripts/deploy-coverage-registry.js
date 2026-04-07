/**
 * Deploy CoverageRegistry.sol
 *
 * Wraps the already-deployed CoverageVerifier (Groth16Verifier) and adds
 * persistent on-chain storage of coverage records.
 *
 * Usage:
 *   pnpm exec hardhat run scripts/deploy-coverage-registry.js --network zksyncSepolia
 *
 * Prerequisites:
 *   - .env has PRIVATE_KEY
 *   - Contracts compiled: pnpm exec hardhat compile
 *
 * After deployment, copy the logged address into:
 *   - src/lib/networkConfig.ts  →  COVERAGE_REGISTRY_CONTRACT (testnet)
 *   - AmachHealth-iOS/.../ZKSyncAttestationService.swift  →  coverageRegistryAddress
 */

const { ethers } = require("hardhat");

// Already deployed on ZKsync Era Sepolia
const COVERAGE_VERIFIER_ADDRESS = "0x58a856a2b11817f8B5E9fd96F797dDD48E57D884";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "ETH\n");

  console.log("Deploying CoverageRegistry...");
  console.log("  Verifier:", COVERAGE_VERIFIER_ADDRESS);

  const CoverageRegistry = await ethers.getContractFactory("CoverageRegistry");
  const registry = await CoverageRegistry.deploy(COVERAGE_VERIFIER_ADDRESS);
  await registry.deployed();

  console.log("\n✅ CoverageRegistry deployed at:", registry.address);
  console.log(
    "\nUpdate the following with this address:",
    "\n  src/lib/networkConfig.ts  →  COVERAGE_REGISTRY_CONTRACT (testnet slot)",
    "\n  AmachHealth-iOS/.../ZKSyncAttestationService.swift  →  coverageRegistryAddress",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
