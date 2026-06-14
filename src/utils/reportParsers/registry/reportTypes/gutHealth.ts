/**
 * Gut health report type definition for the ReportParserRegistry.
 *
 * Tiny Health gut microbiome reports use a two-pass LLM strategy:
 *   Pass 1 (chars 0-40k)  — summary scores, category statuses, metric values, disease markers.
 *   Pass 2 (chars 40k-80k) — full species list, pathway metrics, recommendations.
 */

import type {
  GutHealthFocusArea,
  GutHealthMetric,
  GutHealthReportData,
  GutHealthSpeciesEntry,
  GutHealthStatus,
} from "@/types/reportData";
import {
  validateExtractedValues,
  GUT_HEALTH_VALIDATION_RULES,
} from "../../hallucinationGuard";
import { ANTI_HALLUCINATION_RULES } from "../../llmPipeline";
import { looksLikeGutHealthReport } from "../../gutHealthParser";
import type { ReportTypeDefinition, ParserPass } from "../types";

// ── Internal LLM response shape ────────────────────────────────────────────

interface LlmMetric {
  value?: number | null;
  unit?: string | null;
  status?: string | null;
  ref_low?: number | null;
  ref_median?: number | null;
  ref_high?: number | null;
}

interface LlmResult {
  kit_id?: string | null;
  collection_date?: string | null;
  report_date?: string | null;
  patient_sex?: string | null;
  report_version?: string | null;
  microbiome_score?: number | null;
  gut_type?: string | null;
  beneficial_pct?: number | null;
  variable_pct?: number | null;
  unfriendly_pct?: number | null;
  unknown_pct?: number | null;
  category_statuses?: {
    beneficial_microbes?: string | null;
    disruptive_microbes?: string | null;
    gut_barrier_inflammation?: string | null;
    short_chain_fatty_acids?: string | null;
    digestive_capacity?: string | null;
    diversity_resilience?: string | null;
    microbial_enzymes_metabolites?: string | null;
  };
  metrics?: {
    beneficial_microbes?: {
      bifidobacterium?: LlmMetric | null;
      akkermansia?: LlmMetric | null;
      faecalibacterium?: LlmMetric | null;
      lactobacillaceae?: LlmMetric | null;
      l_rhamnosus?: LlmMetric | null;
      l_paracasei?: LlmMetric | null;
      l_acidophilus?: LlmMetric | null;
      b_animalis?: LlmMetric | null;
      s_thermophilus?: LlmMetric | null;
    };
    disruptive_microbes?: {
      antibiotic_resistance_abundance_index?: LlmMetric | null;
      antibiotic_resistance_richness_index?: LlmMetric | null;
      enterobacteriaceae?: LlmMetric | null;
      e_coli?: LlmMetric | null;
      e_flexneri?: LlmMetric | null;
      e_dysenteriae?: LlmMetric | null;
      h_pylori?: LlmMetric | null;
      blastocystis?: LlmMetric | null;
      cryptosporidium?: LlmMetric | null;
      giardia?: LlmMetric | null;
      entamoeba_histolytica?: LlmMetric | null;
      candida?: LlmMetric | null;
      aspergillus?: LlmMetric | null;
      methane_production_capacity?: LlmMetric | null;
      methanobrevibacter_smithii?: LlmMetric | null;
    };
    gut_barrier_inflammation?: {
      hexa_lps_index?: LlmMetric | null;
      mucus_degradation_index?: LlmMetric | null;
      hydrogen_sulfide_index?: LlmMetric | null;
      host_dna?: LlmMetric | null;
      oxygen_exposure_index?: LlmMetric | null;
    };
    short_chain_fatty_acids?: {
      butyrate?: LlmMetric | null;
      propionate?: LlmMetric | null;
      acetate?: LlmMetric | null;
    };
    digestive_capacity?: {
      cellulose?: LlmMetric | null;
      resistant_starch?: LlmMetric | null;
      chitin?: LlmMetric | null;
      pectin?: LlmMetric | null;
      fructooligosaccharides?: LlmMetric | null;
      galactooligosaccharides?: LlmMetric | null;
      xylooligosaccharides?: LlmMetric | null;
      isomaltooligosaccharides?: LlmMetric | null;
      protein_breakdown?: LlmMetric | null;
      trimethylamine?: LlmMetric | null;
      ammonia?: LlmMetric | null;
      branched_chain_amino_acids?: LlmMetric | null;
      p_cresol?: LlmMetric | null;
      indole_3_propionic_acid?: LlmMetric | null;
      vitamin_b2?: LlmMetric | null;
      vitamin_b7?: LlmMetric | null;
      vitamin_b9?: LlmMetric | null;
      vitamin_b12?: LlmMetric | null;
      vitamin_k?: LlmMetric | null;
    };
    diversity_resilience?: {
      shannon_diversity?: LlmMetric | null;
      species_richness?: LlmMetric | null;
      microbiome_age?: LlmMetric | null;
      gut_resilience_score?: LlmMetric | null;
      oral_microbes?: LlmMetric | null;
      bacteroidota?: LlmMetric | null;
      firmicutes?: LlmMetric | null;
      actinobacteriota?: LlmMetric | null;
      proteobacteria?: LlmMetric | null;
      firmicutes_bacteroidota_ratio?: LlmMetric | null;
      proteobacteria_actinobacteriota_ratio?: LlmMetric | null;
      prevotella_bacteroides_ratio?: LlmMetric | null;
      bacteroides?: LlmMetric | null;
      prevotella?: LlmMetric | null;
      ruminococcus?: LlmMetric | null;
      blautia?: LlmMetric | null;
      roseburia?: LlmMetric | null;
      phocaeicola_dorei?: LlmMetric | null;
    };
    microbial_enzymes_metabolites?: {
      histamine_index?: LlmMetric | null;
      beta_glucuronidase_capacity?: LlmMetric | null;
      gaba_production?: LlmMetric | null;
      gaba_breakdown?: LlmMetric | null;
      unconjugated_bile_acids?: LlmMetric | null;
      secondary_bile_acids?: LlmMetric | null;
      urolithin_producing_species?: LlmMetric | null;
    };
  };
  species?: Array<{
    name: string;
    abundance_pct: number;
    classification: string;
  }>;
  recommendations?: string[];
  top_focus_areas?: Array<{
    category: string;
    metric: string;
    value?: number | null;
  }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toMetric(
  m: LlmMetric | null | undefined,
): GutHealthMetric | undefined {
  if (!m || m.value == null) return undefined;
  const result: GutHealthMetric = {
    value: m.value,
    unit: m.unit ?? "",
    status: normalizeStatus(m.status ?? undefined) ?? "okay",
  };
  if (m.ref_low != null) result.ref_low = m.ref_low;
  if (m.ref_median != null) result.ref_median = m.ref_median;
  if (m.ref_high != null) result.ref_high = m.ref_high;
  return result;
}

function normalizeStatus(s: string | undefined): GutHealthStatus | undefined {
  if (!s) return undefined;
  const lower = s.toLowerCase();
  if (lower.includes("support")) return "needs_support";
  if (lower.includes("improv")) return "improving";
  if (lower.includes("great")) return "great";
  if (lower.includes("okay") || lower === "ok") return "okay";
  return undefined;
}

function classifySpecies(c: string): GutHealthSpeciesEntry["classification"] {
  const lower = String(c).toLowerCase();
  if (lower === "beneficial") return "beneficial";
  if (lower === "variable") return "variable";
  if (lower === "unfriendly") return "unfriendly";
  return "unknown";
}

function flattenForValidation(
  p: LlmResult,
): Record<string, number | undefined | null> {
  const dr = p.metrics?.diversity_resilience ?? {};
  const gb = p.metrics?.gut_barrier_inflammation ?? {};
  return {
    microbiome_score: p.microbiome_score,
    beneficial_pct: p.beneficial_pct,
    variable_pct: p.variable_pct,
    unfriendly_pct: p.unfriendly_pct,
    unknown_pct: p.unknown_pct,
    "diversity_resilience.shannon_diversity": dr.shannon_diversity?.value,
    "diversity_resilience.species_richness": dr.species_richness?.value,
    "diversity_resilience.microbiome_age": dr.microbiome_age?.value,
    "diversity_resilience.gut_resilience_score": dr.gut_resilience_score?.value,
    "diversity_resilience.bacteroidota": dr.bacteroidota?.value,
    "diversity_resilience.firmicutes": dr.firmicutes?.value,
    "diversity_resilience.proteobacteria": dr.proteobacteria?.value,
    "gut_barrier_inflammation.hexa_lps_index": gb.hexa_lps_index?.value,
    "gut_barrier_inflammation.mucus_degradation_index":
      gb.mucus_degradation_index?.value,
    "gut_barrier_inflammation.hydrogen_sulfide_index":
      gb.hydrogen_sulfide_index?.value,
  };
}

// ── Disease marker sanitizer ───────────────────────────────────────────────

function sanitizeDiseaseMarkers(
  dm: NonNullable<LlmResult["metrics"]>["disruptive_microbes"],
  rawText: string,
): void {
  if (!dm) return;
  const DISEASE_MARKERS = [
    "h_pylori",
    "blastocystis",
    "cryptosporidium",
    "giardia",
    "entamoeba_histolytica",
    "candida",
    "aspergillus",
  ] as const;

  const lowerText = rawText.toLowerCase();
  for (const marker of DISEASE_MARKERS) {
    const field = dm[marker];
    if (!field || field.value == null) continue;
    const displayName = marker.replace(/_/g, " ");
    const idx = lowerText.indexOf(displayName);
    if (idx === -1) {
      dm[marker] = null;
      console.warn(`[gutHealth] ⚠️ Nulled ${marker} — not mentioned in text`);
      continue;
    }
    const context = lowerText.slice(Math.max(0, idx - 50), idx + 300);
    const notDetected =
      /not detected|negative|absent|0\.00\s*%|0%|<\s*0\.0/.test(context);
    const positiveDetection =
      /detected|present|\d+\.\d+\s*%|\d+\s*rpkm/.test(context) && !notDetected;
    if (!positiveDetection || notDetected) {
      dm[marker] = null;
      console.warn(
        `[gutHealth] ⚠️ Nulled ${marker} — no positive detection in context`,
      );
    }
  }
}

// ── Pathway normalizer ─────────────────────────────────────────────────────

/**
 * Safety net: if a pathway metric value is > 100 it is almost certainly a raw
 * RPKM count.  Convert it using a log10 scale and update unit to "index".
 */
function normalizeIndexMetric(
  m: GutHealthMetric | undefined,
): GutHealthMetric | undefined {
  if (!m || m.value == null || m.value <= 100) return m;
  const idx = Math.min(
    100,
    Math.max(0, (Math.log10(Math.max(1, m.value)) / 7) * 100),
  );
  return { ...m, value: Math.round(idx * 10) / 10, unit: "index" };
}

// ── Multi-pass merge ────────────────────────────────────────────────────────

function mergeLlmResults(pass1: LlmResult, pass2: LlmResult): LlmResult {
  const merged: LlmResult = { ...pass1 };
  const scalars: Array<keyof LlmResult> = [
    "gut_type",
    "beneficial_pct",
    "variable_pct",
    "unfriendly_pct",
    "unknown_pct",
    "kit_id",
    "collection_date",
    "report_date",
    "patient_sex",
    "report_version",
    "microbiome_score",
  ];
  for (const k of scalars) {
    if (merged[k] == null && pass2[k] != null) {
      (merged as Record<string, unknown>)[k] = pass2[k];
    }
  }

  if ((pass2.species?.length ?? 0) > (pass1.species?.length ?? 0)) {
    merged.species = pass2.species;
  }

  if ((pass2.recommendations?.length ?? 0) > 0) {
    const combined = [
      ...(pass1.recommendations ?? []),
      ...(pass2.recommendations ?? []),
    ];
    merged.recommendations = [...new Set(combined)];
  }

  if (
    (pass2.top_focus_areas?.length ?? 0) > (pass1.top_focus_areas?.length ?? 0)
  ) {
    merged.top_focus_areas = pass2.top_focus_areas;
  }

  if (pass2.category_statuses) {
    merged.category_statuses = merged.category_statuses ?? {};
    for (const [k, v] of Object.entries(pass2.category_statuses)) {
      const key = k as keyof NonNullable<LlmResult["category_statuses"]>;
      if (merged.category_statuses[key] == null && v != null) {
        merged.category_statuses[key] = v;
      }
    }
  }

  if (pass2.metrics) {
    merged.metrics = merged.metrics ?? {};
    for (const [cat, catData] of Object.entries(pass2.metrics)) {
      if (!catData) continue;
      const key = cat as keyof NonNullable<LlmResult["metrics"]>;
      if (!merged.metrics[key]) {
        (merged.metrics as Record<string, unknown>)[key] = catData;
      } else {
        const existingCat = merged.metrics[key] as Record<
          string,
          LlmMetric | null | undefined
        >;
        for (const [metric, value] of Object.entries(
          catData as Record<string, LlmMetric | null | undefined>,
        )) {
          if (existingCat[metric] == null && value != null) {
            existingCat[metric] = value;
          }
        }
      }
    }
  }

  return merged;
}

// For categories whose values live exclusively in gauge images, the vision
// pass should REPLACE (not just fill) whatever the text passes guessed.
// Text passes can see surrounding status labels but not the gauge pointer
// positions, so they hallucinate wildly inconsistent index values.
const VISION_OWNED_CATEGORIES: Array<keyof NonNullable<LlmResult["metrics"]>> =
  ["short_chain_fatty_acids", "digestive_capacity"];

function mergeVisionCategories(base: LlmResult, vision: LlmResult): LlmResult {
  if (!vision.metrics) return base;
  const result: LlmResult = { ...base };
  result.metrics = { ...(base.metrics ?? {}) };
  for (const cat of VISION_OWNED_CATEGORIES) {
    const vCat = (vision.metrics as Record<string, unknown>)[cat];
    if (vCat != null) {
      // Replace the text-pass estimate entirely with the vision reading.
      (result.metrics as Record<string, unknown>)[cat] = vCat;
    }
  }
  return result;
}

// ── Prompts ────────────────────────────────────────────────────────────────

const DISEASE_MARKER_RULES = `
DISEASE MARKER RULES — CRITICAL PATIENT SAFETY:
The following pathogens must return null UNLESS the report explicitly states a POSITIVE
detection with a quantified numeric abundance value:
  h_pylori, blastocystis, cryptosporidium, giardia, entamoeba_histolytica, candida, aspergillus
Indicators that mean NULL: "not detected", "negative", "0%", "<0.001%", not mentioned.
NEVER return a non-null value for a disease marker based on:
  - mention in a reference range or comparison table
  - educational background text about the organism
  - "not detected" or absence from the sample`.trim();

const PATHWAY_UNIT_RULES = `
PATHWAY METRIC UNITS — CRITICAL:
For SCFA, digestive capacity, and microbial enzyme/metabolite metrics:
  - DO NOT return raw RPKM counts. These vary 1,000× between sequencing runs and are not comparable.
  - Return a 0-100 production capacity INDEX where:
      0  = absent / not detected
      25 = low production
      50 = typical population median
      75 = moderately high
      100 = very high production
  - Use the bar chart or colored indicator in the report to determine this index position.
  - If only a status label is visible (great/okay/needs_support) and no bar chart position:
      return null for value, and set status from the label.
  - Species abundance_pct: return as a percentage of total microbiome (0-100 scale, NOT rpkm).
  - All percentage fields: return 0-100 (not 0-1).`.trim();

const SYSTEM_PROMPT = [
  "You are a precise data extraction assistant. Return ONLY valid JSON with no markdown, code blocks, or explanation.",
  "",
  ANTI_HALLUCINATION_RULES,
  "",
  DISEASE_MARKER_RULES,
].join("\n");

function buildPass1Prompt(text: string): string {
  return `Extract structured data from PASS 1 of this Tiny Health gut microbiome report.
Focus on: summary scores, category statuses, individual metric values, disease markers.

EXTRACTION RULES:
- microbiome_score: the overall score out of 100 shown on the summary page (e.g. 61)
- gut_type: the dominant microbiome type (e.g. "Bacteroides", "Prevotella", "Lachnospiraceae")
- Metric values with unit "%" are species/group percentages (0-100 scale)
- SCFA and pathway values: return as a 0-100 production capacity index, NOT raw RPKM counts
- Inflammation indices (hexa_lps_index, mucus_degradation_index, hydrogen_sulfide_index): 0-100 scale, unit ""
- Status values must be exactly one of: "great", "okay", "improving", "needs_support"
- Species classification must be: "beneficial", "variable", "unfriendly", or "unknown"
- recommendations: the "Clinical indication examples" action items for each category
- top_focus_areas: the top 3-5 metrics listed as priority focus areas with their values
- If a value is not explicitly stated in the text, return null — do NOT estimate or fill typical values

RETURN THIS EXACT JSON SCHEMA (use null for missing values, empty arrays for no items):
{
  "collection_date": string|null,
  "report_date": string|null,
  "patient_sex": string|null,
  "report_version": string|null,
  "microbiome_score": number|null,
  "gut_type": string|null,
  "beneficial_pct": number|null,
  "variable_pct": number|null,
  "unfriendly_pct": number|null,
  "unknown_pct": number|null,
  "category_statuses": {
    "beneficial_microbes": string|null,
    "disruptive_microbes": string|null,
    "gut_barrier_inflammation": string|null,
    "short_chain_fatty_acids": string|null,
    "digestive_capacity": string|null,
    "diversity_resilience": string|null,
    "microbial_enzymes_metabolites": string|null
  },
  "metrics": {
    "beneficial_microbes": {
      "bifidobacterium": {"value":number,"unit":"%","status":string}|null,
      "akkermansia": {"value":number,"unit":"%","status":string}|null,
      "faecalibacterium": {"value":number,"unit":"%","status":string}|null,
      "lactobacillaceae": {"value":number,"unit":"%","status":string}|null,
      "l_rhamnosus": {"value":number,"unit":"%","status":string}|null,
      "l_paracasei": {"value":number,"unit":"%","status":string}|null,
      "l_acidophilus": {"value":number,"unit":"%","status":string}|null,
      "b_animalis": {"value":number,"unit":"%","status":string}|null,
      "s_thermophilus": {"value":number,"unit":"%","status":string}|null
    },
    "disruptive_microbes": {
      "antibiotic_resistance_abundance_index": {"value":number,"unit":"","status":string}|null,
      "antibiotic_resistance_richness_index": {"value":number,"unit":"","status":string}|null,
      "enterobacteriaceae": {"value":number,"unit":"%","status":string}|null,
      "e_coli": {"value":number,"unit":"%","status":string}|null,
      "e_flexneri": {"value":number,"unit":"%","status":string}|null,
      "e_dysenteriae": {"value":number,"unit":"%","status":string}|null,
      "h_pylori": {"value":number,"unit":"%","status":string}|null,
      "blastocystis": {"value":number,"unit":"%","status":string}|null,
      "cryptosporidium": {"value":number,"unit":"%","status":string}|null,
      "giardia": {"value":number,"unit":"%","status":string}|null,
      "entamoeba_histolytica": {"value":number,"unit":"%","status":string}|null,
      "candida": {"value":number,"unit":"%","status":string}|null,
      "aspergillus": {"value":number,"unit":"%","status":string}|null,
      "methane_production_capacity": {"value":number,"unit":"index","status":string}|null,
      "methanobrevibacter_smithii": {"value":number,"unit":"%","status":string}|null
    },
    "gut_barrier_inflammation": {
      "hexa_lps_index": {"value":number,"unit":"","status":string}|null,
      "mucus_degradation_index": {"value":number,"unit":"","status":string}|null,
      "hydrogen_sulfide_index": {"value":number,"unit":"","status":string}|null,
      "host_dna": {"value":number,"unit":"%","status":string}|null,
      "oxygen_exposure_index": {"value":number,"unit":"","status":string}|null
    },
    "short_chain_fatty_acids": {
      "butyrate": {"value":number,"unit":"index","status":string}|null,
      "propionate": {"value":number,"unit":"index","status":string}|null,
      "acetate": {"value":number,"unit":"index","status":string}|null
    },
    "digestive_capacity": {
      "cellulose": {"value":number,"unit":"index","status":string}|null,
      "resistant_starch": {"value":number,"unit":"index","status":string}|null,
      "chitin": {"value":number,"unit":"index","status":string}|null,
      "pectin": {"value":number,"unit":"index","status":string}|null,
      "fructooligosaccharides": {"value":number,"unit":"index","status":string}|null,
      "galactooligosaccharides": {"value":number,"unit":"index","status":string}|null,
      "xylooligosaccharides": {"value":number,"unit":"index","status":string}|null,
      "isomaltooligosaccharides": {"value":number,"unit":"index","status":string}|null,
      "protein_breakdown": {"value":number,"unit":"index","status":string}|null,
      "trimethylamine": {"value":number,"unit":"index","status":string}|null,
      "ammonia": {"value":number,"unit":"index","status":string}|null,
      "branched_chain_amino_acids": {"value":number,"unit":"index","status":string}|null,
      "p_cresol": {"value":number,"unit":"index","status":string}|null,
      "indole_3_propionic_acid": {"value":number,"unit":"index","status":string}|null,
      "vitamin_b2": {"value":number,"unit":"index","status":string}|null,
      "vitamin_b7": {"value":number,"unit":"index","status":string}|null,
      "vitamin_b9": {"value":number,"unit":"index","status":string}|null,
      "vitamin_b12": {"value":number,"unit":"index","status":string}|null,
      "vitamin_k": {"value":number,"unit":"index","status":string}|null
    },
    "diversity_resilience": {
      "shannon_diversity": {"value":number,"unit":"","status":string}|null,
      "species_richness": {"value":number,"unit":"","status":string}|null,
      "microbiome_age": {"value":number,"unit":"years","status":string}|null,
      "gut_resilience_score": {"value":number,"unit":"","status":string}|null,
      "oral_microbes": {"value":number,"unit":"%","status":string}|null,
      "bacteroidota": {"value":number,"unit":"%","status":string}|null,
      "firmicutes": {"value":number,"unit":"%","status":string}|null,
      "actinobacteriota": {"value":number,"unit":"%","status":string}|null,
      "proteobacteria": {"value":number,"unit":"%","status":string}|null,
      "firmicutes_bacteroidota_ratio": {"value":number,"unit":"","status":string}|null,
      "proteobacteria_actinobacteriota_ratio": {"value":number,"unit":"","status":string}|null,
      "prevotella_bacteroides_ratio": {"value":number,"unit":"","status":string}|null,
      "bacteroides": {"value":number,"unit":"%","status":string}|null,
      "prevotella": {"value":number,"unit":"%","status":string}|null,
      "ruminococcus": {"value":number,"unit":"%","status":string}|null,
      "blautia": {"value":number,"unit":"%","status":string}|null,
      "roseburia": {"value":number,"unit":"%","status":string}|null,
      "phocaeicola_dorei": {"value":number,"unit":"%","status":string}|null
    },
    "microbial_enzymes_metabolites": {
      "histamine_index": {"value":number,"unit":"index","status":string}|null,
      "beta_glucuronidase_capacity": {"value":number,"unit":"index","status":string}|null,
      "gaba_production": {"value":number,"unit":"index","status":string}|null,
      "gaba_breakdown": {"value":number,"unit":"index","status":string}|null,
      "unconjugated_bile_acids": {"value":number,"unit":"index","status":string}|null,
      "secondary_bile_acids": {"value":number,"unit":"index","status":string}|null,
      "urolithin_producing_species": {"value":number,"unit":"index","status":string}|null
    }
  },
  "species": [{"name":string,"abundance_pct":number,"classification":string}],
  "recommendations": [string],
  "top_focus_areas": [{"category":string,"metric":string,"value":number|null}]
}

PASS 1 TEXT (first portion of report):
${text}`;
}

function buildPass2Prompt(text: string): string {
  return `Extract structured data from PASS 2 of this Tiny Health gut microbiome report.
This is the CONTINUATION of the report. Focus on:
  - TOP 50 species by abundance_pct (do NOT list all species — only the 50 highest abundance ones)
  - Diversity & resilience metrics (shannon_diversity, species_richness, bacteroidota, firmicutes, etc.)
  - Short chain fatty acid pathways (butyrate, propionate, acetate as 0-100 production index)
  - Digestive capacity pathways (cellulose, resistant_starch, vitamins as 0-100 capacity index)
  - Microbial enzyme/metabolite pathways (histamine_index, secondary_bile_acids, etc. as 0-100 index)
  - Recommendations text

${PATHWAY_UNIT_RULES}

IMPORTANT: For "species", return ONLY the top 50 species by abundance_pct. Do NOT list every species.

Return null for any field not explicitly present in this passage.
Return empty arrays for species/recommendations if not present here.

RETURN THIS EXACT JSON SCHEMA (use null for missing values, empty arrays for no items):
{
  "kit_id": null,
  "collection_date": null,
  "report_date": null,
  "patient_sex": null,
  "report_version": null,
  "microbiome_score": null,
  "gut_type": string|null,
  "beneficial_pct": number|null,
  "variable_pct": number|null,
  "unfriendly_pct": number|null,
  "unknown_pct": number|null,
  "category_statuses": {
    "beneficial_microbes": null,
    "disruptive_microbes": null,
    "gut_barrier_inflammation": null,
    "short_chain_fatty_acids": string|null,
    "digestive_capacity": null,
    "diversity_resilience": string|null,
    "microbial_enzymes_metabolites": string|null
  },
  "metrics": {
    "beneficial_microbes": null,
    "disruptive_microbes": null,
    "gut_barrier_inflammation": null,
    "short_chain_fatty_acids": {
      "butyrate": {"value":number,"unit":"index","status":string}|null,
      "propionate": {"value":number,"unit":"index","status":string}|null,
      "acetate": {"value":number,"unit":"index","status":string}|null
    },
    "digestive_capacity": {
      "cellulose": {"value":number,"unit":"index","status":string}|null,
      "resistant_starch": {"value":number,"unit":"index","status":string}|null,
      "chitin": {"value":number,"unit":"index","status":string}|null,
      "pectin": {"value":number,"unit":"index","status":string}|null,
      "fructooligosaccharides": {"value":number,"unit":"index","status":string}|null,
      "galactooligosaccharides": {"value":number,"unit":"index","status":string}|null,
      "xylooligosaccharides": {"value":number,"unit":"index","status":string}|null,
      "isomaltooligosaccharides": {"value":number,"unit":"index","status":string}|null,
      "protein_breakdown": {"value":number,"unit":"index","status":string}|null,
      "trimethylamine": {"value":number,"unit":"index","status":string}|null,
      "ammonia": {"value":number,"unit":"index","status":string}|null,
      "branched_chain_amino_acids": {"value":number,"unit":"index","status":string}|null,
      "p_cresol": {"value":number,"unit":"index","status":string}|null,
      "indole_3_propionic_acid": {"value":number,"unit":"index","status":string}|null,
      "vitamin_b2": {"value":number,"unit":"index","status":string}|null,
      "vitamin_b7": {"value":number,"unit":"index","status":string}|null,
      "vitamin_b9": {"value":number,"unit":"index","status":string}|null,
      "vitamin_b12": {"value":number,"unit":"index","status":string}|null,
      "vitamin_k": {"value":number,"unit":"index","status":string}|null
    },
    "diversity_resilience": {
      "shannon_diversity": {"value":number,"unit":"","status":string}|null,
      "species_richness": {"value":number,"unit":"","status":string}|null,
      "microbiome_age": {"value":number,"unit":"years","status":string}|null,
      "gut_resilience_score": {"value":number,"unit":"","status":string}|null,
      "oral_microbes": {"value":number,"unit":"%","status":string}|null,
      "bacteroidota": {"value":number,"unit":"%","status":string}|null,
      "firmicutes": {"value":number,"unit":"%","status":string}|null,
      "actinobacteriota": {"value":number,"unit":"%","status":string}|null,
      "proteobacteria": {"value":number,"unit":"%","status":string}|null,
      "firmicutes_bacteroidota_ratio": {"value":number,"unit":"","status":string}|null,
      "proteobacteria_actinobacteriota_ratio": {"value":number,"unit":"","status":string}|null,
      "prevotella_bacteroides_ratio": {"value":number,"unit":"","status":string}|null,
      "bacteroides": {"value":number,"unit":"%","status":string}|null,
      "prevotella": {"value":number,"unit":"%","status":string}|null,
      "ruminococcus": {"value":number,"unit":"%","status":string}|null,
      "blautia": {"value":number,"unit":"%","status":string}|null,
      "roseburia": {"value":number,"unit":"%","status":string}|null,
      "phocaeicola_dorei": {"value":number,"unit":"%","status":string}|null
    },
    "microbial_enzymes_metabolites": {
      "histamine_index": {"value":number,"unit":"index","status":string}|null,
      "beta_glucuronidase_capacity": {"value":number,"unit":"index","status":string}|null,
      "gaba_production": {"value":number,"unit":"index","status":string}|null,
      "gaba_breakdown": {"value":number,"unit":"index","status":string}|null,
      "unconjugated_bile_acids": {"value":number,"unit":"index","status":string}|null,
      "secondary_bile_acids": {"value":number,"unit":"index","status":string}|null,
      "urolithin_producing_species": {"value":number,"unit":"index","status":string}|null
    }
  },
  "species": [{"name":string,"abundance_pct":number,"classification":string}],
  "recommendations": [string],
  "top_focus_areas": [{"category":string,"metric":string,"value":number|null}]
}

PASS 2 TEXT (continuation of report):
${text}`;
}

// ── Pass definitions ────────────────────────────────────────────────────────

const PASS_SIZE = 40000; // chars per pass ≈ 10K input tokens

const pass1: ParserPass = {
  label: "summary",
  charRange: [0, PASS_SIZE],
  systemPrompt: SYSTEM_PROMPT,
  buildPrompt: buildPass1Prompt,
  maxTokens: 8000,
  temperature: 0.1,
};

const pass2: ParserPass = {
  label: "species",
  charRange: [PASS_SIZE, PASS_SIZE * 2],
  systemPrompt: SYSTEM_PROMPT,
  buildPrompt: buildPass2Prompt,
  maxTokens: 8000,
  temperature: 0.1,
  retryInstruction:
    "Return ONLY the raw JSON object — no prose, no explanation. Start your response with { and end with }.",
};

// Page 15: SCFA gauge charts (butyrate, propionate, acetate in rpkm)
// Page 16: Digestive capacity charts (fiber fermentation metrics in rpkm)
const VISION_PROMPT = `You are reading pages from a microbiome/gut health lab report (Tiny Health format).

Look at ALL gauge charts, dial charts, and numeric indicators visible in these pages.

Extract the following values and return ONLY a JSON object:

{
  "metrics": {
    "short_chain_fatty_acids": {
      "butyrate":    {"value": <number or null>, "unit": "rpkm", "status": <"okay"|"needs_support"|null>},
      "propionate":  {"value": <number or null>, "unit": "rpkm", "status": <"okay"|"needs_support"|null>},
      "acetate":     {"value": <number or null>, "unit": "rpkm", "status": <"okay"|"needs_support"|null>}
    },
    "digestive_capacity": {
      "cellulose":              {"value": <number or null>, "unit": "rpkm", "status": <"okay"|"needs_support"|null>},
      "resistant_starch":       {"value": <number or null>, "unit": "rpkm", "status": <"okay"|"needs_support"|null>},
      "chitin":                 {"value": <number or null>, "unit": "rpkm", "status": <"okay"|"needs_support"|null>},
      "pectin":                 {"value": <number or null>, "unit": "rpkm", "status": <"okay"|"needs_support"|null>},
      "fructooligosaccharides": {"value": <number or null>, "unit": "rpkm", "status": <"okay"|"needs_support"|null>},
      "protein_breakdown":      {"value": <number or null>, "unit": "rpkm", "status": <"okay"|"needs_support"|null>}
    }
  }
}

Rules:
- Use ONLY values explicitly shown in gauges or charts — do NOT guess or infer.
- If a metric is not visible, set value to null.
- rpkm values are typically in the range 0–5000. Set value to null if you cannot read the number clearly.
- Output ONLY valid JSON starting with { and ending with }.`;

const pass3Vision: ParserPass = {
  type: "vision",
  label: "vision-gauges",
  visionPages: [15, 16],
  visionPrompt: VISION_PROMPT,
  buildPrompt: () => VISION_PROMPT,
  maxTokens: 800,
  temperature: 0,
};

// ── Validate + map ─────────────────────────────────────────────────────────

function mapToGutHealthReportData(
  parsed: LlmResult,
  rawText: string,
): GutHealthReportData {
  sanitizeDiseaseMarkers(
    parsed.metrics?.disruptive_microbes,
    rawText.substring(0, PASS_SIZE),
  );

  const { confidencePenalty } = validateExtractedValues(
    flattenForValidation(parsed),
    GUT_HEALTH_VALIDATION_RULES,
    "gutHealth",
  );

  const m = parsed.metrics ?? {};
  const bm = m.beneficial_microbes ?? {};
  const dm = m.disruptive_microbes ?? {};
  const gb = m.gut_barrier_inflammation ?? {};
  const sc = m.short_chain_fatty_acids ?? {};
  const dc = m.digestive_capacity ?? {};
  const dr = m.diversity_resilience ?? {};
  const em = m.microbial_enzymes_metabolites ?? {};
  const cs = parsed.category_statuses ?? {};

  const speciesArr: GutHealthSpeciesEntry[] = (parsed.species ?? [])
    .filter((s) => s?.name && typeof s.abundance_pct === "number")
    .map((s) => ({
      name: String(s.name),
      abundance_pct: Number(s.abundance_pct),
      classification: classifySpecies(s.classification),
    }));

  const topFocusAreas: GutHealthFocusArea[] = (
    parsed.top_focus_areas ?? []
  ).map((f) => ({
    category: String(f.category),
    metric: String(f.metric),
    value: f.value ?? undefined,
  }));

  let hits = 0;
  if (parsed.microbiome_score != null) hits++;
  if (parsed.gut_type) hits++;
  if (parsed.beneficial_pct != null) hits++;
  if (cs.beneficial_microbes) hits++;
  if (bm.bifidobacterium?.value != null) hits++;
  if (sc.butyrate?.value != null) hits++;
  if (dr.shannon_diversity?.value != null) hits++;
  if (speciesArr.length > 0) hits++;
  const confidence = Math.min(1, Math.max(0.3, hits / 8 - confidencePenalty));

  return {
    type: "gut-health",
    provider: "tiny_health",
    kit_id: parsed.kit_id ?? undefined,
    collection_date: parsed.collection_date ?? undefined,
    report_date: parsed.report_date ?? undefined,
    patient_sex: parsed.patient_sex ?? undefined,
    report_version: parsed.report_version ?? undefined,
    summary: {
      microbiome_score: parsed.microbiome_score ?? undefined,
      gut_type: parsed.gut_type ?? undefined,
      beneficial_pct: parsed.beneficial_pct ?? undefined,
      variable_pct: parsed.variable_pct ?? undefined,
      unfriendly_pct: parsed.unfriendly_pct ?? undefined,
      unknown_pct: parsed.unknown_pct ?? undefined,
    },
    category_statuses: {
      beneficial_microbes: normalizeStatus(cs.beneficial_microbes ?? undefined),
      disruptive_microbes: normalizeStatus(cs.disruptive_microbes ?? undefined),
      gut_barrier_inflammation: normalizeStatus(
        cs.gut_barrier_inflammation ?? undefined,
      ),
      short_chain_fatty_acids: normalizeStatus(
        cs.short_chain_fatty_acids ?? undefined,
      ),
      digestive_capacity: normalizeStatus(cs.digestive_capacity ?? undefined),
      diversity_resilience: normalizeStatus(
        cs.diversity_resilience ?? undefined,
      ),
      microbial_enzymes_metabolites: normalizeStatus(
        cs.microbial_enzymes_metabolites ?? undefined,
      ),
    },
    metrics: {
      beneficial_microbes: {
        bifidobacterium: toMetric(bm.bifidobacterium),
        akkermansia: toMetric(bm.akkermansia),
        faecalibacterium: toMetric(bm.faecalibacterium),
        lactobacillaceae: toMetric(bm.lactobacillaceae),
        l_rhamnosus: toMetric(bm.l_rhamnosus),
        l_paracasei: toMetric(bm.l_paracasei),
        l_acidophilus: toMetric(bm.l_acidophilus),
        b_animalis: toMetric(bm.b_animalis),
        s_thermophilus: toMetric(bm.s_thermophilus),
      },
      disruptive_microbes: {
        antibiotic_resistance_abundance_index: toMetric(
          dm.antibiotic_resistance_abundance_index,
        ),
        antibiotic_resistance_richness_index: toMetric(
          dm.antibiotic_resistance_richness_index,
        ),
        enterobacteriaceae: toMetric(dm.enterobacteriaceae),
        e_coli: toMetric(dm.e_coli),
        e_flexneri: toMetric(dm.e_flexneri),
        e_dysenteriae: toMetric(dm.e_dysenteriae),
        h_pylori: toMetric(dm.h_pylori),
        blastocystis: toMetric(dm.blastocystis),
        cryptosporidium: toMetric(dm.cryptosporidium),
        giardia: toMetric(dm.giardia),
        entamoeba_histolytica: toMetric(dm.entamoeba_histolytica),
        candida: toMetric(dm.candida),
        aspergillus: toMetric(dm.aspergillus),
        methane_production_capacity: toMetric(dm.methane_production_capacity),
        methanobrevibacter_smithii: toMetric(dm.methanobrevibacter_smithii),
      },
      gut_barrier_inflammation: {
        hexa_lps_index: toMetric(gb.hexa_lps_index),
        mucus_degradation_index: toMetric(gb.mucus_degradation_index),
        hydrogen_sulfide_index: toMetric(gb.hydrogen_sulfide_index),
        host_dna: toMetric(gb.host_dna),
        oxygen_exposure_index: toMetric(gb.oxygen_exposure_index),
      },
      short_chain_fatty_acids: {
        butyrate: normalizeIndexMetric(toMetric(sc.butyrate)),
        propionate: normalizeIndexMetric(toMetric(sc.propionate)),
        acetate: normalizeIndexMetric(toMetric(sc.acetate)),
      },
      digestive_capacity: {
        cellulose: normalizeIndexMetric(toMetric(dc.cellulose)),
        resistant_starch: normalizeIndexMetric(toMetric(dc.resistant_starch)),
        chitin: normalizeIndexMetric(toMetric(dc.chitin)),
        pectin: normalizeIndexMetric(toMetric(dc.pectin)),
        fructooligosaccharides: normalizeIndexMetric(
          toMetric(dc.fructooligosaccharides),
        ),
        galactooligosaccharides: normalizeIndexMetric(
          toMetric(dc.galactooligosaccharides),
        ),
        xylooligosaccharides: normalizeIndexMetric(
          toMetric(dc.xylooligosaccharides),
        ),
        isomaltooligosaccharides: normalizeIndexMetric(
          toMetric(dc.isomaltooligosaccharides),
        ),
        protein_breakdown: normalizeIndexMetric(toMetric(dc.protein_breakdown)),
        trimethylamine: normalizeIndexMetric(toMetric(dc.trimethylamine)),
        ammonia: normalizeIndexMetric(toMetric(dc.ammonia)),
        branched_chain_amino_acids: normalizeIndexMetric(
          toMetric(dc.branched_chain_amino_acids),
        ),
        p_cresol: normalizeIndexMetric(toMetric(dc.p_cresol)),
        indole_3_propionic_acid: normalizeIndexMetric(
          toMetric(dc.indole_3_propionic_acid),
        ),
        vitamin_b2: normalizeIndexMetric(toMetric(dc.vitamin_b2)),
        vitamin_b7: normalizeIndexMetric(toMetric(dc.vitamin_b7)),
        vitamin_b9: normalizeIndexMetric(toMetric(dc.vitamin_b9)),
        vitamin_b12: normalizeIndexMetric(toMetric(dc.vitamin_b12)),
        vitamin_k: normalizeIndexMetric(toMetric(dc.vitamin_k)),
      },
      diversity_resilience: {
        shannon_diversity: toMetric(dr.shannon_diversity),
        species_richness: toMetric(dr.species_richness),
        microbiome_age: toMetric(dr.microbiome_age),
        gut_resilience_score: toMetric(dr.gut_resilience_score),
        oral_microbes: toMetric(dr.oral_microbes),
        bacteroidota: toMetric(dr.bacteroidota),
        firmicutes: toMetric(dr.firmicutes),
        actinobacteriota: toMetric(dr.actinobacteriota),
        proteobacteria: toMetric(dr.proteobacteria),
        firmicutes_bacteroidota_ratio: toMetric(
          dr.firmicutes_bacteroidota_ratio,
        ),
        proteobacteria_actinobacteriota_ratio: toMetric(
          dr.proteobacteria_actinobacteriota_ratio,
        ),
        prevotella_bacteroides_ratio: toMetric(dr.prevotella_bacteroides_ratio),
        bacteroides: toMetric(dr.bacteroides),
        prevotella: toMetric(dr.prevotella),
        ruminococcus: toMetric(dr.ruminococcus),
        blautia: toMetric(dr.blautia),
        roseburia: toMetric(dr.roseburia),
        phocaeicola_dorei: toMetric(dr.phocaeicola_dorei),
      },
      microbial_enzymes_metabolites: {
        histamine_index: normalizeIndexMetric(toMetric(em.histamine_index)),
        beta_glucuronidase_capacity: normalizeIndexMetric(
          toMetric(em.beta_glucuronidase_capacity),
        ),
        gaba_production: normalizeIndexMetric(toMetric(em.gaba_production)),
        gaba_breakdown: normalizeIndexMetric(toMetric(em.gaba_breakdown)),
        unconjugated_bile_acids: normalizeIndexMetric(
          toMetric(em.unconjugated_bile_acids),
        ),
        secondary_bile_acids: normalizeIndexMetric(
          toMetric(em.secondary_bile_acids),
        ),
        urolithin_producing_species: normalizeIndexMetric(
          toMetric(em.urolithin_producing_species),
        ),
      },
    },
    species: speciesArr,
    recommendations: parsed.recommendations ?? [],
    top_focus_areas: topFocusAreas,
    rawText,
    confidence,
  };
}

// ── Type definition ────────────────────────────────────────────────────────

export const gutHealthDefinition: ReportTypeDefinition<GutHealthReportData> = {
  id: "gut-health-report",
  displayName: "Gut Health (Tiny Health)",
  storageDataType: "gut-health-report",

  detect: looksLikeGutHealthReport,

  passes: [pass1, pass2, pass3Vision],

  mergePasses(results) {
    const [r1, r2, r3] = results;
    // Merge text passes first (earlier wins on conflict)
    let merged: LlmResult;
    if (!r1 && !r2) {
      merged = {};
    } else if (!r2) {
      merged = (r1 ?? {}) as LlmResult;
    } else if (!r1) {
      merged = (r2 ?? {}) as LlmResult;
    } else {
      merged = mergeLlmResults(r1 as LlmResult, r2 as LlmResult);
    }
    // Overlay vision pass: vision REPLACES text-pass values for gauge-based
    // categories (SCFA, digestive capacity) because text passes can only see
    // status labels and hallucinate inconsistent index estimates.
    if (r3) {
      merged = mergeVisionCategories(merged, r3 as LlmResult);
    }
    return merged as Record<string, unknown>;
  },

  validate(merged, rawText) {
    const parsed = merged as LlmResult;
    // Require at least one meaningful field to avoid returning empty objects
    const hasData =
      parsed.microbiome_score != null ||
      parsed.gut_type != null ||
      parsed.beneficial_pct != null ||
      (parsed.species?.length ?? 0) > 0;
    if (!hasData) return null;
    try {
      return mapToGutHealthReportData(parsed, rawText);
    } catch {
      return null;
    }
  },
};
