import type { HealthMetricClaim } from "@/types/healthMetricProof";
import type { DexaReportData } from "@/types/reportData";
import type { GeneratorContext, ProofGenerator } from "./types";

export interface BodyCompositionInput {
  report: DexaReportData;
}

export const bodyCompositionGenerator: ProofGenerator<BodyCompositionInput> = {
  type: "body_composition",

  async generateClaim(
    input: BodyCompositionInput,
    _ctx: GeneratorContext,
  ): Promise<HealthMetricClaim> {
    const { report } = input;

    const rows: string[] = [];

    if (typeof report.totalBodyFatPercent === "number") {
      rows.push(`Body fat ${report.totalBodyFatPercent.toFixed(1)}%`);
    }
    if (typeof report.totalLeanMassKg === "number") {
      rows.push(`Lean mass ${report.totalLeanMassKg.toFixed(1)} kg`);
    }
    if (typeof report.visceralFatAreaCm2 === "number") {
      rows.push(
        `Visceral fat area ${report.visceralFatAreaCm2.toFixed(1)} cm²`,
      );
    } else if (typeof report.visceralFatRating === "number") {
      rows.push(`Visceral fat rating ${report.visceralFatRating.toFixed(1)}`);
    }
    if (report.boneDensityTotal?.tScore != null) {
      rows.push(
        `Bone density T-score ${report.boneDensityTotal.tScore.toFixed(1)}`,
      );
    }

    const coreSummary =
      rows.length > 0
        ? rows.join(", ")
        : "Body composition scan within recorded ranges";

    const date = report.scanDate ?? "recent scan";
    const summary = `DEXA scan from ${date}: ${coreSummary}`;

    return {
      type: "body_composition",
      summary,
      metricKey: "body_composition",
      period: undefined,
      details: {
        date,
        source: report.source ?? "",
      },
    };
  },
};
