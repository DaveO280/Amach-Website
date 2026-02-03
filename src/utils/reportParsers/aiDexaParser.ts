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

  // Simple: send full text (or reasonable chunk) to Venice and ask for JSON
  // Only truncate if extremely long to avoid timeouts
  const textToParse =
    rawText.length > 20000
      ? rawText.substring(0, 20000) + "... (truncated)"
      : rawText;

  // Minimal prompt - just ask Venice to extract metrics as JSON
  const systemPrompt = `Extract all metrics from this DEXA scan report. Strip all verbiage and return only the data as JSON.`;

  const userPrompt = textToParse;

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
        max_tokens: 2000, // Reduced - JSON responses are compact
        temperature: 0, // Use 0 for deterministic output (faster)
        model: modelName,
        stream: false,
        response_format: { type: "json_object" }, // Force JSON mode for faster, structured output
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

    // Venice returns JSON - accept whatever structure it gives us
    // We'll intelligently extract data from any structure
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText);
      console.log("[AIDexaParser] ✅ Successfully parsed JSON directly");
      console.log("[AIDexaParser] Parsed JSON structure:", {
        keys: Object.keys(parsed),
        preview: JSON.stringify(parsed).substring(0, 1000),
      });
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
          if (fatPercent !== undefined) {
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
    if (typeof totalFatPercent === "number") {
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

    // Update total region with BMD data (create if it doesn't exist)
    let totalRegion = regions.find((r) => r.region === "total");
    if (
      !totalRegion &&
      (bmd !== undefined || tScore !== undefined || zScore !== undefined)
    ) {
      totalRegion = { region: "total" };
      regions.push(totalRegion);
    }
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
