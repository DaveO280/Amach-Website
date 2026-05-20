/**
 * One-shot helper: opens registration on a deployed SpringPushEscrowV1.
 *
 * The contract no longer takes a contest-wide baseline root — each participant
 * commits their own baseline at register() time. This script only seeds the
 * prize pool and transitions UNINITIALIZED → REGISTRATION_OPEN.
 *
 * Usage:
 *   ESCROW_ADDRESS=0x... \
 *   SEED_ETH=0.01 \
 *   pnpm exec hardhat run scripts/deploy/spring-push-open-registration.js --network zksyncSepolia
 *
 * Env vars:
 *   ESCROW_ADDRESS   required — deployed SpringPushEscrowV1 address
 *   SEED_ETH         optional — ETH to seed prize pool; default "0.01"
 */

/* eslint-disable no-console */
const { ethers } = require("hardhat");

async function main() {
  const escrowAddress = process.env.ESCROW_ADDRESS;
  const seedEth = process.env.SEED_ETH || "0.01";

  if (!escrowAddress || !ethers.utils.isAddress(escrowAddress)) {
    console.error("❌ ESCROW_ADDRESS missing or invalid");
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
  console.log("   Seed:      ", seedEth, "ETH");
  console.log("   Baseline:  ", "per-participant (committed at register())");
  console.log("");

  const adminOnChain = await escrow.ADMIN();
  if (adminOnChain.toLowerCase() !== signer.address.toLowerCase()) {
    console.error(`❌ Caller ${signer.address} is not ADMIN ${adminOnChain}`);
    process.exit(1);
  }
  const stateBefore = await escrow.state();
  console.log("   State pre: ", stateBefore.toString(), "(0=UNINITIALIZED)");

  const value = ethers.utils.parseEther(seedEth);
  const tx = await escrow.openRegistration({ value });
  console.log("   tx hash:   ", tx.hash);
  const rcpt = await tx.wait();
  console.log("   mined in block:", rcpt.blockNumber);

  const stateAfter = await escrow.state();
  const prizePool = await escrow.prizePool();
  console.log("\n📋 Post-open state:");
  console.log(
    "   state:        ",
    stateAfter.toString(),
    "(1=REGISTRATION_OPEN)",
  );
  console.log("   prizePool:    ", ethers.utils.formatEther(prizePool), "ETH");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
