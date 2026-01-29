import { parseDexaReport, looksLikeDexaReport } from "./dexaParser";
import {
  parseBloodworkReport,
  looksLikeBloodworkReport,
} from "./bloodworkParser";
import { parseBloodworkReportWithAI } from "./aiBloodworkParser";
import { parseDexaReportWithAI } from "./aiDexaParser";
import type {
  ParsedReportSummary,
  ParsedHealthReport,
} from "@/types/reportData";

export interface ReportParsingOptions {
  inferredType?: "dexa" | "bloodwork";
  sourceName?: string;
  // Legacy option used by some callers; currently ignored by the parser.
  useAI?: boolean;
}

export async function parseHealthReport(
  rawText: string,
  options: ReportParsingOptions = {},
): Promise<ParsedReportSummary[]> {
  if (!rawText || rawText.trim().length === 0) {
    return [];
  }

  const reports: ParsedHealthReport[] = [];

  // Check type if not explicitly set
  const isDexa =
    options.inferredType === "dexa" ||
    (options.inferredType !== "bloodwork" && looksLikeDexaReport(rawText));
  const isBloodwork =
    options.inferredType === "bloodwork" ||
    (options.inferredType !== "dexa" &&
      !isDexa &&
      looksLikeBloodworkReport(rawText));

  if (isDexa) {
    let dexa: ParsedHealthReport | null = null;

    // Try AI parsing first if enabled, fall back to regex
    // Use Promise.race to timeout AI parsing after 45 seconds (leaving buffer for Vercel 60s limit)
    if (options.useAI) {
      console.log("[ReportParser] 🤖 Using AI to parse DEXA report...");
      try {
        const aiPromise = parseDexaReportWithAI(rawText, options.sourceName);
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => {
            console.warn(
              "[ReportParser] ⏱️ AI parser timeout (45s), falling back to regex...",
            );
            resolve(null);
          }, 45000),
        );

        dexa = await Promise.race([aiPromise, timeoutPromise]);

        if (dexa) {
          // Accept AI result if it has regions OR if it has meaningful data (totalBodyFatPercent, BMD, etc.)
          const hasRegions = dexa.regions && dexa.regions.length > 0;
          const hasMeaningfulData =
            dexa.totalBodyFatPercent !== undefined ||
            dexa.boneDensityTotal?.bmd !== undefined ||
            dexa.totalLeanMassKg !== undefined;

          if (hasRegions) {
            console.log(
              `[ReportParser] ✅ AI parser extracted ${dexa.regions.length} regions`,
            );
          } else if (hasMeaningfulData) {
            console.warn(
              `[ReportParser] ⚠️ AI parser extracted data but 0 regions (confidence: ${dexa.confidence}). Keeping AI result and attempting to enhance with structured text parsing.`,
            );
            // Keep the AI result even without regions - it may have other valuable data
            // The structured text parser fallback in aiDexaParser should have already tried to fill regions
          } else {
            console.warn(
              `[ReportParser] ⚠️ AI parser returned report with no meaningful data, falling back to regex...`,
            );
            dexa = null; // Force fallback only if no meaningful data
          }
        } else {
          console.log(
            "[ReportParser] AI parser timed out or returned null, using regex parser...",
          );
        }
      } catch (aiError) {
        console.error("[ReportParser] ❌ AI parser error:", aiError);
        dexa = null; // Force fallback
      }
    }

    // Fall back to regex parser if AI parsing failed or wasn't enabled
    if (!dexa) {
      console.log("[ReportParser] 📝 Using regex to parse DEXA report...");
      dexa = parseDexaReport(rawText);
      if (dexa) {
        console.log(
          `[ReportParser] Regex parser extracted ${dexa.regions?.length || 0} regions`,
        );
      }
    }

    if (dexa) {
      if (options.sourceName && !dexa.source) {
        dexa.source = options.sourceName;
      }
      reports.push(dexa);
    }
    // Don't try to parse as bloodwork if it's clearly a DEXA report
    return reports.map((report) => ({
      report,
      extractedAt: new Date().toISOString(),
    }));
  }

  if (isBloodwork) {
    let blood: ParsedHealthReport | null = null;

    // Try AI parsing first if enabled, fall back to regex
    if (options.useAI) {
      console.log("[ReportParser] 🤖 Using AI to parse bloodwork report...");
      try {
        blood = await parseBloodworkReportWithAI(rawText, options.sourceName);
        if (blood && blood.metrics.length > 0) {
          console.log(
            `[ReportParser] ✅ AI parser extracted ${blood.metrics.length} metrics`,
          );
        } else if (blood) {
          console.warn(
            `[ReportParser] ⚠️ AI parser returned report with 0 metrics, falling back to regex...`,
          );
          blood = null; // Force fallback
        }
      } catch (aiError) {
        console.error("[ReportParser] ❌ AI parser error:", aiError);
        blood = null; // Force fallback
      }
    }

    // Fall back to regex parser if AI parsing failed or wasn't enabled
    if (!blood) {
      console.log("[ReportParser] 📝 Using regex to parse bloodwork report...");
      blood = parseBloodworkReport(rawText);
      if (blood) {
        console.log(
          `[ReportParser] Regex parser extracted ${blood.metrics.length} metrics`,
        );
      }
    }

    if (blood) {
      if (options.sourceName && !blood.source) {
        blood.source = options.sourceName;
      }
      reports.push(blood);
    }
  }

  return reports.map((report) => ({
    report,
    extractedAt: new Date().toISOString(),
  }));
}

export * from "./dexaParser";
export * from "./bloodworkParser";
