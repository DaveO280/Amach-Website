import type { GutHealthReportData } from "@/types/reportData";
import { formatGutHealthReportForAI } from "@/utils/reportFormatters";
import type {
  AgentDataQualityAssessment,
  AgentExecutionContext,
  AgentInsight,
} from "./types";
import { BaseHealthAgent } from "./BaseHealthAgent";

interface GutHealthAgentData {
  reports: GutHealthReportData[];
  actualAgeYears?: number;
}

export class GutHealthAgent extends BaseHealthAgent {
  id = "gut_health";
  name = "Gut Microbiome Specialist";
  expertise = [
    "Gut microbiome composition interpretation",
    "Gut barrier integrity and inflammation markers",
    "SCFA production and digestive capacity analysis",
  ];
  systemPrompt = `You are the Gut Microbiome Specialist within the Luma multi-agent team.
You analyze structured gut microbiome test reports (e.g., Tiny Health) covering beneficial/pathogenic bacteria, gut barrier inflammation, short-chain fatty acids (SCFAs), digestive capacity, diversity/resilience, and microbial enzymes/metabolites.

Key terminology:
- Inflammation indices (Hexa-LPS index, hydrogen sulfide index, mucus degradation index): 0-100 scales measuring inflammatory or gut-barrier-damaging compound potential. Higher = more concerning.
- Pathogenic/opportunistic bacteria (Enterobacteriaceae, E. coli, E. flexneri, H. pylori, Candida, etc.): reported as % abundance; elevated levels are flagged "needs support".
- Beneficial microbes (Faecalibacterium, Akkermansia, Blautia, Roseburia, Bifidobacterium): butyrate/SCFA producers and gut-lining supporters; higher abundance is favorable.
- Short-chain fatty acids (butyrate, propionate, acetate): 0-100 production-capacity indices; butyrate is the primary fuel for colon cells.
- Digestive capacity (resistant starch, cellulose, FOS/GOS/XOS, vitamin production): 0-100 capacity indices for fermenting specific substrates and producing micronutrients.
- Diversity & resilience (Shannon diversity, species richness, microbiome age, Firmicutes/Bacteroidota ratio): overall ecosystem health; microbiome age vs. chronological age indicates whether the gut is aging faster or slower than the person.
- Status labels on every metric: "needs_support" (flagged/critical), "improving", "okay", "great".

Focus points:
- Prioritize "needs_support" findings, especially inflammation indices and pathogenic bacteria — these are the most actionable.
- Highlight standout beneficial findings (high SCFA producers, high diversity, low pathogen load).
- Compare microbiome age to chronological age when both are available and call out the gap.
- Note digestive capacity gaps that could explain symptoms (bloating, irregularity, nutrient deficiencies).
- Connect findings to other domains (bloodwork inflammation markers, activity, recovery) when logical.
- Suggest evidence-informed next steps (specific fiber sources, probiotic strains, retesting) with clear rationale.

Return structured JSON with findings, trends, concerns, correlations, and recommendations.`;

  protected extractRelevantData(
    context: AgentExecutionContext,
  ): GutHealthAgentData {
    const reports =
      context.availableData.reports
        ?.map((summary) => summary.report)
        .filter(
          (report): report is GutHealthReportData =>
            report.type === "gut-health",
        ) ?? [];
    return { reports, actualAgeYears: context.profile?.ageYears };
  }

  protected assessDataQuality(
    data: GutHealthAgentData,
  ): AgentDataQualityAssessment {
    const reportCount = data.reports.length;
    if (reportCount === 0) {
      return {
        score: 0,
        dayCount: 0,
        sampleFrequency: "none",
        strengths: [],
        limitations: ["No gut health reports available"],
        missing: ["Structured gut microbiome data"],
      };
    }

    const dates = data.reports
      .map((report) => report.collection_date ?? report.report_date)
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
      Math.min(1, reportCount / 2) *
      (data.reports.some(
        (report) => report.summary.microbiome_score !== undefined,
      )
        ? 1
        : 0.5);

    return {
      score: qualityScore,
      dayCount: reportCount,
      sampleFrequency:
        reportCount > 1 ? "multi-test (longitudinal)" : "single test",
      strengths: [
        `${reportCount} gut health report${reportCount > 1 ? "s" : ""} available`,
      ],
      limitations: [],
      missing: [],
      dateRange,
    };
  }

  protected formatDataForAnalysis(data: GutHealthAgentData): string {
    if (data.reports.length === 0) {
      return "No gut health report data available.";
    }

    const actualAgeYears =
      data.actualAgeYears !== undefined
        ? Math.round(data.actualAgeYears)
        : undefined;

    return data.reports
      .map(
        (report, index) =>
          `Report ${index + 1}:\n${formatGutHealthReportForAI(report, { actualAgeYears })}`,
      )
      .join("\n\n");
  }

  protected postProcessInsight(
    insight: AgentInsight,
    data: GutHealthAgentData,
  ): AgentInsight {
    if (data.reports.length === 0) {
      return insight;
    }

    const latestReport = data.reports[0];
    const metadata = {
      gutMicrobiomeScore: latestReport.summary.microbiome_score,
      gutType: latestReport.summary.gut_type,
      gutBeneficialPct: latestReport.summary.beneficial_pct,
      gutUnfriendlyPct: latestReport.summary.unfriendly_pct,
      gutCollectionDate: latestReport.collection_date,
      gutInflammationFlag:
        latestReport.category_statuses.gut_barrier_inflammation ===
        "needs_support",
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
