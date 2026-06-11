/**
 * AI-powered DEXA parser using Venice AI
 * More robust than regex-based parsing for different DEXA report formats
 */

import type { DexaReportData, DexaRegionMetrics } from "@/types/reportData";
import { callLlmExtractor, ANTI_HALLUCINATION_RULES } from "./llmPipeline";
import {
  validateExtractedValues,
  DEXA_VALIDATION_RULES,
} from "./hallucinationGuard";

/**
 * Parse DEXA report using AI
 */
export async function parseDexaReportWithAI(
  rawText: string,
  sourceName?: string,
): Promise<DexaReportData | null> {
  if (!rawText || rawText.trim().length === 0) {
    return null;
  }

  // Simple: send full text (or reasonable chunk) to Venice and ask for JSON
  // Only truncate if extremely long to avoid timeouts
  const textToParse =
    rawText.length > 20000
      ? rawText.substring(0, 20000) + "... (truncated)"
      : rawText;

  // Structured prompt with explicit schema for consistent extraction
  const systemPrompt = [
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

  const userPrompt = textToParse;

  try {
    console.log("[AIDexaParser] Sending PDF text to AI for parsing...");

    const parsed = await callLlmExtractor(systemPrompt, userPrompt, {
      logTag: "AIDexaParser",
      maxTokens: 2000,
      temperature: 0,
    });

    if (!parsed) {
      console.error("[AIDexaParser] ❌ LLM extractor returned null");
      return null;
    }

    console.log("[AIDexaParser] ✅ Parsed JSON structure:", {
      keys: Object.keys(parsed),
      preview: JSON.stringify(parsed).substring(0, 1000),
    });

    // Map JSON structure to DexaReportData - intelligently extract from any structure
    const regions: DexaRegionMetrics[] = [];

    // Helper to safely get nested values
    const get = (obj: unknown, path: string): unknown => {
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
    };

    // Helper to find any field that matches a pattern (case-insensitive)
    const findField = (obj: unknown, patterns: string[]): unknown => {
      if (!obj || typeof obj !== "object") return undefined;
      const lowerObj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
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
    };

    // Extract regions - look for any structure that contains regional data
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

    // Try to find segmental/regional data in any format
    let segmental = findField(parsed, [
      "segmental_analysis",
      "segmental",
      "regions",
      "regional",
    ]) as Record<string, unknown> | undefined;

    // If not found, check if parsed itself contains regional data
    if (!segmental) {
      // Check if any top-level key contains regional data
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

    console.log("[AIDexaParser] Found segmental data:", {
      hasSegmental: !!segmental,
      segmentalKeys:
        segmental && typeof segmental === "object"
          ? Object.keys(segmental)
          : [],
      allParsedKeys: Object.keys(parsed),
    });

    if (segmental && typeof segmental === "object") {
      for (const [key, regionData] of Object.entries(segmental)) {
        const lowerKey = key.toLowerCase();
        const regionName =
          regionMapping[lowerKey] ||
          regionKeys.find((r) => lowerKey.includes(r));

        if (regionName && regionData && typeof regionData === "object") {
          const metrics: DexaRegionMetrics = { region: regionName };
          const data = regionData as Record<string, unknown>;

          // Extract fat/lean mass (try various field names)
          const fatLbs =
            (typeof data.fat_mass_lbs === "number"
              ? data.fat_mass_lbs
              : undefined) ??
            (typeof data.fat_mass === "number" ? data.fat_mass : undefined) ??
            (typeof data["fat mass"] === "number"
              ? data["fat mass"]
              : undefined);
          const leanLbs =
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

          if (fatLbs !== undefined) {
            metrics.fatMassKg = fatLbs * 0.453592;
          }
          if (leanLbs !== undefined) {
            metrics.leanMassKg = leanLbs * 0.453592;
          }
          // Validate fat percent: must be in [0, 100] — reject impossible AI hallucinations
          if (
            fatPercent !== undefined &&
            fatPercent >= 0 &&
            fatPercent <= 100
          ) {
            metrics.bodyFatPercent = fatPercent;
          } else if (fatLbs !== undefined && leanLbs !== undefined) {
            const tissueLbs = fatLbs + leanLbs;
            if (tissueLbs > 0) {
              metrics.bodyFatPercent = (fatLbs / tissueLbs) * 100;
            }
          }

          // Extract BMD
          const bmd =
            (typeof data.bmd === "number" ? data.bmd : undefined) ??
            (typeof data.bone_density === "number"
              ? data.bone_density
              : undefined) ??
            (typeof data.bmd_g_cm2 === "number" ? data.bmd_g_cm2 : undefined);
          if (bmd !== undefined) {
            metrics.boneDensityGPerCm2 = bmd;
          }

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

    // Extract totals - search flexibly for any field containing these values
    let totalBodyFatPercent: number | undefined;
    let totalLeanMassKg: number | undefined;
    let androidGynoidRatio: number | undefined;

    // Try to find total body fat % from various locations
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
          if (tissueLbs > 0) {
            totalBodyFatPercent = (fatLbs / tissueLbs) * 100;
          }
        }
      }
    }

    // Try to find total lean mass
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
        if (leanLbs !== undefined) {
          totalLeanMassKg = leanLbs * 0.453592;
        }
      }
    }

    // Extract Android/Gynoid ratio
    const agRatios = findField(parsed, [
      "android_gynoid_ratios",
      "ag_ratio",
      "android_gynoid",
    ]);
    if (agRatios && typeof agRatios === "object") {
      const ratios = agRatios as Record<string, unknown>;
      androidGynoidRatio =
        typeof ratios.ag_ratio === "number" ? ratios.ag_ratio : undefined;
    }

    // Update android/gynoid regions with %Fat if available
    if (agRatios && typeof agRatios === "object") {
      const ratios = agRatios as Record<string, unknown>;
      if (typeof ratios.android_tissue_percent_fat === "number") {
        const androidRegion = regions.find((r) => r.region === "android");
        if (androidRegion) {
          androidRegion.bodyFatPercent = ratios.android_tissue_percent_fat;
        }
      }
      if (typeof ratios.gynoid_tissue_percent_fat === "number") {
        const gynoidRegion = regions.find((r) => r.region === "gynoid");
        if (gynoidRegion) {
          gynoidRegion.bodyFatPercent = ratios.gynoid_tissue_percent_fat;
        }
      }
    }

    // Extract BMD data - search flexibly
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

      // Try total_body structure
      if (bmdObj.total_body && typeof bmdObj.total_body === "object") {
        const totalBmd = bmdObj.total_body as Record<string, unknown>;
        if (typeof totalBmd.bmd_g_cm2 === "number") bmd = totalBmd.bmd_g_cm2;
        if (typeof totalBmd.t_score === "number") tScore = totalBmd.t_score;
        if (typeof totalBmd.z_score === "number") zScore = totalBmd.z_score;
        if (
          totalBmd.regional_bmd &&
          typeof totalBmd.regional_bmd === "object"
        ) {
          regionalBmd = totalBmd.regional_bmd as Record<
            string,
            { bmd_g_cm2?: number }
          >;
        }
      }

      // Try flat structure
      if (typeof bmdObj.total_body_bmd_g_cm2 === "number") {
        bmd = bmdObj.total_body_bmd_g_cm2;
      }
      if (typeof bmdObj.t_score === "number") {
        tScore = bmdObj.t_score;
      }
      if (typeof bmdObj.z_score === "number") {
        zScore = bmdObj.z_score;
      }
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

        // If this is the total region, also update the top-level bmd variable
        if (regionName === "total" && !bmd) {
          bmd = bmdValue;
        }
      }
    }

    // Ensure total region gets BMD if we have it from top-level extraction
    if (bmd !== undefined) {
      let totalRegion = regions.find((r) => r.region === "total");
      if (!totalRegion) {
        totalRegion = { region: "total" };
        regions.push(totalRegion);
      }
      if (!totalRegion.boneDensityGPerCm2) {
        totalRegion.boneDensityGPerCm2 = bmd;
      }
      if (tScore !== undefined && !totalRegion.tScore) {
        totalRegion.tScore = tScore;
      }
      if (zScore !== undefined && !totalRegion.zScore) {
        totalRegion.zScore = zScore;
      }
    }

    // Extract visceral fat data - search flexibly
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

      if (typeof vat.mass_lbs === "number") {
        visceralFatMassLbs = vat.mass_lbs;
      }
      if (typeof vat.volume_in3 === "number") {
        visceralFatVolumeCm3 = vat.volume_in3 * 16.387; // Convert in³ to cm³
      }
      if (typeof vat.area_in2 === "number") {
        visceralFatAreaCm2 = vat.area_in2 * 6.452; // Convert in² to cm²
      }
    }

    // Extract scan date - search flexibly
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
        (typeof dateObj.scan_date === "string"
          ? dateObj.scan_date
          : undefined) ??
        (typeof dateObj.measured_date === "string"
          ? dateObj.measured_date
          : undefined);
    }

    // Also try client_info/patient_info paths
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

    const report: DexaReportData = {
      type: "dexa",
      scanDate,
      totalBodyFatPercent,
      totalLeanMassKg,
      androidGynoidRatio,
      visceralFatRating: visceralFatMassLbs,
      visceralFatAreaCm2,
      visceralFatVolumeCm3,
      boneDensityTotal: {
        bmd,
        tScore,
        zScore,
      },
      regions,
      notes: [],
      rawText,
      confidence: regions.length > 0 ? Math.min(1, regions.length / 6) : 0.1,
      source: sourceName,
    };

    // Post-parse validation
    const { confidencePenalty } = validateExtractedValues(
      {
        totalBodyFatPercent,
        "boneDensityTotal.bmd": bmd,
        "boneDensityTotal.tScore": tScore,
        "boneDensityTotal.zScore": zScore,
      },
      DEXA_VALIDATION_RULES,
      "AIDexaParser",
    );
    report.confidence = Math.max(
      0.1,
      (regions.length > 0 ? Math.min(1, regions.length / 6) : 0.1) -
        confidencePenalty,
    );

    console.log(
      `[AIDexaParser] ✅ Successfully extracted DEXA report with ${regions.length} regions`,
      {
        regions: regions.map((r) => ({
          region: r.region,
          hasFat: r.fatMassKg !== undefined,
          hasLean: r.leanMassKg !== undefined,
          hasFatPercent: r.bodyFatPercent !== undefined,
          hasBMD: r.boneDensityGPerCm2 !== undefined,
        })),
        totalBodyFatPercent,
        totalLeanMassKg,
        bmd,
      },
    );
    return report;
  } catch (error) {
    console.error("[AIDexaParser] Error parsing with AI:", error);
    return null;
  }
}
