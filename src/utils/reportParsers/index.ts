import { parseDexaReport, looksLikeDexaReport } from "./dexaParser";
import {
  parseBloodworkReport,
  looksLikeBloodworkReport,
} from "./bloodworkParser";
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

export function parseHealthReport(
  rawText: string,
  options: ReportParsingOptions = {},
): ParsedReportSummary[] {
  if (!rawText || rawText.trim().length === 0) {
    return [];
  }

  const reports: ParsedHealthReport[] = [];

  const tryDexa =
    options.inferredType === "dexa" || looksLikeDexaReport(rawText);
  if (tryDexa) {
    const dexa = parseDexaReport(rawText);
    if (dexa) {
      if (options.sourceName) {
        dexa.source = options.sourceName;
      }
      reports.push(dexa);
    }
  }

  const tryBlood =
    options.inferredType === "bloodwork" || looksLikeBloodworkReport(rawText);
  if (tryBlood) {
    const blood = parseBloodworkReport(rawText);
    if (blood) {
      if (options.sourceName) {
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
