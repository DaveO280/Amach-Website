import type {
  HealthMetricClaim,
  HealthMetricProofType,
} from "@/types/healthMetricProof";

export interface GeneratorContext {
  walletAddress: string;
  chainId: number;
  platform: "web" | "ios";
  appVersion?: string;
}

export interface ProofGenerator<I = unknown> {
  type: HealthMetricProofType;
  generateClaim(input: I, ctx: GeneratorContext): Promise<HealthMetricClaim>;
}
