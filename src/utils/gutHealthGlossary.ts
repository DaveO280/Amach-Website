/**
 * Glossary and value-formatting helpers for gut microbiome report metrics
 * (e.g., Tiny Health). Single source of truth for:
 *  - human-readable labels (e.g., "e_flexneri" -> "E. flexneri")
 *  - short plain-language descriptions of what each metric means
 *  - how to render the metric's value (percent / 0-100 index / years / etc.)
 *
 * Used by reportFormatters.formatGutHealthReportForAI (narrative summary fed
 * to Luma) and by GutHealthAgent's system prompt (specialist analysis).
 */

import type { GutHealthMetric } from "@/types/reportData";

export type GutMetricFormat =
  | "percent"
  | "score100"
  | "years"
  | "count"
  | "rpkm"
  | "raw";

export interface GutMetricGlossaryEntry {
  label: string;
  description: string;
  format: GutMetricFormat;
}

export const GUT_HEALTH_METRIC_GLOSSARY: Record<
  string,
  GutMetricGlossaryEntry
> = {
  // Beneficial microbes
  bifidobacterium: {
    label: "Bifidobacterium",
    description: "beneficial probiotic genus, supports gut barrier",
    format: "percent",
  },
  akkermansia: {
    label: "Akkermansia",
    description: "supports gut mucus layer integrity",
    format: "percent",
  },
  faecalibacterium: {
    label: "Faecalibacterium",
    description: "butyrate producer, anti-inflammatory",
    format: "percent",
  },
  lactobacillaceae: {
    label: "Lactobacillaceae",
    description: "beneficial lactic acid bacteria family",
    format: "percent",
  },
  l_rhamnosus: {
    label: "L. rhamnosus",
    description: "probiotic species, supports gut and immune health",
    format: "percent",
  },
  l_paracasei: {
    label: "L. paracasei",
    description: "probiotic species, supports digestion",
    format: "percent",
  },
  l_acidophilus: {
    label: "L. acidophilus",
    description: "probiotic species, supports gut balance",
    format: "percent",
  },
  b_animalis: {
    label: "B. animalis",
    description: "probiotic species, supports regularity",
    format: "percent",
  },
  s_thermophilus: {
    label: "S. thermophilus",
    description: "beneficial fermentation species",
    format: "percent",
  },

  // Disruptive / pathogenic microbes
  antibiotic_resistance_abundance_index: {
    label: "Antibiotic resistance abundance index",
    description: "abundance of antibiotic-resistance genes",
    format: "score100",
  },
  antibiotic_resistance_richness_index: {
    label: "Antibiotic resistance richness index",
    description: "diversity of antibiotic-resistance genes",
    format: "score100",
  },
  enterobacteriaceae: {
    label: "Enterobacteriaceae",
    description: "opportunistic bacterial family, flagged when elevated",
    format: "percent",
  },
  e_coli: {
    label: "E. coli",
    description: "can be pathogenic at high abundance",
    format: "percent",
  },
  e_flexneri: {
    label: "E. flexneri",
    description: "pathogenic species, needs support",
    format: "percent",
  },
  e_dysenteriae: {
    label: "E. dysenteriae",
    description: "pathogenic species, causes dysentery",
    format: "percent",
  },
  h_pylori: {
    label: "H. pylori",
    description: "linked to gastritis and ulcers",
    format: "percent",
  },
  blastocystis: {
    label: "Blastocystis",
    description: "parasitic organism, variable pathogenicity",
    format: "percent",
  },
  cryptosporidium: {
    label: "Cryptosporidium",
    description: "parasitic pathogen, causes diarrheal illness",
    format: "percent",
  },
  giardia: {
    label: "Giardia",
    description: "parasitic pathogen, causes giardiasis",
    format: "percent",
  },
  entamoeba_histolytica: {
    label: "Entamoeba histolytica",
    description: "pathogenic amoeba",
    format: "percent",
  },
  candida: {
    label: "Candida",
    description: "opportunistic yeast, overgrowth linked to dysbiosis",
    format: "percent",
  },
  aspergillus: {
    label: "Aspergillus",
    description: "opportunistic fungus",
    format: "percent",
  },
  methane_production_capacity: {
    label: "Methane production capacity",
    description: "linked to constipation and SIBO",
    format: "rpkm",
  },
  methanobrevibacter_smithii: {
    label: "Methanobrevibacter smithii",
    description: "methane-producing archaeon",
    format: "percent",
  },

  // Gut barrier & inflammation
  hexa_lps_index: {
    label: "Hexa-LPS index",
    description: "measures inflammatory compound potential",
    format: "score100",
  },
  mucus_degradation_index: {
    label: "Mucus degradation index",
    description: "measures gut lining breakdown potential",
    format: "score100",
  },
  hydrogen_sulfide_index: {
    label: "Hydrogen sulfide index",
    description: "measures H2S production potential",
    format: "score100",
  },
  host_dna: {
    label: "Host DNA",
    description: "marker of intestinal cell shedding and barrier integrity",
    format: "percent",
  },
  oxygen_exposure_index: {
    label: "Oxygen exposure index",
    description: "indicates gut lining oxygen exposure, linked to dysbiosis",
    format: "score100",
  },

  // Short-chain fatty acids
  butyrate: {
    label: "Butyrate",
    description: "primary fuel for colon cells, anti-inflammatory",
    format: "score100",
  },
  propionate: {
    label: "Propionate",
    description: "supports metabolic and liver health",
    format: "score100",
  },
  acetate: {
    label: "Acetate",
    description: "supports energy metabolism and gut pH balance",
    format: "score100",
  },

  // Digestive capacity
  cellulose: {
    label: "Cellulose",
    description: "fiber breakdown capacity",
    format: "score100",
  },
  resistant_starch: {
    label: "Resistant starch",
    description: "fiber breakdown capacity, feeds beneficial bacteria",
    format: "score100",
  },
  chitin: {
    label: "Chitin",
    description: "fiber breakdown capacity",
    format: "score100",
  },
  pectin: {
    label: "Pectin",
    description: "fiber breakdown capacity",
    format: "score100",
  },
  fructooligosaccharides: {
    label: "FOS",
    description: "prebiotic fiber breakdown capacity",
    format: "score100",
  },
  galactooligosaccharides: {
    label: "GOS",
    description: "prebiotic fiber breakdown capacity",
    format: "score100",
  },
  xylooligosaccharides: {
    label: "XOS",
    description: "prebiotic fiber breakdown capacity",
    format: "score100",
  },
  isomaltooligosaccharides: {
    label: "IMO",
    description: "prebiotic fiber breakdown capacity",
    format: "score100",
  },
  protein_breakdown: {
    label: "Protein breakdown",
    description: "protein fermentation capacity",
    format: "score100",
  },
  trimethylamine: {
    label: "Trimethylamine (TMA)",
    description: "byproduct linked to cardiovascular risk when elevated",
    format: "score100",
  },
  ammonia: {
    label: "Ammonia",
    description: "protein fermentation byproduct",
    format: "score100",
  },
  branched_chain_amino_acids: {
    label: "Branched-chain amino acids",
    description: "protein fermentation byproduct",
    format: "score100",
  },
  p_cresol: {
    label: "P-cresol",
    description:
      "protein fermentation byproduct, gut barrier irritant when elevated",
    format: "score100",
  },
  indole_3_propionic_acid: {
    label: "Indole-3-propionic acid",
    description: "beneficial tryptophan metabolite",
    format: "score100",
  },
  vitamin_b2: {
    label: "Vitamin B2 production",
    description: "riboflavin production capacity",
    format: "score100",
  },
  vitamin_b7: {
    label: "Vitamin B7 production",
    description: "biotin production capacity",
    format: "score100",
  },
  vitamin_b9: {
    label: "Vitamin B9 production",
    description: "folate production capacity",
    format: "score100",
  },
  vitamin_b12: {
    label: "Vitamin B12 production",
    description: "B12 production capacity",
    format: "score100",
  },
  vitamin_k: {
    label: "Vitamin K production",
    description: "vitamin K production capacity",
    format: "score100",
  },

  // Diversity & resilience
  shannon_diversity: {
    label: "Shannon diversity",
    description: "overall species diversity index",
    format: "raw",
  },
  species_richness: {
    label: "Species richness",
    description: "total distinct species detected",
    format: "count",
  },
  microbiome_age: {
    label: "Microbiome age",
    description: "estimated biological age of the microbiome",
    format: "years",
  },
  gut_resilience_score: {
    label: "Gut resilience score",
    description: "ability to recover from disruption",
    format: "score100",
  },
  oral_microbes: {
    label: "Oral microbes",
    description: "presence of oral-origin bacteria in the gut",
    format: "percent",
  },
  bacteroidota: {
    label: "Bacteroidota",
    description: "major bacterial phylum",
    format: "percent",
  },
  firmicutes: {
    label: "Firmicutes",
    description: "major bacterial phylum",
    format: "percent",
  },
  actinobacteriota: {
    label: "Actinobacteriota",
    description: "bacterial phylum, includes Bifidobacterium",
    format: "percent",
  },
  proteobacteria: {
    label: "Proteobacteria",
    description: "phylum often elevated in dysbiosis",
    format: "percent",
  },
  firmicutes_bacteroidota_ratio: {
    label: "Firmicutes/Bacteroidota ratio",
    description: "linked to metabolic health",
    format: "raw",
  },
  proteobacteria_actinobacteriota_ratio: {
    label: "Proteobacteria/Actinobacteriota ratio",
    description: "dysbiosis marker",
    format: "raw",
  },
  prevotella_bacteroides_ratio: {
    label: "Prevotella/Bacteroides ratio",
    description: "linked to diet type (fiber vs. animal protein)",
    format: "raw",
  },
  bacteroides: {
    label: "Bacteroides",
    description: "common gut genus, fiber and protein metabolism",
    format: "percent",
  },
  prevotella: {
    label: "Prevotella",
    description: "genus linked to fiber-rich diets",
    format: "percent",
  },
  ruminococcus: {
    label: "Ruminococcus",
    description: "fiber-fermenting genus",
    format: "percent",
  },
  blautia: {
    label: "Blautia",
    description: "fiber digester, butyrate producer",
    format: "percent",
  },
  roseburia: {
    label: "Roseburia",
    description: "butyrate producer",
    format: "percent",
  },
  phocaeicola_dorei: {
    label: "Phocaeicola dorei",
    description: "common commensal species",
    format: "percent",
  },

  // Microbial enzymes & metabolites
  histamine_index: {
    label: "Histamine index",
    description: "histamine production potential",
    format: "score100",
  },
  beta_glucuronidase_capacity: {
    label: "Beta-glucuronidase capacity",
    description:
      "enzyme linked to toxin and hormone recirculation when elevated",
    format: "score100",
  },
  gaba_production: {
    label: "GABA production",
    description: "calming neurotransmitter production capacity",
    format: "score100",
  },
  gaba_breakdown: {
    label: "GABA breakdown",
    description: "calming neurotransmitter breakdown capacity",
    format: "score100",
  },
  unconjugated_bile_acids: {
    label: "Unconjugated bile acids",
    description: "bile acid metabolism marker",
    format: "score100",
  },
  secondary_bile_acids: {
    label: "Secondary bile acids",
    description: "bile acid metabolism, linked to gut barrier health",
    format: "score100",
  },
  urolithin_producing_species: {
    label: "Urolithin-producing species",
    description: "polyphenol metabolism, linked to mitochondrial health",
    format: "score100",
  },
};

/** Human-readable label for a metric key (falls back to the raw key). */
export function getGutMetricLabel(key: string): string {
  return GUT_HEALTH_METRIC_GLOSSARY[key]?.label ?? key;
}

/** Short plain-language description of what a metric means, if known. */
export function getGutMetricDescription(key: string): string | undefined {
  return GUT_HEALTH_METRIC_GLOSSARY[key]?.description;
}

/** Render a metric's value using the glossary's format hint. */
export function formatGutMetricValue(
  key: string,
  metric: GutHealthMetric,
): string {
  const format = GUT_HEALTH_METRIC_GLOSSARY[key]?.format ?? "raw";
  const v = metric.value;
  switch (format) {
    case "percent":
      return `${v}%`;
    case "score100":
      return `${v}/100`;
    case "years":
      return `${v} years`;
    case "count":
      return `${v} species`;
    case "rpkm":
      return `${v} rpkm`;
    case "raw":
    default:
      return `${v}${metric.unit ? ` ${metric.unit}` : ""}`;
  }
}

/** Human-readable status label ("needs_support" -> "needs support"). */
export function gutStatusLabel(status: string): string {
  switch (status) {
    case "needs_support":
      return "needs support";
    case "improving":
      return "improving";
    case "great":
      return "great";
    case "okay":
    default:
      return "okay";
  }
}
