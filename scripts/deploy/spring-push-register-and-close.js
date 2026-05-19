/**
 * One-shot: registers caller, prints participant list, then closes registration.
 *
 * Env: ESCROW_ADDRESS, optional REGISTER_ONLY=true to skip closeRegistration.
 */

/* eslint-disable no-console */
const { ethers } = require("hardhat");

async function main() {
  const escrowAddress = process.env.ESCROW_ADDRESS;
  if (!escrowAddress || !ethers.utils.isAddress(escrowAddress)) {
    console.error("❌ ESCROW_ADDRESS missing or invalid");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  const escrow = await ethers.getContractAt(
    "SpringPushEscrowV1",
    escrowAddress,
  );

  console.log("🟢 register + closeRegistration on SpringPushEscrowV1");
  console.log("   Escrow: ", escrowAddress);
  console.log("   Caller: ", signer.address);

  const stateBefore = await escrow.state();
  const countBefore = await escrow.participantCount();
  console.log(
    "   state pre:",
    stateBefore.toString(),
    "participants:",
    countBefore.toString(),
  );

  const alreadyRegistered = await escrow.registered(signer.address);
  if (alreadyRegistered) {
    console.log("   ⚠️  caller already registered — skipping register()");
  } else {
    const txR = await escrow.register();
    console.log("   register tx:", txR.hash);
    const rR = await txR.wait();
    console.log("   register mined in block:", rR.blockNumber);
  }

  const countMid = await escrow.participantCount();
  console.log("\n📋 Participants:");
  for (let i = 0; i < countMid.toNumber(); i++) {
    const p = await escrow.participants(i);
    console.log(`   [${i}] ${p}`);
  }

  if (String(process.env.REGISTER_ONLY || "").toLowerCase() === "true") {
    console.log("\nREGISTER_ONLY=true — exiting before closeRegistration");
    return;
  }

  const contestDurationBn = await escrow.CONTEST_DURATION();
  const claimWindowBn = await escrow.CLAIM_WINDOW();

  console.log("\n🟡 calling closeRegistration()...");
  const txC = await escrow.closeRegistration();
  console.log("   close tx:", txC.hash);
  const rC = await txC.wait();
  console.log("   close mined in block:", rC.blockNumber);

  const stateAfter = await escrow.state();
  const contestCloseTime = await escrow.contestCloseTime();
  const claimWindowEndTime = await escrow.claimWindowEndTime();
  const block = await ethers.provider.getBlock(rC.blockNumber);

  console.log("\n📋 Post-close state:");
  console.log(
    "   state:             ",
    stateAfter.toString(),
    "(2=ACTIVE, 5=FAILED)",
  );
  console.log(
    "   block timestamp:   ",
    block.timestamp,
    "→",
    new Date(block.timestamp * 1000).toISOString(),
  );
  console.log("   CONTEST_DURATION:  ", contestDurationBn.toString(), "sec");
  console.log("   CLAIM_WINDOW:      ", claimWindowBn.toString(), "sec");
  console.log(
    "   contestCloseTime:  ",
    contestCloseTime.toString(),
    "→",
    new Date(contestCloseTime.toNumber() * 1000).toISOString(),
  );
  console.log(
    "   claimWindowEndTime:",
    claimWindowEndTime.toString(),
    "→",
    new Date(claimWindowEndTime.toNumber() * 1000).toISOString(),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
