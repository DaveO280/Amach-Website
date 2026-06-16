/**
 * Universal health report parser — entry point.
 *
 * All report-type logic lives in the ReportParserRegistry
 * (registry/reportTypes/).  This file provides the public API used by the
 * rest of the application and delegates to universalParser.ts.
 *
 * Adding a new report type:
 *   1. Create registry/reportTypes/myReport.ts
 *   2. Define a ReportTypeDefinition<MyReportData>
 *   3. Register it in registry/reportTypes/index.ts
 *   Done — no changes here.
 */

import { parseHealthReportUniversal } from "./universalParser";

export interface ReportParsingOptions {
  inferredType?: "dexa" | "bloodwork" | "medical-record" | "gut-health";
  sourceName?: string;
  /** Raw PDF bytes — enables vision passes for gauge/chart extraction. */
  pdfData?: Uint8Array;
  /** @deprecated AI is now the default for all types. This option is ignored. */
  useAI?: boolean;
}

export async function parseHealthReport(
  rawText: string,
  options: ReportParsingOptions = {},
): Promise<import("@/types/reportData").ParsedReportSummary[]> {
  return parseHealthReportUniversal(rawText, options);
}

export * from "./dexaParser";
export * from "./bloodworkParser";
export * from "./aiMedicalRecordParser";
export * from "./gutHealthParser";
export * from "./gutHealthLlmExtractor";
export * from "./parseConfig";
export * from "./veniceModels";
export * from "./llmPipeline";
export * from "./hallucinationGuard";

export * from "./dexaParser";
export * from "./bloodworkParser";
export * from "./aiMedicalRecordParser";
export * from "./gutHealthParser";
export * from "./gutHealthLlmExtractor";
export * from "./parseConfig";
export * from "./veniceModels";
export * from "./llmPipeline";
export * from "./hallucinationGuard";
