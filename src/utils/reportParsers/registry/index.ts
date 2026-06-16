/**
 * ReportParserRegistry — the single pipeline for all health report types.
 *
 * To add a new report type:
 * 1. Create src/utils/reportParsers/registry/reportTypes/myReport.ts
 * 2. Define a ReportTypeDefinition<MyReportData> with detect(), passes[], validate()
 * 3. Import and register it in registry/reportTypes/index.ts
 * That's it — no pipeline changes needed.
 */

import type {
  ParsedHealthReport,
  ParsedReportSummary,
} from "@/types/reportData";
import {
  callLlmExtractor,
  runVisionExtractor,
  ANTI_HALLUCINATION_RULES,
} from "../llmPipeline";
import { renderPdfPages } from "./pdfRenderer";
import type { ReportTypeDefinition, ParserPass } from "./types";

// ── Registry storage ──────────────────────────────────────────────────────────

type AnyDef = ReportTypeDefinition<ParsedHealthReport>;
const registry = new Map<string, AnyDef>();

export function registerReportType<T extends ParsedHealthReport>(
  def: ReportTypeDefinition<T>,
): void {
  registry.set(def.id, def as unknown as AnyDef);
}

/** Retrieve a registered definition by id (useful for testing). */
export function getReportType(id: string): AnyDef | undefined {
  return registry.get(id);
}

// ── Default pipeline helpers ──────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = [
  "You are a precise data extraction assistant. Return ONLY valid JSON with no markdown, code blocks, or explanation.",
  "",
  ANTI_HALLUCINATION_RULES,
].join("\n");

/**
 * Shallow first-pass-wins merge.
 * Start from the last pass result and let earlier passes overwrite
 * with their non-null values.
 */
function defaultMergePasses(
  results: Array<Record<string, unknown> | null>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (let i = results.length - 1; i >= 0; i--) {
    const result = results[i];
    if (!result) continue;
    for (const [key, value] of Object.entries(result)) {
      if (i === results.length - 1) {
        // Seed from last pass (lowest priority)
        merged[key] = value;
      } else if (value != null) {
        // Earlier passes overwrite only with non-null values
        merged[key] = value;
      }
    }
  }
  return merged;
}

async function runPass(
  def: AnyDef,
  pass: ParserPass,
  rawText: string,
  pdfData?: Uint8Array,
  extraInstruction?: string,
): Promise<Record<string, unknown> | null> {
  const logTag = `registry/${def.id}/${pass.label}`;

  if (pass.type === "vision") {
    if (!pdfData) {
      console.warn(`[${logTag}] Vision pass skipped — no pdfData provided`);
      return null;
    }
    const pages = pass.visionPages ?? [];
    if (pages.length === 0) {
      console.warn(`[${logTag}] Vision pass has no visionPages configured`);
      return null;
    }
    const prompt = pass.visionPrompt ?? pass.buildPrompt("");
    let images: string[];
    try {
      images = await renderPdfPages(pdfData, pages);
    } catch (err) {
      console.error(`[${logTag}] PDF rendering failed:`, err);
      return null;
    }
    return runVisionExtractor(images, prompt, {
      maxTokens: pass.maxTokens ?? 1000,
      temperature: pass.temperature ?? 0,
      logTag,
      visionModel: pass.visionModel,
    });
  }

  // Text pass (default)
  const textSlice =
    pass.charRange != null
      ? rawText.slice(pass.charRange[0], pass.charRange[1])
      : rawText;

  const userPrompt = extraInstruction
    ? `${pass.buildPrompt(textSlice)}\n\n${extraInstruction}`
    : pass.buildPrompt(textSlice);

  return callLlmExtractor(
    pass.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    userPrompt,
    {
      maxTokens: pass.maxTokens ?? 8000,
      temperature: extraInstruction != null ? 0 : (pass.temperature ?? 0.1),
      logTag,
      skipRetry: extraInstruction != null,
    },
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ParseReportOptions {
  /** Force a specific registered type id (skips auto-detect). */
  typeId?: string;
  /** Attached to the returned report's source field if it is not already set. */
  sourceName?: string;
  /**
   * Raw PDF bytes — required for vision passes that render pages to images.
   * When not provided, vision passes are silently skipped.
   */
  pdfData?: Uint8Array;
}

export async function parseReport(
  rawText: string,
  options: ParseReportOptions = {},
): Promise<ParsedReportSummary[]> {
  if (!rawText?.trim()) return [];

  // Resolve type definition
  let typeDef: AnyDef | undefined;
  if (options.typeId) {
    typeDef = registry.get(options.typeId);
    if (!typeDef) {
      console.warn(`[registry] No type registered for id "${options.typeId}"`);
    }
  }
  if (!typeDef) {
    for (const def of registry.values()) {
      if (def.detect(rawText)) {
        typeDef = def;
        break;
      }
    }
  }

  if (!typeDef) return [];

  console.log(
    `[registry] Matched type "${typeDef.id}" — running ${typeDef.passes.length} pass(es)`,
  );

  // Run all passes
  const passResults: Array<Record<string, unknown> | null> = [];
  for (const pass of typeDef.passes) {
    const result = await runPass(typeDef, pass, rawText, options.pdfData);
    passResults.push(result);
    console.log(
      `[registry/${typeDef.id}/${pass.label}] Result: ${result ? "ok" : "null"}`,
    );
  }

  // Merge pass results
  const merged = typeDef.mergePasses
    ? typeDef.mergePasses(passResults)
    : defaultMergePasses(passResults);

  // Validate
  let result = typeDef.validate(merged, rawText);

  // Retry last pass if validate returned null and a retryInstruction is configured
  if (!result) {
    const lastPass = typeDef.passes[typeDef.passes.length - 1];
    if (lastPass.retryInstruction) {
      console.log(
        `[registry/${typeDef.id}] validate returned null — retrying last pass with retry instruction`,
      );
      const retryResult = await runPass(
        typeDef,
        lastPass,
        rawText,
        options.pdfData,
        lastPass.retryInstruction,
      );
      if (retryResult) {
        const retryPassResults = [...passResults.slice(0, -1), retryResult];
        const retryMerged = typeDef.mergePasses
          ? typeDef.mergePasses(retryPassResults)
          : defaultMergePasses(retryPassResults);
        result = typeDef.validate(retryMerged, rawText);
      }
    }
  }

  if (!result) {
    console.warn(
      `[registry/${typeDef.id}] All passes failed to produce a valid result`,
    );
    return [];
  }

  // Normalize
  if (typeDef.normalize) {
    result = typeDef.normalize(result);
  }

  // Attach source if missing
  if (options.sourceName && !("source" in result && result.source)) {
    result = { ...result, source: options.sourceName } as ParsedHealthReport;
  }

  return [{ report: result, extractedAt: new Date().toISOString() }];
}

export type { ReportTypeDefinition, ParserPass } from "./types";
