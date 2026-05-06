/**
 * Deploy AverageImprovementProofV1Verifier.sol — Groth16 verifier for the
 * Spring Push (vo2max average improvement) circuit.
 *
 * This is an immutable contract: no owner, no upgrade path. The verification
 * key is baked in at compile time by snarkJS.
 *
 * Mirrors the structure of scripts/deploy-coverage-verifier.js — both
 * Groth16 verifiers deploy to zkSync Era Sepolia via the standard
 * hardhat-ethers `getContractFactory` path. Originally lived in
 * AmachHealth-iOS/zk/deploy/, but Dave deploys all contracts from
 * Amach-Website, so it now sits next to the other website deploy scripts.
 *
 * Usage:
 *   pnpm exec hardhat run scripts/deploy-improvement-verifier.js --network zksyncSepolia
 *
 * Prerequisites:
 *   - .env has PRIVATE_KEY (any funded wallet on zkSync Sepolia)
 *   - Contracts compiled: pnpm exec hardhat compile
 *
 * After deployment, copy the logged address into:
 *   - src/lib/contractConfig.ts  →  IMPROVEMENT_VERIFIER_ADDRESS
 *   - AmachHealth-iOS/.../ZKSyncAttestationService.swift  →  improvementVerifierAddress
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// snarkJS names every Groth16 verifier `Groth16Verifier`, so this collides
// with CoverageVerifier.sol's contract. Resolve by fully-qualified name.
const FQN = "contracts/AverageImprovementProofV1Verifier.sol:Groth16Verifier";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "ETH\n");

  const Verifier = await ethers.getContractFactory(FQN);
  console.log("Deploying AverageImprovementProofV1Verifier (Groth16)...");
  const verifier = await Verifier.deploy();
  await verifier.deployed();

  console.log(
    "\n✅ AverageImprovementProofV1Verifier deployed at:",
    verifier.address,
  );
  console.log(
    "   Explorer: https://explorer.sepolia.era.zksync.dev/address/" +
      verifier.address,
  );

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const ts = Date.now();
  const outFile = path.join(deploymentsDir, `improvement-verifier-${ts}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        contract: "AverageImprovementProofV1Verifier",
        address: verifier.address,
        deployedAt: new Date(ts).toISOString(),
        network: "zksyncSepolia",
        chainId: 300,
        metric: "vo2max",
        metricPointer: 64,
        N: 2,
        M: 2,
        treeDepth: 7,
      },
      null,
      2,
    ),
  );
  console.log(`   Saved to ${path.relative(process.cwd(), outFile)}`);

  console.log(
    "\nUpdate the following with this address:",
    "\n  src/lib/contractConfig.ts  →  IMPROVEMENT_VERIFIER_ADDRESS",
    "\n  AmachHealth-iOS/.../ZKSyncAttestationService.swift  →  improvementVerifierAddress",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
