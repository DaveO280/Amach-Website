#!/usr/bin/env tsx
/**
 * test-spring-push-proof.ts
 *
 * Exercises the Spring Push improvement-proof flow end-to-end without
 * touching Storj or the dev server:
 *   1. Builds synthetic v2 baseline + finish leaves with realistic health
 *      values that show meaningful VO2max + steps improvement.
 *   2. Picks indices the same way the wallet-keyed entry point does
 *      (`pickIndicesByMetric` — lowest-non-zero baseline, highest finish).
 *   3. Calls `buildImprovementWitnessFromLeaves` to produce the snarkjs
 *      witness input, prints the public signals.
 *   4. Loads `improvement.wasm` + `improvement_final.zkey` from
 *      `public/zk/improvement/` and runs `snarkjs.groth16.fullProve`.
 *   5. Verifies the resulting proof against `verification_key.json` and
 *      reports the final public signals.
 *
 * Run: pnpm exec tsx scripts/test-spring-push-proof.ts
 */

import { readFileSync } from "fs";
import path from "path";
import {
  buildImprovementWitnessFromLeaves,
  serializeLeafV2,
  __internal,
  type AmachLeafV2Fields,
} from "../src/zk/improvementWitnessBuilder";

// snarkjs ships no TS types — cast through unknown.
import * as snarkjs from "snarkjs";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixture: realistic baseline + finish v2 daily summaries
// ─────────────────────────────────────────────────────────────────────────────

/** Wallet address baked into every leaf (bytes 4..35 of the v2 layout). The
 *  Merkle root depends on this — override it via TEST_WALLET=0x… when you
 *  need to precompute the root for a specific wallet (e.g. for
 *  `openRegistration(baselineRoot)`). Defaults to `TEST_CONFIG.TEST_WALLETS[0]`
 *  in `src/lib/test-config.ts`. */
const TEST_WALLET =
  process.env.TEST_WALLET ?? "0x1234567890123456789012345678901234567890";

/** Build a v2 daily-summary leaf with the supplied overrides on top of
 *  realistic defaults. vo2max + steps + restingHR + hrv default to a healthy
 *  baseline so the resulting leaf is well-formed even if the caller only
 *  overrides one metric. */
function leafForDay(
  dayId: number,
  overrides: Partial<AmachLeafV2Fields> = {},
): AmachLeafV2Fields {
  return {
    wallet: TEST_WALLET,
    dayId,
    timezoneOffset: -300,
    steps: 8500,
    activeEnergy: 35000,
    exerciseMins: 40,
    hrv: 42,
    restingHR: 58,
    sleepMins: 450,
    workoutCount: 1,
    sourceCount: 2,
    dataFlags: 0x0000_03ff,
    vo2max: 400,
    weight: 7800,
    bodyFatPct: 1850,
    leanMass: 6300,
    deepSleepMins: 75,
    remSleepMins: 95,
    lightSleepMins: 240,
    awakeMins: 20,
    ...overrides,
  };
}

// The circuit enforces `claimedMagnitude * baselineCross === diff * 10000`
// as strict equality, so the chosen baseline + finish vo2max values must
// make the honest improvement land on an integer bp. We pick the two lowest
// baseline (sum = 490 + 510 = 1000) and two highest finish (sum = 620 + 600
// = 1220). With N=M=2 → baselineCross = 2000, finishCross = 2440, diff = 440,
// claimedMagnitudeBp = 440 * 10000 / 2000 = 2200 (i.e. +22.00%).
const BASELINE_LEAVES: AmachLeafV2Fields[] = [
  leafForDay(0, { steps: 7800, hrv: 38, restingHR: 62, vo2max: 490 }),
  leafForDay(1, { steps: 8100, hrv: 40, restingHR: 61, vo2max: 510 }),
  leafForDay(2, { steps: 7950, hrv: 39, restingHR: 60, vo2max: 530 }),
  leafForDay(3, { steps: 8200, hrv: 41, restingHR: 60, vo2max: 550 }),
];

const FINISH_LEAVES: AmachLeafV2Fields[] = [
  leafForDay(90, { steps: 11200, hrv: 52, restingHR: 55, vo2max: 600 }),
  leafForDay(91, { steps: 10800, hrv: 50, restingHR: 56, vo2max: 580 }),
  leafForDay(92, { steps: 11500, hrv: 54, restingHR: 54, vo2max: 590 }),
  leafForDay(93, { steps: 12000, hrv: 55, restingHR: 53, vo2max: 620 }),
];

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

interface SnarkjsModule {
  groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasm: ArrayBuffer | Uint8Array | string,
      zkey: ArrayBuffer | Uint8Array | string,
    ): Promise<{
      proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] };
      publicSignals: string[];
    }>;
    verify(
      vkey: Record<string, unknown>,
      publicSignals: string[],
      proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] },
    ): Promise<boolean>;
  };
}

async function main(): Promise<void> {
  console.log("─".repeat(72));
  console.log("Spring Push improvement-proof end-to-end test");
  console.log("─".repeat(72));
  console.log(`Test wallet: ${TEST_WALLET}`);
  console.log(
    `Baseline leaves: ${BASELINE_LEAVES.length} (days ${BASELINE_LEAVES.map((l) => l.dayId).join(", ")})`,
  );
  console.log(
    `Finish leaves:   ${FINISH_LEAVES.length} (days ${FINISH_LEAVES.map((l) => l.dayId).join(", ")})`,
  );
  console.log();
  console.log("VO2max values (u16, deci-units = mL/kg/min × 10):");
  console.log(`  baseline: ${BASELINE_LEAVES.map((l) => l.vo2max).join(", ")}`);
  console.log(`  finish:   ${FINISH_LEAVES.map((l) => l.vo2max).join(", ")}`);

  // Step 1: serialize leaves to bytes (same path the upload endpoint takes).
  const baselineBufs = BASELINE_LEAVES.map(serializeLeafV2);
  const finishBufs = FINISH_LEAVES.map(serializeLeafV2);

  // Step 2: pick indices the same way buildImprovementWitness does
  // (lowest-non-zero baseline, highest finish). Re-use the same internal
  // helper so this stays bit-identical with the production path.
  const baselineIndices = __internal.pickIndicesByMetric(
    baselineBufs,
    2,
    "lowest-nonzero",
    "baselineLeaves",
  );
  const finishIndices = __internal.pickIndicesByMetric(
    finishBufs,
    2,
    "highest",
    "finishLeaves",
  );
  console.log();
  console.log(`Picked baseline indices: [${baselineIndices.join(", ")}]`);
  console.log(`Picked finish indices:   [${finishIndices.join(", ")}]`);

  // Step 3: build the witness.
  console.log();
  console.log("Building witness via buildImprovementWitnessFromLeaves…");
  const witness = buildImprovementWitnessFromLeaves({
    baselineLeaves: baselineBufs,
    finishLeaves: finishBufs,
    baselineIndices,
    finishIndices,
  });

  console.log();
  console.log("── Witness public signals ────────────────────────────────────");
  console.log(`baselineRoot:       ${witness.baselineRoot}`);
  console.log(`finishRoot:         ${witness.finishRoot}`);
  console.log(`metricPointer:      ${witness.metricPointer}`);
  console.log(`claimedMagnitudeBp: ${witness.claimedMagnitudeBp}`);
  console.log(`claimedSignFlag:    ${witness.claimedSignFlag}`);

  console.log();
  console.log("── Witness meta (off-circuit) ────────────────────────────────");
  console.log(`baselineSum:   ${witness.meta.baselineSum}`);
  console.log(`finishSum:     ${witness.meta.finishSum}`);
  console.log(
    `improvementBp: ${witness.meta.improvementBp} (signFlag=${witness.meta.signFlag})`,
  );
  // Print the full 32-byte left-padded hex form too — that's what
  // `openRegistration(baselineRoot)` and the verifier expect on-chain. The
  // BN254 scalar field is 254 bits, so the high byte may be < 0x20 and the
  // raw `0x…` representation can be shorter than 64 hex chars; pad explicitly.
  const baselineRoot32 =
    "0x" + BigInt(witness.baselineRoot).toString(16).padStart(64, "0");
  const finishRoot32 =
    "0x" + BigInt(witness.finishRoot).toString(16).padStart(64, "0");
  console.log(`baselineRoot hex (32B): ${baselineRoot32}`);
  console.log(`finishRoot   hex (32B): ${finishRoot32}`);

  // Step 4: run groth16.fullProve.
  const repoRoot = path.resolve(__dirname, "..");
  const wasmPath = path.join(
    repoRoot,
    "public/zk/improvement/improvement.wasm",
  );
  const zkeyPath = path.join(
    repoRoot,
    "public/zk/improvement/improvement_final.zkey",
  );
  const vkeyPath = path.join(
    repoRoot,
    "public/zk/improvement/verification_key.json",
  );
  console.log();
  console.log("── Running groth16.fullProve ─────────────────────────────────");
  console.log(`wasm: ${wasmPath}`);
  console.log(`zkey: ${zkeyPath}`);

  const wasm = new Uint8Array(readFileSync(wasmPath));
  const zkey = new Uint8Array(readFileSync(zkeyPath));

  const witnessInput: Record<string, unknown> = {
    baselineRoot: witness.baselineRoot,
    finishRoot: witness.finishRoot,
    metricPointer: witness.metricPointer,
    claimedMagnitudeBp: witness.claimedMagnitudeBp,
    claimedSignFlag: witness.claimedSignFlag,
    baselineLeafHashes: witness.baselineLeafHashes,
    baselineChunks: witness.baselineChunks,
    baselinePaths: witness.baselinePaths,
    baselineIdx: witness.baselineIdx,
    finishLeafHashes: witness.finishLeafHashes,
    finishChunks: witness.finishChunks,
    finishPaths: witness.finishPaths,
    finishIdx: witness.finishIdx,
  };

  const t0 = Date.now();
  const sj = snarkjs as unknown as SnarkjsModule;
  const { proof, publicSignals } = await sj.groth16.fullProve(
    witnessInput,
    wasm,
    zkey,
  );
  const provedInMs = Date.now() - t0;
  console.log(`✅ fullProve OK in ${provedInMs}ms`);
  console.log(
    `   pi_a length=${proof.pi_a.length}, pi_b shape=[${proof.pi_b.length}x${proof.pi_b[0]?.length ?? "?"}], pi_c length=${proof.pi_c.length}`,
  );
  console.log(`   publicSignals (${publicSignals.length}):`);
  publicSignals.forEach((s, i) => {
    const labels = [
      "baselineRoot",
      "finishRoot",
      "metricPointer",
      "claimedMagnitudeBp",
      "claimedSignFlag",
    ];
    console.log(`     [${i}] ${labels[i] ?? "?"} = ${s}`);
  });

  // Step 5: verify the proof.
  console.log();
  console.log("── Verifying proof against verification_key.json ─────────────");
  const vkey = JSON.parse(readFileSync(vkeyPath, "utf8")) as Record<
    string,
    unknown
  >;
  const ok = await sj.groth16.verify(vkey, publicSignals, proof);
  if (!ok) {
    throw new Error("Proof verification FAILED");
  }
  console.log("✅ Proof verifies");

  console.log();
  console.log("─".repeat(72));
  console.log("SUMMARY");
  console.log("─".repeat(72));
  console.log(`claimedMagnitudeBp = ${witness.claimedMagnitudeBp}`);
  console.log(`claimedSignFlag    = ${witness.claimedSignFlag}`);
  console.log(
    `→ honest VO2max improvement: ${(Number(witness.claimedMagnitudeBp) / 100).toFixed(2)}%`,
  );
  console.log(
    `Proof generation + verification completed end-to-end in ${Date.now() - t0}ms.`,
  );

  // snarkjs leaves worker threads alive — exit cleanly so the script doesn't
  // hang on the event loop.
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Spring Push proof test failed:", err);
  process.exit(1);
});
