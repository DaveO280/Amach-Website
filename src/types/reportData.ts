export type HealthReportType =
  | "dexa"
  | "bloodwork"
  | "medical-record"
  | "gut-health";

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

export interface MedicalRecordData {
  type: "medical-record";
  source?: string;
  reportDate?: string;
  documentType?: string; // e.g. "imaging", "discharge-summary", "prescription", "lab-panel", "other"
  title?: string;
  summary?: string; // AI-generated summary of the document
  keyFindings?: string[];
  medications?: string[];
  diagnoses?: string[];
  rawText: string;
  confidence: number;
}

export type GutHealthStatus = "needs_support" | "improving" | "okay" | "great";

export interface GutHealthMetric {
  value: number;
  unit: string;
  status: string;
  ref_low?: number;
  ref_median?: number;
  ref_high?: number;
}

export interface GutHealthCategoryStatuses {
  beneficial_microbes?: GutHealthStatus;
  disruptive_microbes?: GutHealthStatus;
  gut_barrier_inflammation?: GutHealthStatus;
  short_chain_fatty_acids?: GutHealthStatus;
  digestive_capacity?: GutHealthStatus;
  diversity_resilience?: GutHealthStatus;
  microbial_enzymes_metabolites?: GutHealthStatus;
}

export interface GutHealthBeneficialMicrobes {
  bifidobacterium?: GutHealthMetric;
  akkermansia?: GutHealthMetric;
  faecalibacterium?: GutHealthMetric;
  lactobacillaceae?: GutHealthMetric;
  l_rhamnosus?: GutHealthMetric;
  l_paracasei?: GutHealthMetric;
  l_acidophilus?: GutHealthMetric;
  b_animalis?: GutHealthMetric;
  s_thermophilus?: GutHealthMetric;
}

export interface GutHealthDisruptiveMicrobes {
  antibiotic_resistance_abundance_index?: GutHealthMetric;
  antibiotic_resistance_richness_index?: GutHealthMetric;
  enterobacteriaceae?: GutHealthMetric;
  e_coli?: GutHealthMetric;
  e_flexneri?: GutHealthMetric;
  e_dysenteriae?: GutHealthMetric;
  h_pylori?: GutHealthMetric;
  blastocystis?: GutHealthMetric;
  cryptosporidium?: GutHealthMetric;
  giardia?: GutHealthMetric;
  entamoeba_histolytica?: GutHealthMetric;
  candida?: GutHealthMetric;
  aspergillus?: GutHealthMetric;
  methane_production_capacity?: GutHealthMetric;
  methanobrevibacter_smithii?: GutHealthMetric;
}

export interface GutHealthBarrier {
  hexa_lps_index?: GutHealthMetric;
  mucus_degradation_index?: GutHealthMetric;
  hydrogen_sulfide_index?: GutHealthMetric;
  host_dna?: GutHealthMetric;
  oxygen_exposure_index?: GutHealthMetric;
}

export interface GutHealthSCFA {
  butyrate?: GutHealthMetric;
  propionate?: GutHealthMetric;
  acetate?: GutHealthMetric;
}

export interface GutHealthDigestive {
  cellulose?: GutHealthMetric;
  resistant_starch?: GutHealthMetric;
  chitin?: GutHealthMetric;
  pectin?: GutHealthMetric;
  fructooligosaccharides?: GutHealthMetric;
  galactooligosaccharides?: GutHealthMetric;
  xylooligosaccharides?: GutHealthMetric;
  isomaltooligosaccharides?: GutHealthMetric;
  protein_breakdown?: GutHealthMetric;
  trimethylamine?: GutHealthMetric;
  ammonia?: GutHealthMetric;
  branched_chain_amino_acids?: GutHealthMetric;
  p_cresol?: GutHealthMetric;
  indole_3_propionic_acid?: GutHealthMetric;
  vitamin_b2?: GutHealthMetric;
  vitamin_b7?: GutHealthMetric;
  vitamin_b9?: GutHealthMetric;
  vitamin_b12?: GutHealthMetric;
  vitamin_k?: GutHealthMetric;
}

export interface GutHealthDiversity {
  shannon_diversity?: GutHealthMetric;
  species_richness?: GutHealthMetric;
  microbiome_age?: GutHealthMetric;
  gut_resilience_score?: GutHealthMetric;
  oral_microbes?: GutHealthMetric;
  bacteroidota?: GutHealthMetric;
  firmicutes?: GutHealthMetric;
  actinobacteriota?: GutHealthMetric;
  proteobacteria?: GutHealthMetric;
  firmicutes_bacteroidota_ratio?: GutHealthMetric;
  proteobacteria_actinobacteriota_ratio?: GutHealthMetric;
  prevotella_bacteroides_ratio?: GutHealthMetric;
  bacteroides?: GutHealthMetric;
  prevotella?: GutHealthMetric;
  ruminococcus?: GutHealthMetric;
  blautia?: GutHealthMetric;
  roseburia?: GutHealthMetric;
  phocaeicola_dorei?: GutHealthMetric;
}

export interface GutHealthEnzymes {
  histamine_index?: GutHealthMetric;
  beta_glucuronidase_capacity?: GutHealthMetric;
  gaba_production?: GutHealthMetric;
  gaba_breakdown?: GutHealthMetric;
  unconjugated_bile_acids?: GutHealthMetric;
  secondary_bile_acids?: GutHealthMetric;
  urolithin_producing_species?: GutHealthMetric;
}

export interface GutHealthMetrics {
  beneficial_microbes: GutHealthBeneficialMicrobes;
  disruptive_microbes: GutHealthDisruptiveMicrobes;
  gut_barrier_inflammation: GutHealthBarrier;
  short_chain_fatty_acids: GutHealthSCFA;
  digestive_capacity: GutHealthDigestive;
  diversity_resilience: GutHealthDiversity;
  microbial_enzymes_metabolites: GutHealthEnzymes;
}

export interface GutHealthSpeciesEntry {
  name: string;
  abundance_pct: number;
  classification: "beneficial" | "variable" | "unfriendly" | "unknown";
}

export interface GutHealthFocusArea {
  category: string;
  metric: string;
  value?: number;
}

export interface GutHealthReportData {
  type: "gut-health";
  source?: string;
  provider: string;
  kit_id?: string;
  collection_date?: string;
  report_date?: string;
  patient_sex?: string;
  report_version?: string;
  summary: {
    microbiome_score?: number;
    gut_type?: string;
    beneficial_pct?: number;
    variable_pct?: number;
    unfriendly_pct?: number;
    unknown_pct?: number;
  };
  category_statuses: GutHealthCategoryStatuses;
  metrics: GutHealthMetrics;
  species: GutHealthSpeciesEntry[];
  recommendations?: string[];
  top_focus_areas?: GutHealthFocusArea[];
  rawText: string;
  confidence: number;
}

export type ParsedHealthReport =
  | DexaReportData
  | BloodworkReportData
  | MedicalRecordData
  | GutHealthReportData;

export interface ParsedReportSummary {
  report: ParsedHealthReport;
  extractedAt: string;
  storjUri?: string; // Storj URI if report has been saved to Storj
  storjSpeciesUri?: string; // Storj URI for the species list (gut-health only)
  savedToStorjAt?: string; // ISO timestamp when saved to Storj
}
