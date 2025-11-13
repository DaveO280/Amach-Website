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

const NUMBER_REGEX = /-?\d+(?:\.\d+)?/;

function extractNumber(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const match = text.match(NUMBER_REGEX);
  if (!match) return undefined;
  const parsed = Number.parseFloat(match[0]);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function inferScanDate(text: string): string | undefined {
  const dateRegex =
    /\b(20\d{2}|19\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/g;
  const matches = text.match(dateRegex);
  if (matches && matches.length > 0) {
    return matches[0];
  }

  const altRegex =
    /\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])[-/.](20\d{2}|19\d{2})\b/g;
  const altMatches = text.match(altRegex);
  if (altMatches && altMatches.length > 0) {
    return altMatches[0];
  }
  return undefined;
}

function inferConfidence(score: number, maxScore: number): number {
  if (maxScore === 0) return 0.1;
  return Math.min(1, Math.max(0.1, score / maxScore));
}

function parseRegionLine(region: string, line: string): DexaRegionMetrics {
  const tokens = line.split(/\s+/);
  const numbers = tokens
    .map((token) => extractNumber(token))
    .filter((value): value is number => value !== undefined);

  const metrics: DexaRegionMetrics = { region };

  if (numbers.length > 0) {
    metrics.bodyFatPercent = numbers[0];
  }
  if (numbers.length > 1) {
    metrics.leanMassKg = numbers[1];
  }
  if (numbers.length > 2) {
    metrics.fatMassKg = numbers[2];
  }
  if (numbers.length > 3) {
    metrics.boneDensityGPerCm2 = numbers[3];
  }
  if (numbers.length > 4) {
    metrics.tScore = numbers[4];
  }
  if (numbers.length > 5) {
    metrics.zScore = numbers[5];
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
      const match = line.match(
        /(total (body )?fat(?: percent|\s*%| percentage)?[:\s]*)(\d+(?:\.\d+)?)/i,
      );
      if (match) {
        totalBodyFatPercent = Number.parseFloat(match[3]);
        scoreHits += 1;
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
      const match = line.match(
        /(visceral fat(?: rating)?[:\s]*)(\d+(?:\.\d+)?)/i,
      );
      if (match) {
        visceralFatRating = Number.parseFloat(match[2]);
        scoreHits += 1;
      }
    }

    if (!visceralFatAreaCm2) {
      const match = line.match(
        /(visceral fat(?: area)?[:\s]*)(\d+(?:\.\d+)?)(?:\s*(?:cm2|cm²))/i,
      );
      if (match) {
        visceralFatAreaCm2 = Number.parseFloat(match[2]);
        scoreHits += 1;
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

  lines.forEach((line) => {
    Object.entries(REGION_PATTERNS).forEach(([region, pattern]) => {
      if (pattern.test(line)) {
        const existing = regions.find((entry) => entry.region === region);
        const metrics = parseRegionLine(region, line);
        if (existing) {
          Object.assign(existing, metrics);
        } else {
          regions.push(metrics);
        }
      }
    });
  });

  const confidence = inferConfidence(
    scoreHits + (regions.length > 0 ? 1 : 0),
    maxScore,
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
      bmd: totalBmd,
      tScore,
      zScore,
    },
    regions,
    notes: [],
    rawText,
    confidence,
  };

  return report;
}
