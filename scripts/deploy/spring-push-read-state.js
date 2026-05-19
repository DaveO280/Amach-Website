/**
 * Read-only state dump for SpringPushEscrowV1.
 *
 * Env: ESCROW_ADDRESS (required), PARTICIPANT (optional - defaults to participant 1)
 */

/* eslint-disable no-console */
const { ethers } = require("hardhat");

async function main() {
  const escrowAddress = process.env.ESCROW_ADDRESS;
  if (!escrowAddress || !ethers.utils.isAddress(escrowAddress)) {
    console.error("ESCROW_ADDRESS missing or invalid");
    process.exit(1);
  }

  const escrow = await ethers.getContractAt(
    "SpringPushEscrowV1",
    escrowAddress,
  );

  const state = await escrow.state();
  const contestCloseTime = await escrow.contestCloseTime();
  const claimWindowEndTime = await escrow.claimWindowEndTime();
  const totalClaimed = await escrow.totalClaimed();
  const prizePool = await escrow.prizePool();
  const qualifierCount = await escrow.qualifierCount();
  const participantCount = await escrow.participantCount();

  const target =
    process.env.PARTICIPANT || "0x58147e61cc2683295c6eD00D5daeB8052B3D0c87";
  const registered = await escrow.registered(target);
  const improvementBp = await escrow.improvementBp(target);
  const claimed = await escrow.claimed(target);
  const rank = await escrow.participantRank(target);

  const now = Math.floor(Date.now() / 1000);
  const block = await ethers.provider.getBlock("latest");

  console.log("SpringPushEscrowV1 state @", escrowAddress);
  console.log(
    "  block:               ",
    block.number,
    "ts=",
    block.timestamp,
    "->",
    new Date(block.timestamp * 1000).toISOString(),
  );
  console.log(
    "  local now:           ",
    now,
    "->",
    new Date(now * 1000).toISOString(),
  );
  console.log("");
  console.log(
    "  state():              ",
    state.toString(),
    "(0=UNINITIALIZED, 1=REGISTRATION_OPEN, 2=ACTIVE, 3=CLAIMING, 4=FINALIZED, 5=FAILED)",
  );
  console.log(
    "  contestCloseTime():   ",
    contestCloseTime.toString(),
    "->",
    new Date(contestCloseTime.toNumber() * 1000).toISOString(),
  );
  console.log(
    "  claimWindowEndTime(): ",
    claimWindowEndTime.toString(),
    "->",
    new Date(claimWindowEndTime.toNumber() * 1000).toISOString(),
  );
  console.log(
    "  totalClaimed():       ",
    totalClaimed.toString(),
    "wei =",
    ethers.utils.formatEther(totalClaimed),
    "ETH",
  );
  console.log(
    "  prizePool:            ",
    prizePool.toString(),
    "wei =",
    ethers.utils.formatEther(prizePool),
    "ETH",
  );
  console.log("  qualifierCount:       ", qualifierCount.toString());
  console.log("  participantCount:     ", participantCount.toString());
  console.log("");
  console.log("  Target participant:   ", target);
  console.log("    registered:         ", registered);
  console.log(
    "    improvementBp:      ",
    improvementBp.toString(),
    "(0 = no proof submitted)",
  );
  console.log("    claimed:            ", claimed);
  console.log("    participantRank:    ", rank.toString(), "(0 = unranked)");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
