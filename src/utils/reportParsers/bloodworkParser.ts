import {
  BloodworkMetric,
  BloodworkReportData,
  BloodworkFlag,
} from "@/types/reportData";

const PANEL_KEYWORDS: Record<string, RegExp> = {
  lipid: /\b(lipid|cholesterol|hdl|ldl|triglyceride)\b/i,
  metabolic: /\b(glucose|insulin|a1c|metabolic|cmp)\b/i,
  thyroid: /\b(tsh|t3|t4|thyroid)\b/i,
  hormone: /\b(testosterone|estradiol|progesterone|cortisol|hormone)\b/i,
  inflammation: /\b(crp|hs-crp|sed rate|esr|inflammation)\b/i,
  hematology: /\b(hemoglobin|hematocrit|cbc|wbc|rbc|platelet)\b/i,
  liver: /\b(ast|alt|alkaline phosphatase|bilirubin|liver)\b/i,
  kidney: /\b(creatinine|bun|egfr|kidney)\b/i,
};

const FLAG_KEYWORDS: Record<BloodworkFlag, RegExp[]> = {
  "critical-low": [/\bcritical low\b/i, /\balert low\b/i],
  "critical-high": [/\bcritical high\b/i, /\balert high\b/i],
  low: [/\blow\b/i, /\bbelow\b/i, /\bL\b/, /\b↓\b/],
  high: [/\bhigh\b/i, /\babove\b/i, /\bH\b/, /\b↑\b/],
  normal: [/\bnormal\b/i, /\bw/i],
};

function determineFlag(text: string): BloodworkFlag | undefined {
  for (const [flag, patterns] of Object.entries(FLAG_KEYWORDS)) {
    if (patterns.some((pattern) => pattern.test(text))) {
      return flag as BloodworkFlag;
    }
  }
  return undefined;
}

function extractPanel(name: string, line: string): string {
  const combined = `${name} ${line}`;
  for (const [panel, regex] of Object.entries(PANEL_KEYWORDS)) {
    if (regex.test(combined)) {
      return panel;
    }
  }
  return "general";
}

function sanitizeName(rawName: string): string {
  return rawName
    .replace(/\s+/g, " ")
    .replace(/\bref(erence)? range\b/i, "")
    .trim();
}

const LINE_PATTERNS: RegExp[] = [
  /^(?<name>[A-Za-z0-9%\/\-\s]+?)[:\-]\s*(?<value>-?\d+(?:\.\d+)?)\s*(?<unit>[A-Za-z%\/\-\d]*)\s*(?:\((?<reference>[^)]+)\))?(?<flags>\s*(?:H|L|↑|↓|high|low|critical[^;]*)?)$/i,
  /^(?<name>[A-Za-z0-9%\/\-\s]+?)\s+(?<value>-?\d+(?:\.\d+)?)\s*(?<unit>[A-Za-z%\/\-\d]*)\s*(?<flags>\b(?:H|L|↑|↓|high|low|critical[^;]*)\b)?\s*(?<reference>(?:\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:to|-)\s*\d+(?:\.\d+)?|[A-Za-z%\/\s\d]+))?$/i,
  /^(?<name>[A-Za-z0-9%\/\-\s]+?)\s+(?<value>-?\d+(?:\.\d+)?)\s*(?<unit>[A-Za-z%\/\-\d]*)\s*(?:Reference\s*Range[:\s]*(?<reference>[A-Za-z0-9%\/\-\s]+))?(?<flags>\s*(?:H|L|↑|↓|high|low|critical[^;]*)?)$/i,
];

function parseLine(line: string): BloodworkMetric | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  for (const pattern of LINE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match.groups) {
      const name = sanitizeName(match.groups.name ?? "");
      if (!name) continue;

      const rawValue = match.groups.value;
      const unit = match.groups.unit?.trim() || undefined;
      const reference = match.groups.reference?.trim() || undefined;
      const flagText = match.groups.flags?.trim();

      const value = rawValue ? Number.parseFloat(rawValue) : undefined;
      const flag = flagText ? determineFlag(flagText) : undefined;

      return {
        name,
        value: Number.isFinite(value) ? value : undefined,
        valueText: rawValue,
        unit,
        referenceRange: reference,
        flag,
      };
    }
  }

  return null;
}

export function looksLikeBloodworkReport(rawText: string): boolean {
  const lower = rawText.toLowerCase();
  const keywords = [
    "reference range",
    "labcorp",
    "quest diagnostics",
    "test name",
    "units",
    "result",
    "specimen",
    "collection date",
    "performed",
    "interpretation",
    "glucose",
    "cholesterol",
    "hemoglobin",
  ];
  return keywords.some((keyword) => lower.includes(keyword));
}

export function parseBloodworkReport(
  rawText: string,
): BloodworkReportData | null {
  if (!rawText || !looksLikeBloodworkReport(rawText)) {
    return null;
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const metrics: BloodworkMetric[] = [];
  const notes: string[] = [];

  lines.forEach((line) => {
    const metric = parseLine(line);
    if (metric) {
      metrics.push(metric);
    } else if (line.toLowerCase().includes("reference") || line.length > 40) {
      notes.push(line);
    }
  });

  metrics.forEach((metric) => {
    metric.panel = extractPanel(metric.name, rawText);
  });

  const panels = metrics.reduce<Record<string, BloodworkMetric[]>>(
    (acc, metric) => {
      const panel = metric.panel ?? "general";
      if (!acc[panel]) {
        acc[panel] = [];
      }
      acc[panel].push(metric);
      return acc;
    },
    {},
  );

  const report: BloodworkReportData = {
    type: "bloodwork",
    reportDate: inferReportDate(rawText),
    laboratory: inferLaboratory(rawText),
    panels,
    metrics,
    notes: notes.length ? notes : undefined,
    rawText,
    confidence: metrics.length > 0 ? Math.min(1, metrics.length / 12) : 0.2,
  };

  return report;
}

function inferReportDate(text: string): string | undefined {
  const dateRegex =
    /\b(20\d{2}|19\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/;
  const match = text.match(dateRegex);
  if (match) {
    return match[0];
  }

  const altRegex =
    /\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])[-/.](20\d{2}|19\d{2})\b/;
  const altMatch = text.match(altRegex);
  if (altMatch) {
    return altMatch[0];
  }
  return undefined;
}

function inferLaboratory(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (lower.includes("quest diagnostics")) return "Quest Diagnostics";
  if (lower.includes("labcorp")) return "LabCorp";
  if (lower.includes("sonora quest")) return "Sonora Quest";
  if (lower.includes("life extension")) return "Life Extension";
  return undefined;
}
