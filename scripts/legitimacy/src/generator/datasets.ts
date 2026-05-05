/**
 * Named synthetic datasets covering the test matrix in the Spring Push
 * verification brief, "Simulated Data Specifications" section.
 *
 *   L1–L5 — legitimate, must score > 0.85
 *   A1–A8 — adversarial, must fail at least one C/D/E check, score < 0.70
 *   E1–E3 — edge cases, must pass with warnings, score > 0.70
 *
 * Each dataset is a function that returns a fresh `GeneratorOutput` plus
 * the post-processed leaves (some adversarials apply transforms after
 * generation — copy a week, switch device midway, etc).
 *
 * Adversarials always start from one of the legitimate base profiles so
 * the only difference is the manipulation, not the underlying signal
 * shape. That way each adversarial corresponds to a specific failure
 * mode rather than being an unrelated nonsense distribution.
 */

import { createHash } from "node:crypto";

import type { AmachLeafV2 } from "../types";
import { buildLeafV2 } from "../leaf";
import {
  generateSeries,
  sourceHashFor,
  walletFromSeed,
  type GeneratorConfig
} from "./synthetic";

export interface NamedDataset {
  id: string;
  description: string;
  leaves: AmachLeafV2[];
  config: GeneratorConfig;
  /** Optional commit timestamps to drive D.4 (one entry per submission). */
  commitTimestamps?: number[];
}

// ─── Legitimate datasets ────────────────────────────────────────────────────

export function L1(): NamedDataset {
  const cfg: GeneratorConfig = {
    seed: "L1",
    days: 90,
    age: 35,
    sex: "male",
    startingFitness: "average",
    vo2maxStart: 32,
    vo2maxEnd: 36,
    device: "apple-watch",
    noise: "mid"
  };
  const out = generateSeries(cfg);
  return {
    id: "L1",
    description: "Average improver, Apple Watch (35 yo male; VO2 32 → 36, 12.5%).",
    leaves: out.leaves,
    config: cfg,
    commitTimestamps: weeklyCommits(cfg.days ?? 90)
  };
}

export function L2(): NamedDataset {
  const cfg: GeneratorConfig = {
    seed: "L2",
    days: 90,
    age: 28,
    sex: "male",
    startingFitness: "fit",
    vo2maxStart: 38,
    vo2maxEnd: 46,
    device: "whoop",
    noise: "high"
  };
  const out = generateSeries(cfg);
  return {
    id: "L2",
    description: "Strong improver, Whoop (28 yo male; VO2 38 → 46, 21%).",
    leaves: out.leaves,
    config: cfg,
    commitTimestamps: weeklyCommits(cfg.days ?? 90)
  };
}

export function L3(): NamedDataset {
  const cfg: GeneratorConfig = {
    seed: "L3",
    days: 90,
    age: 45,
    sex: "female",
    startingFitness: "average",
    vo2maxStart: 28,
    vo2maxEnd: 30,
    device: "apple-watch",
    noise: "mid"
  };
  const out = generateSeries(cfg);
  return {
    id: "L3",
    description: "Marginal improver (45 yo female; VO2 28 → 30, 7%).",
    leaves: out.leaves,
    config: cfg,
    commitTimestamps: weeklyCommits(cfg.days ?? 90)
  };
}

export function L4(): NamedDataset {
  // Plateau then improvement: 60 days flat, then 30 days steep gain. We
  // implement this by stitching two `generateSeries` runs end-to-end.
  const flat = generateSeries({
    seed: "L4-flat",
    days: 60,
    age: 32,
    sex: "male",
    startingFitness: "average",
    vo2maxStart: 36,
    vo2maxEnd: 36.5,
    device: "apple-watch",
    noise: "mid",
    startDayId: 19000
  });
  const climb = generateSeries({
    seed: "L4-climb",
    days: 30,
    age: 32,
    sex: "male",
    startingFitness: "average",
    vo2maxStart: 36.5,
    vo2maxEnd: 42,
    device: "apple-watch",
    noise: "mid",
    startDayId: 19060,
    wallet: flat.config.wallet
  });
  // Stamp the same wallet & sourceHash across both halves so E.3 is happy.
  const sourceHash = flat.leaves[0].sourceHash;
  const leaves = [...flat.leaves, ...climb.leaves].map((l) => ({
    ...l,
    sourceHash,
    wallet: flat.config.wallet
  }));
  return {
    id: "L4",
    description:
      "Plateau then steep improvement (32 yo; flat 60d, then VO2 36.5 → 42 over 30d).",
    leaves,
    config: { seed: "L4", days: 90 },
    commitTimestamps: weeklyCommits(90)
  };
}

export function L5(): NamedDataset {
  const cfg: GeneratorConfig = {
    seed: "L5",
    days: 90,
    age: 30,
    sex: "female",
    startingFitness: "average",
    vo2maxStart: 34,
    vo2maxEnd: 39,
    device: "apple-watch",
    noise: "high"
  };
  const out = generateSeries(cfg);
  return {
    id: "L5",
    description:
      "Improvement with realistic variance (30 yo female; VO2 34 → 39, daily noise high).",
    leaves: out.leaves,
    config: cfg,
    commitTimestamps: weeklyCommits(cfg.days ?? 90)
  };
}

// ─── Adversarial datasets ───────────────────────────────────────────────────

/**
 * A1 — pure random within plausible ranges. Each metric drawn independently;
 * no temporal coherence, no correlation between metrics. Should fail
 * Category C correlations and D temporal patterns.
 */
export function A1(): NamedDataset {
  const seed = "A1";
  const wallet = walletFromSeed(seed);
  const sourceHash = sourceHashFor("apple-watch", seed);
  const days = 90;
  const startDayId = 19000;
  const rng = makeStableRng(seed);

  const leaves: AmachLeafV2[] = [];
  for (let i = 0; i < days; i++) {
    const steps = randInt(rng, 4000, 16000);
    const energyKcal = randInt(rng, 200, 900);
    const exMin = randInt(rng, 5, 90);
    const hrvMs = randInt(rng, 20, 80); // wire-units = × 10 below
    const rhr = randInt(rng, 50, 75);
    const sleepM = randInt(rng, 380, 540);
    const vo2 = randInt(rng, 30, 50);
    const dataFlags = 0xff_07ff;
    leaves.push(
      buildLeafV2({
        wallet,
        dayId: startDayId + i,
        timezoneOffset: -300,
        steps,
        activeEnergy: energyKcal * 100,
        exerciseMins: exMin,
        hrv: hrvMs * 10,
        restingHR: rhr * 10,
        sleepMins: sleepM,
        workoutCount: rng() < 0.4 ? 1 : 0,
        sourceCount: 1,
        dataFlags,
        vo2max: vo2 * 10,
        weight: 7500,
        bodyFatPct: 1800,
        leanMass: 6150,
        deepSleepMins: Math.round(sleepM * 0.17),
        remSleepMins: Math.round(sleepM * 0.22),
        lightSleepMins: Math.round(sleepM * 0.56),
        awakeMins: Math.round(sleepM * 0.05),
        sourceHash
      })
    );
  }
  return {
    id: "A1",
    description: "Pure random within plausible ranges, no temporal coherence.",
    leaves,
    config: { seed, days, device: "apple-watch" },
    commitTimestamps: weeklyCommits(days)
  };
}

/** A2 — mathematically smooth curves with no daily variance. */
export function A2(): NamedDataset {
  const seed = "A2";
  const wallet = walletFromSeed(seed);
  const sourceHash = sourceHashFor("apple-watch", seed);
  const days = 90;
  const startDayId = 19000;

  const leaves: AmachLeafV2[] = [];
  for (let i = 0; i < days; i++) {
    const t = i / (days - 1);
    const vo2 = 32 + 4 * t;
    const rhr = 65 - 6 * t;
    const hrvMs = 40 + 12 * t;
    const steps = Math.round(8500 + 1500 * t);
    const energyKcal = Math.round(420 + 120 * t);
    const exMin = Math.round(35 + 15 * t);
    const sleepM = 460;
    const dataFlags = 0xff_07ff;
    leaves.push(
      buildLeafV2({
        wallet,
        dayId: startDayId + i,
        timezoneOffset: -300,
        steps,
        activeEnergy: energyKcal * 100,
        exerciseMins: exMin,
        hrv: hrvMs * 10,
        restingHR: rhr * 10,
        sleepMins: sleepM,
        workoutCount: 1,
        sourceCount: 1,
        dataFlags,
        vo2max: Math.round(vo2 * 10),
        weight: 7500,
        bodyFatPct: 1800,
        leanMass: 6150,
        deepSleepMins: Math.round(sleepM * 0.17),
        remSleepMins: Math.round(sleepM * 0.22),
        lightSleepMins: Math.round(sleepM * 0.56),
        awakeMins: Math.round(sleepM * 0.05),
        sourceHash
      })
    );
  }
  return {
    id: "A2",
    description: "Smoothed perfect curves with no daily noise.",
    leaves,
    config: { seed, days, device: "apple-watch" },
    commitTimestamps: weeklyCommits(days)
  };
}

/**
 * A3 — VO2 max improves but RHR, HRV, sleep show no corresponding changes.
 * Implemented by running a regular series with a big VO2 trajectory but
 * pinning RHR/HRV to the baseline values.
 */
export function A3(): NamedDataset {
  const cfg: GeneratorConfig = {
    seed: "A3",
    days: 90,
    age: 35,
    sex: "male",
    startingFitness: "average",
    vo2maxStart: 32,
    vo2maxEnd: 44,
    device: "apple-watch",
    noise: "mid"
  };
  const out = generateSeries(cfg);
  // Overwrite RHR/HRV with the baseline values everywhere.
  const baselineRHR = out.leaves[0].restingHR;
  const baselineHRV = out.leaves[0].hrv;
  const tampered = out.leaves.map((l) => ({
    ...l,
    restingHR: baselineRHR,
    hrv: baselineHRV
  }));
  return {
    id: "A3",
    description: "Single-metric improvement: VO2 climbs while RHR/HRV stay flat.",
    leaves: tampered,
    config: cfg,
    commitTimestamps: weeklyCommits(cfg.days ?? 90)
  };
}

/** A4 — cherry-picked good days. Drop ~30% of days and leave gaps > 48h. */
export function A4(): NamedDataset {
  const base = L1();
  const trimmed = base.leaves.filter((_, i) => i % 4 !== 0 && i % 7 !== 0);
  return {
    id: "A4",
    description: "Cherry-picked: ~30% of days dropped to remove inconvenient ones.",
    leaves: trimmed,
    config: base.config,
    commitTimestamps: weeklyCommits(base.config.days ?? 90)
  };
}

/** A5 — copy-paste week. One realistic week × 13. */
export function A5(): NamedDataset {
  const base = L1();
  const wallet = base.leaves[0].wallet;
  const sourceHash = base.leaves[0].sourceHash;
  const week = base.leaves.slice(7, 14);
  const out: AmachLeafV2[] = [];
  for (let w = 0; w < 13; w++) {
    for (let d = 0; d < 7; d++) {
      const src = week[d];
      out.push({
        ...src,
        dayId: 19000 + w * 7 + d,
        wallet,
        sourceHash
      });
    }
  }
  return {
    id: "A5",
    description: "Copy-paste week: one realistic week × 13 with date adjustments.",
    leaves: out,
    config: base.config,
    commitTimestamps: weeklyCommits(91)
  };
}

/**
 * A6 — friend's data. Stitched-together physiology: VO2 max series taken
 * from an elite athlete, RHR / HRV series taken from a sedentary user. The
 * individual metrics all sit in plausible ranges but their cross-metric
 * correlations break (C.1 RHR↔HRV, C.2 VO2↔RHR, C.3 VO2↔HRV all fail).
 * This is the "took someone else's lab readings" failure mode.
 */
export function A6(): NamedDataset {
  const elite = generateSeries({
    seed: "A6-elite",
    days: 90,
    startingFitness: "athlete",
    vo2maxStart: 62,
    vo2maxEnd: 70, // bigger trend so VO2/RHR mismatch is unambiguous
    weightKgStart: 72,
    bodyFatPctStart: 9,
    device: "garmin",
    noise: "mid"
  });
  const sedentary = generateSeries({
    seed: "A6-sedentary",
    days: 90,
    // Stamp a sedentary baseline that does NOT improve — RHR stays high
    // even though the elite VO2 series is climbing. This is the "took
    // someone else's lab readings" signature.
    startingFitness: "sedentary",
    vo2maxStart: 26,
    vo2maxEnd: 26,
    weightKgStart: 92,
    bodyFatPctStart: 30,
    device: "garmin",
    noise: "mid",
    wallet: elite.config.wallet
  });
  // Take VO2 / steps / activeEnergy / exercise from the elite series; take
  // RHR / HRV / sleep from the sedentary series.
  const leaves: AmachLeafV2[] = elite.leaves.map((e, i) => {
    const s = sedentary.leaves[i];
    return {
      ...e,
      restingHR: s.restingHR,
      hrv: s.hrv,
      sleepMins: s.sleepMins,
      deepSleepMins: s.deepSleepMins,
      remSleepMins: s.remSleepMins,
      lightSleepMins: s.lightSleepMins,
      awakeMins: s.awakeMins,
      wallet: elite.config.wallet,
      sourceHash: elite.leaves[0].sourceHash
    };
  });
  return {
    id: "A6",
    description:
      "Friend's data: elite VO2/activity series stitched with sedentary RHR/HRV/sleep.",
    leaves,
    config: { seed: "A6", days: 90 },
    commitTimestamps: weeklyCommits(90)
  };
}

/** A7 — device switch midway. Two distinct sourceHashes, ~50/50. */
export function A7(): NamedDataset {
  const a = generateSeries({
    seed: "A7-a",
    days: 45,
    startDayId: 19000,
    device: "apple-watch",
    startingFitness: "average",
    vo2maxStart: 33,
    vo2maxEnd: 35
  });
  const b = generateSeries({
    seed: "A7-b",
    days: 45,
    startDayId: 19045,
    device: "garmin",
    startingFitness: "average",
    vo2maxStart: 35,
    vo2maxEnd: 37,
    wallet: a.config.wallet
  });
  const leaves = [...a.leaves, ...b.leaves].map((l) => ({
    ...l,
    wallet: a.config.wallet
  }));
  return {
    id: "A7",
    description: "Device switch midway through the window — sourceHash changes.",
    leaves,
    config: { seed: "A7", days: 90 },
    commitTimestamps: weeklyCommits(90)
  };
}

/** A8 — backloaded commits. All weekly commits in the final week. */
export function A8(): NamedDataset {
  const base = L1();
  // 12 commits, all packed into the last 5 days.
  const endTs = 1716_000_000; // arbitrary unix seconds
  const commits = Array.from({ length: 12 }, (_, i) => endTs - i * 3600);
  return {
    id: "A8",
    description: "Backloaded commits: all submissions in the final week.",
    leaves: base.leaves,
    config: base.config,
    commitTimestamps: commits.sort((a, b) => a - b),
    // tag the day range so it's discoverable
  };
}

// ─── Edge case datasets ─────────────────────────────────────────────────────

/**
 * E1 — sparse but real. Genuine pattern with gaps from inconsistent watch
 * wearing. Drop ~20% of days but ensure no gap exceeds the 48h limit.
 */
export function E1(): NamedDataset {
  const base = L1();
  const trimmed: AmachLeafV2[] = [];
  for (let i = 0; i < base.leaves.length; i++) {
    // Skip ~1 in 5 days but never two consecutive days.
    if (i > 0 && i % 5 === 0 && i + 1 < base.leaves.length) continue;
    trimmed.push(base.leaves[i]);
  }
  return {
    id: "E1",
    description: "Sparse but real: ~20% of days missing, no gap > 48h.",
    leaves: trimmed,
    config: base.config,
    commitTimestamps: weeklyCommits(base.config.days ?? 90)
  };
}

/**
 * E2 — atypical but plausible. Night-shift worker: sleep happens in the
 * day, exercise patterns inverted. We model this as a normal series with
 * very high sleep variability (CV ~0.35) and shifted RHR/sleep alignment.
 */
export function E2(): NamedDataset {
  const cfg: GeneratorConfig = {
    seed: "E2",
    days: 90,
    age: 38,
    sex: "female",
    startingFitness: "average",
    vo2maxStart: 33,
    vo2maxEnd: 36,
    device: "apple-watch",
    noise: "high",
    timezoneOffset: -480
  };
  const out = generateSeries(cfg);
  // Inject extra sleep variability: alternate days have 100 min more or less
  // sleep than the synthetic baseline.
  const tweaked = out.leaves.map((l, i) => {
    const delta = i % 2 === 0 ? 80 : -70;
    const s = Math.min(720, Math.max(180, l.sleepMins + delta));
    const ratio = l.sleepMins > 0 ? s / l.sleepMins : 1;
    return {
      ...l,
      sleepMins: s,
      deepSleepMins: Math.min(0xffff, Math.round(l.deepSleepMins * ratio)),
      remSleepMins: Math.min(0xffff, Math.round(l.remSleepMins * ratio)),
      lightSleepMins: Math.min(0xffff, Math.round(l.lightSleepMins * ratio)),
      awakeMins: Math.min(0xffff, Math.round(l.awakeMins * ratio))
    };
  });
  return {
    id: "E2",
    description:
      "Atypical but plausible: night-shift schedule, high day-to-day sleep variability.",
    leaves: tweaked,
    config: cfg,
    commitTimestamps: weeklyCommits(cfg.days ?? 90)
  };
}

/** E3 — highly trained athlete. Elite metrics throughout. */
export function E3(): NamedDataset {
  const cfg: GeneratorConfig = {
    seed: "E3",
    days: 90,
    age: 32,
    sex: "male",
    startingFitness: "athlete",
    vo2maxStart: 65,
    vo2maxEnd: 68,
    weightKgStart: 70,
    bodyFatPctStart: 8,
    device: "garmin",
    noise: "low"
  };
  const out = generateSeries(cfg);
  return {
    id: "E3",
    description: "Highly trained athlete: VO2 65+, RHR in the 40s.",
    leaves: out.leaves,
    config: cfg,
    commitTimestamps: weeklyCommits(cfg.days ?? 90)
  };
}

// ─── Catalog ────────────────────────────────────────────────────────────────

export const ALL_DATASETS: Array<() => NamedDataset> = [
  L1, L2, L3, L4, L5,
  A1, A2, A3, A4, A5, A6, A7, A8,
  E1, E2, E3
];

// ─── Internal helpers ───────────────────────────────────────────────────────

function makeStableRng(seed: string): () => number {
  const h = createHash("sha256").update(seed).digest();
  let state = h.readUInt32BE(0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, lo: number, hi: number): number {
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

/**
 * Generate weekly commit timestamps spread evenly across the window. Used by
 * the legitimate datasets so D.4 has "well-distributed commits" signal.
 * Anchored to an arbitrary unix epoch second.
 */
function weeklyCommits(days: number): number[] {
  const anchor = 1716_000_000;
  const stride = 7 * 24 * 3600;
  const span = days * 24 * 3600;
  const out: number[] = [];
  for (let t = 0; t <= span; t += stride) out.push(anchor + t);
  return out;
}
