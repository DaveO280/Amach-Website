import type { HealthMetricProofType } from "@/types/healthMetricProof";
import type { ProofGenerator } from "./types";
import { labResultGenerator } from "./labResultGenerator";
import { bodyCompositionGenerator } from "./bodyCompositionGenerator";
import { metricChangeGenerator } from "./metricChangeGenerator";
import { dataCompletenessGenerator } from "./dataCompletenessGenerator";

const registry = new Map<HealthMetricProofType, ProofGenerator>([
  ["lab_result", labResultGenerator],
  ["body_composition", bodyCompositionGenerator],
  ["metric_change", metricChangeGenerator],
  ["data_completeness", dataCompletenessGenerator],
  // metric_range and exercise_summary can be added later following same pattern
]);

export function getGenerator(
  type: HealthMetricProofType,
): ProofGenerator | undefined {
  return registry.get(type);
}
