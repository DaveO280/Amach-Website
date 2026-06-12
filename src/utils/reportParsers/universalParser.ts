/**
 * Universal health report parser.
 *
 * Thin wrapper around the ReportParserRegistry.
 * All report type logic lives in registry/reportTypes/.
 * This file handles:
 *   - Mapping legacy inferredType strings to registry ids
 *   - The medical-record fallback (not yet in the registry)
 */

// Ensure all report types are registered before the first call.
import "./registry/reportTypes/index";

import { parseReport } from "./registry";
import {
  parseMedicalRecordWithAI,
  createFallbackMedicalRecord,
} from "./aiMedicalRecordParser";
import type { ParsedReportSummary } from "@/types/reportData";

const INFERRED_TYPE_TO_REGISTRY_ID: Record<string, string> = {
  "gut-health": "gut-health-report",
  dexa: "dexa-report",
  bloodwork: "bloodwork-report",
};

export interface UniversalParseOptions {
  inferredType?: "dexa" | "bloodwork" | "medical-record" | "gut-health";
  sourceName?: string;
}

export async function parseHealthReportUniversal(
  rawText: string,
  options: UniversalParseOptions = {},
): Promise<ParsedReportSummary[]> {
  if (!rawText?.trim()) return [];

  // Medical-record is not in the registry — handle it directly.
  if (options.inferredType === "medical-record") {
    return parseMedicalRecordFallback(rawText, options.sourceName);
  }

  // Map legacy inferredType to registry id.
  const typeId = options.inferredType
    ? INFERRED_TYPE_TO_REGISTRY_ID[options.inferredType]
    : undefined;

  const results = await parseReport(rawText, {
    typeId,
    sourceName: options.sourceName,
  });

  if (results.length > 0) return results;

  // Nothing matched — fall through to medical-record parser.
  return parseMedicalRecordFallback(rawText, options.sourceName);
}

async function parseMedicalRecordFallback(
  rawText: string,
  sourceName?: string,
): Promise<ParsedReportSummary[]> {
  console.log(
    "[universalParser] No registry type matched — trying medical record parser",
  );
  let medRecord = null;
  try {
    medRecord = await parseMedicalRecordWithAI(rawText, sourceName);
  } catch (err) {
    console.error("[universalParser] Medical record parser error:", err);
  }
  if (!medRecord) {
    medRecord = createFallbackMedicalRecord(rawText, sourceName);
  }
  if (!medRecord) return [];
  return [{ report: medRecord, extractedAt: new Date().toISOString() }];
}
