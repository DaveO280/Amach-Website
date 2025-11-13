import type { BloodworkMetric, BloodworkReportData } from "@/types/reportData";
import type {
  AgentDataQualityAssessment,
  AgentExecutionContext,
  AgentInsight,
} from "./types";
import { BaseHealthAgent } from "./BaseHealthAgent";

interface BloodworkAgentData {
  reports: BloodworkReportData[];
  metrics: BloodworkMetric[];
}

const FLAG_PRIORITY: Record<string, number> = {
  "critical-high": 4,
  "critical-low": 4,
  high: 3,
  low: 3,
  normal: 1,
};

function sortBySeverity(metrics: BloodworkMetric[]): BloodworkMetric[] {
  return [...metrics].sort((a, b) => {
    const aScore = a.flag ? (FLAG_PRIORITY[a.flag] ?? 2) : 2;
    const bScore = b.flag ? (FLAG_PRIORITY[b.flag] ?? 2) : 2;
    if (bScore !== aScore) return bScore - aScore;
    return (b.value ?? 0) - (a.value ?? 0);
  });
}

function formatMetric(metric: BloodworkMetric): string {
  const pieces = [`${metric.name}`];
  if (metric.value !== undefined) {
    pieces.push(`${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`);
  } else if (metric.valueText) {
    pieces.push(metric.valueText);
  }
  if (metric.flag && metric.flag !== "normal") {
    pieces.push(`[${metric.flag.toUpperCase()}]`);
  }
  if (metric.referenceRange) {
    pieces.push(`Ref: ${metric.referenceRange}`);
  }
  return pieces.join(" ");
}

function formatPanelName(panel: string): string {
  return panel
    .split(/[\s_\-]+/)
    .map(
      (segment) =>
        segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
    )
    .join(" ");
}

export class BloodworkAgent extends BaseHealthAgent {
  id = "bloodwork";
  name = "Clinical Bloodwork Specialist";
  expertise = [
    "Laboratory biomarker interpretation",
    "Cardiometabolic and endocrine panel review",
    "Inflammation and hematology assessment",
  ];
  systemPrompt = `You are the Clinical Bloodwork Specialist within the Cosaint multi-agent team.
You analyze structured bloodwork metrics to identify out-of-range values, trends across panels, and their implications for metabolic, cardiovascular, hormonal, and inflammatory health.

Focus points:
- Prioritize clinically significant deviations from reference ranges.
- Group findings by panel (lipid, metabolic, thyroid, hormone, etc.).
- Highlight interactions with other health domains when logical (e.g., lipids with activity, inflammatory markers with sleep recovery).
- Suggest evidence-informed next steps (lifestyle, retesting, physician follow-up) with clear rationale.

Return structured JSON with findings, trends, concerns, correlations, and recommendations.`;

  protected extractRelevantData(
    context: AgentExecutionContext,
  ): BloodworkAgentData {
    const reports =
      context.availableData.reports
        ?.map((summary) => summary.report)
        .filter(
          (report): report is BloodworkReportData =>
            report.type === "bloodwork",
        ) ?? [];
    const metrics = reports.flatMap((report) => report.metrics);
    return { reports, metrics };
  }

  protected assessDataQuality(
    data: BloodworkAgentData,
  ): AgentDataQualityAssessment {
    const metricCount = data.metrics.length;
    if (metricCount === 0) {
      return {
        score: 0,
        dayCount: 0,
        sampleFrequency: "none",
        strengths: [],
        limitations: ["No structured bloodwork data available"],
        missing: ["Laboratory panel metrics"],
      };
    }

    const flagged = data.metrics.filter(
      (metric) => metric.flag && metric.flag !== "normal",
    );

    const score = Math.min(
      1,
      (metricCount > 0 ? 0.4 : 0) +
        (flagged.length > 0 ? 0.3 : 0) +
        (data.reports.length > 1 ? 0.3 : 0.1),
    );

    return {
      score,
      dayCount: data.reports.length,
      sampleFrequency:
        data.reports.length > 1 ? "multiple bloodwork panels" : "single panel",
      strengths: [`${metricCount} metrics parsed across bloodwork panels`],
      limitations: [],
      missing: [],
    };
  }

  protected formatDataForAnalysis(data: BloodworkAgentData): string {
    if (data.metrics.length === 0) {
      return "No bloodwork metrics available.";
    }

    const flaggedMetrics = sortBySeverity(
      data.metrics.filter((metric) => metric.flag && metric.flag !== "normal"),
    ).slice(0, 12);

    const neutralMetrics = sortBySeverity(
      data.metrics.filter((metric) => !metric.flag || metric.flag === "normal"),
    ).slice(0, 8);

    const panelSummary = Object.entries(
      data.reports.reduce<Record<string, number>>((acc, report) => {
        Object.keys(report.panels).forEach((panel) => {
          acc[panel] = (acc[panel] ?? 0) + report.panels[panel].length;
        });
        return acc;
      }, {}),
    )
      .map(([panel, count]) => `${panel}: ${count} metrics`)
      .join("; ");

    return [
      `Panels: ${panelSummary || "not specified"}.`,
      flaggedMetrics.length
        ? `Flagged metrics:\n${flaggedMetrics
            .map((metric) => `- ${formatMetric(metric)}`)
            .join("\n")}`
        : "No flagged metrics detected.",
      neutralMetrics.length
        ? `Representative in-range metrics:\n${neutralMetrics
            .map((metric) => `- ${formatMetric(metric)}`)
            .join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  protected buildDetailedPrompt(
    query: string,
    data: BloodworkAgentData,
    quality: AgentDataQualityAssessment,
  ): string {
    const basePrompt = super.buildDetailedPrompt(query, data, quality);

    const directives = [
      "Prioritize clinically significant abnormalities (critical-high/critical-low) before moderate deviations.",
      "Group findings by panel (lipid, metabolic, thyroid, hormone, inflammation, hematology) and explain the implications.",
      "Reference quantitative values, units, and reference ranges when providing findings.",
      "Suggest actionable next steps (lifestyle adjustments, medical follow-up, retesting intervals) tied directly to the data.",
      "Call out missing or outdated labs that limit interpretation, and recommend relevant follow-ups.",
    ];

    return `${basePrompt}

BLOODWORK AGENT DIRECTIVES:
${directives.map((line) => `- ${line}`).join("\n")}`;
  }

  protected postProcessInsight(
    insight: AgentInsight,
    data: BloodworkAgentData,
  ): AgentInsight {
    const flaggedMetrics = data.metrics.filter(
      (metric) => metric.flag && metric.flag !== "normal",
    );
    const panelNames = [
      ...new Set(
        data.metrics
          .map((metric) => metric.panel)
          .filter((panel): panel is string => Boolean(panel)),
      ),
    ];
    const panelSummaries = Object.entries(
      data.reports.reduce<Record<string, BloodworkMetric[]>>((acc, report) => {
        Object.entries(report.panels).forEach(([panel, metrics]) => {
          if (!acc[panel]) {
            acc[panel] = [];
          }
          acc[panel].push(...metrics);
        });
        return acc;
      }, {}),
    ).map(([panel, metrics]) => {
      const flagged = sortBySeverity(
        metrics.filter((metric) => metric.flag && metric.flag !== "normal"),
      ).slice(0, 5);
      const inRange = metrics
        .filter((metric) => !metric.flag || metric.flag === "normal")
        .slice(0, 3);
      const flaggedText = flagged.length
        ? flagged.map((metric) => formatMetric(metric)).join("; ")
        : "No flagged markers";
      const inRangeText = inRange.length
        ? `In-range examples: ${inRange
            .map((metric) => formatMetric(metric))
            .join("; ")}`
        : "";
      const panelLabel = formatPanelName(panel);
      return `${panelLabel}: ${flaggedText}${
        inRangeText ? `. ${inRangeText}` : ""
      }`;
    });

    return {
      ...insight,
      metadata: {
        ...insight.metadata,
        bloodworkFlaggedMetrics: flaggedMetrics.length,
        bloodworkPanels: panelNames,
        bloodworkReportDate: data.reports[0]?.reportDate,
        bloodworkPanelSummaries: panelSummaries,
      },
    };
  }
}
