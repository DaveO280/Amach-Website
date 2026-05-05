/**
 * Public type definitions for @amach/legitimacy.
 *
 * Mirrors the v2 leaf schema documented in
 * /Users/dave/Documents/Claude/Projects/Amach Health/VERIFICATION_FACTORY.md
 * (section "The Leaf Format Evolution → v2"). Field names match the JS
 * builder in /Users/dave/AmachHealth-iOS/zk/scripts/hash_leaf.js so test
 * vectors interoperate verbatim.
 */

/**
 * Decoded v2 daily-summary leaf. Numeric fields are integers as stored
 * on-the-wire (e.g. vo2max = ml/kg/min × 10, weight = grams ÷ 10).
 */
export interface AmachLeafV2 {
  // Envelope
  version: number; // u8, 0x02 in v2
  leafType: number; // u8, 0x00 = daily_summary
  schemaVersion: number; // u8, 0x01 for v2.0 daily_summary
  reservedEnvelope: number; // u8, must be 0 in v2.0

  // Identity & time
  wallet: Buffer; // 32 bytes
  dayId: number; // u32, epoch days from reference
  timezoneOffset: number; // i16, minutes from UTC

  // v1-equivalent metrics
  steps: number; // u32
  activeEnergy: number; // u32, kcal × 100
  exerciseMins: number; // u16
  hrv: number; // u16, ms × 10
  restingHR: number; // u16, bpm × 10
  sleepMins: number; // u16
  workoutCount: number; // u8
  sourceCount: number; // u8
  dataFlags: number; // u32

  // v2 additions
  vo2max: number; // u16, ml/kg/min × 10
  weight: number; // u16, grams ÷ 10
  bodyFatPct: number; // u16, percent × 100
  leanMass: number; // u16, grams ÷ 10
  deepSleepMins: number; // u16
  remSleepMins: number; // u16
  lightSleepMins: number; // u16
  awakeMins: number; // u16

  reservedPayload: Buffer; // 12 bytes, must be zeros in v2.0
  sourceHash: Buffer; // 32 bytes
}

/** Legitimacy-check input bundle (parsed JSON). */
export interface ParticipantInput {
  walletAddress: string;
  expectedRoot: string; // hex (0x-prefixed) or decimal
  expectedLeafCount?: number;
  expectedStartDayId?: number;
  expectedEndDayId?: number;
  network?: string;
  /**
   * Either an array of decoded v2 leaves OR an array of hex strings (each 248
   * hex chars, the 124-byte serialized form). The pipeline accepts both.
   */
  leaves: Array<AmachLeafV2 | string>;
  /** Optional sidecar: when leaves were committed on-chain, by index. */
  commitTimestamps?: number[];
}

export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
  id: string;
  category: "A" | "B" | "C" | "D" | "E" | "F";
  name: string;
  status: CheckStatus;
  message: string;
  /** Where applicable: the measured value and the bound it was compared to. */
  value?: number | string | null;
  bound?: string;
  /** Optional citation backing the threshold (e.g. "CDC NHANES 2017–2020"). */
  source?: string;
  weight?: number;
}

export interface CategoryResult {
  category: "A" | "B" | "C" | "D" | "E" | "F";
  status: CheckStatus;
  checks: CheckResult[];
}

export interface LegitimacyReport {
  version: string;
  generatedAt: string;
  network: string | null;
  walletAddress: string;
  expectedRoot: string;
  computedRoot: string | null;
  leafCount: number;
  dayRange: { startDayId: number | null; endDayId: number | null };
  categories: CategoryResult[];
  /** Aggregate score in [0, 1]. A failures force the score to 0. */
  score: number;
  /** Score threshold used by the recommendation. */
  threshold: number;
  recommendation: "pass" | "fail";
  failures: string[];
  warnings: string[];
  notes: string[];
}

/** Tunable thresholds. Single set tuned for fitness-focused 25 to 45 audience. */
export interface LegitimacyConfig {
  /** Pass / fail score threshold (default 0.7 per session brief). */
  scoreThreshold: number;

  /** Maximum allowed gap between consecutive data days in hours (E.1). */
  maxGapHours: number;

  /** B.3 maximum proportion of identical samples (default 0.30 per brief). */
  maxDuplicateProportion: number;

  /** Per-metric statistical bounds (B.1, B.4, B.5). */
  metricBounds: Record<string, MetricBound>;

  /** Correlation thresholds (C.1–C.3). */
  correlations: {
    rhrHrvInverseMin: number;
    vo2RhrInverseMin: number;
    vo2HrvPositiveMin: number;
    activeEnergyExerciseMin: number;
  };

  /** Sleep-stage proportion ranges (C.5, Ohayon et al. 2004). */
  sleepStages: {
    deepMin: number;
    deepMax: number;
    remMin: number;
    remMax: number;
    lightMin: number;
    lightMax: number;
    awakeMaxProportion: number;
    /** Allowed |total - sum(stages)| / total tolerance. */
    sumTolerance: number;
  };

  /** Body-comp coherence (C.6). */
  bodyComp: {
    /** Allowed |weight - (lean+fat)| / weight. */
    massTolerance: number;
  };

  /** Per-metric minimum coverage (presence rate) for E.2. */
  minCoverage: Record<string, number>;

  /** D.4 — fraction of commits allowed in the final week. */
  maxBackloadProportion: number;
}

/**
 * Inclusive plausibility bounds for a metric, in raw integer (wire) units.
 * Bounds derive from CDC NHANES, ACSM Guidelines for Exercise Testing 11e,
 * Schmitt et al. 2013 (HRV norms by age), and Ohayon et al. 2004 (sleep
 * stage proportions). See README for full citation list.
 */
export interface MetricBound {
  /** Plausible mean range (B.1). null disables that side. */
  meanMin: number | null;
  meanMax: number | null;
  /** Coefficient-of-variation bounds (B.2). Variance must lie in this band. */
  cvMin: number | null;
  cvMax: number | null;
  /** Maximum allowed day-over-day absolute jump (B.4), wire units. */
  maxStepChange: number | null;
  /** Maximum allowed range (max - min) over the window (B.5). */
  maxRange: number | null;
  /** Citation backing the thresholds. */
  source: string;
}
