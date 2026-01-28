/**
 * AI-powered bloodwork parser using Venice AI
 * More robust than regex-based parsing for complex PDF formats
 */

import type {
  BloodworkReportData,
  BloodworkMetric,
  BloodworkFlag,
} from "@/types/reportData";

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
  // Remove common markdown emphasis + quotes
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

  // Keep only the first "label-like" chunk; drop narrative/refs.
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
    .split(/\.\s/)[0]; // stop at first sentence boundary

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
  if (allowed.has(s)) return s;
  return "general";
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
    t.includes("i will") ||
    t.includes("the text says")
  );
}

function looksLikeJsonLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t === "{" || t === "}" || t === "[" || t === "]") return true;
  return /^"[^"]+"\s*:\s*/.test(t) || /^"[^"]+"\s*,\s*$/.test(t);
}

function metricHasSignal(m: BloodworkMetric): boolean {
  const name = stripMarkdownAndNoise(String(m.name || "")).toLowerCase();
  if (!name) return false;
  if (JUNK_METRIC_NAMES.has(name)) return false;
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

    if (!metricHasSignal(next)) continue;
    if (seen.has(key)) continue;
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

    // Prevent mis-parsing valid JSON (e.g. `"laboratory": "LabCorp"`) as metrics
    if (looksLikeJsonLine(line)) continue;
    // Skip obvious narrative/thinking text (common when models ignore JSON-only instructions)
    if (looksLikeNarrativeText(line)) continue;
    if (line.length > 220) continue;

    // Skip obvious non-metric "analysis" headings
    if (!line.includes("|") && !line.includes(",")) continue;

    const hasPipe = line.includes("|");
    const hasColon = line.includes(":");
    const commaCount = (line.match(/,/g) || []).length;

    if (hasPipe) {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length < 3) continue;

      const nameMatch = parts[0].match(/^(?:\d+\.)?\s*(.+)$/);
      const name = stripMarkdownAndNoise(
        nameMatch ? nameMatch[1].trim() : parts[0].trim(),
      );
      if (!name) continue;

      const valueStr = parts[1];
      const numeric = valueStr && valueStr !== "null" ? Number(valueStr) : NaN;
      const value = Number.isFinite(numeric) ? numeric : undefined;

      const unit = parts[2] ? stripMarkdownAndNoise(parts[2]) : undefined;
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

      const panel = sanitizePanel(parts[5] || "general");

      const metric: BloodworkMetric = {
        name,
        value,
        valueText: value !== undefined ? String(value) : valueStr || undefined,
        unit,
        referenceRange: referenceRange
          ? stripMarkdownAndNoise(referenceRange)
          : referenceRange,
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
      const nameClean = stripMarkdownAndNoise(rawName);
      const rest = headerMatch[2].trim();
      if (!nameClean || !rest) continue;

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
        name: nameClean,
        value,
        valueText: value !== undefined ? String(value) : valueStr || undefined,
        unit: unit ? stripMarkdownAndNoise(unit) : unit,
        referenceRange: referenceRange
          ? stripMarkdownAndNoise(referenceRange)
          : referenceRange,
        flag,
        panel: sanitizePanel(panel),
      };

      metrics.push(metric);
      panels[panel] = panels[panel] || [];
      panels[panel].push(metric);
    }
  }

  if (metrics.length === 0) return null;

  const cleaned = cleanAndValidateMetrics(metrics);
  if (cleaned.length === 0 || shouldTreatAsBadParse(cleaned)) return null;

  // Best-effort report date extraction
  const dateMatch =
    fullText.match(/reported_date["']?\s*[:=]\s*["']?(\d{2}\/\d{2}\/\d{4})/i) ||
    fullText.match(/Reported\s*Date[:\s]+(\d{2}\/\d{2}\/\d{4})/i) ||
    fullText.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);

  const reportDate = dateMatch?.[1];

  const report: BloodworkReportData = {
    type: "bloodwork",
    reportDate,
    laboratory: sanitizeLaboratory(
      fullText.match(/laboratory["']?\s*[:=]\s*["']?([^\n"]+)/i)?.[1],
    ),
    source: sourceName,
    panels,
    metrics: cleaned,
    rawText,
    confidence: Math.min(1, cleaned.length / 60),
  };

  console.log(
    `[AIBloodworkParser] ✅ Parsed ${cleaned.length} metrics from structured output (fallback)`,
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

  const buildTextToParse = (text: string): string => {
    // Long PDFs often contain the actual lab table later in the document.
    // Using only the first chunk can miss the table entirely.
    const MAX = 24000;
    if (text.length <= MAX) return text;

    const head = text.slice(0, 12000);
    const tail = text.slice(-12000);
    return `${head}\n\n[...TRUNCATED... keeping start+end of report]\n\n${tail}`;
  };

  const textToParse = buildTextToParse(rawText);

  const systemPrompt = `Extract structured bloodwork/lab test data and output ONLY valid JSON.
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
- Do not include any phrases like "I will", "let's", "wait", or other planning/thinking text anywhere in any field.`;

  const userPrompt = `Extract all bloodwork/lab test metrics from this report and output ONLY valid JSON:

${textToParse}`;

  try {
    console.log("[AIBloodworkParser] Sending PDF text to AI for parsing...");

    // Make direct API call to access reasoning_content if needed
    const modelName =
      process.env.NEXT_PUBLIC_VENICE_MODEL_NAME || "zai-org-glm-4.7";
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: userPrompt });

    const callVenice = async (extraInstruction?: string): Promise<string> => {
      const attemptMessages = extraInstruction
        ? [
            ...messages,
            {
              role: "user",
              content: `IMPORTANT: ${extraInstruction}`,
            },
          ]
        : messages;

      const response = await fetch("/api/venice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: attemptMessages,
          max_tokens: 8000,
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
      return (message?.content?.trim() ||
        message?.reasoning_content?.trim() ||
        "") as string;
    };

    // Use model output (content preferred; some models emit in reasoning_content)
    let fullAssistantText = await callVenice();
    if (!fullAssistantText) {
      console.error("[AIBloodworkParser] ❌ Empty response from AI");
      return null;
    }

    // IMPORTANT: Try JSON parsing FIRST.
    // If Venice does return JSON, the structured parser will otherwise misinterpret
    // `"laboratory": ...` / `"name": ...` as bogus metrics.

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
        // Fall back to structured parsing when JSON is not present
        const structuredFallback = parseBloodworkStructuredLines(
          fullAssistantText,
          rawText,
          sourceName,
        );
        if (structuredFallback) return structuredFallback;

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
        const structuredFallback = parseBloodworkStructuredLines(
          fullAssistantText,
          rawText,
          sourceName,
        );
        if (structuredFallback) return structuredFallback;
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
    if (cleaned.length === 0 || shouldTreatAsBadParse(cleaned)) {
      console.warn(
        "[AIBloodworkParser] ⚠️ Parsed JSON metrics look invalid (junk keys like name/laboratory). Falling back to structured parsing.",
      );
      const structuredFallback = parseBloodworkStructuredLines(
        fullAssistantText,
        rawText,
        sourceName,
      );
      if (structuredFallback) return structuredFallback;

      // One retry: ask the model to re-scan and ensure metrics contain numeric values where present.
      console.warn(
        "[AIBloodworkParser] 🔁 Retrying AI parse (previous result invalid)...",
      );
      fullAssistantText = await callVenice(
        "Return ONLY JSON. Ensure metrics[] contains the actual lab tests with their numeric values/units/ranges. Do NOT output keys like 'name'/'laboratory' as standalone strings.",
      );
      if (!fullAssistantText) return null;

      // Try parsing again (JSON extraction path)
      try {
        parsed = JSON.parse(fullAssistantText);
      } catch {
        const extracted = extractBestJsonObject(fullAssistantText);
        if (!extracted) return null;
        parsed = JSON.parse(stripTrailingCommas(extracted));
      }

      if (!parsed.metrics || !Array.isArray(parsed.metrics)) {
        const flattened = flattenNestedBloodworkJsonToMetrics(
          parsed as unknown as JsonValue,
        );
        if (flattened.length > 0) parsed.metrics = flattened;
      }

      if (
        !parsed.metrics ||
        !Array.isArray(parsed.metrics) ||
        parsed.metrics.length === 0
      ) {
        return null;
      }

      const retriedMetrics: BloodworkMetric[] = parsed.metrics.map((m) => {
        const obj = m as Record<string, unknown>;

        const rawVal = obj.value;
        const valueText =
          rawVal === null || rawVal === undefined ? undefined : String(rawVal);
        let value: number | undefined = undefined;
        if (typeof rawVal === "number" && Number.isFinite(rawVal)) {
          value = rawVal;
        } else if (typeof rawVal === "string") {
          const n = Number.parseFloat(rawVal);
          if (Number.isFinite(n)) value = n;
        }

        const unit = typeof obj.unit === "string" ? obj.unit : undefined;
        const referenceRange =
          typeof obj.referenceRange === "string"
            ? obj.referenceRange
            : undefined;
        const panel = typeof obj.panel === "string" ? obj.panel : "general";
        const flag =
          normalizeFlag(obj.flag) ??
          (typeof obj.flag === "string"
            ? (obj.flag as BloodworkFlag)
            : undefined);

        return {
          name: stripQuotes(String(obj.name ?? "")),
          value,
          valueText,
          unit,
          referenceRange,
          flag,
          panel,
        };
      });

      const retriedCleaned = cleanAndValidateMetrics(retriedMetrics);
      if (
        retriedCleaned.length === 0 ||
        shouldTreatAsBadParse(retriedCleaned)
      ) {
        return null;
      }

      const retryPanels: Record<string, BloodworkMetric[]> = {};
      for (const metric of retriedCleaned) {
        const panel = (metric.panel || "general").toLowerCase();
        if (!retryPanels[panel]) retryPanels[panel] = [];
        retryPanels[panel].push(metric);
      }

      return {
        type: "bloodwork",
        reportDate: parsed.reportDate ?? undefined,
        laboratory: sanitizeLaboratory(parsed.laboratory) ?? undefined,
        source: sourceName,
        panels: retryPanels,
        metrics: retriedCleaned,
        rawText,
        confidence:
          retriedCleaned.length > 0
            ? Math.min(1, retriedCleaned.length / 20)
            : 0.1,
      };
    }

    const panels: Record<string, BloodworkMetric[]> = {};
    for (const metric of cleaned) {
      const panel = (metric.panel || "general").toLowerCase();
      if (!panels[panel]) panels[panel] = [];
      panels[panel].push(metric);
    }

    const report: BloodworkReportData = {
      type: "bloodwork",
      reportDate: parsed.reportDate ?? undefined,
      laboratory: sanitizeLaboratory(parsed.laboratory) ?? undefined,
      source: sourceName,
      panels,
      metrics: cleaned,
      rawText,
      confidence: cleaned.length > 0 ? Math.min(1, cleaned.length / 20) : 0.1,
    };

    console.log(
      `[AIBloodworkParser] ✅ Successfully extracted ${cleaned.length} metrics from report`,
    );
    console.log(
      `[AIBloodworkParser] Sample metrics:`,
      cleaned
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
