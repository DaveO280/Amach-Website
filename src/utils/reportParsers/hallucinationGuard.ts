/**
 * Post-extraction validation for LLM-parsed health data.
 *
 * Health accuracy is critical — a fabricated inflammation index is worse than
 * a missing one.  This module flags out-of-range or suspiciously round values
 * without removing them, giving callers a confidence penalty to apply.
 *
 * Flagged values are NOT automatically nullified.  The caller receives
 * warnings and a penalty and decides how to proceed.
 */

export interface FieldBounds {
  min?: number;
  max?: number;
  /**
   * Flag values that are whole-number multiples of 5.
   * Real biological measurements rarely land on exact round numbers;
   * a model that returns 50.0 for a metric that typically reads 47.3 is
   * likely estimating rather than reading.
   */
  flagRoundIntegers?: boolean;
}

export interface ValidationWarning {
  field: string;
  value: number;
  reason: string;
}

export interface GuardResult {
  warnings: ValidationWarning[];
  /** Subtract from the 0–1 confidence score.  Capped at 0.2. */
  confidencePenalty: number;
}

/**
 * Validate a flat map of fieldPath → value against declared bounds.
 * Use dot notation for nested fields (e.g. "diversity_resilience.shannon_diversity").
 */
export function validateExtractedValues(
  values: Record<string, number | undefined | null>,
  rules: Record<string, FieldBounds>,
  logTag: string,
): GuardResult {
  const warnings: ValidationWarning[] = [];

  for (const [field, bounds] of Object.entries(rules)) {
    const raw = values[field];
    if (raw == null) continue;
    const value = Number(raw);
    if (!isFinite(value)) continue;

    if (bounds.min !== undefined && value < bounds.min) {
      warnings.push({ field, value, reason: `below minimum ${bounds.min}` });
    }
    if (bounds.max !== undefined && value > bounds.max) {
      warnings.push({ field, value, reason: `above maximum ${bounds.max}` });
    }
    if (
      bounds.flagRoundIntegers &&
      Number.isInteger(value) &&
      value % 5 === 0 &&
      value !== 0
    ) {
      warnings.push({
        field,
        value,
        reason: "suspiciously round (whole-number multiple of 5)",
      });
    }
  }

  if (warnings.length > 0) {
    console.warn(
      `[${logTag}] ${warnings.length} suspicious value(s) flagged:`,
      warnings.map((w) => `${w.field}=${w.value} (${w.reason})`).join("; "),
    );
  }

  return {
    warnings,
    confidencePenalty: Math.min(0.2, warnings.length * 0.02),
  };
}

// ── Pre-built rule sets ───────────────────────────────────────────────────────

/** Validation rules for Tiny Health gut microbiome reports. */
export const GUT_HEALTH_VALIDATION_RULES: Record<string, FieldBounds> = {
  microbiome_score: { min: 0, max: 100, flagRoundIntegers: true },
  beneficial_pct: { min: 0, max: 100 },
  variable_pct: { min: 0, max: 100 },
  unfriendly_pct: { min: 0, max: 100 },
  unknown_pct: { min: 0, max: 100 },
  "diversity_resilience.shannon_diversity": { min: 0, max: 8 },
  "diversity_resilience.species_richness": {
    min: 0,
    max: 1000,
    flagRoundIntegers: true,
  },
  "diversity_resilience.microbiome_age": {
    min: 0,
    max: 120,
    flagRoundIntegers: true,
  },
  "diversity_resilience.gut_resilience_score": {
    min: 0,
    max: 100,
    flagRoundIntegers: true,
  },
  "diversity_resilience.bacteroidota": { min: 0, max: 100 },
  "diversity_resilience.firmicutes": { min: 0, max: 100 },
  "diversity_resilience.proteobacteria": { min: 0, max: 100 },
  "gut_barrier_inflammation.hexa_lps_index": {
    min: 0,
    max: 100,
    flagRoundIntegers: true,
  },
  "gut_barrier_inflammation.mucus_degradation_index": {
    min: 0,
    max: 100,
    flagRoundIntegers: true,
  },
  "gut_barrier_inflammation.hydrogen_sulfide_index": {
    min: 0,
    max: 100,
    flagRoundIntegers: true,
  },
};

/** Validation rules for DEXA scan reports. */
export const DEXA_VALIDATION_RULES: Record<string, FieldBounds> = {
  totalBodyFatPercent: { min: 0, max: 100 },
  "boneDensityTotal.bmd": { min: 0.3, max: 3.0 },
  "boneDensityTotal.tScore": { min: -6, max: 6 },
  "boneDensityTotal.zScore": { min: -6, max: 6 },
};
