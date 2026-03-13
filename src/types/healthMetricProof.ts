import type { HealthDataType } from "./healthDataAttestation";

export type HealthMetricProofType =
  | "metric_change"
  | "metric_range"
  | "exercise_summary"
  | "data_completeness"
  | "lab_result"
  | "body_composition";

export interface ClaimPeriod {
  start: string;
  end: string;
}

export interface HealthMetricClaim {
  type: HealthMetricProofType;
  summary: string;
  metricKey?: string;
  period?: ClaimPeriod;
  details?: Record<string, string>;
}

export interface HealthMetricProver {
  walletAddress: string;
  chainId: number;
  attestationUid?: string | null;
  attestationTxHash?: string | null;
  contractAddress?: string | null;
}

export interface HealthMetricEvidence {
  dataContentHash?: string | null;
  proofHash: string;
  attestationTxHash?: string | null;
  storjUri?: string | null;
  dataType?: string | null | HealthDataType;
}

export interface HealthMetricProofMetadata {
  createdAt: string;
  platform: "web" | "ios";
  appVersion?: string;
  generator?: string;
}

export interface HealthMetricProofDocument {
  proofId: string;
  claim: HealthMetricClaim;
  prover: HealthMetricProver;
  evidence: HealthMetricEvidence;
  metadata: HealthMetricProofMetadata;
  signature: string;
}

export interface HealthMetricProofVerificationResult {
  isValid: boolean;
  reason?: string | null;
  proof?: HealthMetricProofDocument | null;
}
