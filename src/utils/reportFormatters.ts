/**
 * Utilities for formatting structured health reports for AI consumption
 * This extracts only relevant metrics instead of sending full PDF text
 */

import type {
  ParsedReportSummary,
  DexaReportData,
  BloodworkReportData,
} from "@/types/reportData";

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

  const parts: string[] = [];
  if (dexaCount > 0) {
    parts.push(`${dexaCount} DEXA scan(s)`);
  }
  if (bloodworkCount > 0) {
    parts.push(`${bloodworkCount} bloodwork report(s)`);
  }

  return parts.join(", ");
}
