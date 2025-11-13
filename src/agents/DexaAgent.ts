import type { DexaReportData, DexaRegionMetrics } from "@/types/reportData";
import type {
  AgentDataQualityAssessment,
  AgentExecutionContext,
  AgentInsight,
} from "./types";
import { BaseHealthAgent } from "./BaseHealthAgent";

interface DexaAgentData {
  reports: DexaReportData[];
}

function formatRegion(region: DexaRegionMetrics): string {
  const parts: string[] = [];
  if (region.bodyFatPercent !== undefined) {
    parts.push(`fat ${region.bodyFatPercent.toFixed(1)}%`);
  }
  if (region.leanMassKg !== undefined) {
    parts.push(`lean ${region.leanMassKg.toFixed(1)} kg`);
  }
  if (region.fatMassKg !== undefined) {
    parts.push(`fat mass ${region.fatMassKg.toFixed(1)} kg`);
  }
  if (region.boneDensityGPerCm2 !== undefined) {
    parts.push(`BMD ${region.boneDensityGPerCm2.toFixed(3)} g/cm²`);
  }
  if (region.tScore !== undefined) {
    parts.push(`T-score ${region.tScore.toFixed(2)}`);
  }
  if (region.zScore !== undefined) {
    parts.push(`Z-score ${region.zScore.toFixed(2)}`);
  }
  return `${region.region}: ${parts.join(", ")}`;
}

export class DexaAgent extends BaseHealthAgent {
  id = "dexa";
  name = "DEXA Composition Specialist";
  expertise = [
    "Body composition interpretation",
    "Visceral fat and android/gynoid distribution",
    "Bone density and osteoporosis risk",
  ];
  systemPrompt = `You are the DEXA Composition Specialist within the Cosaint multi-agent team.
You analyze structured DEXA scan data to interpret body composition, visceral fat, muscular balance, and bone density metrics.

Focus points:
- Evaluate overall body fat %, android/gynoid ratio, visceral fat, and regional composition balance.
- Assess bone density (BMD, T-score, Z-score) and highlight osteoporosis risk or improvements.
- Track change over time when multiple scans exist.
- Connect findings to other domains (activity, recovery, cardiovascular) when logical.
- Flag concerning asymmetries or rapid changes.

Return structured JSON with findings, trends, concerns, correlations, and recommendations.`;

  protected extractRelevantData(context: AgentExecutionContext): DexaAgentData {
    const reports =
      context.availableData.reports
        ?.map((summary) => summary.report)
        .filter((report): report is DexaReportData => report.type === "dexa") ??
      [];
    return { reports };
  }

  protected assessDataQuality(data: DexaAgentData): AgentDataQualityAssessment {
    const reportCount = data.reports.length;
    if (reportCount === 0) {
      return {
        score: 0,
        dayCount: 0,
        sampleFrequency: "none",
        strengths: [],
        limitations: ["No DEXA reports available"],
        missing: ["Structured DEXA scan data"],
      };
    }

    const dates = data.reports
      .map((report) => report.scanDate)
      .filter((date): date is string => Boolean(date))
      .map((date) => new Date(date));
    const dateRange =
      dates.length > 0
        ? {
            start: new Date(Math.min(...dates.map((date) => date.getTime()))),
            end: new Date(Math.max(...dates.map((date) => date.getTime()))),
          }
        : undefined;

    const qualityScore =
      Math.min(1, reportCount / 3) *
      (data.reports.some(
        (report) =>
          report.totalBodyFatPercent !== undefined ||
          report.boneDensityTotal?.tScore !== undefined,
      )
        ? 1
        : 0.5);

    return {
      score: qualityScore,
      dayCount: reportCount,
      sampleFrequency:
        reportCount > 1 ? "multi-scan (longitudinal)" : "single evaluation",
      strengths: [
        `${reportCount} DEXA report${reportCount > 1 ? "s" : ""} available`,
      ],
      limitations: [],
      missing: [],
      dateRange,
    };
  }

  protected formatDataForAnalysis(data: DexaAgentData): string {
    if (data.reports.length === 0) {
      return "No DEXA report data available.";
    }

    return data.reports
      .map((report, index) => {
        const parts: string[] = [];
        parts.push(
          `Report ${index + 1} (${report.scanDate ?? "Date N/A"}): Total body fat ${report.totalBodyFatPercent ?? "N/A"}%, lean mass ${report.totalLeanMassKg ?? "N/A"} kg, visceral fat rating ${report.visceralFatRating ?? "N/A"}, android/gynoid ratio ${report.androidGynoidRatio ?? "N/A"}.`,
        );
        if (report.boneDensityTotal) {
          parts.push(
            `Bone density: BMD ${report.boneDensityTotal.bmd ?? "N/A"} g/cm², T-score ${report.boneDensityTotal.tScore ?? "N/A"}, Z-score ${report.boneDensityTotal.zScore ?? "N/A"}.`,
          );
        }
        if (report.regions.length) {
          parts.push(
            `Regions: ${report.regions
              .slice(0, 6)
              .map((region) => formatRegion(region))
              .join(" | ")}`,
          );
        }
        return parts.join(" ");
      })
      .join("\n");
  }

  protected buildDetailedPrompt(
    query: string,
    data: DexaAgentData,
    quality: AgentDataQualityAssessment,
  ): string {
    const basePrompt = super.buildDetailedPrompt(query, data, quality);

    const directives = [
      "Quantify changes in total body fat %, visceral fat metrics, and android/gynoid ratio when multiple scans exist.",
      "Interpret bone density metrics (BMD, T-score, Z-score) in the context of osteoporosis risk.",
      "Call out regional imbalances (e.g., limb asymmetry, trunk vs limb distribution).",
      "Highlight implications for metabolic health, cardiovascular load, or recovery where supported.",
      "Include actionable recommendations tied to the data (nutrition, training, follow-up testing).",
    ];

    return `${basePrompt}

DEXA AGENT DIRECTIVES:
${directives.map((line) => `- ${line}`).join("\n")}`;
  }

  protected postProcessInsight(
    insight: AgentInsight,
    data: DexaAgentData,
  ): AgentInsight {
    if (data.reports.length === 0) {
      return insight;
    }

    const latestReport = data.reports[0];
    const regionSummaries = latestReport.regions
      .slice(0, 6)
      .map((region) => formatRegion(region));
    const metadata = {
      dexaTotalBodyFatPercent: latestReport.totalBodyFatPercent,
      dexaVisceralFatRating: latestReport.visceralFatRating,
      dexaAndroidGynoidRatio: latestReport.androidGynoidRatio,
      dexaBoneDensityTScore: latestReport.boneDensityTotal?.tScore,
      dexaScanDate: latestReport.scanDate,
      dexaRegionSummaries: regionSummaries,
    };

    return {
      ...insight,
      metadata: {
        ...insight.metadata,
        ...metadata,
      },
    };
  }
}
