import type { HealthMetricClaim } from "@/types/healthMetricProof";
import type { GeneratorContext, ProofGenerator } from "./types";

export interface MetricChangeInput {
  metricKey: string; // e.g. "HKQuantityTypeIdentifierHeartRateVariabilitySDNN"
  metricLabel: string; // e.g. "HRV"
  startDate: string; // ISO date
  endDate: string; // ISO date
  startValue: number;
  endValue: number;
  unit?: string;
}

export const metricChangeGenerator: ProofGenerator<MetricChangeInput> = {
  type: "metric_change",

  async generateClaim(
    input: MetricChangeInput,
    _ctx: GeneratorContext,
  ): Promise<HealthMetricClaim> {
    const delta = input.endValue - input.startValue;
    const pct =
      input.startValue !== 0
        ? ((input.endValue - input.startValue) / input.startValue) * 100
        : null;

    const sign = delta >= 0 ? "+" : "-";
    const absDelta = Math.abs(delta);
    const absPct = pct != null ? Math.abs(pct) : null;

    const roundedDelta = Number(absDelta.toFixed(1));
    const roundedPct = absPct != null ? Number(absPct.toFixed(1)) : null;

    const unit = input.unit ? ` ${input.unit}` : "";
    const pctText = roundedPct != null ? ` (${sign}${roundedPct}%)` : "";

    const summary = `${input.metricLabel} changed by ${sign}${roundedDelta}${unit}${pctText} between ${input.startDate} and ${input.endDate}`;

    return {
      type: "metric_change",
      summary,
      metricKey: input.metricKey,
      period: {
        start: input.startDate,
        end: input.endDate,
      },
      details: {
        startValue: String(input.startValue),
        endValue: String(input.endValue),
        delta: String(delta),
        unit: input.unit ?? "",
      },
    };
  },
};
