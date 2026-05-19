#!/usr/bin/env node
/**
 * Spring Push speed-run — Step 1: synthetic baseline + finish datasets.
 *
 * Generates two 90-day series:
 *   - baseline: vo2max ≈ 40.0 ml/kg/min, flat
 *   - finish:   vo2max ≈ 44.0 ml/kg/min, flat (+10% improvement)
 *
 * Then overrides the first 2 leaves of each series with clean, snapped
 * vo2max values (400 / 440 wire units = 40.0 / 44.0 real) so the proof's
 * integer-bp equation closes exactly. The two-leaf prefix is what the
 * AverageImprovementProof circuit (N=2, M=2) will reference.
 *
 * Both 90-leaf arrays are then padded to depth 7 (128 leaves) and Merkle-
 * rooted; the baselineRoot becomes the on-chain commitment.
 *
 * Outputs:
 *   /tmp/spring-push-speedrun/baseline.json  — serialized leaves + meta
 *   /tmp/spring-push-speedrun/finish.json
 *   /tmp/spring-push-speedrun/roots.json     — baselineRoot, finishRoot (bytes32)
 */

"use strict";

const fs = require("fs");
const path = require("path");

const LEGIT_DIR = path.join(__dirname, "..", "legitimacy");
const {
  generateSeries,
  walletFromSeed,
  sourceHashFor,
  buildLeafV2,
  serializeLeafV2,
  buildMerkleTree,
} = require(path.join(LEGIT_DIR, "dist"));

const OUT_DIR = "/tmp/spring-push-speedrun";
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASELINE_VO2_REAL = 40.0;
const FINISH_VO2_REAL = 44.0;
const BASELINE_VO2_WIRE = 400; // = 40.0 * 10
const FINISH_VO2_WIRE = 440; // = 44.0 * 10
const SEED = "spring-push-speedrun-2026-05";
const START_DAY_ID = 19500;
const DAYS = 90;

function injectCleanPrefix(leaves, vo2maxWire, count = 2) {
  const wallet = leaves[0].wallet;
  const sourceHash = leaves[0].sourceHash;
  const tz = leaves[0].timezoneOffset;
  for (let i = 0; i < count; i++) {
    leaves[i] = buildLeafV2({
      wallet,
      dayId: leaves[i].dayId,
      timezoneOffset: tz,
      // Realistic floor values; the circuit only reads vo2max via metricPointer.
      steps: 9000,
      activeEnergy: 35000,
      exerciseMins: 30,
      hrv: 450,
      restingHR: 580,
      sleepMins: 450,
      workoutCount: 1,
      sourceCount: 1,
      // dataFlags: low byte (1..6), plus vo2max (bit 16).
      dataFlags: 1 | 2 | 4 | 8 | 16 | 32 | 64 | (1 << 16),
      vo2max: vo2maxWire,
      weight: 0,
      bodyFatPct: 0,
      leanMass: 0,
      deepSleepMins: 0,
      remSleepMins: 0,
      lightSleepMins: 0,
      awakeMins: 0,
      sourceHash,
    });
  }
}

function buildDepth7Root(leaves) {
  // Pad with the same dummy v2 leaf the iOS witness builder uses
  // (build_improvement_witness.js makeDummyLeaf), so on-chain root agrees
  // with whatever the prover reconstructs.
  const TARGET = 128; // 2^7
  const padded = leaves.slice();
  const dummy = Buffer.alloc(124, 0);
  dummy.writeUInt8(0x02, 0); // version
  dummy.writeUInt8(0x00, 1); // leafType
  dummy.writeUInt8(0x01, 2); // schemaVersion
  while (padded.length < TARGET) padded.push(dummy);
  if (padded.length !== TARGET) {
    throw new Error(
      `Tree size ${padded.length} ≠ ${TARGET} — too many leaves to fit depth 7.`,
    );
  }
  return buildMerkleTree(padded);
}

function asBytes32(rootBigInt) {
  let hex = rootBigInt.toString(16);
  if (hex.length > 64) throw new Error(`root overflows bytes32: ${hex}`);
  return "0x" + hex.padStart(64, "0");
}

function dumpDataset(label, gen, serializedHex) {
  return {
    label,
    seed: gen.config.seed,
    walletHex: "0x" + gen.config.wallet.toString("hex"),
    startDayId: gen.config.startDayId,
    days: gen.config.days,
    vo2maxStartReal: gen.config.vo2maxStart,
    vo2maxEndReal: gen.config.vo2maxEnd,
    leaves: serializedHex,
    leafCount: serializedHex.length,
  };
}

(function main() {
  console.log("▶ Spring Push speed-run — generating synthetic datasets…");

  const baselineGen = generateSeries({
    seed: SEED + ":baseline",
    wallet: walletFromSeed(SEED + ":participant"), // SAME wallet across both windows
    startDayId: START_DAY_ID,
    days: DAYS,
    age: 35,
    sex: "male",
    startingFitness: "average",
    vo2maxStart: BASELINE_VO2_REAL,
    vo2maxEnd: BASELINE_VO2_REAL,
    device: "apple-watch",
    noise: "mid",
    timezoneOffset: -300,
  });

  const finishGen = generateSeries({
    seed: SEED + ":finish",
    wallet: walletFromSeed(SEED + ":participant"),
    startDayId: START_DAY_ID + DAYS,
    days: DAYS,
    age: 35,
    sex: "male",
    startingFitness: "fit",
    vo2maxStart: FINISH_VO2_REAL,
    vo2maxEnd: FINISH_VO2_REAL,
    device: "apple-watch",
    noise: "mid",
    timezoneOffset: -300,
  });

  // Override leaves[0..1] with snapped clean values so the (b - a) / a equation
  // closes exactly at 1000 bp.
  injectCleanPrefix(baselineGen.leaves, BASELINE_VO2_WIRE, 2);
  injectCleanPrefix(finishGen.leaves, FINISH_VO2_WIRE, 2);

  const baselineBufs = baselineGen.leaves.map(serializeLeafV2);
  const finishBufs = finishGen.leaves.map(serializeLeafV2);

  console.log(
    `  ✓ baseline: ${baselineBufs.length} leaves, first vo2max wire = ${BASELINE_VO2_WIRE}`,
  );
  console.log(
    `  ✓ finish:   ${finishBufs.length} leaves, first vo2max wire = ${FINISH_VO2_WIRE}`,
  );

  const baselineTree = buildDepth7Root(baselineBufs);
  const finishTree = buildDepth7Root(finishBufs);

  const baselineRoot = asBytes32(baselineTree.root);
  const finishRoot = asBytes32(finishTree.root);
  console.log(`  ✓ baselineRoot: ${baselineRoot}`);
  console.log(`  ✓ finishRoot:   ${finishRoot}`);

  const baselineHex = baselineBufs.map((b) => b.toString("hex"));
  const finishHex = finishBufs.map((b) => b.toString("hex"));

  fs.writeFileSync(
    path.join(OUT_DIR, "baseline.json"),
    JSON.stringify(dumpDataset("baseline", baselineGen, baselineHex), null, 2),
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "finish.json"),
    JSON.stringify(dumpDataset("finish", finishGen, finishHex), null, 2),
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "roots.json"),
    JSON.stringify(
      {
        baselineRoot,
        finishRoot,
        baselineRootDecimal: baselineTree.root.toString(10),
        finishRootDecimal: finishTree.root.toString(10),
        depth: 7,
        treeSize: 128,
        leafCount: baselineBufs.length,
        metricPointer: 64, // VO2 max — chunk 2 (offset 62) + 2 = byte 64
        cleanWindow: {
          baselineIndices: [0, 1],
          finishIndices: [0, 1],
          baselineVo2maxWire: BASELINE_VO2_WIRE,
          finishVo2maxWire: FINISH_VO2_WIRE,
          claimedImprovementBp: 1000,
        },
      },
      null,
      2,
    ),
  );

  console.log("  ✓ wrote baseline.json, finish.json, roots.json to", OUT_DIR);
})();
