export type HealthReportType = "dexa" | "bloodwork";

export interface DexaRegionMetrics {
  region: string;
  bodyFatPercent?: number;
  leanMassKg?: number;
  fatMassKg?: number;
  boneDensityGPerCm2?: number;
  tScore?: number;
  zScore?: number;
}

export interface DexaReportData {
  type: "dexa";
  source?: string;
  scanDate?: string;
  totalBodyFatPercent?: number;
  totalLeanMassKg?: number;
  visceralFatRating?: number;
  visceralFatAreaCm2?: number;
  visceralFatVolumeCm3?: number;
  boneDensityTotal?: {
    bmd?: number;
    tScore?: number;
    zScore?: number;
  };
  androidGynoidRatio?: number;
  regions: DexaRegionMetrics[];
  notes?: string[];
  rawText: string;
  confidence: number;
}

export type BloodworkFlag =
  | "low"
  | "high"
  | "critical-low"
  | "critical-high"
  | "normal";

export interface BloodworkMetric {
  name: string;
  value?: number;
  valueText?: string;
  unit?: string;
  referenceRange?: string;
  panel?: string;
  collectedAt?: string;
  flag?: BloodworkFlag;
  interpretationNotes?: string[];
}

export interface BloodworkReportData {
  type: "bloodwork";
  source?: string;
  reportDate?: string;
  laboratory?: string;
  panels: Record<string, BloodworkMetric[]>;
  metrics: BloodworkMetric[];
  notes?: string[];
  rawText: string;
  confidence: number;
}

export type ParsedHealthReport = DexaReportData | BloodworkReportData;

export interface ParsedReportSummary {
  report: ParsedHealthReport;
  extractedAt: string;
}
