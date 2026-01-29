import { DexaRegionMetrics, DexaReportData } from "@/types/reportData";

const REGION_PATTERNS: Record<string, RegExp> = {
  total: /\btotal body\b/i,
  arms: /\barms?\b/i,
  legs: /\blegs?\b/i,
  trunk: /\btrunk\b/i,
  android: /\bandroid\b/i,
  gynoid: /\bgynoid\b/i,
  torso: /\btorso\b/i,
  leftArm: /\bleft arm\b/i,
  rightArm: /\bright arm\b/i,
  leftLeg: /\bleft leg\b/i,
  rightLeg: /\bright leg\b/i,
};

// Removed extractNumber - using specific regex patterns instead

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function inferScanDate(text: string): string | undefined {
  // Look for "Measured:" followed by a date (this is the scan date)
  const measuredMatch = text.match(
    /measured[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  );
  if (measuredMatch) {
    return measuredMatch[1];
  }

  // Look for scan date patterns near "Body Composition" or "Report:"
  const reportDateMatch = text.match(
    /(?:report|scan|measured)[:\s]+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*,?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  );
  if (reportDateMatch) {
    return reportDateMatch[1];
  }

  // Fallback: look for dates in 2024/2025 range (likely scan dates, not birth dates)
  const recentDateRegex =
    /\b(20(?:2[4-9]|[3-9]\d))[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/g;
  const recentMatches = text.match(recentDateRegex);
  if (recentMatches && recentMatches.length > 0) {
    // Prefer dates that appear after "Measured" or "Report"
    const measuredIndex = text.toLowerCase().indexOf("measured");
    if (measuredIndex > 0) {
      const afterMeasured = text.substring(measuredIndex);
      const afterMatch = afterMeasured.match(recentDateRegex);
      if (afterMatch && afterMatch.length > 0) {
        return afterMatch[0];
      }
    }
    return recentMatches[0];
  }

  // Last resort: any date in MM/DD/YYYY or YYYY-MM-DD format
  const altRegex =
    /\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])[-/.](20\d{2}|19\d{2})\b/g;
  const altMatches = text.match(altRegex);
  if (altMatches && altMatches.length > 0) {
    // Prefer later dates (more likely to be scan dates)
    const dates = altMatches.map((d) => {
      const parts = d.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (parts) {
        const year = parseInt(parts[3]);
        return { date: d, year };
      }
      return { date: d, year: 0 };
    });
    dates.sort((a, b) => b.year - a.year);
    return dates[0].date;
  }
  return undefined;
}

function inferConfidence(score: number, maxScore: number): number {
  if (maxScore === 0) return 0.1;
  return Math.min(1, Math.max(0.1, score / maxScore));
}

function parseRegionLine(region: string, line: string): DexaRegionMetrics {
  const metrics: DexaRegionMetrics = { region };

  // Skip lines that look like addresses or phone numbers
  if (/\d{4,}\s+[A-Z][a-z]+/.test(line) || /\(___\)/.test(line)) {
    return metrics; // Return empty metrics for address/phone lines
  }

  // Extract Tissue %Fat for regions - look for pattern like "Android: 26.1 %"
  const fatPercentMatch = line.match(/tissue\s*%?\s*fat[:\s]*(\d+(?:\.\d+)?)/i);
  if (fatPercentMatch) {
    const value = parseFloat(fatPercentMatch[1]);
    if (value >= 0 && value <= 100) {
      metrics.bodyFatPercent = value;
    }
  }

  // Extract fat mass in lbs - look for "Fat (lbs)" or "Fat Mass (lbs)"
  const fatMassMatch = line.match(
    /fat\s*(?:mass)?\s*\(?lbs?\)?[:\s]*(\d+(?:\.\d+)?)/i,
  );
  if (fatMassMatch) {
    const lbs = parseFloat(fatMassMatch[1]);
    if (lbs >= 0 && lbs <= 500) {
      // Reasonable range
      metrics.fatMassKg = lbs * 0.453592; // Convert lbs to kg
    }
  }

  // Extract lean mass in lbs - look for "Lean (lbs)" or "Lean Mass (lbs)"
  const leanMassMatch = line.match(
    /lean\s*(?:mass)?\s*\(?lbs?\)?[:\s]*(\d+(?:\.\d+)?)/i,
  );
  if (leanMassMatch) {
    const lbs = parseFloat(leanMassMatch[1]);
    if (lbs >= 0 && lbs <= 500) {
      // Reasonable range
      metrics.leanMassKg = lbs * 0.453592; // Convert lbs to kg
    }
  }

  // Extract BMD - look for "BMD (g/cm²)" or "bmd[:\s]*(\d+(?:\.\d+)?)"
  const bmdMatch = line.match(/bmd\s*\(?g\/cm[²2]\)?[:\s]*(\d+(?:\.\d+)?)/i);
  if (bmdMatch) {
    const value = parseFloat(bmdMatch[1]);
    if (value >= 0 && value <= 3) {
      // Reasonable BMD range
      metrics.boneDensityGPerCm2 = value;
    }
  }

  // Extract T-score - look for "T-score" or "T-score"
  const tScoreMatch = line.match(/t[-\s]?score[:\s]*(-?\d+(?:\.\d+)?)/i);
  if (tScoreMatch) {
    const value = parseFloat(tScoreMatch[1]);
    if (value >= -10 && value <= 10) {
      // Reasonable T-score range
      metrics.tScore = value;
    }
  }

  // Extract Z-score - look for "Z-score" or "Z-score"
  const zScoreMatch = line.match(/z[-\s]?score[:\s]*(-?\d+(?:\.\d+)?)/i);
  if (zScoreMatch) {
    const value = parseFloat(zScoreMatch[1]);
    if (value >= -10 && value <= 10) {
      // Reasonable Z-score range
      metrics.zScore = value;
    }
  }

  // For structured table rows, try to parse from table format
  // Format: "Region   Tissue (%Fat)   Centile Total Mass (lbs) Fat (lbs) Lean (lbs) BMC (lbs)"
  // Example: "Android   26.1   -   11.4   2.9   8.3   0.1"
  if (region && !metrics.bodyFatPercent && !metrics.leanMassKg) {
    // Try to match region name followed by numbers
    const regionPattern = new RegExp(`${region}\\s+(-?\\d+(?:\\.\\d+)?)`, "i");
    const regionMatch = line.match(regionPattern);
    if (regionMatch) {
      // This is likely a table row - try to extract from structured format
      // Pattern: region name, %fat, centile, total mass, fat mass, lean mass
      const tableMatch = line.match(
        /^(\w+)\s+(-?\d+(?:\.\d+)?)\s+([-\d]+)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i,
      );
      if (tableMatch) {
        const percentFat = parseFloat(tableMatch[2]);
        const fatMassLbs = parseFloat(tableMatch[5]);
        const leanMassLbs = parseFloat(tableMatch[6]);

        if (percentFat >= 0 && percentFat <= 100) {
          metrics.bodyFatPercent = percentFat;
        }
        if (fatMassLbs >= 0 && fatMassLbs <= 500) {
          metrics.fatMassKg = fatMassLbs * 0.453592;
        }
        if (leanMassLbs >= 0 && leanMassLbs <= 500) {
          metrics.leanMassKg = leanMassLbs * 0.453592;
        }
      }
    }
  }

  return metrics;
}

export function looksLikeDexaReport(rawText: string): boolean {
  const lower = rawText.toLowerCase();
  const keywords = [
    "dexa",
    "dual-energy",
    "body composition",
    "bone density",
    "android/gynoid",
    "t-score",
    "z-score",
    "lean mass",
  ];
  return keywords.some((keyword) => lower.includes(keyword));
}

export function parseDexaReport(rawText: string): DexaReportData | null {
  if (!rawText || !looksLikeDexaReport(rawText)) {
    return null;
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  let totalBodyFatPercent: number | undefined;
  let totalLeanMassKg: number | undefined;
  let visceralFatRating: number | undefined;
  let visceralFatAreaCm2: number | undefined;
  let visceralFatVolumeCm3: number | undefined;
  let androidGynoidRatio: number | undefined;
  let tScore: number | undefined;
  let zScore: number | undefined;
  let totalBmd: number | undefined;
  let scoreHits = 0;
  const maxScore = 8;

  lines.forEach((line) => {
    if (!totalBodyFatPercent) {
      // Look for "Tissue (%Fat)" pattern - more specific
      const tissueFatMatch = line.match(
        /tissue\s*\(?%?\s*fat\)?[:\s]*(\d+(?:\.\d+)?)/i,
      );
      if (tissueFatMatch) {
        const value = Number.parseFloat(tissueFatMatch[1]);
        if (value >= 0 && value <= 100) {
          totalBodyFatPercent = value;
          scoreHits += 1;
        }
      } else {
        // Fallback to general pattern
        const match = line.match(
          /(total (body )?fat(?: percent|\s*%| percentage)?[:\s]*)(\d+(?:\.\d+)?)/i,
        );
        if (match) {
          const value = Number.parseFloat(match[3]);
          if (value >= 0 && value <= 100) {
            totalBodyFatPercent = value;
            scoreHits += 1;
          }
        }
      }
    }

    if (!totalLeanMassKg) {
      const match = line.match(
        /(total (lean|muscle) mass[:\s]*)(\d+(?:\.\d+)?)/i,
      );
      if (match) {
        totalLeanMassKg = Number.parseFloat(match[3]);
        scoreHits += 1;
      }
    }

    if (!visceralFatRating) {
      // Look for "Fat Mass (lbs)  1.13" pattern in VAT section
      const match = line.match(
        /(?:visceral|vat).*?fat.*?mass[:\s]*\(?lbs?\)?[:\s]*(\d+(?:\.\d+)?)/i,
      );
      if (match) {
        visceralFatRating = Number.parseFloat(match[1]);
        scoreHits += 1;
      }
    }

    if (!visceralFatAreaCm2) {
      // Look for "Area (in²)  9.00" and convert to cm²
      const match = line.match(
        /(?:visceral|vat).*?area[:\s]*\(?in²?\)?[:\s]*(\d+(?:\.\d+)?)/i,
      );
      if (match) {
        visceralFatAreaCm2 = Number.parseFloat(match[1]) * 6.452; // Convert in² to cm²
        scoreHits += 1;
      } else {
        // Also try cm² directly
        const cmMatch = line.match(
          /(?:visceral|vat).*?area[:\s]*(\d+(?:\.\d+)?)(?:\s*(?:cm2|cm²))/i,
        );
        if (cmMatch) {
          visceralFatAreaCm2 = Number.parseFloat(cmMatch[1]);
          scoreHits += 1;
        }
      }
    }

    if (!visceralFatVolumeCm3) {
      const match = line.match(
        /(visceral fat(?: volume)?[:\s]*)(\d+(?:\.\d+)?)(?:\s*(?:cm3|cm³|cc))/i,
      );
      if (match) {
        visceralFatVolumeCm3 = Number.parseFloat(match[2]);
        scoreHits += 1;
      }
    }

    if (!androidGynoidRatio) {
      const match = line.match(/(android\/gynoid ratio[:\s]*)(\d+(?:\.\d+)?)/i);
      if (match) {
        androidGynoidRatio = Number.parseFloat(match[2]);
        scoreHits += 1;
      }
    }

    if (!tScore) {
      const match = line.match(/t[-\s]?score[:\s]*(-?\d+(?:\.\d+)?)/i);
      if (match) {
        tScore = Number.parseFloat(match[1]);
        scoreHits += 1;
      }
    }

    if (!zScore) {
      const match = line.match(/z[-\s]?score[:\s]*(-?\d+(?:\.\d+)?)/i);
      if (match) {
        zScore = Number.parseFloat(match[1]);
        scoreHits += 1;
      }
    }

    if (!totalBmd) {
      const match = line.match(
        /(total\s+(?:bone\s+)?density[:\s]*)(\d+(?:\.\d+)?)/i,
      );
      if (match) {
        totalBmd = Number.parseFloat(match[2]);
        scoreHits += 1;
      }
    }
  });

  const regions: DexaRegionMetrics[] = [];

  // First, try to find structured table data (more reliable)
  // Look for the "Total Body Tissue Quantitation" table or "Body Composition - Segmental Analysis"
  let inTable = false;
  let tableStartIndex = -1;

  lines.forEach((line, index) => {
    // Check if we're entering the composition table
    if (
      line.toLowerCase().includes("tissue quantitation") ||
      line.toLowerCase().includes("composition (enhanced analysis)") ||
      line.toLowerCase().includes("body composition") ||
      line.toLowerCase().includes("segmental analysis")
    ) {
      inTable = true;
      tableStartIndex = index;
      return;
    }

    // Check if we're leaving the table (hit another section)
    if (
      inTable &&
      (line.toLowerCase().includes("trend:") ||
        line.toLowerCase().includes("graph") ||
        line.toLowerCase().includes("page:"))
    ) {
      inTable = false;
      return;
    }

    // Parse table rows
    if (inTable && index > tableStartIndex + 2) {
      // Skip header rows
      // Table format: "Region   Tissue (%Fat)   Centile Total Mass (lbs) Fat (lbs) Lean (lbs) BMC (lbs)"
      // Examples:
      //   "Arm Right   20.3   -   11.0   2.1   8.3   0.5"
      //   "Total   23.4   60   161.9   36.3   118.5   7.1"

      // Map region names from table to our region names
      // Handle both "Arms Total" and "arms total" formats
      const regionMap: Record<string, string> = {
        "arms total": "arms",
        "arm right": "arms",
        "arm left": "arms",
        "legs total": "legs",
        "leg right": "legs",
        "leg left": "legs",
        trunk: "trunk",
        android: "android",
        gynoid: "gynoid",
        total: "total",
      };

      // Check each possible region name
      for (const [patternName, region] of Object.entries(regionMap)) {
        // More flexible pattern - region name can be at start or anywhere, case insensitive
        const pattern = new RegExp(
          `\\b${patternName.replace(/\s+/g, "\\s+")}\\b`,
          "i",
        );
        if (pattern.test(line)) {
          // This looks like a table row - extract numbers
          const numbers = line.match(/-?\d+(?:\.\d+)?/g);
          if (numbers && numbers.length >= 3) {
            const existing = regions.find((entry) => entry.region === region);
            const metrics: DexaRegionMetrics = { region };

            // Determine table format by checking first number
            const firstNum = parseFloat(numbers[0]);
            const isPercentFormat = firstNum >= 0 && firstNum <= 100;

            if (isPercentFormat && numbers.length >= 6) {
              // "Total Body Tissue Quantitation" format:
              // Region | Tissue (%Fat) | Centile | Total Mass | Fat | Lean | BMC
              // Example: "Total   23.4   60   161.9   36.3   118.5   7.1"
              // Numbers: [%Fat=23.4, Centile=60, TotalMass=161.9, Fat=36.3, Lean=118.5, BMC=7.1]
              metrics.bodyFatPercent = firstNum;
              const fatLbs = parseFloat(numbers[4]); // 5th number (index 4) = Fat
              const leanLbs = parseFloat(numbers[5]); // 6th number (index 5) = Lean

              if (fatLbs >= 0 && fatLbs <= 500) {
                metrics.fatMassKg = fatLbs * 0.453592;
              }
              if (leanLbs >= 0 && leanLbs <= 500) {
                metrics.leanMassKg = leanLbs * 0.453592;
              }
            } else if (isPercentFormat && numbers.length >= 5) {
              // Partial format: [%Fat, Centile, TotalMass, Fat, Lean]
              metrics.bodyFatPercent = firstNum;
              const fatLbs = parseFloat(numbers[3]);
              const leanLbs = parseFloat(numbers[4]);

              if (fatLbs >= 0 && fatLbs <= 500) {
                metrics.fatMassKg = fatLbs * 0.453592;
              }
              if (leanLbs >= 0 && leanLbs <= 500) {
                metrics.leanMassKg = leanLbs * 0.453592;
              }
            } else if (numbers.length >= 3 && firstNum > 10) {
              // "Body Composition - Segmental Analysis" format:
              // Region | Total Mass (lbs) | Fat Mass (lbs) | Lean Mass (lbs)
              // Example: "Arms Total   22.6   4.5   17.0"
              // Numbers: [TotalMass=22.6, Fat=4.5, Lean=17.0]
              const fatLbs = parseFloat(numbers[1]);
              const leanLbs = parseFloat(numbers[2]);

              if (fatLbs >= 0 && fatLbs <= 500) {
                metrics.fatMassKg = fatLbs * 0.453592;
              }
              if (leanLbs >= 0 && leanLbs <= 500) {
                metrics.leanMassKg = leanLbs * 0.453592;
              }
              // Calculate body fat % from fat and lean
              if (fatLbs > 0 && leanLbs > 0) {
                const tissueLbs = fatLbs + leanLbs;
                if (tissueLbs > 0) {
                  metrics.bodyFatPercent = (fatLbs / tissueLbs) * 100;
                }
              }
            }

            // Only add if we extracted valid data
            if (
              metrics.bodyFatPercent !== undefined ||
              metrics.leanMassKg !== undefined ||
              metrics.fatMassKg !== undefined
            ) {
              if (existing) {
                // Merge with existing - prefer new data, but validate ranges
                if (
                  metrics.bodyFatPercent !== undefined &&
                  metrics.bodyFatPercent <= 100
                ) {
                  existing.bodyFatPercent = metrics.bodyFatPercent;
                }
                // Only update if the new value is in a reasonable range
                if (
                  metrics.fatMassKg !== undefined &&
                  metrics.fatMassKg > 0 &&
                  metrics.fatMassKg < 100
                ) {
                  existing.fatMassKg = metrics.fatMassKg;
                }
                if (
                  metrics.leanMassKg !== undefined &&
                  metrics.leanMassKg > 20 &&
                  metrics.leanMassKg < 200
                ) {
                  existing.leanMassKg = metrics.leanMassKg;
                }
              } else {
                regions.push(metrics);
              }
            }
          }
          break; // Found a match, stop checking other patterns
        }
      }
    }
  });

  // Extract BMD data from Densitometry table
  let inBmdTable = false;
  lines.forEach((line) => {
    // Check if we're entering the BMD table
    if (
      line.toLowerCase().includes("densitometry") ||
      line.toLowerCase().includes("region bmd") ||
      (line.toLowerCase().includes("bmd") &&
        line.toLowerCase().includes("g/cm"))
    ) {
      inBmdTable = true;
      return;
    }

    // Check if we're leaving the BMD table
    if (
      inBmdTable &&
      (line.toLowerCase().includes("trend:") ||
        line.toLowerCase().includes("graph") ||
        line.toLowerCase().includes("page:") ||
        line.toLowerCase().includes("comments:"))
    ) {
      inBmdTable = false;
      return;
    }

    // Parse BMD table rows: "Region BMD (g/cm²) YA T-score AM Z-score"
    if (inBmdTable) {
      const bmdRegionMap: Record<string, string> = {
        head: "head",
        arms: "arms",
        legs: "legs",
        trunk: "trunk",
        ribs: "ribs",
        spine: "spine",
        pelvis: "pelvis",
        total: "total",
      };

      for (const [patternName, region] of Object.entries(bmdRegionMap)) {
        // More flexible pattern matching - region name can be anywhere in line
        const pattern = new RegExp(`\\b${patternName}\\b`, "i");
        if (pattern.test(line)) {
          // Extract BMD value - look for number followed by "g/cm" or just numbers
          // Pattern: "Head   2.972" or "Head   2.972   -   -"
          const bmdMatch = line.match(
            /(\d+\.\d+|\d+)(?:\s*(?:g\/cm[²2]?|g\/cm2))?/i,
          );
          if (bmdMatch) {
            const bmdValue = parseFloat(bmdMatch[1]);
            if (bmdValue >= 0 && bmdValue <= 3) {
              let bmdRegion = regions.find((r) => r.region === region);
              if (!bmdRegion) {
                bmdRegion = { region };
                regions.push(bmdRegion);
              }
              bmdRegion.boneDensityGPerCm2 = bmdValue;

              // Extract T-score and Z-score if available (for total region)
              // Look for pattern: "Total   1.500   3.0   3.2"
              if (region === "total") {
                const allNumbers = line.match(/-?\d+(?:\.\d+)?/g);
                if (allNumbers && allNumbers.length >= 3) {
                  const tVal = parseFloat(allNumbers[1]);
                  const zVal = parseFloat(allNumbers[2]);
                  if (tVal >= -10 && tVal <= 10) {
                    bmdRegion.tScore = tVal;
                    if (!tScore) tScore = tVal;
                  }
                  if (zVal >= -10 && zVal <= 10) {
                    bmdRegion.zScore = zVal;
                    if (!zScore) zScore = zVal;
                  }
                }
              }
            }
          }
          break;
        }
      }
    }
  });

  // Extract visceral fat from VAT section
  if (!visceralFatRating || !visceralFatVolumeCm3) {
    let inVatSection = false;
    lines.forEach((line) => {
      if (
        line.toLowerCase().includes("visceral adipose tissue") ||
        line.toLowerCase().includes("vat")
      ) {
        inVatSection = true;
      }
      if (inVatSection) {
        // Look for "Fat Mass (lbs)  1.13" or "Volume (in³)  33.19"
        if (!visceralFatRating) {
          const massMatch = line.match(
            /fat\s+mass\s*\(?lbs?\)?[:\s]+(\d+(?:\.\d+)?)/i,
          );
          if (massMatch) {
            visceralFatRating = parseFloat(massMatch[1]);
          }
        }
        if (!visceralFatVolumeCm3) {
          const volumeMatch = line.match(
            /volume\s*\(?in³?\)?[:\s]+(\d+(?:\.\d+)?)/i,
          );
          if (volumeMatch) {
            visceralFatVolumeCm3 = parseFloat(volumeMatch[1]) * 16.387; // Convert in³ to cm³
          }
        }
        if (
          line.toLowerCase().includes("subcutaneous") ||
          line.toLowerCase().includes("sat")
        ) {
          inVatSection = false;
        }
      }
    });
  }

  // Fallback: parse individual region lines if table parsing didn't work
  if (regions.length === 0) {
    lines.forEach((line) => {
      // Skip address lines
      if (/\d{4,}\s+[A-Z][a-z]+/.test(line) || /\(___\)/.test(line)) {
        return;
      }

      Object.entries(REGION_PATTERNS).forEach(([region, pattern]) => {
        if (pattern.test(line)) {
          const existing = regions.find((entry) => entry.region === region);
          const metrics = parseRegionLine(region, line);

          // Only add if we actually extracted valid data
          if (
            metrics.bodyFatPercent !== undefined ||
            metrics.leanMassKg !== undefined ||
            metrics.fatMassKg !== undefined ||
            metrics.boneDensityGPerCm2 !== undefined
          ) {
            if (existing) {
              Object.assign(existing, metrics);
            } else {
              regions.push(metrics);
            }
          }
        }
      });
    });
  }

  // Calculate confidence based on extracted data
  // Higher confidence if we have regions, BMD data, and key metrics
  const hasRegions = regions.length > 0;
  const hasBmdData = regions.some((r) => r.boneDensityGPerCm2 !== undefined);
  const hasKeyMetrics =
    totalBodyFatPercent !== undefined ||
    totalLeanMassKg !== undefined ||
    totalBmd !== undefined;

  const confidence = inferConfidence(
    scoreHits +
      (hasRegions ? 2 : 0) +
      (hasBmdData ? 1 : 0) +
      (hasKeyMetrics ? 1 : 0),
    maxScore + 4, // Adjusted max score to account for bonus points
  );

  const report: DexaReportData = {
    type: "dexa",
    scanDate: inferScanDate(rawText),
    totalBodyFatPercent,
    totalLeanMassKg,
    visceralFatRating,
    visceralFatAreaCm2,
    visceralFatVolumeCm3,
    androidGynoidRatio,
    boneDensityTotal: {
      bmd:
        totalBmd ||
        regions.find((r) => r.region === "total")?.boneDensityGPerCm2,
      tScore: tScore || regions.find((r) => r.region === "total")?.tScore,
      zScore: zScore || regions.find((r) => r.region === "total")?.zScore,
    },
    regions,
    notes: [],
    rawText,
    confidence,
  };

  return report;
}
