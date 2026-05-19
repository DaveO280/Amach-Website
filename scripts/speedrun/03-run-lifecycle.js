#!/usr/bin/env node
/**
 * Spring Push speed-run — Step 3: full contest lifecycle on zkSync Sepolia.
 *
 *   openRegistration → register → closeRegistration (ACTIVE)
 *   submitProof → wait for active+claim windows → finalize → claimPrize
 *
 * Reads the most recent escrow + proof artifacts:
 *   /Users/dave/Amach-Website/.../deployments/spring-push-escrow-*.json
 *   /tmp/spring-push-speedrun/{roots.json,proof.json}
 *
 * Writes step-by-step transaction receipts to:
 *   /tmp/spring-push-speedrun/lifecycle.json
 *
 * Env:
 *   PRIVATE_KEY        required — deployer + admin + sole participant key
 *   ESCROW_ADDRESS     optional — override the auto-discovered escrow
 *   PRIZE_POOL_ETH     optional — default 0.001
 *   ENTRY_FEE_ETH      optional — default 0.0001
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEPLOY_DIR = path.join(REPO_ROOT, "deployments");
const SPEEDRUN_DIR = "/tmp/spring-push-speedrun";
const LIFECYCLE_OUT = path.join(SPEEDRUN_DIR, "lifecycle.json");

const RPC = "https://sepolia.era.zksync.dev";

const ESCROW_ABI = [
  "function openRegistration(bytes32 baselineRoot) payable",
  "function register() payable",
  "function closeRegistration()",
  "function submitProof(bytes proof, uint256[4] pubSignals)",
  "function finalize(address[] sortedParticipants)",
  "function claimPrize()",
  "function state() view returns (uint8)",
  "function baselineRoot() view returns (bytes32)",
  "function prizePool() view returns (uint256)",
  "function entryFeesTotal() view returns (uint256)",
  "function totalClaimed() view returns (uint256)",
  "function qualifierCount() view returns (uint256)",
  "function participantCount() view returns (uint256)",
  "function improvementBp(address) view returns (uint256)",
  "function participantRank(address) view returns (uint256)",
  "function claimed(address) view returns (bool)",
  "function CONTEST_DURATION() view returns (uint256)",
  "function CLAIM_WINDOW() view returns (uint256)",
  "function contestStartTime() view returns (uint256)",
  "function contestCloseTime() view returns (uint256)",
  "function claimWindowEndTime() view returns (uint256)",
  "function previewPrizeFor(address) view returns (uint256, uint8)",
  "event ContestOpened(uint256 prizePool, uint256 startTime, bytes32 baselineRoot)",
  "event ParticipantRegistered(address indexed participant, uint256 entryFee)",
  "event RegistrationClosed(uint256 participantCount, uint8 state)",
  "event ProofSubmitted(address indexed participant, uint256 improvementBp)",
  "event ContestFinalized(uint256 qualifierCount)",
  "event PrizeClaimed(address indexed participant, uint256 amount, uint8 tier)",
];

const STATE_NAMES = [
  "UNINITIALIZED",
  "REGISTRATION_OPEN",
  "ACTIVE",
  "CLAIMING",
  "FINISHED",
  "FAILED",
];

function findLatestEscrow() {
  const files = fs
    .readdirSync(DEPLOY_DIR)
    .filter((f) => /^spring-push-escrow-\d+\.json$/.test(f))
    .sort();
  if (files.length === 0)
    throw new Error("No spring-push-escrow-*.json deployment found");
  return JSON.parse(
    fs.readFileSync(path.join(DEPLOY_DIR, files[files.length - 1]), "utf8"),
  );
}

/**
 * Encode snarkjs proof into the (uint[2] pA, uint[2][2] pB, uint[2] pC) form
 * the on-chain snarkjs verifier expects, then ABI-encode to bytes for the
 * adapter's verifyProof(bytes, uint256[4]) entry point.
 *
 * snarkjs output uses jacobian (x, y, z) form — z=1 is implicit, drop it.
 * For pi_b the BN254 G2 element pair is reversed in the serialized form
 * (ApB1 = [pi_b[0][1], pi_b[0][0]], ApB2 = [pi_b[1][1], pi_b[1][0]]).
 */
function encodeProofForAdapter(proof) {
  const pA = [proof.pi_a[0], proof.pi_a[1]];
  const pB = [
    [proof.pi_b[0][1], proof.pi_b[0][0]],
    [proof.pi_b[1][1], proof.pi_b[1][0]],
  ];
  const pC = [proof.pi_c[0], proof.pi_c[1]];

  return ethers.utils.defaultAbiCoder.encode(
    ["uint256[2]", "uint256[2][2]", "uint256[2]"],
    [pA, pB, pC],
  );
}

async function txReport(label, txPromise, log) {
  const tx = await txPromise;
  const r = await tx.wait();
  const entry = {
    label,
    txHash: r.transactionHash,
    blockNumber: r.blockNumber,
    gasUsed: r.gasUsed.toString(),
    effectiveGasPrice: r.effectiveGasPrice
      ? r.effectiveGasPrice.toString()
      : null,
    status: r.status,
  };
  log.push(entry);
  console.log(
    `  ✓ ${label}: tx=${r.transactionHash} gas=${r.gasUsed.toString()}`,
  );
  return r;
}

async function dumpStateLine(escrow, prefix = "") {
  const [s, prize, fees, qc, pc] = await Promise.all([
    escrow.state(),
    escrow.prizePool(),
    escrow.entryFeesTotal(),
    escrow.qualifierCount(),
    escrow.participantCount(),
  ]);
  console.log(
    `  ${prefix}state=${STATE_NAMES[s]} prize=${ethers.utils.formatEther(prize)} fees=${ethers.utils.formatEther(fees)} qualifiers=${qc.toString()} participants=${pc.toString()}`,
  );
  return {
    state: STATE_NAMES[s],
    prizePool: prize.toString(),
    entryFeesTotal: fees.toString(),
    qualifierCount: qc.toString(),
    participantCount: pc.toString(),
  };
}

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(RPC);
  if (!process.env.PRIVATE_KEY) {
    console.error("PRIVATE_KEY not set");
    process.exit(1);
  }
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const escrowDeployment = process.env.ESCROW_ADDRESS
    ? { address: process.env.ESCROW_ADDRESS }
    : findLatestEscrow();
  const escrowAddress = escrowDeployment.address;

  const escrow = new ethers.Contract(escrowAddress, ESCROW_ABI, wallet);

  console.log(`▶ Spring Push speed-run lifecycle`);
  console.log(`   escrow:       ${escrowAddress}`);
  console.log(`   admin/player: ${wallet.address}`);
  const balance0 = await provider.getBalance(wallet.address);
  console.log(`   start balance: ${ethers.utils.formatEther(balance0)} ETH`);

  const roots = JSON.parse(
    fs.readFileSync(path.join(SPEEDRUN_DIR, "roots.json"), "utf8"),
  );
  const proofData = JSON.parse(
    fs.readFileSync(path.join(SPEEDRUN_DIR, "proof.json"), "utf8"),
  );

  const txLog = [];
  const result = {
    escrowAddress,
    deployer: wallet.address,
    baselineRoot: roots.baselineRoot,
    finishRoot: roots.finishRoot,
    startTime: new Date().toISOString(),
    initialBalance: balance0.toString(),
    txLog,
    states: [],
  };

  // --- Step 1: openRegistration -------------------------------------------
  await dumpStateLine(escrow, "before openRegistration: ");
  const prizePoolEth = process.env.PRIZE_POOL_ETH || "0.001";
  console.log(
    `▶ openRegistration with prize pool ${prizePoolEth} ETH, baselineRoot=${roots.baselineRoot}`,
  );
  await txReport(
    "openRegistration",
    escrow.openRegistration(roots.baselineRoot, {
      value: ethers.utils.parseEther(prizePoolEth),
    }),
    txLog,
  );
  result.states.push(await dumpStateLine(escrow, "after openRegistration:  "));

  // --- Step 2: register ---------------------------------------------------
  const entryEth = process.env.ENTRY_FEE_ETH || "0.0001";
  console.log(`▶ register with entry fee ${entryEth} ETH`);
  await txReport(
    "register",
    escrow.register({ value: ethers.utils.parseEther(entryEth) }),
    txLog,
  );
  result.states.push(await dumpStateLine(escrow, "after register:          "));

  // --- Step 3: closeRegistration ------------------------------------------
  console.log("▶ closeRegistration → expect ACTIVE");
  await txReport("closeRegistration", escrow.closeRegistration(), txLog);
  result.states.push(await dumpStateLine(escrow, "after closeRegistration: "));

  const [contestStart, contestClose, claimEnd] = await Promise.all([
    escrow.contestStartTime(),
    escrow.contestCloseTime(),
    escrow.claimWindowEndTime(),
  ]);
  console.log(
    `   contest window: ${new Date(contestStart * 1000).toISOString()} → ${new Date(contestClose * 1000).toISOString()}`,
  );
  console.log(
    `   claim window ends: ${new Date(claimEnd * 1000).toISOString()}`,
  );

  // --- Step 4: submitProof ------------------------------------------------
  const proofBytes = encodeProofForAdapter(proofData.proof);
  // Map circuit's 5 public signals → escrow's 4 (drop signFlag).
  const pubSignals4 = [
    ethers.BigNumber.from(proofData.publicSignals[0]), // baselineRoot
    ethers.BigNumber.from(proofData.publicSignals[1]), // finishRoot
    ethers.BigNumber.from(proofData.publicSignals[2]), // metricPointer
    ethers.BigNumber.from(proofData.publicSignals[3]), // claimedMagnitudeBp
  ];
  console.log(
    `▶ submitProof — proof bytes length=${(proofBytes.length - 2) / 2}, pubSignals=[root, finishRoot, ${pubSignals4[2].toString()}, ${pubSignals4[3].toString()}]`,
  );
  await txReport(
    "submitProof",
    escrow.submitProof(proofBytes, pubSignals4),
    txLog,
  );
  result.states.push(await dumpStateLine(escrow, "after submitProof:       "));
  const submittedBp = await escrow.improvementBp(wallet.address);
  console.log(
    `   improvementBp recorded for ${wallet.address}: ${submittedBp.toString()}`,
  );
  result.improvementBpOnChain = submittedBp.toString();

  // --- Step 5: wait for the claim window to elapse ------------------------
  const now = Math.floor(Date.now() / 1000);
  const sleepFor = Math.max(0, claimEnd.toNumber() - now) + 5; // +5s slack
  console.log(`▶ waiting ${sleepFor}s for ACTIVE+CLAIMING windows to elapse…`);
  await new Promise((r) => setTimeout(r, sleepFor * 1000));

  // Force a state read so the auto-advance fires through a tx if needed.
  // _advanceFromActiveIfElapsed only fires on writes, so the public state()
  // view may still report ACTIVE here. finalize() will trigger the advance.
  await dumpStateLine(escrow, "after wait (pre-finalize): ");

  // --- Step 6: finalize ---------------------------------------------------
  console.log("▶ finalize with sole participant");
  await txReport("finalize", escrow.finalize([wallet.address]), txLog);
  result.states.push(await dumpStateLine(escrow, "after finalize:          "));
  const rank = await escrow.participantRank(wallet.address);
  console.log(`   participantRank: ${rank.toString()}`);
  result.rankOnChain = rank.toString();

  // --- Step 7: claimPrize -------------------------------------------------
  const [previewAmt, previewTier] = await escrow.previewPrizeFor(
    wallet.address,
  );
  console.log(
    `▶ claimPrize — preview ${ethers.utils.formatEther(previewAmt)} ETH (tier ${previewTier}) + entry refund`,
  );
  const balBefore = await provider.getBalance(wallet.address);
  const claimRcpt = await txReport("claimPrize", escrow.claimPrize(), txLog);
  result.states.push(await dumpStateLine(escrow, "after claimPrize:        "));

  const balAfter = await provider.getBalance(wallet.address);
  const gasCostClaim = claimRcpt.gasUsed.mul(claimRcpt.effectiveGasPrice || 0);
  const netReceived = balAfter.sub(balBefore).add(gasCostClaim);
  console.log(
    `   net received (prize + entry refund): ${ethers.utils.formatEther(netReceived)} ETH`,
  );

  result.previewPrize = previewAmt.toString();
  result.previewTier = previewTier;
  result.netReceivedOnClaim = netReceived.toString();
  result.endingBalance = balAfter.toString();
  result.endTime = new Date().toISOString();

  fs.writeFileSync(LIFECYCLE_OUT, JSON.stringify(result, null, 2));
  console.log(`\n✅ lifecycle complete — wrote ${LIFECYCLE_OUT}`);
}

main().catch((e) => {
  console.error("\n❌ lifecycle failed:", e);
  try {
    if (e.transaction) console.error("   tx:", e.transaction);
    if (e.receipt)
      console.error("   receipt:", JSON.stringify(e.receipt, null, 2));
    if (e.error && e.error.body) console.error("   body:", e.error.body);
  } catch (_) {}
  process.exit(1);
});
