/**
 * AI-powered bloodwork parser using Venice AI
 * More robust than regex-based parsing for complex PDF formats
 */

import type {
  BloodworkReportData,
  BloodworkMetric,
  BloodworkFlag,
} from "@/types/reportData";

function isTemplateLikeBloodworkJson(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("yyyy-mm-dd") ||
    t.includes("mm/dd/yyyy") ||
    t.includes('"test name"') ||
    t.includes('"lab name if mentioned"') ||
    t.includes('"lipid|metabolic|thyroid')
  );
}

function stripTrailingCommas(json: string): string {
  // Removes trailing commas before } or ]
  return json.replace(/,\s*([}\]])/g, "$1");
}

function extractBestJsonObject(text: string): string | null {
  // Pull out the most likely JSON object from a blob that may contain reasoning + examples.
  // We prefer objects that contain "metrics" and do NOT look like a template.
  const candidates: Array<{ json: string; score: number }> = [];

  // Find balanced {...} objects using a simple stack scan.
  const starts: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") starts.push(i);
    else if (ch === "}" && starts.length > 0) {
      const start = starts.pop()!;
      const json = text.slice(start, i + 1);
      if (json.length < 50) continue;

      let score = 0;
      if (json.includes('"metrics"')) score += 5;
      if ((json.match(/"name"\s*:/g) || []).length >= 3) score += 3;
      if (/\d/.test(json)) score += 1;
      if (isTemplateLikeBloodworkJson(json)) score -= 10;

      candidates.push({ json, score });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best.score >= 1 ? best.json : null;
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
  if (typeof value === "number" && Number.isFinite(value)) {
    return { value, valueText: String(value) };
  }
  const s = String(value).trim();
  if (!s) return {};
  // handle "<3.0" / ">4"
  const cleaned = s.replace(/[<>]/g, "");
  const n = Number(cleaned);
  if (Number.isFinite(n)) return { value: n, valueText: s };
  return { valueText: s };
}

function flattenNestedBloodworkJsonToMetrics(root: JsonValue): Array<{
  name: string;
  value: number | null;
  unit?: string | null;
  referenceRange?: string | null;
  flag?: string | null;
  panel?: string | null;
}> {
  // Accepts the “Venice chat UI” style:
  // {
  //   patient_information: {...},
  //   cardiovascular_health: { cholesterol_total: { result, unit, reference_range, flag }, ... },
  //   ...
  // }
  const out: Array<{
    name: string;
    value: number | null;
    unit?: string | null;
    referenceRange?: string | null;
    flag?: string | null;
    panel?: string | null;
  }> = [];

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

      // Prefer a human-ish name when available
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

function parseBloodworkStructuredLines(
  fullText: string,
  rawText: string,
  sourceName?: string,
): BloodworkReportData | null {
  // Supports two common Venice "structured" formats:
  // 1) Pipe: "43. Platelet Count | 290 | Thousand/uL | 140-400 | normal | hematology"
  // 2) Comma: "43. **PLATELET COUNT**: 290, Thousand/uL, 140-400 Thousand/uL, normal, hematology"
  // 3) Bullet comma format (common in "Final Review of Data Points"):
  //    "*   CHOLESTEROL, TOTAL: 237, mg/dL, <200, high, lipid"
  const candidateLines = fullText.split(/\r?\n/).map((l) => l.trim());
  if (candidateLines.length === 0) return null;

  const panels: Record<string, BloodworkMetric[]> = {};
  const metrics: BloodworkMetric[] = [];

  for (const rawLine of candidateLines) {
    const line = rawLine.trim();

    // Skip obvious non-metric "analysis" headings
    if (!line.includes("|") && !line.includes(",")) continue;

    const hasPipe = line.includes("|");
    const hasColon = line.includes(":");
    const commaCount = (line.match(/,/g) || []).length;

    if (hasPipe) {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length < 3) continue;

      const nameMatch = parts[0].match(/^(?:\d+\.)?\s*(.+)$/);
      const name = nameMatch ? nameMatch[1].trim() : parts[0].trim();
      if (!name) continue;

      const valueStr = parts[1];
      const numeric = valueStr && valueStr !== "null" ? Number(valueStr) : NaN;
      const value = Number.isFinite(numeric) ? numeric : undefined;

      const unit = parts[2] || undefined;
      const referenceRange =
        parts[3] && parts[3] !== "null" ? parts[3] : undefined;

      const flagStr = (parts[4] || "normal").toLowerCase();
      const flag: BloodworkFlag | undefined =
        flagStr === "low" || flagStr === "high" || flagStr === "normal"
          ? (flagStr as BloodworkFlag)
          : flagStr.includes("critical-low")
            ? "critical-low"
            : flagStr.includes("critical-high")
              ? "critical-high"
              : undefined;

      const panel = (parts[5] || "general").toLowerCase();

      const metric: BloodworkMetric = {
        name,
        value,
        valueText: value !== undefined ? String(value) : valueStr || undefined,
        unit,
        referenceRange,
        flag,
        panel,
      };

      metrics.push(metric);
      panels[panel] = panels[panel] || [];
      panels[panel].push(metric);
      continue;
    }

    // Comma format requires a colon and enough commas to include unit/range/flag/panel
    if (hasColon && commaCount >= 2) {
      const headerMatch = line.match(
        /^\s*(?:\d+\.)?\s*(?:[*-]\s*)?(?:\*\*)?(.+?)(?:\*\*)?\s*:\s*(.+)$/,
      );
      if (!headerMatch) continue;

      const rawName = headerMatch[1].replace(/\*\*/g, "").trim();
      const rest = headerMatch[2].trim();
      if (!rawName || !rest) continue;

      // Split the remainder into fields: value, unit, range, flag, panel
      const fields = rest
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
      if (fields.length < 2) continue;

      const valueStr = fields[0];
      const numeric =
        valueStr && valueStr !== "null"
          ? Number(valueStr.replace(/[<>]/g, ""))
          : NaN;
      const value = Number.isFinite(numeric) ? numeric : undefined;

      const unitRaw = fields[1];
      const unit = unitRaw && unitRaw !== "null" ? unitRaw : undefined;
      const referenceRangeRaw = fields[2];
      const referenceRange =
        referenceRangeRaw && referenceRangeRaw !== "null"
          ? referenceRangeRaw
          : undefined;
      const flagStr = (fields[3] || "normal").toLowerCase();
      const flag: BloodworkFlag | undefined =
        flagStr === "low" || flagStr === "high" || flagStr === "normal"
          ? (flagStr as BloodworkFlag)
          : flagStr.includes("critical-low")
            ? "critical-low"
            : flagStr.includes("critical-high")
              ? "critical-high"
              : undefined;

      const panel = (fields[4] || "general").toLowerCase();

      const metric: BloodworkMetric = {
        name: rawName,
        value,
        valueText: value !== undefined ? String(value) : valueStr || undefined,
        unit,
        referenceRange,
        flag,
        panel,
      };

      metrics.push(metric);
      panels[panel] = panels[panel] || [];
      panels[panel].push(metric);
    }
  }

  if (metrics.length === 0) return null;

  // Best-effort report date extraction
  const dateMatch =
    fullText.match(/reported_date["']?\s*[:=]\s*["']?(\d{2}\/\d{2}\/\d{4})/i) ||
    fullText.match(/Reported\s*Date[:\s]+(\d{2}\/\d{2}\/\d{4})/i) ||
    fullText.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);

  const reportDate = dateMatch?.[1];

  const report: BloodworkReportData = {
    type: "bloodwork",
    reportDate,
    laboratory: undefined,
    source: sourceName,
    panels,
    metrics,
    rawText,
    confidence: Math.min(1, metrics.length / 60),
  };

  console.log(
    `[AIBloodworkParser] ✅ Parsed ${metrics.length} metrics from structured output (fallback)`,
  );

  return report;
}

/**
 * Parse bloodwork report using AI
 */
export async function parseBloodworkReportWithAI(
  rawText: string,
  sourceName?: string,
): Promise<BloodworkReportData | null> {
  if (!rawText || rawText.trim().length === 0) {
    return null;
  }

  // Truncate very long text to avoid token limits (keep first 15000 chars which should cover most reports)
  const textToParse =
    rawText.length > 15000
      ? rawText.substring(0, 15000) + "... (truncated)"
      : rawText;

  const systemPrompt = `Extract structured bloodwork/lab test data and output ONLY valid JSON.
No narrative, explanations, markdown, or reasoning.

Return ONLY a JSON object in this format:
{
  "reportDate": "YYYY-MM-DD or MM/DD/YYYY or null",
  "laboratory": "Lab name if mentioned or null",
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
- Output ONLY valid JSON starting with { and ending with }.`;

  const userPrompt = `Extract all bloodwork/lab test metrics from this report and output ONLY valid JSON:

${textToParse}`;

  try {
    console.log("[AIBloodworkParser] Sending PDF text to AI for parsing...");

    // Make direct API call to access reasoning_content if needed
    const modelName =
      process.env.NEXT_PUBLIC_VENICE_MODEL_NAME || "zai-org-glm-4.7";
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: userPrompt });

    const response = await fetch("/api/venice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
        max_tokens: 5000,
        temperature: 0,
        model: modelName,
        stream: false,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message;

    // Use model output (content preferred; some models emit in reasoning_content)
    const fullAssistantText =
      message?.content?.trim() || message?.reasoning_content?.trim() || "";
    if (!fullAssistantText) {
      console.error("[AIBloodworkParser] ❌ Empty response from AI");
      return null;
    }

    // ✅ Revert to the previous “structured output first” approach:
    // Venice sometimes ignores JSON-mode and emits pipe-separated result lines.
    // This path is robust and matches the behavior that was producing metrics for you.
    const structuredFirst = parseBloodworkStructuredLines(
      fullAssistantText,
      rawText,
      sourceName,
    );
    if (structuredFirst) return structuredFirst;

    interface VeniceBloodworkJson {
      reportDate?: string | null;
      laboratory?: string | null;
      metrics?: Array<{
        name: string;
        value: number | null;
        unit?: string | null;
        referenceRange?: string | null;
        flag?: string | null;
        panel?: string | null;
      }>;
      // allow nested category output; we will flatten it
      [key: string]: unknown;
    }

    let parsed: VeniceBloodworkJson;
    try {
      parsed = JSON.parse(fullAssistantText);
    } catch {
      let jsonText = fullAssistantText;
      // Strip markdown fences if present
      if (jsonText.includes("```json")) {
        jsonText = jsonText.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      } else if (jsonText.includes("```")) {
        jsonText = jsonText.replace(/```\s*/g, "");
      }

      // Extract JSON object (prefer a non-template one containing metrics)
      const extracted = extractBestJsonObject(jsonText);
      if (!extracted) {
        console.error(
          "[AIBloodworkParser] ❌ No JSON object found in AI response",
        );
        console.log(
          "[AIBloodworkParser] Response preview (first 800):",
          jsonText.substring(0, 800),
        );
        console.log(
          "[AIBloodworkParser] Response preview (last 1200):",
          jsonText.substring(Math.max(0, jsonText.length - 1200)),
        );
        return null;
      }

      jsonText = extracted;
      try {
        parsed = JSON.parse(stripTrailingCommas(jsonText));
      } catch (parseError) {
        console.error("[AIBloodworkParser] JSON parse error:", parseError);
        console.log(
          "[AIBloodworkParser] JSON text preview:",
          jsonText.substring(0, 800),
        );
        return null;
      }
    }

    // If Venice returned nested JSON (like the chat UI), flatten it into metrics[]
    if (!parsed.metrics || !Array.isArray(parsed.metrics)) {
      const flattened = flattenNestedBloodworkJsonToMetrics(
        parsed as unknown as JsonValue,
      );
      if (flattened.length > 0) {
        parsed.metrics = flattened;
      }
    }

    if (
      !parsed.metrics ||
      !Array.isArray(parsed.metrics) ||
      parsed.metrics.length === 0
    ) {
      console.error(
        "[AIBloodworkParser] Invalid response structure - missing metrics array",
      );
      console.error("[AIBloodworkParser] Parsed object:", parsed);
      return null;
    }

    // Guard: sometimes the model echoes the schema/template instead of real data
    if (
      parsed.metrics.length <= 1 &&
      JSON.stringify(parsed).includes("Test name")
    ) {
      console.warn(
        "[AIBloodworkParser] Detected template JSON, falling back to structured parsing",
      );
      const structuredFallback = parseBloodworkStructuredLines(
        fullAssistantText,
        rawText,
        sourceName,
      );
      if (structuredFallback) return structuredFallback;
    }

    console.log(
      `[AIBloodworkParser] Successfully parsed ${parsed.metrics.length} metrics from AI response`,
    );

    // Convert to BloodworkReportData format
    const panels: Record<string, BloodworkMetric[]> = {};
    const metrics: BloodworkMetric[] = parsed.metrics.map((m) => {
      const panel = m.panel || "general";
      const metric: BloodworkMetric = {
        name: m.name,
        value: m.value !== null ? m.value : undefined,
        valueText: m.value !== null ? String(m.value) : undefined,
        unit: m.unit ?? undefined,
        referenceRange: m.referenceRange ?? undefined,
        flag: normalizeFlag(m.flag) ?? (m.flag as BloodworkFlag | undefined),
        panel,
      };

      if (!panels[panel]) {
        panels[panel] = [];
      }
      panels[panel].push(metric);

      return metric;
    });

    const report: BloodworkReportData = {
      type: "bloodwork",
      reportDate: parsed.reportDate ?? undefined,
      laboratory: parsed.laboratory ?? undefined,
      source: sourceName,
      panels,
      metrics,
      rawText,
      confidence: metrics.length > 0 ? Math.min(1, metrics.length / 20) : 0.1,
    };

    console.log(
      `[AIBloodworkParser] ✅ Successfully extracted ${metrics.length} metrics from report`,
    );
    console.log(
      `[AIBloodworkParser] Sample metrics:`,
      metrics
        .slice(0, 3)
        .map((m) => ({ name: m.name, value: m.value, unit: m.unit })),
    );
    return report;
  } catch (error) {
    console.error("[AIBloodworkParser] Error parsing with AI:", error);
    if (error instanceof SyntaxError) {
      console.error(
        "[AIBloodworkParser] JSON parse error - AI response may not be valid JSON:",
        error.message,
      );
    }
    // Fall back to regex parser
    return null;
  }
}
