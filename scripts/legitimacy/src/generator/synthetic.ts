/**
 * Synthetic Apple Health data generator.
 *
 * Produces sequences of v2 leaves shaped to look like real wearable output.
 * Used by the test fixtures (L1–L5 legitimate, A1–A8 adversarial, E1–E3
 * edge cases) and exposed as a public API so the AverageImprovementProof
 * circuit (Layer 2) can reuse it.
 *
 * The generator is intentionally simple and self-contained — no ML, no
 * external models. Just a seeded PRNG, plausible base distributions, and
 * configurable correlations between metrics.
 *
 * Configurable knobs:
 *   - starting fitness level (sedentary / average / athlete)
 *   - age, sex
 *   - target improvement trajectory (over the window)
 *   - device profile (Apple Watch / Whoop / generic)
 *   - noise profile (low / mid / high)
 */

import { createHash } from "node:crypto";

import type { AmachLeafV2 } from "../types";
import { buildLeafV2 } from "../leaf";

export type Sex = "male" | "female";
export type FitnessLevel = "sedentary" | "average" | "fit" | "athlete";
export type DeviceProfile = "apple-watch" | "whoop" | "garmin";
export type NoiseProfile = "low" | "mid" | "high";

export interface GeneratorConfig {
  /** Wallet address (32 bytes). Will be filled from a seed if absent. */
  wallet?: Buffer;

  /** Random seed for reproducibility. */
  seed?: string;

  /** Starting day id (epoch days from reference). Default 19000 ≈ 2022-01-08. */
  startDayId?: number;

  /** Number of days to generate. Default 90 (Season One contest length). */
  days?: number;

  /** Demographics. */
  age?: number;
  sex?: Sex;

  /** Starting state. */
  startingFitness?: FitnessLevel;

  /** Improvement trajectory. */
  vo2maxStart?: number; // ml/kg/min (real-units)
  vo2maxEnd?: number; // ml/kg/min (real-units)

  /** Optional starting weight in kg; defaults to 75 kg male / 62 kg female. */
  weightKgStart?: number;
  /** Optional ending weight in kg; defaults to weightKgStart. */
  weightKgEnd?: number;

  /** Body fat percentage at the start, real-units (e.g. 18.5 for 18.5%). */
  bodyFatPctStart?: number;
  /** Body fat percentage at the end. */
  bodyFatPctEnd?: number;

  /** Device + noise. */
  device?: DeviceProfile;
  noise?: NoiseProfile;

  /** Timezone offset in minutes from UTC. */
  timezoneOffset?: number;

  /** Default daily presence rate per metric in [0,1]. */
  presence?: Partial<Record<DailyMetricKey, number>>;
}

export type DailyMetricKey =
  | "steps"
  | "activeEnergy"
  | "exerciseMins"
  | "hrv"
  | "restingHR"
  | "sleepMins"
  | "vo2max"
  | "weight"
  | "bodyFatPct"
  | "leanMass"
  | "sleepStages";

const NOISE_TABLE: Record<NoiseProfile, number> = {
  low: 0.05,
  mid: 0.1,
  high: 0.18
};

/** Lookup table of starting values per fitness level. Real-units. */
const FITNESS_BASE: Record<
  FitnessLevel,
  {
    steps: number;
    activeEnergy: number;
    exerciseMins: number;
    hrv: number;
    restingHR: number;
    vo2max: number;
  }
> = {
  sedentary: {
    steps: 4500,
    activeEnergy: 250,
    exerciseMins: 12,
    hrv: 32,
    restingHR: 72,
    vo2max: 26
  },
  average: {
    steps: 8500,
    activeEnergy: 400,
    exerciseMins: 32,
    hrv: 45,
    restingHR: 62,
    vo2max: 35
  },
  fit: {
    steps: 11500,
    activeEnergy: 650,
    exerciseMins: 55,
    hrv: 65,
    restingHR: 54,
    vo2max: 45
  },
  athlete: {
    steps: 13500,
    activeEnergy: 850,
    exerciseMins: 80,
    hrv: 85,
    restingHR: 46,
    vo2max: 58
  }
};

/**
 * Deterministic PRNG (mulberry32). Plenty of randomness for synthetic data
 * and deterministic from a string seed — important so test fixtures are
 * reproducible across runs.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: string) {
    const h = createHash("sha256").update(seed).digest();
    this.state = h.readUInt32BE(0) || 1;
  }

  /** Uniform [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Standard normal via Box–Muller. */
  normal(): number {
    let u = 0;
    while (u === 0) u = this.next();
    let v = 0;
    while (v === 0) v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Uniform integer in [min, max] inclusive. */
  intBetween(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Bernoulli. */
  bernoulli(p: number): boolean {
    return this.next() < p;
  }
}

export interface GeneratorOutput {
  config: Required<Omit<GeneratorConfig, "wallet" | "presence">> & {
    wallet: Buffer;
    presence: Record<DailyMetricKey, number>;
  };
  leaves: AmachLeafV2[];
}

const DEFAULT_PRESENCE: Record<DailyMetricKey, number> = {
  steps: 0.98,
  activeEnergy: 0.95,
  exerciseMins: 0.85,
  hrv: 0.75,
  restingHR: 0.85,
  sleepMins: 0.85,
  vo2max: 0.3,
  weight: 0.4,
  bodyFatPct: 0.25,
  leanMass: 0.25,
  sleepStages: 0.7
};

/** Linear interpolation: (1 - t) * a + t * b. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp to a closed interval. */
function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Round to nearest integer, treating non-finite as 0. */
function ri(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.round(x));
}

/**
 * Build a wallet buffer from a seed string. Deterministic, looks like a
 * 20-byte address right-aligned in a 32-byte buffer.
 */
export function walletFromSeed(seed: string): Buffer {
  const hash = createHash("sha256").update(`amach.legit.wallet:${seed}`).digest();
  return Buffer.from(hash);
}

/** Build a deterministic 32-byte sourceHash for a given device profile. */
export function sourceHashFor(device: DeviceProfile, salt: string = ""): Buffer {
  return createHash("sha256")
    .update(`amach.legit.source:${device}:${salt}`)
    .digest();
}

/**
 * Generate a sequence of v2 leaves with realistic, correlated daily metrics
 * shaped by the configuration. Returns both the leaves and the resolved
 * configuration so callers can read back what was actually used.
 */
export function generateSeries(input: GeneratorConfig = {}): GeneratorOutput {
  const seed = input.seed ?? "amach.default";
  const rng = new SeededRandom(seed);

  const days = input.days ?? 90;
  const startingFitness = input.startingFitness ?? "average";
  const base = FITNESS_BASE[startingFitness];
  const age = input.age ?? 35;
  const sex = input.sex ?? "male";
  const device: DeviceProfile = input.device ?? "apple-watch";
  const noise = input.noise ?? "mid";
  const noiseSigma = NOISE_TABLE[noise];
  const startDayId = input.startDayId ?? 19000;
  const timezoneOffset = input.timezoneOffset ?? -300;

  const vo2maxStart = input.vo2maxStart ?? base.vo2max;
  const vo2maxEnd = input.vo2maxEnd ?? base.vo2max;
  const weightKgStart =
    input.weightKgStart ?? (sex === "female" ? 62 : 75);
  const weightKgEnd = input.weightKgEnd ?? weightKgStart;
  const bodyFatPctStart =
    input.bodyFatPctStart ?? (sex === "female" ? 26 : 18);
  const bodyFatPctEnd = input.bodyFatPctEnd ?? bodyFatPctStart;

  const wallet = input.wallet ?? walletFromSeed(seed);
  const sourceHash = sourceHashFor(device, seed);

  const presence: Record<DailyMetricKey, number> = {
    ...DEFAULT_PRESENCE,
    ...(input.presence ?? {})
  };

  const leaves: AmachLeafV2[] = [];

  // Persistent state for lag-1 autocorrelation. Real biometric series carry
  // over from one day to the next — today's RHR is close to yesterday's.
  // We model that with an AR(1) noise stream per affected metric.
  let prevRhrDeviate = 0;
  let prevHrvDeviate = 0;
  let prevStepsDeviate = 0;
  const AR_RHO = 0.6;

  for (let i = 0; i < days; i++) {
    const t = days <= 1 ? 0 : i / (days - 1);

    // Trended baselines.
    const vo2real = lerp(vo2maxStart, vo2maxEnd, t);
    const weightKg = lerp(weightKgStart, weightKgEnd, t);
    const bodyFatPctReal = lerp(bodyFatPctStart, bodyFatPctEnd, t);

    // Resting HR drops as fitness improves (≈ −1 bpm per 1 ml/kg/min VO2
    // gain at population scale — Astrand & Rodahl 4e). HRV rises mirror
    // image; coupled with stronger coefficient so the trend survives daily
    // noise on a 90-day window.
    const rhrTrend = base.restingHR - 1.0 * (vo2real - base.vo2max);
    const hrvTrend = base.hrv + 2.0 * (vo2real - base.vo2max);

    const stepsTrend = base.steps + 25 * (vo2real - base.vo2max);
    // Exercise minutes are bimodal (workout vs rest day); active energy
    // trends with steps and adds an explicit exercise-minute kicker so the
    // C.4 mechanical link is real, not an artefact of correlated noise.
    const exerciseBaseRest = 5 + Math.max(0, vo2real - base.vo2max) * 0.2;
    const exerciseBaseWorkout = base.exerciseMins + 0.6 * (vo2real - base.vo2max);

    // Weekday/weekend variation: ~25% activity drop on weekends for the
    // average synthetic profile (real datasets show 5–30% depending on
    // person; we keep this consistent so the D.2 check has signal).
    const dayOfWeek = (startDayId + i) % 7;
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
    const weekendMultiplier = isWeekend ? 0.78 : 1.0;

    // Correlated daily noise: one shared "vitality" deviate per day pulls
    // steps/energy/exercise together and slightly opposes RHR. Keeps
    // multi-metric correlation realistic.
    const vitality = rng.normal();

    // AR(1) noise streams — today's deviate = ρ·yesterday + ε. Gives
    // realistic lag-1 autocorrelation and keeps day-over-day jumps within
    // physiological bounds.
    const stepsDeviate =
      AR_RHO * prevStepsDeviate +
      Math.sqrt(1 - AR_RHO * AR_RHO) *
        (vitality * noiseSigma + rng.normal() * noiseSigma * 0.6);
    const energyShockNoise = rng.normal() * noiseSigma * 0.4;
    const exerciseNoise =
      vitality * noiseSigma * 0.5 + rng.normal() * noiseSigma * 0.3;
    const hrvDeviate =
      AR_RHO * prevHrvDeviate +
      Math.sqrt(1 - AR_RHO * AR_RHO) *
        (vitality * 0.5 * noiseSigma + rng.normal() * noiseSigma * 0.5);
    // RHR moves slowly; AR(1) ρ=0.6 plus capped ε keeps day-over-day jumps
    // under the B.4 step-change bound.
    const rhrDeviate = clamp(
      AR_RHO * prevRhrDeviate +
        Math.sqrt(1 - AR_RHO * AR_RHO) *
          (-vitality * 0.5 * noiseSigma +
            rng.normal() * noiseSigma * 0.25),
      -0.08,
      0.08
    );

    prevStepsDeviate = stepsDeviate;
    prevHrvDeviate = hrvDeviate;
    prevRhrDeviate = rhrDeviate;

    // Decide workout vs rest first; workout-day exercise is anchored to a
    // clearly higher baseline than rest days.
    const willWorkout = rng.bernoulli(isWeekend ? 0.55 : 0.7);
    const exerciseBase = willWorkout
      ? exerciseBaseWorkout
      : exerciseBaseRest;

    const steps = stepsTrend * weekendMultiplier * (1 + stepsDeviate);
    const exerciseMins =
      Math.max(0, exerciseBase * weekendMultiplier * (1 + exerciseNoise));
    // Active energy = steps-driven baseline + explicit exercise contribution.
    // The kcal/min coefficient (~6) is the population mid-point for moderate
    // exercise (ACSM compendium). This wires the C.4 mechanical link in.
    const stepsBaseEnergy = (steps / 1000) * 35;
    const activeEnergyKcal = clamp(
      stepsBaseEnergy + 6 * exerciseMins + 50 * energyShockNoise,
      0,
      4000
    );
    const hrv = clamp(hrvTrend * (1 + hrvDeviate), 12, 140);
    const restingHR = clamp(rhrTrend * (1 + rhrDeviate), 35, 90);

    // Sleep window: mean 7.5 h with 50-min stdev, REM ~22%, deep ~17%,
    // awake ~5%. Slight day-of-week effect (more sleep on weekends).
    const sleepMeanMin = isWeekend ? 480 : 450;
    const sleepMins = clamp(
      sleepMeanMin + rng.normal() * 50,
      240,
      720
    );
    const deepFrac = clamp(0.17 + rng.normal() * 0.03, 0.1, 0.27);
    const remFrac = clamp(0.22 + rng.normal() * 0.03, 0.15, 0.3);
    const awakeFrac = clamp(0.05 + Math.abs(rng.normal()) * 0.02, 0, 0.15);
    const lightFrac = Math.max(0, 1 - deepFrac - remFrac - awakeFrac);
    const deepSleepMins = sleepMins * deepFrac;
    const remSleepMins = sleepMins * remFrac;
    const awakeMins = sleepMins * awakeFrac;
    const lightSleepMins = sleepMins * lightFrac;

    const workoutCount = willWorkout ? 1 + (rng.next() < 0.25 ? 1 : 0) : 0;

    // Body composition: lean mass = (1 - bodyFat) * weight. Per-day noise
    // keeps the distribution from being mode-degenerate when participants
    // weigh themselves daily — real scales drift ±0.5 kg with hydration.
    const weightDailyKg =
      weightKg + rng.normal() * 0.6 * NOISE_TABLE[noise] * 5;
    const bodyFatDaily = clamp(
      bodyFatPctReal + rng.normal() * 0.4 * NOISE_TABLE[noise] * 5,
      3,
      55
    );
    const weightWire = weightDailyKg * 100;
    const bodyFatPctWire = bodyFatDaily * 100;
    const leanMassKg = weightDailyKg * (1 - bodyFatDaily / 100);
    const leanMassWire = leanMassKg * 100;

    // dataFlags: low byte mirrors v1 presence (steps/energy/exercise/hrv/
    // restingHR/sleep/workouts), upper bytes mark v2 metric presence.
    let dataFlags = 0;
    if (rng.bernoulli(presence.steps)) dataFlags |= 1 << 0;
    if (rng.bernoulli(presence.activeEnergy)) dataFlags |= 1 << 1;
    if (rng.bernoulli(presence.exerciseMins)) dataFlags |= 1 << 2;
    if (rng.bernoulli(presence.hrv)) dataFlags |= 1 << 3;
    if (rng.bernoulli(presence.restingHR)) dataFlags |= 1 << 4;
    if (rng.bernoulli(presence.sleepMins)) dataFlags |= 1 << 5;
    if (workoutCount > 0) dataFlags |= 1 << 6;
    const vo2Present = rng.bernoulli(presence.vo2max);
    const weightPresent = rng.bernoulli(presence.weight);
    const bodyFatPresent = rng.bernoulli(presence.bodyFatPct);
    const leanPresent = rng.bernoulli(presence.leanMass);
    const stagesPresent = rng.bernoulli(presence.sleepStages);
    if (vo2Present) dataFlags |= 1 << 16;
    if (weightPresent) dataFlags |= 1 << 17;
    if (bodyFatPresent) dataFlags |= 1 << 18;
    if (leanPresent) dataFlags |= 1 << 19;
    if (stagesPresent) dataFlags |= 1 << 20;

    const leaf = buildLeafV2({
      wallet,
      dayId: startDayId + i,
      timezoneOffset,
      steps: (dataFlags & 1) !== 0 ? ri(steps) : 0,
      activeEnergy: (dataFlags & 2) !== 0 ? ri(activeEnergyKcal * 100) : 0,
      exerciseMins: (dataFlags & 4) !== 0 ? clamp(ri(exerciseMins), 0, 0xffff) : 0,
      hrv: (dataFlags & 8) !== 0 ? clamp(ri(hrv * 10), 0, 0xffff) : 0,
      restingHR: (dataFlags & 16) !== 0 ? clamp(ri(restingHR * 10), 0, 0xffff) : 0,
      sleepMins: (dataFlags & 32) !== 0 ? clamp(ri(sleepMins), 0, 0xffff) : 0,
      workoutCount: clamp(workoutCount, 0, 0xff),
      sourceCount: 1,
      dataFlags,
      vo2max: vo2Present ? clamp(ri(vo2real * 10), 0, 0xffff) : 0,
      weight: weightPresent ? clamp(ri(weightWire), 0, 0xffff) : 0,
      bodyFatPct: bodyFatPresent ? clamp(ri(bodyFatPctWire), 0, 0xffff) : 0,
      leanMass: leanPresent ? clamp(ri(leanMassWire), 0, 0xffff) : 0,
      deepSleepMins: stagesPresent ? clamp(ri(deepSleepMins), 0, 0xffff) : 0,
      remSleepMins: stagesPresent ? clamp(ri(remSleepMins), 0, 0xffff) : 0,
      lightSleepMins: stagesPresent ? clamp(ri(lightSleepMins), 0, 0xffff) : 0,
      awakeMins: stagesPresent ? clamp(ri(awakeMins), 0, 0xffff) : 0,
      sourceHash
    });
    leaves.push(leaf);
  }

  return {
    config: {
      seed,
      days,
      age,
      sex,
      startingFitness,
      vo2maxStart,
      vo2maxEnd,
      weightKgStart,
      weightKgEnd,
      bodyFatPctStart,
      bodyFatPctEnd,
      device,
      noise,
      timezoneOffset,
      startDayId,
      wallet,
      presence
    },
    leaves
  };
}
