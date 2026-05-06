/**
 * Deploy SpringPushEscrowV1
 *
 * Non-upgradeable prize escrow for the Spring Push Season One contest.
 * Plain hardhat-ethers (ethers v5), no proxy, no initializer.
 *
 * Usage:
 *   pnpm exec hardhat run scripts/deploy/spring-push-escrow.js --network zksyncSepolia
 *
 * Required env vars:
 *   - PRIVATE_KEY                       deployer key (also pays gas)
 *   - SPRING_PUSH_VERIFIER (optional)   override the AverageImprovementProofV1Verifier address
 *   - SPRING_PUSH_MULTI_SIG (required)  multisig that will be the only privileged caller
 *
 * After deployment, the JSON receipt is written to:
 *   deployments/spring-push-escrow-<unix-ts>.json
 */

const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

// AverageImprovementProofV1Verifier address (per spec)
const DEFAULT_VERIFIER = "0x2248040f9833A6C91bfC161F244E0238da64615b";

async function main() {
  const verifier = process.env.SPRING_PUSH_VERIFIER || DEFAULT_VERIFIER;
  const multiSig = process.env.SPRING_PUSH_MULTI_SIG;

  if (!multiSig) {
    console.error(
      "❌ SPRING_PUSH_MULTI_SIG is required. Set it to the multisig address that will own the escrow.",
    );
    process.exit(1);
  }
  if (!ethers.utils.isAddress(verifier)) {
    console.error("❌ Invalid verifier address:", verifier);
    process.exit(1);
  }
  if (!ethers.utils.isAddress(multiSig)) {
    console.error("❌ Invalid multisig address:", multiSig);
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("🚀 Deploying SpringPushEscrowV1");
  console.log(
    "   Network:    ",
    network.name,
    "(chainId:",
    network.chainId + ")",
  );
  console.log("   Deployer:   ", deployer.address);
  console.log("   Balance:    ", ethers.utils.formatEther(balance), "ETH");
  console.log("   Verifier:   ", verifier);
  console.log("   Multi-sig:  ", multiSig);
  console.log("");

  const Factory = await ethers.getContractFactory("SpringPushEscrowV1");
  const escrow = await Factory.deploy(verifier, multiSig);
  await escrow.deployed();

  console.log("✅ SpringPushEscrowV1 deployed at:", escrow.address);

  // Sanity-read immutables back so we have on-chain proof the params took.
  const [
    duration,
    claimWindow,
    maxP,
    minP,
    founderDelay,
    verifierOnChain,
    multiSigOnChain,
  ] = await Promise.all([
    escrow.CONTEST_DURATION(),
    escrow.CLAIM_WINDOW(),
    escrow.MAX_PARTICIPANTS(),
    escrow.MIN_PARTICIPANTS(),
    escrow.FOUNDER_RECLAIM_DELAY(),
    escrow.IMPROVEMENT_VERIFIER(),
    escrow.MULTI_SIG(),
  ]);

  console.log("\n📋 Immutables:");
  console.log("   CONTEST_DURATION:     ", duration.toString(), "sec");
  console.log("   CLAIM_WINDOW:         ", claimWindow.toString(), "sec");
  console.log("   MAX_PARTICIPANTS:     ", maxP.toString());
  console.log("   MIN_PARTICIPANTS:     ", minP.toString());
  console.log("   FOUNDER_RECLAIM_DELAY:", founderDelay.toString(), "sec");
  console.log("   IMPROVEMENT_VERIFIER: ", verifierOnChain);
  console.log("   MULTI_SIG:            ", multiSigOnChain);

  const ts = Math.floor(Date.now() / 1000);
  const out = {
    contract: "SpringPushEscrowV1",
    address: escrow.address,
    deployer: deployer.address,
    txHash: escrow.deployTransaction.hash,
    network: { name: network.name, chainId: network.chainId },
    constructorArgs: { verifier, multiSig },
    immutables: {
      CONTEST_DURATION: duration.toString(),
      CLAIM_WINDOW: claimWindow.toString(),
      MAX_PARTICIPANTS: maxP.toString(),
      MIN_PARTICIPANTS: minP.toString(),
      FOUNDER_RECLAIM_DELAY: founderDelay.toString(),
      IMPROVEMENT_VERIFIER: verifierOnChain,
      MULTI_SIG: multiSigOnChain,
    },
    deployedAt: new Date(ts * 1000).toISOString(),
  };

  const dir = path.join(__dirname, "..", "..", "deployments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = path.join(dir, `spring-push-escrow-${ts}.json`);
  fs.writeFileSync(filename, JSON.stringify(out, null, 2));
  console.log(
    "\n💾 Receipt written to:",
    path.relative(process.cwd(), filename),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
