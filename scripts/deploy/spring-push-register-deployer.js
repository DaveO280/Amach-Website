/**
 * Register the deployer wallet as a participant in SpringPushEscrowV1.
 *
 * Usage:
 *   ESCROW_ADDRESS=0x... \
 *   pnpm exec hardhat run scripts/deploy/spring-push-register-deployer.js \
 *     --network zksyncSepolia --no-compile
 *
 * Env vars:
 *   ESCROW_ADDRESS   required — deployed SpringPushEscrowV1 address
 *                    (defaults to the vibrant-hawking-316975 deployment)
 */

/* eslint-disable no-console */
const { ethers } = require("hardhat");

const DEFAULT_ESCROW = "0x07EDbAd94B23b44a3dAfe83E913Ad7C3D493b985";

async function main() {
  const escrowAddress = process.env.ESCROW_ADDRESS || DEFAULT_ESCROW;

  if (!ethers.utils.isAddress(escrowAddress)) {
    console.error("❌ ESCROW_ADDRESS is not a valid address:", escrowAddress);
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(signer.address);

  console.log("📝 Registering deployer as Spring Push participant");
  console.log(
    "   Network:  ",
    network.name,
    "(chainId:",
    network.chainId + ")",
  );
  console.log("   Escrow:   ", escrowAddress);
  console.log("   Caller:   ", signer.address);
  console.log("   Balance:  ", ethers.utils.formatEther(balance), "ETH");
  console.log("");

  const escrow = await ethers.getContractAt(
    "SpringPushEscrowV1",
    escrowAddress,
  );

  // Sanity-checks before sending tx
  const state = await escrow.state();
  if (state.toString() !== "1") {
    console.error(
      "❌ Contract is not in REGISTRATION_OPEN state (state =",
      state.toString() + ")",
    );
    process.exit(1);
  }

  const alreadyRegistered = await escrow.registered(signer.address);
  if (alreadyRegistered) {
    console.log("ℹ️  Wallet is already registered — nothing to do.");
    const count = await escrow.participantCount();
    console.log("   Participant count:", count.toString());
    return;
  }

  const max = await escrow.MAX_PARTICIPANTS();
  const count = await escrow.participantCount();
  console.log(
    "   Participants before: " + count.toString() + " / " + max.toString(),
  );

  const tx = await escrow.register();
  console.log("   tx hash:  ", tx.hash);
  const rcpt = await tx.wait();
  console.log("   mined in block:", rcpt.blockNumber);

  const countAfter = await escrow.participantCount();
  const isRegistered = await escrow.registered(signer.address);

  console.log("\n✅ Registration confirmed");
  console.log(
    "   Participants after:  " + countAfter.toString() + " / " + max.toString(),
  );
  console.log("   registered[" + signer.address + "] =", isRegistered);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
