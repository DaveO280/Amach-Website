/**
 * Deploy CoverageVerifier.sol — Groth16 verifier for the coverage circuit.
 *
 * This is an immutable contract: no owner, no upgrade path.
 * The verification key is baked in at compile time by snarkJS.
 *
 * Usage:
 *   pnpm exec hardhat run scripts/deploy-coverage-verifier.js --network zksyncSepolia
 *
 * Prerequisites:
 *   - .env has PRIVATE_KEY (any funded wallet on the target network)
 *   - Compiled: pnpm exec hardhat compile
 *
 * After deployment, copy the logged address into:
 *   - src/lib/contractConfig.ts  (COVERAGE_VERIFIER_ADDRESS)
 *   - AmachHealth-iOS/.../ZKSyncAttestationService.swift  (coverageVerifierAddress)
 */

const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "ETH\n");

  const CoverageVerifier = await ethers.getContractFactory("Groth16Verifier");
  console.log("Deploying CoverageVerifier (Groth16)...");
  const verifier = await CoverageVerifier.deploy();
  await verifier.deployed();

  console.log("\n✅ CoverageVerifier deployed at:", verifier.address);
  console.log(
    "\nUpdate the following with this address:",
    "\n  src/lib/contractConfig.ts  →  COVERAGE_VERIFIER_ADDRESS",
    "\n  AmachHealth-iOS/.../ZKSyncAttestationService.swift  →  coverageVerifierAddress",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
