import type { HealthMetricClaim } from "@/types/healthMetricProof";
import type { BloodworkReportData } from "@/types/reportData";
import type { GeneratorContext, ProofGenerator } from "./types";

export interface LabResultInput {
  report: BloodworkReportData;
}

function extractCoreMetrics(report: BloodworkReportData): {
  ldl?: number;
  hdl?: number;
  triglycerides?: number;
  hba1c?: number;
} {
  const values: Record<string, number> = {};

  for (const metric of report.metrics) {
    if (metric.value == null) continue;
    const key = metric.name.toLowerCase();
    values[key] = metric.value;
  }

  const find = (...names: string[]): number | undefined =>
    names
      .map((n) => values[n.toLowerCase()])
      .find((v) => typeof v === "number");

  return {
    ldl: find("ldl", "ldl cholesterol", "ldl-c"),
    hdl: find("hdl", "hdl cholesterol", "hdl-c"),
    triglycerides: find("triglycerides", "triglyceride"),
    hba1c: find("hba1c", "hemoglobin a1c", "a1c"),
  };
}

export const labResultGenerator: ProofGenerator<LabResultInput> = {
  type: "lab_result",

  async generateClaim(
    input: LabResultInput,
    _ctx: GeneratorContext,
  ): Promise<HealthMetricClaim> {
    const { report } = input;
    const { ldl, hdl, triglycerides, hba1c } = extractCoreMetrics(report);

    const pieces: string[] = [];
    if (ldl != null) pieces.push(`LDL ${ldl} mg/dL (optimal <100)`);
    if (hdl != null) pieces.push(`HDL ${hdl} mg/dL (optimal >60)`);
    if (triglycerides != null) {
      pieces.push(`Triglycerides ${triglycerides} mg/dL (optimal <150)`);
    }
    if (hba1c != null) pieces.push(`HbA1c ${hba1c}% (optimal <5.7)`);

    const date = report.reportDate ?? "recent panel";
    const coreSummary =
      pieces.length > 0
        ? pieces.join(", ")
        : "Panel values within recorded ranges";

    const summary = `Bloodwork from ${date}: ${coreSummary}`;

    return {
      type: "lab_result",
      summary,
      metricKey: "lab_panel",
      period: undefined,
      details: {
        date,
        panel: "bloodwork",
        source: report.source ?? "",
        laboratory: report.laboratory ?? "",
      },
    };
  },
};
