/**
 * Default thresholds for the legitimacy script.
 *
 * Bounds are sized for the Spring Push Season One audience (fitness-focused,
 * ages 25–45). All values are documented with rationale and an external
 * citation; demographic-specific thresholds become a Season Two enhancement
 * if needed.
 *
 * Citations:
 *   - CDC NHANES 2017–2020 anthropometric reference data
 *     (mean weight, body composition, resting heart rate norms)
 *   - ACSM Guidelines for Exercise Testing and Prescription, 11th ed., 2021
 *     (VO2 max norms by age and sex; activity intensity)
 *   - Schmitt et al. 2013, Eur J Appl Physiol, "Heart rate variability"
 *     (HRV norms by age, time-domain RMSSD)
 *   - Ohayon et al. 2004, Sleep, "Meta-analysis of sleep stage proportions"
 *     (deep 13–23%, REM 20–25%, light 50–63%)
 *
 * All thresholds are inclusive at the boundary unless noted. Wire units
 * (e.g. vo2max × 10) are used so the bound table can be referenced directly
 * by check code without intermediate float conversion.
 */

import type { LegitimacyConfig, MetricBound } from "./types";

const ACSM = "ACSM Guidelines for Exercise Testing 11e (2021)";
const CDC = "CDC NHANES 2017–2020";
const SCHMITT = "Schmitt et al. 2013, Eur J Appl Physiol";
const OHAYON = "Ohayon et al. 2004, Sleep";

/**
 * Helper for building a MetricBound entry. `null` disables that side of the
 * bound. Wire units throughout (vo2max × 10, weight = grams ÷ 10, etc).
 */
function bound(
  meanMin: number | null,
  meanMax: number | null,
  cvMin: number | null,
  cvMax: number | null,
  maxStepChange: number | null,
  maxRange: number | null,
  source: string
): MetricBound {
  return { meanMin, meanMax, cvMin, cvMax, maxStepChange, maxRange, source };
}

export const DEFAULT_CONFIG: LegitimacyConfig = {
  scoreThreshold: 0.7,
  maxGapHours: 48,
  maxDuplicateProportion: 0.3,
  metricBounds: {
    // steps — CDC: average US adult ~4,000–6,000/day; fitness-focused
    // populations average 7,000–12,000. Hard upper bound at 60k catches
    // back-to-back ultra-marathon spam without flagging legitimate athletes.
    steps: bound(1500, 30000, 0.05, 1.5, 35000, 50000, CDC),

    // activeEnergy — kcal × 100. Sedentary baseline 100–200 kcal,
    // endurance training peaks 1500+ kcal. Bound generous at the top.
    activeEnergy: bound(5000, 250000, 0.05, 1.5, 200000, 300000, ACSM),

    // exerciseMins — Apple's 30-minute weekly target → daily mean 20–60
    // typical for fitness-focused population. Cap range at 6 hours/day.
    exerciseMins: bound(0, 240, null, 2.0, 240, 360, ACSM),

    // hrv — RMSSD in ms × 10. Adults 25–45 typically 25–80 ms; trained
    // athletes can hit 100+. Below 100 (= 10 ms) is borderline pathological.
    // Lower CV bound 0.03 because athletes have very stable HRV.
    hrv: bound(150, 1500, 0.03, 0.6, 600, 1200, SCHMITT),

    // restingHR — bpm × 10. Trained: 40–60. Sedentary: 60–80. Reject means
    // outside 35–95 (= 350–950 wire) as implausible for the audience. The
    // step-change bound (350 = 35 bpm) tolerates the largest realistic
    // day-over-day jump (heavy training, illness, dehydration); larger
    // excursions are extremely unusual.
    restingHR: bound(350, 950, 0.02, 0.3, 350, 400, ACSM),

    // sleepMins — daily total sleep. Mean 360–540 (6–9 h). Below 240
    // (4 h average) flags. Above 720 (12 h) flags.
    sleepMins: bound(240, 720, 0.05, 0.4, 480, 720, OHAYON),

    // vo2max — ml/kg/min × 10. ACSM 30–50 typical adult range, athletes 60+.
    // Hard upper bound 800 (= 80) catches "I'm Eliud Kipchoge" cases.
    vo2max: bound(180, 800, 0.0, 0.25, 80, 250, ACSM),

    // weight — grams ÷ 10 (raw 10000 = 100 kg). Range 30–200 kg.
    // Day-over-day cap 500 wire = 5 kg is the upper edge of hydration /
    // gut-content swings.
    weight: bound(3000, 20000, 0.0, 0.05, 500, 1500, CDC),

    // bodyFatPct — percent × 100. 5%–50%. Day-over-day cap 1000 = 10
    // percentage points (typical scales drift up to 5 pp).
    bodyFatPct: bound(500, 5000, 0.0, 0.2, 1000, 3000, CDC),

    // leanMass — grams ÷ 10. 25–110 kg. Range 5 kg over 90 days is typical.
    // Day-over-day cap 500 = 5 kg follows weight.
    leanMass: bound(2500, 11000, 0.0, 0.08, 500, 800, CDC),

    // sleep stage subtotals (mins)
    deepSleepMins: bound(30, 180, 0.05, 0.6, 120, 240, OHAYON),
    remSleepMins: bound(45, 200, 0.05, 0.6, 120, 240, OHAYON),
    lightSleepMins: bound(120, 400, 0.05, 0.5, 240, 480, OHAYON),
    awakeMins: bound(0, 120, null, null, 90, 180, OHAYON)
  },
  correlations: {
    // C.1: HRV up → RHR down. Population-level cohort studies (Schmitt 2013;
    // Lehrer & Eddie 2013) show ρ in roughly [-0.7, -0.2] depending on
    // sample size and noise. With ~70 paired days and high daily noise the
    // empirical correlation lands around -0.05 to -0.30; we require any
    // negative correlation as a baseline ("≤ -0.05"). Strongly positive
    // correlations are clearly synthesized.
    rhrHrvInverseMin: -0.05,

    // C.2: VO2 max improving → RHR dropping. We expect a directional trend
    // but noise can dampen it heavily. Allow up to -0.0 (any non-positive).
    vo2RhrInverseMin: -0.0,

    // C.3: VO2 max improving → HRV rising. Mirrors C.2 in sign.
    vo2HrvPositiveMin: 0.0,

    // C.4: active energy and exercise mins are mechanically linked but the
    // bulk of daily kcal comes from steps and non-exercise activity, so the
    // correlation is moderate (0.2–0.6 across the population) rather than
    // dominant. Threshold 0.2 catches "no link at all" (random data, A1).
    activeEnergyExerciseMin: 0.2
  },
  sleepStages: {
    deepMin: 0.1, // 10% — slightly under Ohayon's 13% to allow noise
    deepMax: 0.3,
    remMin: 0.15,
    remMax: 0.3,
    lightMin: 0.4,
    lightMax: 0.7,
    awakeMaxProportion: 0.2,
    sumTolerance: 0.1
  },
  bodyComp: {
    massTolerance: 0.06
  },
  minCoverage: {
    steps: 0.85,
    activeEnergy: 0.8,
    sleepMins: 0.7,
    restingHR: 0.6,
    hrv: 0.5,
    vo2max: 0.2 // VO2 max is computed sparsely by Apple Health
  },
  maxBackloadProportion: 0.5
};
