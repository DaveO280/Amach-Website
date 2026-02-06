import { parseDexaReport, looksLikeDexaReport } from "./dexaParser";
import {
  parseBloodworkReport,
  looksLikeBloodworkReport,
} from "./bloodworkParser";
import { parseBloodworkReportWithAI } from "./aiBloodworkParser";
import { parseDexaReportWithAI } from "./aiDexaParser";
import type {
  ParsedReportSummary,
  ParsedHealthReport,
} from "@/types/reportData";

export interface ReportParsingOptions {
  inferredType?: "dexa" | "bloodwork";
  sourceName?: string;
  // Legacy option used by some callers; currently ignored by the parser.
  useAI?: boolean;
}

export async function parseHealthReport(
  rawText: string,
  options: ReportParsingOptions = {},
): Promise<ParsedReportSummary[]> {
  if (!rawText || rawText.trim().length === 0) {
    return [];
  }

  const reports: ParsedHealthReport[] = [];

  // Check type if not explicitly set
  const isDexa =
    options.inferredType === "dexa" ||
    (options.inferredType !== "bloodwork" && looksLikeDexaReport(rawText));
  const isBloodwork =
    options.inferredType === "bloodwork" ||
    (options.inferredType !== "dexa" &&
      !isDexa &&
      looksLikeBloodworkReport(rawText));

  if (isDexa) {
    let dexa: ParsedHealthReport | null = null;

    // Try AI parsing first if enabled, then merge with regex parser for best results
    let aiResult: ParsedHealthReport | null = null;
    let regexResult: ParsedHealthReport | null = null;

    if (options.useAI) {
      console.log("[ReportParser] 🤖 Using AI to parse DEXA report...");
      try {
        aiResult = await parseDexaReportWithAI(rawText, options.sourceName);

        if (aiResult) {
          const hasRegions = aiResult.regions && aiResult.regions.length > 0;
          const hasMeaningfulData =
            aiResult.totalBodyFatPercent !== undefined ||
            aiResult.boneDensityTotal?.bmd !== undefined ||
            aiResult.totalLeanMassKg !== undefined;

          if (hasRegions) {
            console.log(
              `[ReportParser] ✅ AI parser extracted ${aiResult.regions.length} regions`,
            );
          } else if (hasMeaningfulData) {
            console.warn(
              `[ReportParser] ⚠️ AI parser extracted data but 0 regions (confidence: ${aiResult.confidence}).`,
            );
          } else {
            console.warn(
              `[ReportParser] ⚠️ AI parser returned report with no meaningful data.`,
            );
            aiResult = null;
          }
        } else {
          console.log("[ReportParser] AI parser timed out or returned null.");
        }
      } catch (aiError) {
        console.error("[ReportParser] ❌ AI parser error:", aiError);
        aiResult = null;
      }
    }

    // Always run regex parser to get body composition data (fat/lean mass)
    console.log("[ReportParser] 📝 Using regex to parse DEXA report...");
    regexResult = parseDexaReport(rawText);
    if (regexResult) {
      console.log(
        `[ReportParser] Regex parser extracted ${regexResult.regions?.length || 0} regions`,
      );
    }

    // Merge results: prefer AI for BMD, prefer regex for body composition
    if (aiResult && regexResult) {
      console.log("[ReportParser] 🔀 Merging AI and regex parser results...");

      // Start with AI result as base
      dexa = { ...aiResult };

      // Merge regions: combine BMD from AI with fat/lean mass from regex
      const mergedRegions = new Map<string, (typeof aiResult.regions)[0]>();

      // Add all regions from regex (has fat/lean mass)
      regexResult.regions?.forEach((region) => {
        mergedRegions.set(region.region, { ...region });
      });

      // Merge BMD data from AI into existing regions
      aiResult.regions?.forEach((aiRegion) => {
        const existing = mergedRegions.get(aiRegion.region);
        if (existing) {
          // Merge: keep fat/lean from regex, add BMD from AI
          existing.boneDensityGPerCm2 =
            aiRegion.boneDensityGPerCm2 ?? existing.boneDensityGPerCm2;
          existing.tScore = aiRegion.tScore ?? existing.tScore;
          existing.zScore = aiRegion.zScore ?? existing.zScore;
        } else {
          // New region from AI (only BMD), add it
          mergedRegions.set(aiRegion.region, { ...aiRegion });
        }
      });

      dexa.regions = Array.from(mergedRegions.values());

      // Prefer regex for body composition totals (more reliable)
      if (regexResult.totalBodyFatPercent !== undefined) {
        dexa.totalBodyFatPercent = regexResult.totalBodyFatPercent;
      }
      if (regexResult.totalLeanMassKg !== undefined) {
        dexa.totalLeanMassKg = regexResult.totalLeanMassKg;
      }
      if (regexResult.visceralFatRating !== undefined) {
        dexa.visceralFatRating = regexResult.visceralFatRating;
      }
      if (regexResult.visceralFatAreaCm2 !== undefined) {
        dexa.visceralFatAreaCm2 = regexResult.visceralFatAreaCm2;
      }
      if (regexResult.visceralFatVolumeCm3 !== undefined) {
        dexa.visceralFatVolumeCm3 = regexResult.visceralFatVolumeCm3;
      }
      if (regexResult.androidGynoidRatio !== undefined) {
        dexa.androidGynoidRatio = regexResult.androidGynoidRatio;
      }

      // Prefer AI for BMD totals (more reliable)
      if (aiResult.boneDensityTotal?.bmd !== undefined) {
        dexa.boneDensityTotal = {
          ...dexa.boneDensityTotal,
          bmd: aiResult.boneDensityTotal.bmd,
        };
      }
      if (aiResult.boneDensityTotal?.tScore !== undefined) {
        dexa.boneDensityTotal = {
          ...dexa.boneDensityTotal,
          tScore: aiResult.boneDensityTotal.tScore,
        };
      }
      if (aiResult.boneDensityTotal?.zScore !== undefined) {
        dexa.boneDensityTotal = {
          ...dexa.boneDensityTotal,
          zScore: aiResult.boneDensityTotal.zScore,
        };
      }

      // CRITICAL: If boneDensityTotal.bmd is still missing, promote from regions.total
      if (dexa.boneDensityTotal?.bmd === undefined) {
        const totalRegion = dexa.regions?.find((r) => r.region === "total");
        if (totalRegion?.boneDensityGPerCm2 !== undefined) {
          dexa.boneDensityTotal = {
            ...dexa.boneDensityTotal,
            bmd: totalRegion.boneDensityGPerCm2,
          };
          console.log(
            `[ReportParser] 📊 Promoted BMD from regions.total: ${totalRegion.boneDensityGPerCm2}`,
          );
        }
      }

      // Also promote tScore and zScore from regions if missing
      if (dexa.boneDensityTotal?.tScore === undefined) {
        const totalRegion = dexa.regions?.find((r) => r.region === "total");
        if (totalRegion?.tScore !== undefined) {
          dexa.boneDensityTotal = {
            ...dexa.boneDensityTotal,
            tScore: totalRegion.tScore,
          };
        }
      }
      if (dexa.boneDensityTotal?.zScore === undefined) {
        const totalRegion = dexa.regions?.find((r) => r.region === "total");
        if (totalRegion?.zScore !== undefined) {
          dexa.boneDensityTotal = {
            ...dexa.boneDensityTotal,
            zScore: totalRegion.zScore,
          };
        }
      }

      // Use better confidence (higher of the two)
      dexa.confidence = Math.max(
        aiResult.confidence || 0,
        regexResult.confidence || 0,
      );

      console.log(
        `[ReportParser] ✅ Merged result: ${dexa.regions.length} regions with both body composition and BMD data`,
      );
    } else if (aiResult) {
      // Only AI result available
      dexa = aiResult;
      // Promote BMD from regions if missing at top level
      if (dexa.boneDensityTotal?.bmd === undefined) {
        const totalRegion = dexa.regions?.find((r) => r.region === "total");
        if (totalRegion?.boneDensityGPerCm2 !== undefined) {
          dexa.boneDensityTotal = {
            ...dexa.boneDensityTotal,
            bmd: totalRegion.boneDensityGPerCm2,
          };
        }
      }
    } else if (regexResult) {
      // Only regex result available
      dexa = regexResult;
      // Promote BMD from regions if missing at top level
      if (dexa.boneDensityTotal?.bmd === undefined) {
        const totalRegion = dexa.regions?.find((r) => r.region === "total");
        if (totalRegion?.boneDensityGPerCm2 !== undefined) {
          dexa.boneDensityTotal = {
            ...dexa.boneDensityTotal,
            bmd: totalRegion.boneDensityGPerCm2,
          };
        }
      }
    }

    if (dexa) {
      if (options.sourceName && !dexa.source) {
        dexa.source = options.sourceName;
      }
      reports.push(dexa);
    }
    // Don't try to parse as bloodwork if it's clearly a DEXA report
    return reports.map((report) => ({
      report,
      extractedAt: new Date().toISOString(),
    }));
  }

  if (isBloodwork) {
    let blood: ParsedHealthReport | null = null;

    // Try AI parsing first if enabled, fall back to regex
    if (options.useAI) {
      console.log("[ReportParser] 🤖 Using AI to parse bloodwork report...");
      try {
        blood = await parseBloodworkReportWithAI(rawText, options.sourceName);
        if (blood && blood.metrics.length > 0) {
          console.log(
            `[ReportParser] ✅ AI parser extracted ${blood.metrics.length} metrics`,
          );
        } else if (blood) {
          console.warn(
            `[ReportParser] ⚠️ AI parser returned report with 0 metrics, falling back to regex...`,
          );
          blood = null; // Force fallback
        }
      } catch (aiError) {
        console.error("[ReportParser] ❌ AI parser error:", aiError);
        blood = null; // Force fallback
      }
    }

    // Fall back to regex parser if AI parsing failed or wasn't enabled
    if (!blood) {
      console.log("[ReportParser] 📝 Using regex to parse bloodwork report...");
      blood = parseBloodworkReport(rawText);
      if (blood) {
        console.log(
          `[ReportParser] Regex parser extracted ${blood.metrics.length} metrics`,
        );
      }
    }

    if (blood) {
      if (options.sourceName && !blood.source) {
        blood.source = options.sourceName;
      }
      reports.push(blood);
    }
  }

  return reports.map((report) => ({
    report,
    extractedAt: new Date().toISOString(),
  }));
}

export * from "./dexaParser";
export * from "./bloodworkParser";
