/**
 * Core type definitions for the ReportParserRegistry.
 *
 * Adding a new report type is a pure schema / config exercise:
 * 1. Create reportTypes/myReport.ts
 * 2. Define a ReportTypeDefinition<MyReportData> with detect(), passes[], validate()
 * 3. Import and register it in reportTypes/index.ts
 * No changes to registry/index.ts or any other pipeline file.
 */

import type { ParsedHealthReport } from "@/types/reportData";

// ── Pass ──────────────────────────────────────────────────────────────────────

export interface ParserPass {
  /** Short label used in logs (e.g. "summary", "species"). */
  label: string;

  /**
   * "text" (default) calls the Venice text-completion endpoint with rawText.
   * "vision" renders PDF pages to PNG images and calls the Venice vision endpoint.
   */
  type?: "text" | "vision";

  /**
   * Character range [start, end] to slice rawText for this pass (text passes only).
   * If omitted the full rawText is used.
   */
  charRange?: [number, number];

  /**
   * Build the user-facing prompt from the text slice for this pass.
   * Receives the sliced (or full) raw text.  For vision passes the string
   * argument is empty — use visionPrompt for the image prompt instead.
   */
  buildPrompt: (textSlice: string) => string;

  /**
   * Override the system prompt for this pass.
   * Defaults to the registry's DEFAULT_SYSTEM_PROMPT (anti-hallucination rules).
   */
  systemPrompt?: string;

  /** Venice max_tokens. Default 8000. */
  maxTokens?: number;

  /** Venice temperature. Default 0.1. */
  temperature?: number;

  /**
   * If the registry's validate() returns null (indicating unusable output),
   * this instruction is appended to the pass's prompt on a single retry at
   * temperature 0.  Leave undefined to skip retry.
   */
  retryInstruction?: string;

  // ── Vision-only fields ──────────────────────────────────────────────────

  /**
   * 1-indexed page numbers to render and send as images (vision passes only).
   * Pages are batched into a single API call.
   */
  visionPages?: number[];

  /**
   * User-facing text prompt to send alongside the rendered images.
   * Replaces the buildPrompt output for vision passes.
   */
  visionPrompt?: string;

  /**
   * Venice vision model override.  Defaults to VENICE_PARSE_VISION_MODEL
   * from parseConfig.ts.
   */
  visionModel?: string;
}

// ── Type definition ────────────────────────────────────────────────────────────

export interface ReportTypeDefinition<T extends ParsedHealthReport> {
  /** Unique identifier used for lookup and storage routing. */
  id: string;

  /** Human-readable name shown in logs. */
  displayName: string;

  /** Storj data-type key (e.g. "gut-health-report", "dexa"). */
  storageDataType: string;

  /**
   * Return true if rawText looks like this report type.
   * Called in registration order; first match wins.
   */
  detect: (text: string) => boolean;

  /**
   * Ordered list of Venice passes to run.
   * Most report types need only one pass; multi-pass is used when the PDF
   * is too long to fit in a single context (e.g. gut health).
   */
  passes: ParserPass[];

  /**
   * How to combine raw results from multiple passes into a single object
   * for validate().  Default: shallow merge, first-pass values take
   * precedence over later passes (earlier passes overwrite on non-null).
   */
  mergePasses?: (
    results: Array<Record<string, unknown> | null>,
  ) => Record<string, unknown>;

  /**
   * Map the merged raw LLM output to a typed result.
   * rawText is passed for types that need to run supplemental regex logic
   * (e.g. DEXA merges AI output with a regex parser).
   * Return null to signal unusable output — triggers a retry if the last
   * pass has retryInstruction set.
   */
  validate: (merged: Record<string, unknown>, rawText: string) => T | null;

  /**
   * Optional normalization applied after validate() succeeds.
   * Use for unit conversions or range clamping (e.g. RPKM → 0-100 index).
   */
  normalize?: (result: T) => T;
}
