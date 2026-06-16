/**
 * Utilities for formatting structured health reports for AI consumption
 * This extracts only relevant metrics instead of sending full PDF text
 */

import type {
  ParsedReportSummary,
  DexaReportData,
  BloodworkReportData,
  GutHealthMetrics,
  GutHealthReportData,
} from "@/types/reportData";
import {
  getGutMetricLabel,
  getGutMetricDescription,
  formatGutMetricValue,
  gutStatusLabel,
} from "@/utils/gutHealthGlossary";

/**
 * Extract a display date for any parsed report type. Metadata selection
 * only — no clinical interpretation — so it stays generic across report
 * types without needing per-type system-prompt knowledge.
 */
export function getReportDateLabel(
  report: ParsedReportSummary["report"],
): string | undefined {
  switch (report.type) {
    case "dexa":
      return report.scanDate;
    case "bloodwork":
    case "medical-record":
      return report.reportDate;
    case "gut-health":
      return report.collection_date ?? report.report_date;
    default:
      return undefined;
  }
}

/**
 * Format a DEXA report for AI consumption (structured metrics only)
 */
function formatDexaReportForAI(report: DexaReportData): string {
  const lines: string[] = [];

  lines.push(
    `DEXA Scan Report${report.scanDate ? ` (${report.scanDate})` : ""}`,
  );

  if (report.totalBodyFatPercent !== undefined) {
    lines.push(`  Total Body Fat: ${report.totalBodyFatPercent}%`);
  }
  if (report.totalLeanMassKg !== undefined) {
    lines.push(`  Total Lean Mass: ${report.totalLeanMassKg} kg`);
  }
  if (report.visceralFatRating !== undefined) {
    lines.push(`  Visceral Fat Rating: ${report.visceralFatRating}`);
  }
  if (report.visceralFatVolumeCm3 !== undefined) {
    lines.push(`  Visceral Fat Volume: ${report.visceralFatVolumeCm3} cm³`);
  }
  if (report.androidGynoidRatio !== undefined) {
    lines.push(`  Android/Gynoid Ratio: ${report.androidGynoidRatio}`);
  }

  if (report.boneDensityTotal) {
    lines.push(
      `  Bone Density (BMD): ${report.boneDensityTotal.bmd ?? "n/a"} g/cm²`,
    );
    if (report.boneDensityTotal.tScore !== undefined) {
      lines.push(`  T-Score: ${report.boneDensityTotal.tScore}`);
    }
    if (report.boneDensityTotal.zScore !== undefined) {
      lines.push(`  Z-Score: ${report.boneDensityTotal.zScore}`);
    }
  }

  if (report.regions && report.regions.length > 0) {
    lines.push(`  Regional Analysis:`);
    report.regions.forEach((region) => {
      const regionLines: string[] = [];
      if (region.bodyFatPercent !== undefined) {
        regionLines.push(`${region.bodyFatPercent}% fat`);
      }
      if (region.leanMassKg !== undefined) {
        regionLines.push(`${region.leanMassKg} kg lean`);
      }
      if (region.fatMassKg !== undefined) {
        regionLines.push(`${region.fatMassKg} kg fat`);
      }
      if (region.boneDensityGPerCm2 !== undefined) {
        regionLines.push(`BMD: ${region.boneDensityGPerCm2} g/cm²`);
      }
      if (regionLines.length > 0) {
        lines.push(`    ${region.region}: ${regionLines.join(", ")}`);
      }
    });
  }

  // Only include notes if they're short and meaningful (not raw PDF text)
  if (report.notes && report.notes.length > 0) {
    const meaningfulNotes = report.notes.filter(
      (note) =>
        note.length < 200 &&
        !note.includes("Page:") &&
        !note.includes("Result   Value"),
    );
    if (meaningfulNotes.length > 0) {
      lines.push(`  Notes: ${meaningfulNotes.join("; ")}`);
    }
  }

  return lines.join("\n");
}

/**
 * Check if a string contains raw PDF text patterns
 */
function isRawPDFText(text: string): boolean {
  const pdfPatterns = [
    "Result   Value   Reference Range",
    "We advise having your results reviewed",
    "Ordering Physician",
    "Report Status   Complete",
    "Page:",
    "of 12",
    "Ulta Lab Tests",
    "Quest Diagnostics",
    "Collected Date",
    "Received Date",
    "Lab Ref No",
    "Requisition",
  ];

  // If text is very long, it's likely raw PDF
  if (text.length > 500) {
    return true;
  }

  // Check for multiple PDF patterns
  const patternMatches = pdfPatterns.filter((pattern) =>
    text.includes(pattern),
  ).length;
  return patternMatches >= 2;
}

/**
 * Format a bloodwork report for AI consumption (structured metrics only)
 */
function formatBloodworkReportForAI(report: BloodworkReportData): string {
  const lines: string[] = [];

  lines.push(
    `Bloodwork Report${report.reportDate ? ` (${report.reportDate})` : ""}`,
  );
  if (report.laboratory) {
    lines.push(`  Laboratory: ${report.laboratory}`);
  }

  // If no metrics were extracted, don't show the report
  if (!report.metrics || report.metrics.length === 0) {
    lines.push(
      `  ⚠️ No metrics extracted from this report. The parser may need improvement.`,
    );
    return lines.join("\n");
  }

  // Group metrics by panel for better organization
  const panelGroups = new Map<string, typeof report.metrics>();

  report.metrics.forEach((metric) => {
    const panel = metric.panel || "general";
    if (!panelGroups.has(panel)) {
      panelGroups.set(panel, []);
    }
    panelGroups.get(panel)!.push(metric);
  });

  // Format each panel
  panelGroups.forEach((metrics, panel) => {
    if (panel !== "general") {
      lines.push(`  ${panel.charAt(0).toUpperCase() + panel.slice(1)} Panel:`);
    }

    metrics.forEach((metric) => {
      const parts: string[] = [];
      parts.push(metric.name);

      if (metric.value !== undefined) {
        parts.push(`${metric.value}${metric.unit || ""}`);
      } else if (metric.valueText) {
        parts.push(metric.valueText);
      }

      if (metric.referenceRange) {
        parts.push(`(ref: ${metric.referenceRange})`);
      }

      if (metric.flag && metric.flag !== "normal") {
        parts.push(`[${metric.flag.toUpperCase()}]`);
      }

      lines.push(`    ${parts.join(" ")}`);
    });
  });

  // Highlight notable flags
  const flaggedMetrics = report.metrics.filter(
    (m) => m.flag && m.flag !== "normal",
  );
  if (flaggedMetrics.length > 0) {
    lines.push(
      `  Notable Flags: ${flaggedMetrics.length} metric(s) outside normal range`,
    );
  }

  // Completely skip notes if they contain raw PDF text
  if (report.notes && report.notes.length > 0) {
    const meaningfulNotes = report.notes.filter(
      (note) => !isRawPDFText(note) && note.length < 200,
    );
    if (meaningfulNotes.length > 0) {
      lines.push(`  Notes: ${meaningfulNotes.join("; ")}`);
    }
  }

  return lines.join("\n");
}

const GUT_CATEGORY_LABELS: Record<keyof GutHealthMetrics, string> = {
  beneficial_microbes: "Beneficial microbes",
  disruptive_microbes: "Pathogenic bacteria",
  gut_barrier_inflammation: "Inflammation",
  short_chain_fatty_acids: "Short-chain fatty acids",
  digestive_capacity: "Digestive capacity",
  diversity_resilience: "Diversity & resilience",
  microbial_enzymes_metabolites: "Microbial enzymes & metabolites",
};

// Order in which CRITICAL categories are reported (most actionable first)
const GUT_CRITICAL_CATEGORY_ORDER: Array<keyof GutHealthMetrics> = [
  "gut_barrier_inflammation",
  "disruptive_microbes",
  "beneficial_microbes",
  "diversity_resilience",
  "microbial_enzymes_metabolites",
];

interface GutMetricEntry {
  key: string;
  category: keyof GutHealthMetrics;
  label: string;
  description: string;
  value: number;
  formattedValue: string;
  status: string;
}

function collectGutMetricEntries(metrics: GutHealthMetrics): GutMetricEntry[] {
  const entries: GutMetricEntry[] = [];
  (Object.keys(metrics) as Array<keyof GutHealthMetrics>).forEach(
    (category) => {
      const group = metrics[category] as Record<
        string,
        { value: number; unit: string; status: string } | undefined
      >;
      Object.entries(group).forEach(([key, metric]) => {
        if (!metric) return;
        entries.push({
          key,
          category,
          label: getGutMetricLabel(key),
          description: getGutMetricDescription(key) ?? "",
          value: metric.value,
          formattedValue: formatGutMetricValue(key, metric),
          status: metric.status,
        });
      });
    },
  );
  return entries;
}

function describeGutEntry(
  entry: GutMetricEntry,
  actualAgeYears?: number,
): string {
  if (entry.key === "microbiome_age" && actualAgeYears !== undefined) {
    const diff = Math.round(entry.value - actualAgeYears);
    if (diff > 0) {
      return `actual age ${actualAgeYears} — accelerated by ${diff} years`;
    }
    if (diff < 0) {
      return `actual age ${actualAgeYears} — ${Math.abs(diff)} years younger than actual age`;
    }
    return `matches actual age ${actualAgeYears}`;
  }
  return entry.description;
}

function formatGutEntryLine(
  entry: GutMetricEntry,
  actualAgeYears?: number,
): string {
  const desc = describeGutEntry(entry, actualAgeYears);
  return `  - ${entry.label}: ${entry.formattedValue}${desc ? ` (${desc})` : ""}`;
}

function summarizeGutStatuses(statuses: string[]): string {
  if (statuses.length === 0) return "no data";
  if (statuses.every((s) => s === statuses[0])) {
    return `all ${gutStatusLabel(statuses[0])}`;
  }
  const counts = new Map<string, number>();
  statuses.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1));
  return Array.from(counts.entries())
    .map(([status, count]) => `${count} ${gutStatusLabel(status)}`)
    .join(", ");
}

/**
 * Format a gut microbiome report (e.g., Tiny Health) for AI consumption as a
 * human-readable narrative — grouped by severity/status — instead of raw
 * nested JSON. This lets Luma reason across all 50+ metrics directly rather
 * than needing tool calls (gut-health reports have no tool-retrieval path).
 */
export function formatGutHealthReportForAI(
  report: GutHealthReportData,
  options?: { actualAgeYears?: number },
): string {
  const lines: string[] = [];
  const actualAgeYears = options?.actualAgeYears;
  const dateLabel = report.collection_date || report.report_date;
  const providerLabel =
    report.provider === "tiny_health" ? "Tiny Health" : report.provider;
  const scoreLabel =
    report.summary.microbiome_score !== undefined
      ? ` — Score: ${report.summary.microbiome_score}/100`
      : "";
  lines.push(
    `GUT HEALTH REPORT (${providerLabel}${dateLabel ? `, ${dateLabel}` : ""})${scoreLabel}`,
  );

  const allEntries = collectGutMetricEntries(report.metrics);
  const scfaEntries = allEntries.filter(
    (e) => e.category === "short_chain_fatty_acids",
  );
  const digestiveEntries = allEntries.filter(
    (e) => e.category === "digestive_capacity",
  );
  const bucketableEntries = allEntries.filter(
    (e) =>
      e.category !== "short_chain_fatty_acids" &&
      e.category !== "digestive_capacity",
  );

  const criticalByCategory = new Map<
    keyof GutHealthMetrics,
    GutMetricEntry[]
  >();
  const attention: GutMetricEntry[] = [];
  const great: GutMetricEntry[] = [];
  const okay: GutMetricEntry[] = [];

  for (const entry of bucketableEntries) {
    if (entry.status === "needs_support") {
      const list = criticalByCategory.get(entry.category) ?? [];
      list.push(entry);
      criticalByCategory.set(entry.category, list);
    } else if (entry.status === "improving") {
      attention.push(entry);
    } else if (entry.status === "great") {
      great.push(entry);
    } else {
      okay.push(entry);
    }
  }

  for (const category of GUT_CRITICAL_CATEGORY_ORDER) {
    const entries = criticalByCategory.get(category);
    if (entries && entries.length > 0) {
      lines.push(`CRITICAL — ${GUT_CATEGORY_LABELS[category]}:`);
      entries.forEach((e) => lines.push(formatGutEntryLine(e, actualAgeYears)));
    }
  }

  if (great.length > 0) {
    lines.push(`BENEFICIAL (great):`);
    great.forEach((e) => lines.push(formatGutEntryLine(e, actualAgeYears)));
  }

  if (attention.length > 0) {
    lines.push(`NEEDS ATTENTION:`);
    attention.forEach((e) => lines.push(formatGutEntryLine(e, actualAgeYears)));
  }

  if (okay.length > 0) {
    lines.push(
      `OKAY (within normal range): ${okay
        .map((e) => `${e.label} ${e.formattedValue}`)
        .join(", ")}`,
    );
  }

  if (scfaEntries.length > 0) {
    lines.push(
      `SHORT-CHAIN FATTY ACIDS: ${scfaEntries
        .map((e) => `${e.label} ${e.value}`)
        .join(
          ", ",
        )} (${summarizeGutStatuses(scfaEntries.map((e) => e.status))})`,
    );
  }

  if (digestiveEntries.length > 0) {
    const fine = digestiveEntries.filter(
      (e) => e.status === "great" || e.status === "okay",
    );
    const flagged = digestiveEntries.filter(
      (e) => e.status !== "great" && e.status !== "okay",
    );
    let line = "DIGESTIVE CAPACITY: ";
    if (fine.length > 0) {
      line += `Mostly good (${fine
        .map((e) => `${e.label} ${e.value}`)
        .join(", ")})`;
    }
    if (flagged.length > 0) {
      line += `${fine.length > 0 ? " except " : ""}${flagged
        .map((e) => `${e.label} ${e.value} (${gutStatusLabel(e.status)})`)
        .join(", ")}`;
    }
    lines.push(line);
  }

  const composition: string[] = [];
  if (report.summary.beneficial_pct !== undefined) {
    composition.push(`${report.summary.beneficial_pct}% beneficial`);
  }
  if (report.summary.variable_pct !== undefined) {
    composition.push(`${report.summary.variable_pct}% variable`);
  }
  if (report.summary.unfriendly_pct !== undefined) {
    composition.push(`${report.summary.unfriendly_pct}% unfriendly`);
  }
  if (report.summary.unknown_pct !== undefined) {
    composition.push(`${report.summary.unknown_pct}% unknown`);
  }
  // Defensive: gut-health reports retrieved from Storj's report/retrieve are
  // stored as two layers, so `species` may be absent until merged back in.
  const species = report.species ?? [];

  if (composition.length > 0 || species.length > 0) {
    lines.push(
      `MICROBIOME COMPOSITION: ${composition.join(", ")}${
        species.length > 0
          ? `${composition.length > 0 ? " — " : ""}${species.length} species detected`
          : ""
      }`,
    );
  }

  const coveredLabels = new Set(allEntries.map((e) => e.label.toLowerCase()));
  const notableSpecies = species
    .filter(
      (s) =>
        (s.classification === "unfriendly" ||
          s.classification === "beneficial") &&
        !coveredLabels.has(s.name.toLowerCase()),
    )
    .sort((a, b) => b.abundance_pct - a.abundance_pct)
    .slice(0, 6);
  if (notableSpecies.length > 0) {
    lines.push(
      `Other notable species: ${notableSpecies
        .map((s) => `${s.name} ${s.abundance_pct}% (${s.classification})`)
        .join(", ")}`,
    );
  }

  if (report.top_focus_areas && report.top_focus_areas.length > 0) {
    lines.push(
      `TOP FOCUS AREAS: ${report.top_focus_areas
        .map((f) => `${f.metric} (${f.category})`)
        .join(", ")}`,
    );
  }

  if (report.recommendations && report.recommendations.length > 0) {
    lines.push(`RECOMMENDATIONS:`);
    report.recommendations.forEach((r) => lines.push(`  - ${r}`));
  }

  return lines.join("\n");
}

/**
 * Format structured reports for AI consumption
 * Returns a concise, structured representation instead of full PDF text
 */
export function formatReportsForAI(reports: ParsedReportSummary[]): string {
  if (reports.length === 0) {
    return "";
  }

  const formattedReports = reports
    .map((summary) => {
      if (summary.report.type === "dexa") {
        const dexa = summary.report;
        // Only include if we have actual data (not just empty structure)
        if (
          dexa.totalBodyFatPercent !== undefined ||
          dexa.totalLeanMassKg !== undefined ||
          (dexa.regions && dexa.regions.length > 0) ||
          dexa.boneDensityTotal
        ) {
          return formatDexaReportForAI(dexa);
        }
        return null; // Skip empty reports
      } else if (summary.report.type === "bloodwork") {
        const bloodwork = summary.report;
        // Always format bloodwork reports - the formatter will show a warning if no metrics
        return formatBloodworkReportForAI(bloodwork);
      } else if (summary.report.type === "gut-health") {
        return formatGutHealthReportForAI(summary.report);
      }
      return null;
    })
    .filter((formatted): formatted is string => formatted !== null);

  if (formattedReports.length === 0) {
    return "No structured report data available (parsing may have failed).";
  }

  return formattedReports.join("\n\n");
}

/**
 * Get a summary of reports for quick reference
 */
export function getReportsSummary(reports: ParsedReportSummary[]): string {
  if (reports.length === 0) {
    return "No reports available";
  }

  const dexaCount = reports.filter((r) => r.report.type === "dexa").length;
  const bloodworkCount = reports.filter(
    (r) => r.report.type === "bloodwork",
  ).length;
  const gutHealthCount = reports.filter(
    (r) => r.report.type === "gut-health",
  ).length;

  const parts: string[] = [];
  if (dexaCount > 0) {
    parts.push(`${dexaCount} DEXA scan(s)`);
  }
  if (bloodworkCount > 0) {
    parts.push(`${bloodworkCount} bloodwork report(s)`);
  }
  if (gutHealthCount > 0) {
    parts.push(`${gutHealthCount} gut health report(s)`);
  }

  return parts.join(", ");
}
