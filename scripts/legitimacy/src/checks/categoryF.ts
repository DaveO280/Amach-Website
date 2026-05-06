/**
 * Category F — aggregate scoring and pass/fail recommendation.
 *
 *   F.1 Aggregate legitimacy score in [0, 1]. Category A failures force
 *       the score to 0. Otherwise the score is a category-weighted
 *       aggregate:
 *
 *           score = wB·B + wC·C + wD·D + wE·E
 *
 *       where each category's contribution is its weighted internal pass
 *       rate. Per-check weights inside a category emphasise the more
 *       diagnostic checks (e.g. RHR–HRV inverse correlation outweighs
 *       a noisy mean-bound check).
 *
 *       Category weights (sum to 1):
 *           B (statistical bounds):    0.20
 *           C (correlations):          0.35  ← most diagnostic
 *           D (temporal patterns):     0.25
 *           E (continuity):            0.20
 *
 *       The C-heavy distribution reflects the brief: "correlations and
 *       temporal patterns weighted highest."
 *
 *   F.2 Pass/fail recommendation = score >= configured threshold (0.7).
 *
 *   F.3 Specific findings — list of failure / warning messages for the
 *       narrative summary.
 */

import type {
  CategoryResult,
  CheckResult,
  CheckStatus,
  LegitimacyConfig
} from "../types";

const STATUS_VALUE: Record<CheckStatus, number> = {
  pass: 1,
  warn: 0.6,
  fail: 0
};

const CATEGORY_WEIGHTS: Record<"B" | "C" | "D" | "E", number> = {
  B: 0.2,
  C: 0.35,
  D: 0.25,
  E: 0.2
};

/**
 * Primary diagnostic checks. Failing one of these is, on its own, strong
 * evidence the data is fabricated or manipulated, so the aggregate score
 * is multiplied by 0.6 per diagnostic failure. Two diagnostic failures
 * push the score from ≈ 0.95 down past the 0.7 threshold even if every
 * other check passes.
 */
const PRIMARY_DIAGNOSTIC_IDS = new Set<string>([
  "C.1",
  "C.2",
  "C.3",
  "C.4",
  "C.5",
  "D.2",
  "D.4",
  "D.5",
  "E.1",
  "E.3"
]);

const DIAGNOSTIC_PENALTY = 0.6;

export interface ScoringOutput {
  score: number;
  threshold: number;
  recommendation: "pass" | "fail";
  failures: string[];
  warnings: string[];
  notes: string[];
  /** Categorised view of the underlying checks (a copy, not a mutation). */
  categories: CategoryResult[];
}

/**
 * Score a flat list of check results. `categoryAFailed` short-circuits the
 * score to 0 when cryptographic anchoring failed.
 */
export function score(
  allResults: CheckResult[],
  config: LegitimacyConfig,
  categoryAFailed: boolean
): ScoringOutput {
  const groups: Record<"A" | "B" | "C" | "D" | "E" | "F", CheckResult[]> = {
    A: [],
    B: [],
    C: [],
    D: [],
    E: [],
    F: []
  };
  for (const r of allResults) {
    groups[r.category].push(r);
  }

  // Per-category status — fail if any failure, otherwise warn if any warn,
  // otherwise pass.
  const categories: CategoryResult[] = (["A", "B", "C", "D", "E"] as const).map(
    (cat) => {
      const checks = groups[cat];
      let status: CheckStatus = "pass";
      if (checks.some((c) => c.status === "fail")) status = "fail";
      else if (checks.some((c) => c.status === "warn")) status = "warn";
      return { category: cat, status, checks };
    }
  );

  let computed = 0;
  if (!categoryAFailed) {
    let totalCategoryWeight = 0;
    for (const cat of ["B", "C", "D", "E"] as const) {
      const checks = groups[cat];
      if (checks.length === 0) continue;

      let internalNum = 0;
      let internalDen = 0;
      for (const r of checks) {
        const w = r.weight ?? 1;
        if (w <= 0) continue;
        internalNum += STATUS_VALUE[r.status] * w;
        internalDen += w;
      }
      if (internalDen === 0) continue;
      const internalRate = internalNum / internalDen;

      const catWeight = CATEGORY_WEIGHTS[cat];
      computed += internalRate * catWeight;
      totalCategoryWeight += catWeight;
    }
    if (totalCategoryWeight > 0) {
      // Renormalise so missing categories don't artificially deflate the
      // score (e.g. if E is empty for a malformed input).
      computed = computed / totalCategoryWeight;
    } else {
      computed = 0;
    }

    // Multiplicative penalty for primary diagnostic failures. Each one
    // multiplies the score by 0.6 — two of them push almost any aggregate
    // score below the 0.7 threshold.
    let diagnosticHits = 0;
    for (const r of allResults) {
      if (r.status === "fail" && PRIMARY_DIAGNOSTIC_IDS.has(r.id)) {
        diagnosticHits++;
      }
    }
    if (diagnosticHits > 0) {
      computed = computed * Math.pow(DIAGNOSTIC_PENALTY, diagnosticHits);
    }
  }
  const finalScore = categoryAFailed ? 0 : Math.max(0, Math.min(1, computed));

  const failures = allResults
    .filter((r) => r.status === "fail")
    .map((r) => `[${r.id}] ${r.message}`);
  const warnings = allResults
    .filter((r) => r.status === "warn")
    .map((r) => `[${r.id}] ${r.message}`);

  const notes: string[] = [];
  if (categoryAFailed) {
    notes.push(
      "Category A failed — cryptographic anchoring did not match. Score forced to 0."
    );
  } else {
    notes.push(
      "Score = (0.20·B + 0.35·C + 0.25·D + 0.20·E) × 0.6^N where N = number of primary-diagnostic failures."
    );
  }

  // Append the summary check for transparency.
  const summaryCheck: CheckResult = {
    id: "F.1",
    category: "F",
    name: "Aggregate legitimacy score",
    status:
      finalScore >= config.scoreThreshold ? "pass" : finalScore <= 0 ? "fail" : "warn",
    message: `Score ${finalScore.toFixed(3)} (threshold ${config.scoreThreshold}).`,
    value: Math.round(finalScore * 1000) / 1000,
    bound: `≥ ${config.scoreThreshold}`,
    weight: 0
  };
  const recommendation: "pass" | "fail" =
    finalScore >= config.scoreThreshold ? "pass" : "fail";
  const recommendCheck: CheckResult = {
    id: "F.2",
    category: "F",
    name: "Pass / fail recommendation",
    status: recommendation === "pass" ? "pass" : "fail",
    message:
      recommendation === "pass"
        ? "Recommendation: PASS. Score meets the configured threshold."
        : "Recommendation: FAIL. Score below the configured threshold.",
    weight: 0
  };
  const findingsCheck: CheckResult = {
    id: "F.3",
    category: "F",
    name: "Findings summary",
    status:
      failures.length === 0 && warnings.length === 0
        ? "pass"
        : failures.length === 0
          ? "warn"
          : "fail",
    message:
      failures.length === 0 && warnings.length === 0
        ? "No findings. All checks passed."
        : `${failures.length} failure(s), ${warnings.length} warning(s). See report for details.`,
    weight: 0
  };

  categories.push({
    category: "F",
    status:
      finalScore >= config.scoreThreshold ? "pass" : "fail",
    checks: [summaryCheck, recommendCheck, findingsCheck]
  });

  return {
    score: finalScore,
    threshold: config.scoreThreshold,
    recommendation,
    failures,
    warnings,
    notes,
    categories
  };
}
