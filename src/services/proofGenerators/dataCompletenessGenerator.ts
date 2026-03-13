import type { HealthMetricClaim } from "@/types/healthMetricProof";
import type {
  DatasetCompleteness,
  AttestationTier,
} from "@/types/healthDataAttestation";
import type { GeneratorContext, ProofGenerator } from "./types";

export interface DataCompletenessInput {
  completeness: DatasetCompleteness;
  tier: AttestationTier;
}

export const dataCompletenessGenerator: ProofGenerator<DataCompletenessInput> =
  {
    type: "data_completeness",

    async generateClaim(
      input: DataCompletenessInput,
      _ctx: GeneratorContext,
    ): Promise<HealthMetricClaim> {
      const { completeness, tier } = input;

      const days = completeness.daysCovered;
      const score = completeness.score;

      const summary = `I have ${days} days of Apple Health data at ${score}% completeness (${tier.toUpperCase()} tier) between ${completeness.startDate} and ${completeness.endDate}`;

      return {
        type: "data_completeness",
        summary,
        metricKey: "appleHealth",
        period: {
          start: completeness.startDate,
          end: completeness.endDate,
        },
        details: {
          daysCovered: String(days),
          score: String(score),
          tier,
        },
      };
    },
  };
