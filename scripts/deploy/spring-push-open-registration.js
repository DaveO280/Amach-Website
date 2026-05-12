/**
 * One-shot helper: opens registration on a deployed SpringPushEscrowV1.
 *
 * Usage:
 *   ESCROW_ADDRESS=0x... \
 *   BASELINE_ROOT=0x... \
 *   SEED_ETH=0.01 \
 *   pnpm exec hardhat run scripts/deploy/spring-push-open-registration.js --network zksyncSepolia
 *
 * Env vars:
 *   ESCROW_ADDRESS   required — deployed SpringPushEscrowV1 address
 *   BASELINE_ROOT    required — 32-byte hex (0x-prefixed) baseline Merkle root
 *   SEED_ETH         optional — ETH to seed prize pool; default "0.01"
 */

/* eslint-disable no-console */
const { ethers } = require("hardhat");

async function main() {
  const escrowAddress = process.env.ESCROW_ADDRESS;
  const baselineRoot = process.env.BASELINE_ROOT;
  const seedEth = process.env.SEED_ETH || "0.01";

  if (!escrowAddress || !ethers.utils.isAddress(escrowAddress)) {
    console.error("❌ ESCROW_ADDRESS missing or invalid");
    process.exit(1);
  }
  if (!baselineRoot || !/^0x[0-9a-fA-F]{64}$/.test(baselineRoot)) {
    console.error("❌ BASELINE_ROOT missing or not a 32-byte 0x-hex string");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(signer.address);

  const escrow = await ethers.getContractAt(
    "SpringPushEscrowV1",
    escrowAddress,
  );

  console.log("🟢 Opening registration on SpringPushEscrowV1");
  console.log(
    "   Network:   ",
    network.name,
    "(chainId:",
    network.chainId + ")",
  );
  console.log("   Escrow:    ", escrowAddress);
  console.log("   Caller:    ", signer.address);
  console.log("   Balance:   ", ethers.utils.formatEther(balance), "ETH");
  console.log("   Baseline:  ", baselineRoot);
  console.log("   Seed:      ", seedEth, "ETH");
  console.log("");

  const adminOnChain = await escrow.ADMIN();
  if (adminOnChain.toLowerCase() !== signer.address.toLowerCase()) {
    console.error(`❌ Caller ${signer.address} is not ADMIN ${adminOnChain}`);
    process.exit(1);
  }
  const stateBefore = await escrow.state();
  console.log("   State pre: ", stateBefore.toString(), "(0=UNINITIALIZED)");

  const value = ethers.utils.parseEther(seedEth);
  const tx = await escrow.openRegistration(baselineRoot, { value });
  console.log("   tx hash:   ", tx.hash);
  const rcpt = await tx.wait();
  console.log("   mined in block:", rcpt.blockNumber);

  const stateAfter = await escrow.state();
  const prizePool = await escrow.prizePool();
  const baseline = await escrow.baselineRoot();
  console.log("\n📋 Post-open state:");
  console.log(
    "   state:        ",
    stateAfter.toString(),
    "(1=REGISTRATION_OPEN)",
  );
  console.log("   prizePool:    ", ethers.utils.formatEther(prizePool), "ETH");
  console.log("   baselineRoot: ", baseline);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
