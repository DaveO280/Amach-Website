/**
 * Attestation tier derivation from completeness score.
 * Matches contract thresholds: Gold >= 80%, Silver >= 60%, Bronze >= 40%.
 */

export const TIER_THRESHOLDS = {
  GOLD_MIN_PERCENT: 80,
  SILVER_MIN_PERCENT: 60,
  BRONZE_MIN_PERCENT: 40,
} as const;

export type AttestationTierNum = 0 | 1 | 2 | 3; // NONE, BRONZE, SILVER, GOLD

/**
 * Derive tier from score in basis points (0-10000). Matches contract getAttestationTier.
 */
export function getTierFromScoreBasisPoints(
  scoreBasisPoints: number,
): AttestationTierNum {
  if (scoreBasisPoints >= 8000) return 3; // GOLD
  if (scoreBasisPoints >= 6000) return 2; // SILVER
  if (scoreBasisPoints >= 4000) return 1; // BRONZE
  return 0; // NONE
}

/**
 * Derive tier from score as percent (0-100). Use when you only have percent.
 */
export function getTierFromScorePercent(
  scorePercent: number,
): AttestationTierNum {
  const basisPoints = Math.round(scorePercent * 100);
  return getTierFromScoreBasisPoints(basisPoints);
}
