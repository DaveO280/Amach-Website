/**
 * Bloodwork / lab report type definition for the ReportParserRegistry.
 *
 * Single LLM pass.  The validate() function handles the complex JSON-to-metrics
 * mapping, nested-object flattening, and structured-line parsing fallback.
 */

import type {
  BloodworkReportData,
  BloodworkMetric,
  BloodworkFlag,
} from "@/types/reportData";
import {
  looksLikeBloodworkReport,
  parseBloodworkReport,
} from "../../bloodworkParser";
import { ANTI_HALLUCINATION_RULES } from "../../llmPipeline";
import type { ReportTypeDefinition } from "../types";

// ── Shared sanitizers (copied from aiBloodworkParser) ──────────────────────

const JUNK_METRIC_NAMES = new Set([
  "name",
  "laboratory",
  "lab",
  "unit",
  "units",
  "value",
  "valuetext",
  "referencerange",
  "reference_range",
  "reference range",
  "flag",
  "panel",
  "metrics",
  "reportdate",
  "report_date",
  "date",
]);

function stripQuotes(s: string): string {
  return s.replace(/^"+|"+$/g, "").trim();
}

function stripMarkdownAndNoise(s: string): string {
  return stripQuotes(s)
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeLaboratory(raw: unknown): string | undefined {
  const s = stripMarkdownAndNoise(String(raw ?? ""));
  if (!s) return undefined;
  const firstLine = s.split(/\r?\n/)[0] ?? s;
  const cut = firstLine
    .split(/\(ref:/i)[0]
    .split(/\(ref/i)[0]
    .split(/\(but/i)[0]
    .split(/\bbut\b/i)[0]
    .split(/\bi will\b/i)[0]
    .split(/\bi'll\b/i)[0]
    .split(/\blet's\b/i)[0]
    .split(/\bwait\b/i)[0]
    .split(/\.\s/)[0];
  const out = stripMarkdownAndNoise(cut);
  if (!out) return undefined;
  return out.length > 80 ? out.slice(0, 80).trim() : out;
}

function sanitizePanel(raw: unknown): string {
  const s = stripMarkdownAndNoise(String(raw ?? "")).toLowerCase();
  const allowed = new Set([
    "lipid",
    "metabolic",
    "thyroid",
    "hormone",
    "inflammation",
    "hematology",
    "liver",
    "kidney",
    "general",
  ]);
  return allowed.has(s) ? s : "general";
}

function looksLikeNarrativeText(s: string): boolean {
  const t = s.toLowerCase();
  return (
    t.includes("i will") ||
    t.includes("i'll") ||
    t.includes("let's") ||
    t.includes("wait") ||
    t.includes("set value") ||
    t.includes("it doesn't") ||
    t.includes("i will use") ||
    t.includes("i will set") ||
    t.includes("but usually") ||
    t.includes("the text says")
  );
}

function metricHasSignal(m: BloodworkMetric): boolean {
  const name = stripMarkdownAndNoise(String(m.name || "")).toLowerCase();
  if (!name || JUNK_METRIC_NAMES.has(name)) return false;
  if (looksLikeNarrativeText(name)) return false;
  if (typeof m.value === "number" && Number.isFinite(m.value)) return true;
  const vt = (m.valueText || "").toString();
  return /[\d<>]/.test(vt);
}

function cleanAndValidateMetrics(
  metrics: BloodworkMetric[],
): BloodworkMetric[] {
  const cleaned: BloodworkMetric[] = [];
  const seen = new Set<string>();
  for (const m of metrics) {
    const nameClean = stripMarkdownAndNoise(String(m.name || ""));
    const next: BloodworkMetric = {
      ...m,
      name: nameClean,
      unit: m.unit ? stripMarkdownAndNoise(String(m.unit)) : m.unit,
      referenceRange: m.referenceRange
        ? stripMarkdownAndNoise(String(m.referenceRange))
        : m.referenceRange,
      panel: sanitizePanel(m.panel),
    };
    const key = `${nameClean.toLowerCase()}|${(next.unit || "").toLowerCase()}|${(next.panel || "").toLowerCase()}|${next.valueText || ""}`;
    if (!metricHasSignal(next) || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(next);
  }
  return cleaned;
}

function shouldTreatAsBadParse(metrics: BloodworkMetric[]): boolean {
  if (metrics.length === 0) return true;
  const names = metrics.map((m) =>
    stripQuotes(String(m.name || "")).toLowerCase(),
  );
  const junkCount = names.filter((n) => !n || JUNK_METRIC_NAMES.has(n)).length;
  return junkCount / Math.max(1, names.length) >= 0.25;
}

function normalizeFlag(flag: unknown): BloodworkFlag | undefined {
  const s = String(flag ?? "")
    .trim()
    .toLowerCase();
  if (!s) return undefined;
  if (s === "h" || s === "high") return "high";
  if (s === "l" || s === "low") return "low";
  if (s === "hh" || s.includes("critical-high")) return "critical-high";
  if (s === "ll" || s.includes("critical-low")) return "critical-low";
  if (s === "n" || s === "normal") return "normal";
  return undefined;
}

function normalizeNumericValue(value: unknown): {
  value?: number;
  valueText?: string;
} {
  if (value === null || value === undefined) return {};
  if (typeof value === "number" && Number.isFinite(value))
    return { value, valueText: String(value) };
  const s = String(value).trim();
  if (!s) return {};
  const cleaned = s.replace(/[<>]/g, "");
  const n = Number(cleaned);
  if (Number.isFinite(n)) return { value: n, valueText: s };
  return { valueText: s };
}

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

function isObject(v: JsonValue): v is { [key: string]: JsonValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type FlatMetricRow = {
  name: string;
  value: number | null;
  unit?: string | null;
  referenceRange?: string | null;
  flag?: string | null;
  panel?: string | null;
};

function flattenNestedBloodworkJsonToMetrics(root: JsonValue): FlatMetricRow[] {
  const out: FlatMetricRow[] = [];
  if (!isObject(root)) return out;
  for (const [sectionKey, sectionVal] of Object.entries(root)) {
    if (!isObject(sectionVal)) continue;
    if (sectionKey.toLowerCase().includes("patient")) continue;
    for (const [metricKey, metricVal] of Object.entries(sectionVal)) {
      if (!isObject(metricVal)) continue;
      const hasResult =
        "result" in metricVal ||
        "value" in metricVal ||
        "measurement" in metricVal;
      if (!hasResult) continue;
      const result =
        (metricVal as Record<string, JsonValue>).result ??
        (metricVal as Record<string, JsonValue>).value ??
        null;
      const unit = (metricVal as Record<string, JsonValue>).unit ?? null;
      const referenceRange =
        (metricVal as Record<string, JsonValue>).reference_range ??
        (metricVal as Record<string, JsonValue>).referenceRange ??
        null;
      const flag = (metricVal as Record<string, JsonValue>).flag ?? null;
      const display =
        (metricVal as Record<string, JsonValue>).name ??
        metricKey.replace(/_/g, " ").toUpperCase();
      const { value } = normalizeNumericValue(result);
      out.push({
        name: String(display),
        value: value !== undefined ? value : null,
        unit: unit !== null ? String(unit) : null,
        referenceRange: referenceRange !== null ? String(referenceRange) : null,
        flag: flag !== null ? String(flag) : null,
        panel: sectionKey,
      });
    }
  }
  return out;
}

// ── Prompt ─────────────────────────────────────────────────────────────────

const BLOODWORK_SYSTEM_PROMPT = [
  ANTI_HALLUCINATION_RULES,
  "",
  `Extract structured bloodwork/lab test data and output ONLY valid JSON.
No narrative, explanations, markdown, or reasoning.

Return ONLY a JSON object in this format:
{
  "reportDate": "YYYY-MM-DD or MM/DD/YYYY or null",
  "laboratory": "Lab name only (plain text, no notes) or null",
  "metrics": [
    {
      "name": "Test name",
      "value": 123.45,
      "unit": "mg/dL",
      "referenceRange": "65-139 mg/dL or <200 mg/dL or null",
      "flag": "normal|low|high|critical-low|critical-high",
      "panel": "lipid|metabolic|thyroid|hormone|inflammation|hematology|liver|kidney|general"
    }
  ]
}

Rules:
- Extract ALL metrics in the report
- If a value is "<X" or ">X", set value = X
- If a test has no numeric value, set value to null
- Output ONLY valid JSON starting with { and ending with }.
- Do not include any phrases like "I will", "let's", "wait", or other planning/thinking text anywhere in any field.`,
].join("\n");

function buildBloodworkPrompt(text: string): string {
  const MAX = 24000;
  const textToParse =
    text.length <= MAX
      ? text
      : `${text.slice(0, 12000)}\n\n[...TRUNCATED... keeping start+end of report]\n\n${text.slice(-12000)}`;
  return `Extract all bloodwork/lab test metrics from this report and output ONLY valid JSON:\n\n${textToParse}`;
}

// ── Map LLM JSON to BloodworkReportData ────────────────────────────────────

interface VeniceBloodworkJson {
  reportDate?: string | null;
  laboratory?: string | null;
  metrics?: FlatMetricRow[];
  [key: string]: unknown;
}

function mapBloodworkResult(
  raw: Record<string, unknown>,
  rawText: string,
): BloodworkReportData | null {
  let parsed = raw as VeniceBloodworkJson;

  // If Venice returned nested JSON, flatten it into metrics[]
  if (!parsed.metrics || !Array.isArray(parsed.metrics)) {
    const flattened = flattenNestedBloodworkJsonToMetrics(
      parsed as unknown as JsonValue,
    );
    if (flattened.length > 0) parsed = { ...parsed, metrics: flattened };
  }

  if (
    !parsed.metrics ||
    !Array.isArray(parsed.metrics) ||
    parsed.metrics.length === 0
  ) {
    return null;
  }

  // Guard against template/schema echoing
  if (
    parsed.metrics.length <= 1 &&
    JSON.stringify(parsed).includes("Test name")
  ) {
    return null;
  }

  const metrics: BloodworkMetric[] = parsed.metrics.map((m) => ({
    name: stripMarkdownAndNoise(String(m.name ?? "")),
    value: m.value !== null ? m.value : undefined,
    valueText: m.value !== null ? String(m.value) : undefined,
    unit: m.unit ? stripMarkdownAndNoise(String(m.unit)) : undefined,
    referenceRange: m.referenceRange
      ? stripMarkdownAndNoise(String(m.referenceRange))
      : undefined,
    flag: normalizeFlag(m.flag) ?? (m.flag as BloodworkFlag | undefined),
    panel: sanitizePanel(m.panel || "general"),
  }));

  const cleaned = cleanAndValidateMetrics(metrics);
  if (cleaned.length === 0 || shouldTreatAsBadParse(cleaned)) return null;

  const panels: Record<string, BloodworkMetric[]> = {};
  for (const metric of cleaned) {
    const panel = (metric.panel || "general").toLowerCase();
    if (!panels[panel]) panels[panel] = [];
    panels[panel].push(metric);
  }

  return {
    type: "bloodwork",
    reportDate: parsed.reportDate ?? undefined,
    laboratory: sanitizeLaboratory(parsed.laboratory) ?? undefined,
    panels,
    metrics: cleaned,
    rawText,
    confidence: cleaned.length > 0 ? Math.min(1, cleaned.length / 20) : 0.1,
  };
}

// ── Type definition ────────────────────────────────────────────────────────

export const bloodworkDefinition: ReportTypeDefinition<BloodworkReportData> = {
  id: "bloodwork-report",
  displayName: "Bloodwork / Lab Report",
  storageDataType: "bloodwork",

  detect: looksLikeBloodworkReport,

  passes: [
    {
      label: "main",
      systemPrompt: BLOODWORK_SYSTEM_PROMPT,
      buildPrompt: buildBloodworkPrompt,
      maxTokens: 8000,
      temperature: 0,
      retryInstruction:
        "Return ONLY JSON. Ensure metrics[] contains the actual lab tests with their numeric values/units/ranges. Do NOT output keys like 'name'/'laboratory' as standalone strings.",
    },
  ],

  validate(merged, rawText) {
    const result = mapBloodworkResult(merged, rawText);
    if (result) return result;

    // Try structured-line parsing on the Venice raw response content
    // (The registry has already done JSON extraction; if it succeeded but
    //  mapping failed, try the structured format as a last resort.)
    const regexResult = parseBloodworkReport(rawText);
    if (regexResult && regexResult.metrics.length > 0) {
      console.log(
        `[bloodworkRegistry] Fell back to regex parser (${regexResult.metrics.length} metrics)`,
      );
      return regexResult;
    }

    return null;
  },
};
