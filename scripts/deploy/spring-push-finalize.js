/**
 * Calls finalize() on a deployed SpringPushEscrowV1.
 *
 * Reads all participants, reads each improvementBp, builds the
 * descending-sorted list of qualifiers (improvementBp > 0), and submits.
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

  const adminOnChain = await escrow.ADMIN();
  if (adminOnChain.toLowerCase() !== signer.address.toLowerCase()) {
    console.error(`Caller ${signer.address} is not ADMIN ${adminOnChain}`);
    process.exit(1);
  }

  const state = await escrow.state();
  const claimWindowEndTime = await escrow.claimWindowEndTime();
  const latest = await ethers.provider.getBlock("latest");

  console.log("finalize() on SpringPushEscrowV1");
  console.log("  Escrow:               ", escrowAddress);
  console.log("  Caller:               ", signer.address);
  console.log(
    "  state pre:            ",
    state.toString(),
    "(3=CLAIMING required)",
  );
  console.log("  claimWindowEndTime:   ", claimWindowEndTime.toString());
  console.log("  latest block ts:      ", latest.timestamp);

  if (state.toString() !== "3") {
    console.error(
      `State is ${state} — finalize requires CLAIMING (3). Aborting.`,
    );
    process.exit(1);
  }
  if (latest.timestamp <= claimWindowEndTime.toNumber()) {
    console.error("claim window has not yet elapsed. Aborting.");
    process.exit(1);
  }

  const count = (await escrow.participantCount()).toNumber();
  const rows = [];
  for (let i = 0; i < count; i++) {
    const addr = await escrow.participants(i);
    const imp = await escrow.improvementBp(addr);
    rows.push({ addr, imp: imp.toBigInt() });
  }

  console.log("\nParticipants & improvementBp:");
  for (const r of rows) {
    console.log(`  ${r.addr}  bp=${r.imp.toString()}`);
  }

  const qualifiers = rows
    .filter((r) => r.imp > 0n)
    .sort((a, b) => (a.imp < b.imp ? 1 : a.imp > b.imp ? -1 : 0));

  console.log("\nSorted qualifiers to submit:");
  qualifiers.forEach((r, i) =>
    console.log(`  [${i + 1}] ${r.addr}  bp=${r.imp.toString()}`),
  );

  if (qualifiers.length === 0) {
    console.error(
      "\nNo qualifiers — finalize would revert (NotQualified). Aborting.",
    );
    process.exit(1);
  }

  const addrs = qualifiers.map((r) => r.addr);
  console.log("\ncalling finalize()...");
  const tx = await escrow.finalize(addrs);
  console.log("  finalize tx:", tx.hash);
  const rcpt = await tx.wait();
  console.log("  mined in block:", rcpt.blockNumber);

  const stateAfter = await escrow.state();
  const qualifierCount = await escrow.qualifierCount();
  console.log("\nPost-finalize state:");
  console.log(
    "  state:               ",
    stateAfter.toString(),
    "(4=FINISHED expected)",
  );
  console.log("  qualifierCount:      ", qualifierCount.toString());
  for (const r of qualifiers) {
    const rank = await escrow.participantRank(r.addr);
    console.log(`  rank[${r.addr}] = ${rank.toString()}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
