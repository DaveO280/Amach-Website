/**
 * AI-powered DEXA parser using Venice AI
 * More robust than regex-based parsing for different DEXA report formats
 */

import type { DexaReportData, DexaRegionMetrics } from "@/types/reportData";

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

  // Truncate very long text to avoid token limits and timeouts
  // Keep first 15000 chars which should cover most reports while staying under timeout limits
  const textToParse =
    rawText.length > 15000
      ? rawText.substring(0, 15000) + "... (truncated)"
      : rawText;

  const systemPrompt = `Extract all metric data from this DEXA report and output ONLY valid JSON. No narrative, recommendations, or explanations.

The report may be in various formats (Hologic, GE Lunar, Norland, etc.) - extract whatever data is available.

Required JSON structure (include only fields that are present in the report):
{
  "client_info": {
    "measured_date": "MM/DD/YYYY"
  },
  "segmental_analysis": {
    "arms_total": { "total_mass_lbs": X, "fat_mass_lbs": X, "lean_mass_lbs": X },
    "legs_total": { "total_mass_lbs": X, "fat_mass_lbs": X, "lean_mass_lbs": X },
    "trunk": { "total_mass_lbs": X, "fat_mass_lbs": X, "lean_mass_lbs": X },
    "android": { "total_mass_lbs": X, "fat_mass_lbs": X, "lean_mass_lbs": X },
    "gynoid": { "total_mass_lbs": X, "fat_mass_lbs": X, "lean_mass_lbs": X },
    "total": { "total_mass_lbs": X, "fat_mass_lbs": X, "lean_mass_lbs": X }
  },
  "body_composition_percentages": {
    "tissue_percent_fat": X,
    "region_percent_fat": X
  },
  "android_gynoid_ratios": {
    "android_tissue_percent_fat": X,
    "gynoid_tissue_percent_fat": X,
    "ag_ratio": X
  },
  "bone_mineral_density": {
    "total_body": { "bmd_g_cm2": X, "t_score": X, "z_score": X },
    "regional_bmd": {
      "head": { "bmd_g_cm2": X },
      "arms": { "bmd_g_cm2": X },
      "legs": { "bmd_g_cm2": X },
      "trunk": { "bmd_g_cm2": X },
      "ribs": { "bmd_g_cm2": X },
      "spine": { "bmd_g_cm2": X },
      "pelvis": { "bmd_g_cm2": X }
    }
  },
  "fat_distribution": {
    "visceral_adipose_tissue": {
      "mass_lbs": X,
      "volume_in3": X,
      "area_in2": X
    }
  }
}

Output ONLY the JSON object, no markdown, no code blocks, no explanations.`;

  const userPrompt = `Extract all DEXA scan data from this report and output ONLY valid JSON (no markdown, no code blocks, no explanations):

${textToParse}`;

  try {
    console.log("[AIDexaParser] Sending PDF text to AI for parsing...");

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
        max_tokens: 8000,
        temperature: 0.1,
        model: modelName,
        stream: false,
        venice_parameters: {
          // Disable thinking to ensure JSON response is in content field
          disable_thinking: true,
          // Strip any thinking that might leak through
          strip_thinking_response: true,
          // Don't include Venice system prompts
          include_venice_system_prompt: false,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    const firstChoice = data?.choices?.[0];
    const message = firstChoice?.message;

    // Enhanced logging for debugging production issues
    console.log("[AIDexaParser] Venice API response structure:", {
      hasData: Boolean(data),
      hasChoices: Boolean(data?.choices),
      choicesLength: data?.choices?.length || 0,
      hasFirstChoice: Boolean(firstChoice),
      hasMessage: Boolean(message),
      messageKeys: message ? Object.keys(message) : [],
      hasContent: Boolean(message?.content),
      contentLength: message?.content?.length || 0,
      hasReasoningContent: Boolean(message?.reasoning_content),
      reasoningContentLength: message?.reasoning_content?.length || 0,
      contentPreview: message?.content?.substring?.(0, 200),
      reasoningPreview: message?.reasoning_content?.substring?.(0, 200),
    });

    // Get response - try content first, then reasoning_content
    // In production, Venice might return JSON in either field depending on thinking mode
    let jsonText =
      message?.content?.trim() || message?.reasoning_content?.trim() || "";

    if (!jsonText) {
      console.error("[AIDexaParser] ❌ Empty response from AI", {
        hasContent: Boolean(message?.content),
        hasReasoningContent: Boolean(message?.reasoning_content),
        messageStructure: message
          ? JSON.stringify(message).substring(0, 500)
          : "null",
      });
      return null;
    }

    console.log("[AIDexaParser] Attempting to parse JSON directly...");

    // Try parsing directly first (if Venice outputs pure JSON)
    // Define the expected JSON structure from Venice
    interface VeniceDexaJson {
      client_info?: {
        measured_date?: string;
      };
      segmental_analysis?: Record<
        string,
        {
          total_mass_lbs?: number;
          fat_mass_lbs?: number;
          lean_mass_lbs?: number;
        }
      >;
      body_composition_percentages?: {
        tissue_percent_fat?: number;
        region_percent_fat?: number;
      };
      android_gynoid_ratios?: {
        android_tissue_percent_fat?: number;
        gynoid_tissue_percent_fat?: number;
        ag_ratio?: number;
      };
      bone_mineral_density?: {
        total_body?: {
          bmd_g_cm2?: number;
          t_score?: number;
          z_score?: number;
        };
        regional_bmd?: Record<
          string,
          {
            bmd_g_cm2?: number;
          }
        >;
      };
      fat_distribution?: {
        visceral_adipose_tissue?: {
          mass_lbs?: number;
          volume_in3?: number;
          area_in2?: number;
        };
      };
    }

    let parsed: VeniceDexaJson;
    try {
      parsed = JSON.parse(jsonText);
      console.log("[AIDexaParser] ✅ Successfully parsed JSON directly");
    } catch (directParseError) {
      // If direct parse fails, try removing markdown code blocks
      console.warn(
        "[AIDexaParser] Direct parse failed, trying to extract JSON from markdown...",
        {
          error:
            directParseError instanceof Error
              ? directParseError.message
              : String(directParseError),
          jsonTextLength: jsonText.length,
          jsonTextPreview: jsonText.substring(0, 500),
        },
      );

      // Remove markdown code blocks if present
      if (jsonText.includes("```json")) {
        jsonText = jsonText.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      } else if (jsonText.includes("```")) {
        jsonText = jsonText.replace(/```\s*/g, "");
      }

      // Try to extract JSON object
      let jsonMatch = jsonText.match(
        /\{[\s\S]*?"segmental_analysis"[\s\S]*?\}/,
      );
      if (!jsonMatch) {
        jsonMatch = jsonText.match(/\{[\s\S]{200,}\}/);
      }
      if (!jsonMatch) {
        jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      }

      if (!jsonMatch) {
        console.error("[AIDexaParser] ❌ No JSON object found in AI response", {
          jsonTextLength: jsonText.length,
          jsonTextPreview: jsonText.substring(0, 1000),
          hasJsonMarkers: jsonText.includes("{") && jsonText.includes("}"),
          hasSegmentalAnalysis: jsonText.includes("segmental_analysis"),
        });
        // Fallback to structured text parsing
        return parseStructuredTextToDexaReport(
          jsonText,
          null,
          rawText,
          sourceName,
        );
      }

      jsonText = jsonMatch[0];

      try {
        parsed = JSON.parse(jsonText);
        console.log("[AIDexaParser] ✅ Successfully parsed extracted JSON");
      } catch (extractParseError) {
        console.error("[AIDexaParser] JSON parse error after extraction:", {
          error:
            extractParseError instanceof Error
              ? extractParseError.message
              : String(extractParseError),
          extractedJsonLength: jsonText.length,
          extractedJsonPreview: jsonText.substring(0, 1000),
          originalTextLength:
            message?.content?.length || message?.reasoning_content?.length || 0,
        });
        // Fallback to structured text parsing
        return parseStructuredTextToDexaReport(
          jsonText,
          null,
          rawText,
          sourceName,
        );
      }
    }

    // Map JSON structure to DexaReportData
    const regions: DexaRegionMetrics[] = [];

    // Extract segmental analysis data
    const segmental = parsed.segmental_analysis || {};
    const regionMapping: Record<string, string> = {
      arms_total: "arms",
      legs_total: "legs",
      trunk: "trunk",
      android: "android",
      gynoid: "gynoid",
      total: "total",
    };

    for (const [key, regionName] of Object.entries(regionMapping)) {
      const regionData = segmental[key];
      if (regionData) {
        const metrics: DexaRegionMetrics = { region: regionName };

        if (regionData.fat_mass_lbs !== undefined) {
          metrics.fatMassKg = regionData.fat_mass_lbs * 0.453592;
        }
        if (regionData.lean_mass_lbs !== undefined) {
          metrics.leanMassKg = regionData.lean_mass_lbs * 0.453592;
        }

        // Calculate body fat % if we have both
        if (
          regionData.fat_mass_lbs !== undefined &&
          regionData.lean_mass_lbs !== undefined
        ) {
          const tissueLbs = regionData.fat_mass_lbs + regionData.lean_mass_lbs;
          if (tissueLbs > 0) {
            metrics.bodyFatPercent =
              (regionData.fat_mass_lbs / tissueLbs) * 100;
          }
        }

        // Add BMD data if available (for total region)
        if (regionName === "total" && parsed.bone_mineral_density?.total_body) {
          const bmd = parsed.bone_mineral_density.total_body;
          if (bmd.bmd_g_cm2 !== undefined) {
            metrics.boneDensityGPerCm2 = bmd.bmd_g_cm2;
          }
          if (bmd.t_score !== undefined) {
            metrics.tScore = bmd.t_score;
          }
          if (bmd.z_score !== undefined) {
            metrics.zScore = bmd.z_score;
          }
        }

        // Always add region if it has any data, even if just bodyFatPercent
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

    // Extract body composition percentages
    const bodyComp = parsed.body_composition_percentages || {};
    let totalBodyFatPercent = bodyComp.tissue_percent_fat;

    // If totalBodyFatPercent not found in body_composition_percentages, try to extract from total region
    if (totalBodyFatPercent === undefined && segmental.total) {
      const totalData = segmental.total;
      if (
        totalData.fat_mass_lbs !== undefined &&
        totalData.lean_mass_lbs !== undefined
      ) {
        const tissueLbs = totalData.fat_mass_lbs + totalData.lean_mass_lbs;
        if (tissueLbs > 0) {
          totalBodyFatPercent = (totalData.fat_mass_lbs / tissueLbs) * 100;
        }
      }
    }

    // Extract total lean mass from segmental analysis total
    const totalData = segmental.total;
    let totalLeanMassKg: number | undefined;
    if (totalData?.lean_mass_lbs !== undefined) {
      totalLeanMassKg = totalData.lean_mass_lbs * 0.453592;
    }

    // Extract Android/Gynoid ratio
    const agRatios = parsed.android_gynoid_ratios || {};
    const androidGynoidRatio = agRatios.ag_ratio;

    // Update android/gynoid regions with %Fat if available
    if (agRatios.android_tissue_percent_fat !== undefined) {
      const androidRegion = regions.find((r) => r.region === "android");
      if (androidRegion) {
        androidRegion.bodyFatPercent = agRatios.android_tissue_percent_fat;
      }
    }
    if (agRatios.gynoid_tissue_percent_fat !== undefined) {
      const gynoidRegion = regions.find((r) => r.region === "gynoid");
      if (gynoidRegion) {
        gynoidRegion.bodyFatPercent = agRatios.gynoid_tissue_percent_fat;
      }
    }

    // Extract BMD data
    const bmdData = parsed.bone_mineral_density || {};
    const totalBmd = bmdData.total_body || {};
    let bmd: number | undefined;
    let tScore: number | undefined;
    let zScore: number | undefined;

    if (totalBmd.bmd_g_cm2 !== undefined) {
      bmd = totalBmd.bmd_g_cm2;
    }
    if (totalBmd.t_score !== undefined) {
      tScore = totalBmd.t_score;
    }
    if (totalBmd.z_score !== undefined) {
      zScore = totalBmd.z_score;
    }

    // Extract regional BMD
    const regionalBmd = bmdData.regional_bmd || {};
    const bmdRegionMapping: Record<string, string> = {
      head: "head",
      arms: "arms",
      legs: "legs",
      trunk: "trunk",
      ribs: "ribs",
      spine: "spine",
      pelvis: "pelvis",
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
      }
    }

    // Extract visceral fat data
    const fatDist = parsed.fat_distribution || {};
    const vat = fatDist.visceral_adipose_tissue || {};
    let visceralFatVolumeCm3: number | undefined;
    let visceralFatAreaCm2: number | undefined;
    let visceralFatMassLbs: number | undefined;

    if (vat.mass_lbs !== undefined) {
      visceralFatMassLbs = vat.mass_lbs;
    }
    if (vat.volume_in3 !== undefined) {
      visceralFatVolumeCm3 = vat.volume_in3 * 16.387; // Convert in³ to cm³
    }
    if (vat.area_in2 !== undefined) {
      visceralFatAreaCm2 = vat.area_in2 * 6.452; // Convert in² to cm²
    }

    // Extract scan date
    const scanDate = parsed.client_info?.measured_date;

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

    console.log(
      `[AIDexaParser] ✅ Successfully extracted DEXA report with ${regions.length} regions`,
    );
    return report;
  } catch (error) {
    console.error("[AIDexaParser] Error parsing with AI:", error);
    return null;
  }
}

/**
 * Parse structured text format from AI reasoning content
 * The AI outputs beautifully structured sections that we can parse directly
 * Example sections: "Segmental Analysis", "Body Composition Percentages", "Bone Mineral Density", etc.
 */
function parseStructuredTextToDexaReport(
  fullText: string,
  structuredLines: RegExpMatchArray | null,
  rawText: string,
  sourceName?: string,
): DexaReportData | null {
  try {
    const regions: DexaRegionMetrics[] = [];
    let scanDate: string | undefined;
    let totalBodyFatPercent: number | undefined;
    let totalLeanMassKg: number | undefined;
    let androidGynoidRatio: number | undefined;
    let bmd: number | undefined;
    let tScore: number | undefined;
    let zScore: number | undefined;
    let visceralFatVolumeCm3: number | undefined;
    let visceralFatAreaCm2: number | undefined;
    let visceralFatMassLbs: number | undefined;

    // Extract scan date - be flexible with format
    const datePatterns = [
      /measured[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /scan\s+date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /report\s+date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    ];
    for (const pattern of datePatterns) {
      const match = fullText.match(pattern);
      if (match) {
        scanDate = match[1];
        console.log("[AIDexaParser] Found scan date:", scanDate);
        break;
      }
    }

    // Parse Segmental Analysis section
    // The AI outputs data in formats like:
    // "Arms Total - Fat Mass: 4.5 lbs" or "Arms Total\nFat Mass: 4.5 lbs"
    // Simple direct pattern matching for each region and metric

    console.log(
      "[AIDexaParser] Parsing segmental data from full text, length:",
      fullText.length,
    );

    // Define regions and their search patterns
    const regionPatterns: Array<{ key: string; searchPattern: string }> = [
      { key: "arms", searchPattern: "arms?\\s+total" },
      { key: "legs", searchPattern: "legs?\\s+total" },
      { key: "trunk", searchPattern: "\\btrunk\\b" },
      { key: "android", searchPattern: "\\bandroid\\b" },
      { key: "gynoid", searchPattern: "\\bgynoid\\b" },
      { key: "total", searchPattern: "total\\s+body" },
    ];

    // For each region, search for its metrics directly
    for (const { key: regionName, searchPattern } of regionPatterns) {
      const existing = regions.find((r) => r.region === regionName);
      const metrics: DexaRegionMetrics = existing || { region: regionName };

      // Search for "Region Name - Fat Mass: X lbs" or "Region Name\nFat Mass: X lbs"
      // Use flexible matching that works across lines
      const fatRegex = new RegExp(
        `${searchPattern}.*?fat\\s+mass[:\\s-]+([\\d.]+)\\s*(?:lbs?|kg)`,
        "is",
      );
      const fatMatch = fullText.match(fatRegex);
      if (fatMatch) {
        const lbs = parseFloat(fatMatch[1]);
        metrics.fatMassKg = lbs * 0.453592;
        console.log(
          `[AIDexaParser] ${regionName} fat mass:`,
          metrics.fatMassKg,
          "kg",
        );
      }

      const leanRegex = new RegExp(
        `${searchPattern}.*?lean\\s+mass[:\\s-]+([\\d.]+)\\s*(?:lbs?|kg)`,
        "is",
      );
      const leanMatch = fullText.match(leanRegex);
      if (leanMatch) {
        const lbs = parseFloat(leanMatch[1]);
        metrics.leanMassKg = lbs * 0.453592;
        console.log(
          `[AIDexaParser] ${regionName} lean mass:`,
          metrics.leanMassKg,
          "kg",
        );
      }

      // Try to find explicit tissue %Fat for this region (more accurate than calculated)
      const tissueFatRegex = new RegExp(
        `${searchPattern}.*?tissue\\s*%?fat[:\\s-]+([\\d.]+)%?`,
        "is",
      );
      const tissueFatMatch = fullText.match(tissueFatRegex);
      if (tissueFatMatch) {
        metrics.bodyFatPercent = parseFloat(tissueFatMatch[1]);
        console.log(
          `[AIDexaParser] ${regionName} tissue %Fat:`,
          metrics.bodyFatPercent,
          "%",
        );
      } else if (fatMatch && leanMatch) {
        // Calculate body fat % if we have both fat and lean but no explicit %
        const fatLbs = parseFloat(fatMatch[1]);
        const leanLbs = parseFloat(leanMatch[1]);
        const tissueLbs = fatLbs + leanLbs;
        if (tissueLbs > 0) {
          metrics.bodyFatPercent = (fatLbs / tissueLbs) * 100;
        }
      }

      // Only add/update if we found at least one metric
      if (
        metrics.fatMassKg !== undefined ||
        metrics.leanMassKg !== undefined ||
        metrics.bodyFatPercent !== undefined
      ) {
        if (!existing) {
          regions.push(metrics);
          console.log(
            `[AIDexaParser] ✅ Parsed region: ${regionName}`,
            metrics,
          );
        } else {
          Object.assign(existing, metrics);
          console.log(
            `[AIDexaParser] ✅ Updated region: ${regionName}`,
            metrics,
          );
        }
      }
    }

    // Parse Body Composition Percentages section - be flexible
    const tissueFatPatterns = [
      /total\s+body.*?tissue\s*%?fat[:\s-]+([\d.]+)%?/is,
      /tissue\s*%?fat[:\s]+([\d.]+)%?/i,
    ];
    for (const pattern of tissueFatPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        totalBodyFatPercent = parseFloat(match[1]);
        console.log(
          "[AIDexaParser] Found total body fat %:",
          totalBodyFatPercent,
        );
        break;
      }
    }

    // Parse Region %Fat (different from Tissue %Fat)
    const regionFatMatch = fullText.match(/region\s*%?fat[:\\s-]+([\\d.]+)%?/i);
    if (regionFatMatch) {
      console.log("[AIDexaParser] Found Region %Fat:", regionFatMatch[1], "%");
      // Store this separately if needed, or use as fallback for totalBodyFatPercent
    }

    // Parse Total Body section for lean mass - be flexible
    const totalLeanPatterns = [
      /total\s+body.*?lean\s+mass[:\\s-]+([\\d.]+)\\s*(?:lbs?|kg)/is,
      /total\s+body.*?lean[:\\s-]+([\\d.]+)\\s*(?:lbs?|kg)/is,
    ];
    for (const pattern of totalLeanPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        const lbs = parseFloat(match[1]);
        totalLeanMassKg = lbs * 0.453592;
        console.log(
          "[AIDexaParser] Found total lean mass:",
          totalLeanMassKg,
          "kg",
        );
        break;
      }
    }

    // Parse Android / Gynoid Ratios section
    const agRatioMatch = fullText.match(/a\/g\s*ratio[:\s]+([\d.]+)/i);
    if (agRatioMatch) {
      androidGynoidRatio = parseFloat(agRatioMatch[1]);
      console.log("[AIDexaParser] Found A/G ratio:", androidGynoidRatio);
    }

    // Update android/gynoid regions with %Fat from ratios section
    const androidFatMatch = fullText.match(
      /android\s+tissue\s*%?fat[:\s]+([\d.]+)%?/i,
    );
    if (androidFatMatch) {
      const androidRegion = regions.find((r) => r.region === "android");
      if (androidRegion) {
        androidRegion.bodyFatPercent = parseFloat(androidFatMatch[1]);
      }
    }

    const gynoidFatMatch = fullText.match(
      /gynoid\s+tissue\s*%?fat[:\s]+([\d.]+)%?/i,
    );
    if (gynoidFatMatch) {
      const gynoidRegion = regions.find((r) => r.region === "gynoid");
      if (gynoidRegion) {
        gynoidRegion.bodyFatPercent = parseFloat(gynoidFatMatch[1]);
      }
    }

    // Parse Bone Mineral Density (BMD) section - be flexible
    // Look for BMD data anywhere in the text, not just in a specific section

    // Total Body BMD
    const totalBmdPatterns = [
      /total\s+body.*?bmd[:\s-]+([\d.]+)\s*(?:g\/cm[\u00B22]|g\/cm2)?/is,
      /bmd[:\s]+([\d.]+)\s*(?:g\/cm[\u00B22]|g\/cm2)?/i,
    ];
    for (const pattern of totalBmdPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        bmd = parseFloat(match[1]);
        console.log("[AIDexaParser] Found total BMD:", bmd);
        break;
      }
    }

    // T-score - be flexible
    const tScorePatterns = [
      /total\s+body.*?t[-\s]?score[:\\s-]+(-?[\\d.]+)/is,
      /t[-\s]?score[:\\s]+(-?[\\d.]+)/i,
    ];
    for (const pattern of tScorePatterns) {
      const match = fullText.match(pattern);
      if (match) {
        tScore = parseFloat(match[1]);
        console.log("[AIDexaParser] Found T-score:", tScore);
        break;
      }
    }

    // Z-score - be flexible
    const zScorePatterns = [
      /total\s+body.*?z[-\s]?score[:\\s-]+(-?[\\d.]+)/is,
      /z[-\s]?score[:\\s]+(-?[\\d.]+)/i,
    ];
    for (const pattern of zScorePatterns) {
      const match = fullText.match(pattern);
      if (match) {
        zScore = parseFloat(match[1]);
        console.log("[AIDexaParser] Found Z-score:", zScore);
        break;
      }
    }

    // Parse regional BMD data (Head, Arms, Legs, Trunk, Ribs, Spine, Pelvis)
    const regionalBmdRegions = [
      { name: "head", pattern: "\\bhead\\b" },
      { name: "arms", pattern: "\\barms?\\b" },
      { name: "legs", pattern: "\\blegs?\\b" },
      { name: "trunk", pattern: "\\btrunk\\b" },
      { name: "ribs", pattern: "\\bribs?\\b" },
      { name: "spine", pattern: "\\bspine\\b" },
      { name: "pelvis", pattern: "\\bpelvis\\b" },
    ];

    for (const { name: bmdRegionName, pattern } of regionalBmdRegions) {
      // Look for "Region - BMD: X g/cm²" pattern - use flexible matching
      const bmdRegex = new RegExp(
        `${pattern}.*?bmd[:\\s-]+([\\d.]+)\\s*(?:g\\/cm[\\u00B22]|g\\/cm2)?`,
        "is",
      );
      const bmdMatch = fullText.match(bmdRegex);
      if (bmdMatch) {
        const bmdValue = parseFloat(bmdMatch[1]);
        // Find or create region for this BMD data
        let bmdRegion = regions.find((r) => r.region === bmdRegionName);
        if (!bmdRegion) {
          bmdRegion = { region: bmdRegionName };
          regions.push(bmdRegion);
        }
        bmdRegion.boneDensityGPerCm2 = bmdValue;
        console.log(`[AIDexaParser] Found ${bmdRegionName} BMD:`, bmdValue);
      }
    }

    // Update total region with BMD data
    const totalRegion = regions.find((r) => r.region === "total");
    if (totalRegion) {
      if (bmd !== undefined) totalRegion.boneDensityGPerCm2 = bmd;
      if (tScore !== undefined) totalRegion.tScore = tScore;
      if (zScore !== undefined) totalRegion.zScore = zScore;
    }

    // Parse Visceral Fat data - be flexible, search anywhere in text
    // Look for "Visceral Fat - Mass: X lbs" or "VAT - Mass: X lbs" patterns

    const vatMassPatterns = [
      /visceral.*?fat.*?mass[:\\s-]+([\\d.]+)\\s*(?:lbs?|kg)/is,
      /vat.*?mass[:\\s-]+([\\d.]+)\\s*(?:lbs?|kg)/is,
      /visceral.*?mass[:\\s-]+([\\d.]+)\\s*(?:lbs?|kg)/is,
    ];
    for (const pattern of vatMassPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        visceralFatMassLbs = parseFloat(match[1]);
        console.log(
          "[AIDexaParser] Found visceral fat mass:",
          visceralFatMassLbs,
          "lbs",
        );
        break;
      }
    }

    const vatVolumePatterns = [
      /visceral.*?fat.*?volume[:\\s-]+([\\d.]+)\\s*(?:in³|cm³|cc)/is,
      /vat.*?volume[:\\s-]+([\\d.]+)\\s*(?:in³|cm³|cc)/is,
      /visceral.*?volume[:\\s-]+([\\d.]+)\\s*(?:in³|cm³|cc)/is,
    ];
    for (const pattern of vatVolumePatterns) {
      const match = fullText.match(pattern);
      if (match) {
        let vol = parseFloat(match[1]);
        // Check if we need to convert units
        const matchText = match[0];
        if (matchText.includes("in³")) {
          vol = vol * 16.387; // Convert in³ to cm³
        }
        visceralFatVolumeCm3 = vol;
        console.log(
          "[AIDexaParser] Found visceral fat volume:",
          visceralFatVolumeCm3,
          "cm³",
        );
        break;
      }
    }

    const vatAreaPatterns = [
      /visceral.*?fat.*?area[:\\s-]+([\\d.]+)\\s*(?:in²|cm²)/is,
      /vat.*?area[:\\s-]+([\\d.]+)\\s*(?:in²|cm²)/is,
      /visceral.*?area[:\\s-]+([\\d.]+)\\s*(?:in²|cm²)/is,
    ];
    for (const pattern of vatAreaPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        let area = parseFloat(match[1]);
        // Check if we need to convert units
        const matchText = match[0];
        if (matchText.includes("in²")) {
          area = area * 6.452; // Convert in² to cm²
        }
        visceralFatAreaCm2 = area;
        console.log(
          "[AIDexaParser] Found visceral fat area:",
          visceralFatAreaCm2,
          "cm²",
        );
        break;
      }
    }

    // Parse structured lines (if provided)
    if (structuredLines) {
      for (const line of structuredLines) {
        // Clean up the line (remove asterisks, extra whitespace, newlines)
        const cleanLine = line
          .replace(/^[*\s]+/, "")
          .trim()
          .replace(/\s+/g, " ");

        // Extract region name (can be after asterisk or at start)
        const regionMatch = cleanLine.match(
          /^(arms|legs|trunk|android|gynoid|total|scanDate|totalBodyFatPercent)[:\s]/i,
        );
        if (!regionMatch) continue;

        const regionName = regionMatch[1].toLowerCase();

        // Handle scanDate specially
        if (regionName === "scandate") {
          const dateMatch = cleanLine.match(/scanDate[:\s=]+([\d\/\-]+)/i);
          if (dateMatch) {
            scanDate = dateMatch[1];
          }
          continue;
        }

        // Handle totalBodyFatPercent specially
        if (regionName === "totalbodyfatpercent") {
          const match = cleanLine.match(/totalBodyFatPercent[:\s=]+([\d.]+)/i);
          if (match) {
            totalBodyFatPercent = parseFloat(match[1]);
          }
          continue;
        }

        // Extract key=value pairs (format: key=value, key=value)
        const pairs = cleanLine.match(/(\w+)=([\d.]+)/g);
        if (pairs) {
          const existing = regions.find((r) => r.region === regionName);
          const metrics: DexaRegionMetrics = existing || { region: regionName };

          for (const pair of pairs) {
            const [, key, value] = pair.match(/(\w+)=([\d.]+)/) || [];
            if (!key || !value) continue;

            const numValue = parseFloat(value);
            switch (key.toLowerCase()) {
              case "bodyfatpercent":
                metrics.bodyFatPercent = numValue;
                break;
              case "leanmasskg":
                metrics.leanMassKg = numValue;
                break;
              case "fatmasskg":
                metrics.fatMassKg = numValue;
                break;
              case "bonedensitygpercm2":
              case "bmd":
                metrics.boneDensityGPerCm2 = numValue;
                if (regionName === "total") {
                  bmd = numValue;
                }
                break;
              case "tscore":
                metrics.tScore = numValue;
                if (regionName === "total") {
                  tScore = numValue;
                }
                break;
              case "zscore":
                metrics.zScore = numValue;
                if (regionName === "total") {
                  zScore = numValue;
                }
                break;
            }

            // Store totals from the "total" region
            if (regionName === "total") {
              if (key.toLowerCase() === "bodyfatpercent") {
                totalBodyFatPercent = numValue;
              }
              if (key.toLowerCase() === "leanmasskg") {
                totalLeanMassKg = numValue;
              }
            }
          }

          // Only add if we extracted at least one metric
          if (
            metrics.bodyFatPercent !== undefined ||
            metrics.leanMassKg !== undefined ||
            metrics.fatMassKg !== undefined ||
            metrics.boneDensityGPerCm2 !== undefined
          ) {
            if (!existing) {
              regions.push(metrics);
              console.log(
                `[AIDexaParser] Parsed region: ${regionName}`,
                metrics,
              );
            } else {
              // Update existing
              Object.assign(existing, metrics);
            }
          }
        }
      }
    }

    if (regions.length === 0) {
      console.error(
        "[AIDexaParser] No valid regions parsed from structured text",
      );
      return null;
    }

    // Convert visceral fat mass from lbs to kg if needed
    let visceralFatRating: number | undefined;
    if (visceralFatMassLbs) {
      visceralFatRating = visceralFatMassLbs; // Store in lbs for rating
      // Also convert to cm3 if we have volume
      if (!visceralFatVolumeCm3 && visceralFatMassLbs) {
        // Rough conversion: 1 lb fat ≈ 453.6 cm³ (approximate)
        visceralFatVolumeCm3 = visceralFatMassLbs * 453.6;
      }
    }

    const report: DexaReportData = {
      type: "dexa",
      scanDate: scanDate || undefined,
      totalBodyFatPercent,
      totalLeanMassKg,
      androidGynoidRatio,
      visceralFatRating,
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
      confidence: Math.min(1, regions.length / 6),
      source: sourceName,
    };

    console.log(
      `[AIDexaParser] ✅ Successfully parsed ${regions.length} regions from structured text`,
    );
    return report;
  } catch (error) {
    console.error("[AIDexaParser] Error parsing structured text:", error);
    return null;
  }
}
