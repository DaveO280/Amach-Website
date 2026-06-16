/**
 * DEXA scan report type definition for the ReportParserRegistry.
 *
 * Single LLM pass for structured field extraction; the validate() function
 * also runs the regex parser and merges AI + regex results to maximise coverage.
 */

import type { DexaReportData, DexaRegionMetrics } from "@/types/reportData";
import { looksLikeDexaReport, parseDexaReport } from "../../dexaParser";
import {
  validateExtractedValues,
  DEXA_VALIDATION_RULES,
} from "../../hallucinationGuard";
import { ANTI_HALLUCINATION_RULES } from "../../llmPipeline";
import type { ReportTypeDefinition } from "../types";

// ── Prompt ─────────────────────────────────────────────────────────────────

const DEXA_SYSTEM_PROMPT = [
  ANTI_HALLUCINATION_RULES,
  "",
  `You are a medical data extractor. Extract all metrics from this DEXA scan report and return as JSON with this exact structure:
{
  "scan_date": "YYYY-MM-DD or MM/DD/YYYY — the date the scan was PERFORMED (NOT the patient's birth/DOB date)",
  "total_body_fat_percent": number,
  "total_lean_mass_lbs": number,
  "visceral_fat": {
    "mass_lbs": number,
    "volume_in3": number,
    "area_in2": number
  },
  "android_gynoid_ratio": number,
  "bone_density": {
    "total_bmd": number,
    "t_score": number,
    "z_score": number
  },
  "regions": {
    "arms": { "fat_percent": number, "fat_lbs": number, "lean_lbs": number, "bmd": number },
    "legs": { "fat_percent": number, "fat_lbs": number, "lean_lbs": number, "bmd": number },
    "trunk": { "fat_percent": number, "fat_lbs": number, "lean_lbs": number, "bmd": number },
    "android": { "fat_percent": number, "fat_lbs": number, "lean_lbs": number },
    "gynoid": { "fat_percent": number, "fat_lbs": number, "lean_lbs": number },
    "total": { "fat_percent": number, "fat_lbs": number, "lean_lbs": number, "bmd": number, "t_score": number, "z_score": number }
  }
}

CRITICAL RULES:
1. scan_date is the date the scan was PERFORMED — look for "Measured", "Date of Exam", "Exam Date", "Scan Date". NEVER use the patient's birth date / DOB / Date of Birth.
2. total_body_fat_percent MUST be between 0 and 100. If you see a value > 100 for fat%, it is not a percentage — do not include it.
3. GE Lunar scanners may report fat and lean mass in GRAMS (g) or KILOGRAMS (kg) instead of pounds (lbs). Convert to lbs before populating fat_lbs/lean_lbs (1 kg = 2.20462 lbs; divide grams by 453.592 to get lbs).
4. Hologic scanners report in lbs — use values directly.
5. If you cannot confidently identify the scan date (distinct from patient DOB), set scan_date to null.
Use null for any field whose value is not explicitly present in the report.`,
].join("\n");

function buildDexaPrompt(text: string): string {
  const textToParse =
    text.length > 20000 ? text.substring(0, 20000) + "... (truncated)" : text;
  return textToParse;
}

// ── Result mapper ──────────────────────────────────────────────────────────

function get(obj: unknown, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function findField(obj: unknown, patterns: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const lowerObj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    lowerObj[key.toLowerCase()] = value;
  }
  for (const pattern of patterns) {
    const lowerPattern = pattern.toLowerCase();
    for (const [key, value] of Object.entries(lowerObj)) {
      if (key.includes(lowerPattern) || lowerPattern.includes(key)) {
        return value;
      }
    }
  }
  return undefined;
}

function mapDexaLlmResult(
  parsed: Record<string, unknown>,
  rawText: string,
): DexaReportData | null {
  const regions: DexaRegionMetrics[] = [];
  const regionKeys = ["arms", "legs", "trunk", "android", "gynoid", "total"];
  const regionMapping: Record<string, string> = {
    arms_total: "arms",
    arms: "arms",
    legs_total: "legs",
    legs: "legs",
    trunk: "trunk",
    android: "android",
    gynoid: "gynoid",
    total: "total",
  };

  let segmental = findField(parsed, [
    "segmental_analysis",
    "segmental",
    "regions",
    "regional",
  ]) as Record<string, unknown> | undefined;

  if (!segmental) {
    for (const [key, value] of Object.entries(parsed)) {
      const lowerKey = key.toLowerCase();
      if (
        (lowerKey.includes("region") ||
          lowerKey.includes("segmental") ||
          lowerKey.includes("arm") ||
          lowerKey.includes("leg") ||
          lowerKey.includes("trunk")) &&
        value &&
        typeof value === "object"
      ) {
        segmental = value as Record<string, unknown>;
        break;
      }
    }
  }

  if (segmental && typeof segmental === "object") {
    for (const [key, regionData] of Object.entries(segmental)) {
      const lowerKey = key.toLowerCase();
      const regionName =
        regionMapping[lowerKey] || regionKeys.find((r) => lowerKey.includes(r));

      if (regionName && regionData && typeof regionData === "object") {
        const metrics: DexaRegionMetrics = { region: regionName };
        const data = regionData as Record<string, unknown>;

        const fatLbs =
          (typeof data.fat_lbs === "number" ? data.fat_lbs : undefined) ??
          (typeof data.fat_mass_lbs === "number"
            ? data.fat_mass_lbs
            : undefined) ??
          (typeof data.fat_mass === "number" ? data.fat_mass : undefined) ??
          (typeof data["fat mass"] === "number" ? data["fat mass"] : undefined);
        const leanLbs =
          (typeof data.lean_lbs === "number" ? data.lean_lbs : undefined) ??
          (typeof data.lean_mass_lbs === "number"
            ? data.lean_mass_lbs
            : undefined) ??
          (typeof data.lean_mass === "number" ? data.lean_mass : undefined) ??
          (typeof data["lean mass"] === "number"
            ? data["lean mass"]
            : undefined);
        const fatPercent =
          (typeof data.body_fat_percent === "number"
            ? data.body_fat_percent
            : undefined) ??
          (typeof data.fat_percent === "number"
            ? data.fat_percent
            : undefined) ??
          (typeof data["%fat"] === "number" ? data["%fat"] : undefined);

        if (fatLbs !== undefined) metrics.fatMassKg = fatLbs * 0.453592;
        if (leanLbs !== undefined) metrics.leanMassKg = leanLbs * 0.453592;
        if (fatPercent !== undefined && fatPercent >= 0 && fatPercent <= 100) {
          metrics.bodyFatPercent = fatPercent;
        } else if (fatLbs !== undefined && leanLbs !== undefined) {
          const tissueLbs = fatLbs + leanLbs;
          if (tissueLbs > 0) {
            metrics.bodyFatPercent = (fatLbs / tissueLbs) * 100;
          }
        }

        const bmd =
          (typeof data.bmd === "number" ? data.bmd : undefined) ??
          (typeof data.bone_density === "number"
            ? data.bone_density
            : undefined) ??
          (typeof data.bmd_g_cm2 === "number" ? data.bmd_g_cm2 : undefined);
        if (bmd !== undefined) metrics.boneDensityGPerCm2 = bmd;

        const rTScore =
          typeof data.t_score === "number" ? data.t_score : undefined;
        const rZScore =
          typeof data.z_score === "number" ? data.z_score : undefined;
        if (rTScore !== undefined) metrics.tScore = rTScore;
        if (rZScore !== undefined) metrics.zScore = rZScore;

        if (
          metrics.fatMassKg !== undefined ||
          metrics.leanMassKg !== undefined ||
          metrics.bodyFatPercent !== undefined ||
          metrics.boneDensityGPerCm2 !== undefined
        ) {
          regions.push(metrics);
        }
      }
    }
  }

  // Extract totals
  let totalBodyFatPercent: number | undefined;
  let totalLeanMassKg: number | undefined;
  let androidGynoidRatio: number | undefined;

  const totalFatPercent = findField(parsed, [
    "total_body_fat_percent",
    "tissue_percent_fat",
    "body_fat_percent",
    "total_fat_percent",
    "%fat",
  ]);
  if (
    typeof totalFatPercent === "number" &&
    totalFatPercent >= 0 &&
    totalFatPercent <= 100
  ) {
    totalBodyFatPercent = totalFatPercent;
  } else if (segmental && typeof segmental === "object") {
    const totalData = (segmental as Record<string, unknown>).total;
    if (totalData && typeof totalData === "object") {
      const data = totalData as Record<string, unknown>;
      const fatLbs =
        (typeof data.fat_mass_lbs === "number"
          ? data.fat_mass_lbs
          : undefined) ??
        (typeof data.fat_mass === "number" ? data.fat_mass : undefined);
      const leanLbs =
        (typeof data.lean_mass_lbs === "number"
          ? data.lean_mass_lbs
          : undefined) ??
        (typeof data.lean_mass === "number" ? data.lean_mass : undefined);
      if (fatLbs !== undefined && leanLbs !== undefined) {
        const tissueLbs = fatLbs + leanLbs;
        if (tissueLbs > 0) totalBodyFatPercent = (fatLbs / tissueLbs) * 100;
      }
    }
  }

  const totalLean = findField(parsed, [
    "total_lean_mass",
    "lean_mass_lbs",
    "lean_mass",
  ]);
  if (typeof totalLean === "number") {
    totalLeanMassKg = totalLean * 0.453592;
  } else if (segmental && typeof segmental === "object") {
    const totalData = (segmental as Record<string, unknown>).total;
    if (totalData && typeof totalData === "object") {
      const data = totalData as Record<string, unknown>;
      const leanLbs =
        (typeof data.lean_mass_lbs === "number"
          ? data.lean_mass_lbs
          : undefined) ??
        (typeof data.lean_mass === "number" ? data.lean_mass : undefined);
      if (leanLbs !== undefined) totalLeanMassKg = leanLbs * 0.453592;
    }
  }

  const agRatios = findField(parsed, [
    "android_gynoid_ratio",
    "android_gynoid_ratios",
    "ag_ratio",
    "android_gynoid",
  ]);
  if (typeof agRatios === "number") {
    androidGynoidRatio = agRatios;
  } else if (agRatios && typeof agRatios === "object") {
    const ratios = agRatios as Record<string, unknown>;
    androidGynoidRatio =
      typeof ratios.ag_ratio === "number"
        ? ratios.ag_ratio
        : typeof ratios.android_gynoid_ratio === "number"
          ? ratios.android_gynoid_ratio
          : undefined;

    if (typeof ratios.android_tissue_percent_fat === "number") {
      const androidRegion = regions.find((r) => r.region === "android");
      if (androidRegion)
        androidRegion.bodyFatPercent = ratios.android_tissue_percent_fat;
    }
    if (typeof ratios.gynoid_tissue_percent_fat === "number") {
      const gynoidRegion = regions.find((r) => r.region === "gynoid");
      if (gynoidRegion)
        gynoidRegion.bodyFatPercent = ratios.gynoid_tissue_percent_fat;
    }
  }

  // BMD extraction
  const bmdData = findField(parsed, [
    "bone_mineral_density",
    "bone_health",
    "bmd",
    "bone_density",
  ]);
  let bmd: number | undefined;
  let tScore: number | undefined;
  let zScore: number | undefined;
  let regionalBmd: Record<string, { bmd_g_cm2?: number }> = {};

  if (bmdData && typeof bmdData === "object") {
    const bmdObj = bmdData as Record<string, unknown>;
    if (bmdObj.total_body && typeof bmdObj.total_body === "object") {
      const totalBmd = bmdObj.total_body as Record<string, unknown>;
      if (typeof totalBmd.bmd_g_cm2 === "number") bmd = totalBmd.bmd_g_cm2;
      if (typeof totalBmd.t_score === "number") tScore = totalBmd.t_score;
      if (typeof totalBmd.z_score === "number") zScore = totalBmd.z_score;
      if (totalBmd.regional_bmd && typeof totalBmd.regional_bmd === "object") {
        regionalBmd = totalBmd.regional_bmd as Record<
          string,
          { bmd_g_cm2?: number }
        >;
      }
    }
    if (typeof bmdObj.total_bmd === "number") {
      bmd = bmdObj.total_bmd;
    } else if (typeof bmdObj.total_body_bmd_g_cm2 === "number") {
      bmd = bmdObj.total_body_bmd_g_cm2;
    }
    if (typeof bmdObj.t_score === "number") tScore = bmdObj.t_score;
    if (typeof bmdObj.z_score === "number") zScore = bmdObj.z_score;
    if (bmdObj.regional_bmd && typeof bmdObj.regional_bmd === "object") {
      regionalBmd = bmdObj.regional_bmd as Record<
        string,
        { bmd_g_cm2?: number }
      >;
    }
  }

  const bmdRegionMapping: Record<string, string> = {
    head: "head",
    arms: "arms",
    legs: "legs",
    trunk: "trunk",
    ribs: "ribs",
    spine: "spine",
    pelvis: "pelvis",
    total: "total",
  };

  for (const [key, regionName] of Object.entries(bmdRegionMapping)) {
    const bmdValue = regionalBmd[key]?.bmd_g_cm2;
    if (bmdValue !== undefined) {
      let bmdRegion = regions.find((r) => r.region === regionName);
      if (!bmdRegion) {
        bmdRegion = { region: regionName };
        regions.push(bmdRegion);
      }
      bmdRegion.boneDensityGPerCm2 = bmdValue;
      if (regionName === "total" && !bmd) bmd = bmdValue;
    }
  }

  if (bmd !== undefined) {
    let totalRegion = regions.find((r) => r.region === "total");
    if (!totalRegion) {
      totalRegion = { region: "total" };
      regions.push(totalRegion);
    }
    if (!totalRegion.boneDensityGPerCm2) totalRegion.boneDensityGPerCm2 = bmd;
    if (tScore !== undefined && !totalRegion.tScore)
      totalRegion.tScore = tScore;
    if (zScore !== undefined && !totalRegion.zScore)
      totalRegion.zScore = zScore;
  }

  // Visceral fat
  const fatDist = findField(parsed, ["fat_distribution", "visceral", "vat"]);
  let visceralFatVolumeCm3: number | undefined;
  let visceralFatAreaCm2: number | undefined;
  let visceralFatMassLbs: number | undefined;

  if (fatDist && typeof fatDist === "object") {
    const fatObj = fatDist as Record<string, unknown>;
    const vat = (fatObj.visceral_adipose_tissue || fatObj) as Record<
      string,
      unknown
    >;
    if (typeof vat.mass_lbs === "number") visceralFatMassLbs = vat.mass_lbs;
    if (typeof vat.volume_in3 === "number")
      visceralFatVolumeCm3 = vat.volume_in3 * 16.387;
    if (typeof vat.area_in2 === "number")
      visceralFatAreaCm2 = vat.area_in2 * 6.452;
  }

  // Scan date
  const scanDateField = findField(parsed, [
    "scan_date",
    "measured_date",
    "date",
  ]);
  let scanDate: string | undefined;
  if (typeof scanDateField === "string") {
    scanDate = scanDateField;
  } else if (scanDateField && typeof scanDateField === "object") {
    const dateObj = scanDateField as Record<string, unknown>;
    scanDate =
      (typeof dateObj.scan_date === "string" ? dateObj.scan_date : undefined) ??
      (typeof dateObj.measured_date === "string"
        ? dateObj.measured_date
        : undefined);
  }

  if (!scanDate) {
    const clientInfo = get(parsed, "client_info") as
      | Record<string, unknown>
      | undefined;
    const patientInfo = get(parsed, "patient_info") as
      | Record<string, unknown>
      | undefined;
    scanDate =
      (clientInfo?.measured_date as string | undefined) ??
      (patientInfo?.scan_date as string | undefined) ??
      (patientInfo?.measured_date as string | undefined);
  }

  const baseConfidence =
    regions.length > 0 ? Math.min(1, regions.length / 6) : 0.1;
  const { confidencePenalty } = validateExtractedValues(
    {
      totalBodyFatPercent,
      "boneDensityTotal.bmd": bmd,
      "boneDensityTotal.tScore": tScore,
      "boneDensityTotal.zScore": zScore,
    },
    DEXA_VALIDATION_RULES,
    "dexaRegistry",
  );

  const report: DexaReportData = {
    type: "dexa",
    scanDate,
    totalBodyFatPercent,
    totalLeanMassKg,
    androidGynoidRatio,
    visceralFatRating: visceralFatMassLbs,
    visceralFatAreaCm2,
    visceralFatVolumeCm3,
    boneDensityTotal: { bmd, tScore, zScore },
    regions,
    notes: [],
    rawText,
    confidence: Math.max(0.1, baseConfidence - confidencePenalty),
  };

  // Promote BMD from regions.total if still missing at top level
  if (report.boneDensityTotal?.bmd === undefined) {
    const totalRegion = report.regions?.find((r) => r.region === "total");
    if (totalRegion?.boneDensityGPerCm2 !== undefined) {
      report.boneDensityTotal = {
        ...report.boneDensityTotal,
        bmd: totalRegion.boneDensityGPerCm2,
      };
    }
  }

  return report.regions.length > 0 ||
    report.totalBodyFatPercent !== undefined ||
    report.boneDensityTotal?.bmd !== undefined
    ? report
    : null;
}

// ── Merge AI result with regex result ──────────────────────────────────────

function mergeWithRegex(
  aiResult: DexaReportData,
  rawText: string,
): DexaReportData {
  const regexResult = parseDexaReport(rawText);
  if (!regexResult) return aiResult;

  const merged = { ...aiResult };
  const mergedRegions = new Map<string, DexaRegionMetrics>();

  // Seed with regex regions (strong for body composition)
  regexResult.regions?.forEach((r) => mergedRegions.set(r.region, { ...r }));

  // Overlay BMD from AI; fill missing body-composition fields AI computed but regex missed
  aiResult.regions?.forEach((aiRegion) => {
    const existing = mergedRegions.get(aiRegion.region);
    if (existing) {
      existing.boneDensityGPerCm2 =
        aiRegion.boneDensityGPerCm2 ?? existing.boneDensityGPerCm2;
      existing.tScore = aiRegion.tScore ?? existing.tScore;
      existing.zScore = aiRegion.zScore ?? existing.zScore;
      // Regex wins for body composition, but fall back to AI if regex has no value
      existing.bodyFatPercent =
        existing.bodyFatPercent ?? aiRegion.bodyFatPercent;
      existing.leanMassKg = existing.leanMassKg ?? aiRegion.leanMassKg;
      existing.fatMassKg = existing.fatMassKg ?? aiRegion.fatMassKg;
    } else {
      mergedRegions.set(aiRegion.region, { ...aiRegion });
    }
  });

  merged.regions = Array.from(mergedRegions.values());

  // Prefer regex for body composition totals
  if (regexResult.totalBodyFatPercent !== undefined)
    merged.totalBodyFatPercent = regexResult.totalBodyFatPercent;
  if (regexResult.totalLeanMassKg !== undefined)
    merged.totalLeanMassKg = regexResult.totalLeanMassKg;
  if (regexResult.visceralFatRating !== undefined)
    merged.visceralFatRating = regexResult.visceralFatRating;
  if (regexResult.visceralFatAreaCm2 !== undefined)
    merged.visceralFatAreaCm2 = regexResult.visceralFatAreaCm2;
  if (regexResult.visceralFatVolumeCm3 !== undefined)
    merged.visceralFatVolumeCm3 = regexResult.visceralFatVolumeCm3;
  if (regexResult.androidGynoidRatio !== undefined)
    merged.androidGynoidRatio = regexResult.androidGynoidRatio;

  // Prefer AI for BMD
  if (aiResult.boneDensityTotal?.bmd !== undefined)
    merged.boneDensityTotal = {
      ...merged.boneDensityTotal,
      bmd: aiResult.boneDensityTotal.bmd,
    };
  if (aiResult.boneDensityTotal?.tScore !== undefined)
    merged.boneDensityTotal = {
      ...merged.boneDensityTotal,
      tScore: aiResult.boneDensityTotal.tScore,
    };
  if (aiResult.boneDensityTotal?.zScore !== undefined)
    merged.boneDensityTotal = {
      ...merged.boneDensityTotal,
      zScore: aiResult.boneDensityTotal.zScore,
    };

  merged.confidence = Math.max(
    aiResult.confidence ?? 0,
    regexResult.confidence ?? 0,
  );

  return merged;
}

// ── Type definition ────────────────────────────────────────────────────────

export const dexaDefinition: ReportTypeDefinition<DexaReportData> = {
  id: "dexa-report",
  displayName: "DEXA Scan",
  storageDataType: "dexa",

  detect: looksLikeDexaReport,

  passes: [
    {
      label: "main",
      systemPrompt: DEXA_SYSTEM_PROMPT,
      buildPrompt: buildDexaPrompt,
      maxTokens: 2000,
      temperature: 0,
    },
  ],

  validate(merged, rawText) {
    const aiResult = mapDexaLlmResult(merged, rawText);
    if (!aiResult) {
      // Fall back to regex-only
      const regexResult = parseDexaReport(rawText);
      if (regexResult) {
        // Promote BMD from regions if available
        if (regexResult.boneDensityTotal?.bmd === undefined) {
          const totalRegion = regexResult.regions?.find(
            (r) => r.region === "total",
          );
          if (totalRegion?.boneDensityGPerCm2 !== undefined) {
            regexResult.boneDensityTotal = {
              ...regexResult.boneDensityTotal,
              bmd: totalRegion.boneDensityGPerCm2,
            };
          }
        }
      }
      return regexResult;
    }
    return mergeWithRegex(aiResult, rawText);
  },
};
