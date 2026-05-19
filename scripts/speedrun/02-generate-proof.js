#!/usr/bin/env node
/**
 * Spring Push speed-run — Step 2: generate the AverageImprovementProof.
 *
 * Reads the 90-leaf baseline + finish arrays produced by step 1, hands them
 * to the iOS-side witness builder (claude/unruffled-rosalind-0e2d1e
 * worktree of AmachHealth-iOS, where the depth-7 circuit + zkey live), and
 * runs snarkjs.groth16.fullProve.
 *
 * Verifies the witness builder's reconstructed root matches the on-chain
 * commitment computed in step 1 BEFORE proving — saves a 30-second prove
 * on a guaranteed-bad input.
 *
 * Output:
 *   /tmp/spring-push-speedrun/proof.json
 *     { proof: { pi_a, pi_b, pi_c }, publicSignals: [5], proveMs }
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

// iOS-side artifact paths (the only worktree where the improvement circuit is built).
const IOS_ZK_ROOT =
  "/Users/dave/AmachHealth-iOS/.claude/worktrees/unruffled-rosalind-0e2d1e/zk";
const WASM = path.join(
  IOS_ZK_ROOT,
  "build/improvement/improvement_js/improvement.wasm",
);
const ZKEY = path.join(IOS_ZK_ROOT, "build/improvement/improvement_final.zkey");
const VKEY_PATH = path.join(
  IOS_ZK_ROOT,
  "build/improvement/verification_key.json",
);

const { buildImprovementWitness } = require(
  path.join(IOS_ZK_ROOT, "scripts/build_improvement_witness.js"),
);
const snarkjs = require(path.join(IOS_ZK_ROOT, "node_modules/snarkjs"));

const OUT_DIR = "/tmp/spring-push-speedrun";

const N = 2;
const M = 2;
const DEPTH = 7;
const METRIC_CHUNK_IDX = 2;
const METRIC_BYTE_OFFSET_IN_CHUNK = 2; // VO2 max byte position in chunk 2

function unstringify(o) {
  if (typeof o === "string") {
    if (/^[0-9]+$/.test(o)) return BigInt(o);
    return o;
  }
  if (Array.isArray(o)) return o.map(unstringify);
  if (o && typeof o === "object") {
    const out = {};
    for (const [k, v] of Object.entries(o)) out[k] = unstringify(v);
    return out;
  }
  return o;
}

function asBytes32(v) {
  let hex = BigInt(v).toString(16);
  return "0x" + hex.padStart(64, "0");
}

(async function main() {
  console.log("▶ Generating AverageImprovementProof…");

  for (const f of [WASM, ZKEY, VKEY_PATH]) {
    if (!fs.existsSync(f)) {
      console.error("Missing circuit artifact:", f);
      process.exit(1);
    }
  }

  const baseline = JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, "baseline.json"), "utf8"),
  );
  const finish = JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, "finish.json"), "utf8"),
  );
  const expectedRoots = JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, "roots.json"), "utf8"),
  );

  const baselineLeaves = baseline.leaves.map((h) => Buffer.from(h, "hex"));
  const finishLeaves = finish.leaves.map((h) => Buffer.from(h, "hex"));

  console.log(
    `  ✓ loaded ${baselineLeaves.length} baseline + ${finishLeaves.length} finish leaves`,
  );

  const { input, meta } = buildImprovementWitness({
    baselineLeaves,
    finishLeaves,
    baselineIndices: [0, 1],
    finishIndices: [0, 1],
    metricChunkIdx: METRIC_CHUNK_IDX,
    metricByteOffsetInChunk: METRIC_BYTE_OFFSET_IN_CHUNK,
    N,
    M,
    depth: DEPTH,
  });

  // Sanity: witness builder's reconstructed root must equal step-1's root.
  if (
    meta.baselineRoot.toLowerCase() !== expectedRoots.baselineRoot.toLowerCase()
  ) {
    // Pad witness root in case it's missing a leading zero.
    const wantBig = BigInt(expectedRoots.baselineRoot);
    const gotBig = BigInt(meta.baselineRoot);
    if (wantBig !== gotBig) {
      console.error("❌ witness baselineRoot mismatch:");
      console.error("   want", expectedRoots.baselineRoot);
      console.error("   got ", meta.baselineRoot);
      process.exit(1);
    }
  }
  if (BigInt(meta.finishRoot) !== BigInt(expectedRoots.finishRoot)) {
    console.error("❌ witness finishRoot mismatch:");
    console.error("   want", expectedRoots.finishRoot);
    console.error("   got ", meta.finishRoot);
    process.exit(1);
  }
  console.log(`  ✓ witness baselineRoot agrees with on-chain commitment`);
  console.log(`  ✓ witness finishRoot agrees with on-chain commitment`);
  console.log(
    `  ✓ baselineSum=${meta.baselineSum} finishSum=${meta.finishSum}`,
  );
  console.log(
    `  ✓ improvementBp=${meta.improvementBp} signFlag=${meta.signFlag} metricPointer=${meta.metricPointer}`,
  );

  if (meta.signFlag !== 0) {
    console.error(
      "❌ signFlag must be 0 (positive improvement) for adapter compatibility",
    );
    process.exit(1);
  }
  if (BigInt(meta.improvementBp) === 0n) {
    console.error("❌ improvementBp = 0 (escrow rejects)");
    process.exit(1);
  }

  console.log(
    "▶ Running snarkjs.groth16.fullProve (will take ~30-60s on a fresh circuit)…",
  );
  const t0 = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    unstringify(input),
    WASM,
    ZKEY,
  );
  const proveMs = performance.now() - t0;
  console.log(`  ✓ proof generated in ${Math.round(proveMs)}ms`);

  const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
  const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!verified) {
    console.error("❌ local verify failed — circuit/input mismatch");
    process.exit(1);
  }
  console.log(`  ✓ proof verifies locally against verification_key.json`);

  // Public signal layout: [baselineRoot, finishRoot, metricPointer, claimedMagnitudeBp, claimedSignFlag]
  console.log("  publicSignals:");
  publicSignals.forEach((s, i) => {
    const labels = [
      "baselineRoot",
      "finishRoot",
      "metricPointer",
      "claimedMagnitudeBp",
      "claimedSignFlag",
    ];
    console.log(`    [${i}] ${labels[i]}: ${asBytes32(s)} (${s})`);
  });

  fs.writeFileSync(
    path.join(OUT_DIR, "proof.json"),
    JSON.stringify(
      {
        proof,
        publicSignals,
        proveMs,
        meta,
      },
      null,
      2,
    ),
  );
  console.log(`  ✓ wrote ${path.join(OUT_DIR, "proof.json")}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
