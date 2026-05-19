/**
 * Calls closeRegistration() on a deployed SpringPushEscrowV1.
 * Does NOT register the caller — assumes minParticipants is already met.
 *
 * Env: ESCROW_ADDRESS (required)
 */

/* eslint-disable no-console */
const { ethers } = require("hardhat");

async function main() {
  const escrowAddress = process.env.ESCROW_ADDRESS;
  if (!escrowAddress || !ethers.utils.isAddress(escrowAddress)) {
    console.error("ESCROW_ADDRESS missing or invalid");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  const escrow = await ethers.getContractAt(
    "SpringPushEscrowV1",
    escrowAddress,
  );

  console.log("closeRegistration() on SpringPushEscrowV1");
  console.log("  Escrow:", escrowAddress);
  console.log("  Caller:", signer.address);

  const stateBefore = await escrow.state();
  const countBefore = await escrow.participantCount();
  console.log(
    "  state pre:",
    stateBefore.toString(),
    "participants:",
    countBefore.toString(),
  );

  console.log("\nParticipants:");
  for (let i = 0; i < countBefore.toNumber(); i++) {
    const p = await escrow.participants(i);
    console.log(`  [${i}] ${p}`);
  }

  if (stateBefore.toString() !== "1") {
    console.error(
      `\nContract not in REGISTRATION_OPEN (state=1). Current state=${stateBefore}. Aborting.`,
    );
    process.exit(1);
  }

  console.log("\ncalling closeRegistration()...");
  const txC = await escrow.closeRegistration();
  console.log("  close tx:", txC.hash);
  const rC = await txC.wait();
  console.log("  mined in block:", rC.blockNumber);

  const stateAfter = await escrow.state();
  const contestCloseTime = await escrow.contestCloseTime();
  const claimWindowEndTime = await escrow.claimWindowEndTime();
  const block = await ethers.provider.getBlock(rC.blockNumber);

  console.log("\nPost-close state:");
  console.log(
    "  state:             ",
    stateAfter.toString(),
    "(2=ACTIVE, 5=FAILED)",
  );
  console.log(
    "  block timestamp:   ",
    block.timestamp,
    "->",
    new Date(block.timestamp * 1000).toISOString(),
  );
  console.log(
    "  contestCloseTime:  ",
    contestCloseTime.toString(),
    "->",
    new Date(contestCloseTime.toNumber() * 1000).toISOString(),
  );
  console.log(
    "  claimWindowEndTime:",
    claimWindowEndTime.toString(),
    "->",
    new Date(claimWindowEndTime.toNumber() * 1000).toISOString(),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
