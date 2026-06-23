import type {
  GutHealthBarrier,
  GutHealthBeneficialMicrobes,
  GutHealthCategoryStatuses,
  GutHealthDigestive,
  GutHealthDisruptiveMicrobes,
  GutHealthDiversity,
  GutHealthEnzymes,
  GutHealthMetric,
  GutHealthMetrics,
  GutHealthReportData,
  GutHealthSCFA,
  GutHealthSpeciesEntry,
  GutHealthStatus,
} from "@/types/reportData";

// --- Helpers ---

function normalizeStatus(raw: string): GutHealthStatus {
  const lower = raw.toLowerCase().trim();
  if (lower.includes("needs") || lower.includes("support"))
    return "needs_support";
  if (lower.includes("improv")) return "improving";
  if (lower.includes("great")) return "great";
  return "okay";
}

/**
 * Extract a single structured metric by searching for `namePattern` in the
 * text, then scanning the next ~150 chars for: value [unit] [refs…] status.
 *
 * Handles both space-joined pdfjs output ("0.081%") and token-split output
 * ("0.081 %").
 */
function extractMetric(
  text: string,
  namePattern: RegExp,
): GutHealthMetric | undefined {
  const nameMatch = namePattern.exec(text);
  if (!nameMatch || nameMatch.index === undefined) return undefined;

  const after = text.substring(
    nameMatch.index + nameMatch[0].length,
    nameMatch.index + nameMatch[0].length + 200,
  );

  // Tokenise: pull out numbers (with optional unit) and the first status word
  const TOKEN_RE =
    /(-?\d+(?:\.\d+)?)\s*(rpkm|%)?|(needs?\s+support|needs?\s+improving|improving|okay|doing\s+okay|great|doing\s+great)/gi;

  const nums: { v: number; u: string }[] = [];
  let statusRaw: string | undefined;
  let m: RegExpExecArray | null;

  while ((m = TOKEN_RE.exec(after)) !== null) {
    if (m[1] !== undefined) {
      nums.push({ v: parseFloat(m[1]), u: m[2] ?? "" });
    } else if (m[3] !== undefined) {
      statusRaw = m[3];
      break;
    }
  }

  if (nums.length === 0 || !statusRaw) return undefined;

  const [head, ...refs] = nums;
  const result: GutHealthMetric = {
    value: head.v,
    unit: head.u,
    status: normalizeStatus(statusRaw),
  };

  if (refs.length === 1) {
    result.ref_low = refs[0].v;
    result.ref_high = refs[0].v;
  } else if (refs.length === 2) {
    result.ref_low = refs[0].v;
    result.ref_high = refs[1].v;
  } else if (refs.length >= 3) {
    result.ref_low = refs[0].v;
    result.ref_median = refs[1].v;
    result.ref_high = refs[refs.length - 1].v;
  }

  return result;
}

/** Extract a category-level status from the text near a section header. */
function extractCategoryStatus(
  text: string,
  sectionPattern: RegExp,
): GutHealthStatus | undefined {
  const sectionMatch = sectionPattern.exec(text);
  if (!sectionMatch || sectionMatch.index === undefined) return undefined;

  const after = text.substring(
    sectionMatch.index + sectionMatch[0].length,
    sectionMatch.index + sectionMatch[0].length + 300,
  );

  const STATUS_RE =
    /needs?\s+support|needs?\s+improving|improving|okay|doing\s+okay|great|doing\s+great/i;
  const m = STATUS_RE.exec(after);
  return m ? normalizeStatus(m[0]) : undefined;
}

// --- Section parsers ---

function parseBeneficialMicrobes(text: string): GutHealthBeneficialMicrobes {
  return {
    bifidobacterium: extractMetric(
      text,
      /bifidobacterium(?!\s+adolescentis|\s+longum|\s+bifidum|\s+infantis|\s+breve|\s+pseudolongum)/i,
    ),
    akkermansia: extractMetric(text, /akkermansia/i),
    faecalibacterium: extractMetric(
      text,
      /faecalibacterium(?!\s+prausnitzii\s+\d)/i,
    ),
    lactobacillaceae: extractMetric(text, /lactobacillaceae(?!\s+\()/i),
    l_rhamnosus: extractMetric(
      text,
      /l\.?\s*rhamnosus|lactobacillus\s+rhamnosus/i,
    ),
    l_paracasei: extractMetric(
      text,
      /l\.?\s*paracasei|lactobacillus\s+paracasei/i,
    ),
    l_acidophilus: extractMetric(
      text,
      /l\.?\s*acidophilus|lactobacillus\s+acidophilus/i,
    ),
    b_animalis: extractMetric(
      text,
      /b\.?\s*animalis|bifidobacterium\s+animalis/i,
    ),
    s_thermophilus: extractMetric(
      text,
      /s\.?\s*thermophilus|streptococcus\s+thermophilus/i,
    ),
  };
}

function parseDisruptiveMicrobes(text: string): GutHealthDisruptiveMicrobes {
  return {
    antibiotic_resistance_abundance_index: extractMetric(
      text,
      /antibiotic\s+resistance\s+abundance\s+index/i,
    ),
    antibiotic_resistance_richness_index: extractMetric(
      text,
      /antibiotic\s+resistance\s+richness\s+index/i,
    ),
    enterobacteriaceae: extractMetric(text, /enterobacteriaceae/i),
    e_coli: extractMetric(
      text,
      /e\.?\s*coli(?!\s+\w+\s+\d)|escherichia\s+coli/i,
    ),
    e_flexneri: extractMetric(text, /(?:shigella\s+)?flexneri/i),
    e_dysenteriae: extractMetric(text, /(?:shigella\s+)?dysenteriae/i),
    h_pylori: extractMetric(text, /h\.?\s*pylori|helicobacter\s+pylori/i),
    blastocystis: extractMetric(text, /blastocystis(?!\s+\w+\s+\d)/i),
    cryptosporidium: extractMetric(text, /cryptosporidium/i),
    giardia: extractMetric(text, /giardia/i),
    entamoeba_histolytica: extractMetric(text, /entamoeba\s+histolytica/i),
    candida: extractMetric(text, /candida(?!\s+\w+\s+\d)/i),
    aspergillus: extractMetric(text, /aspergillus(?!\s+\w+\s+\d)/i),
    methane_production_capacity: extractMetric(
      text,
      /methane\s+production\s+capacity/i,
    ),
    methanobrevibacter_smithii: extractMetric(
      text,
      /methanobrevibacter\s+smithii/i,
    ),
  };
}

function parseBarrier(text: string): GutHealthBarrier {
  return {
    hexa_lps_index: extractMetric(text, /hexa[-\s]lps\s+index/i),
    mucus_degradation_index: extractMetric(
      text,
      /mucus\s+degradation\s+index/i,
    ),
    hydrogen_sulfide_index: extractMetric(text, /hydrogen\s+sulfide\s+index/i),
    host_dna: extractMetric(text, /host\s+dna/i),
    oxygen_exposure_index: extractMetric(text, /oxygen\s+exposure\s+index/i),
  };
}

function parseSCFA(text: string): GutHealthSCFA {
  return {
    butyrate: extractMetric(text, /\bbutyrate\b/i),
    propionate: extractMetric(text, /\bpropionate\b/i),
    acetate: extractMetric(text, /\bacetate\b/i),
  };
}

function parseDigestive(text: string): GutHealthDigestive {
  return {
    cellulose: extractMetric(text, /\bcellulose\b/i),
    resistant_starch: extractMetric(text, /resistant\s+starch/i),
    chitin: extractMetric(text, /\bchitin\b/i),
    pectin: extractMetric(text, /\bpectin\b/i),
    fructooligosaccharides: extractMetric(
      text,
      /fructooligosaccharides|(?<!\w)fos(?!\w)/i,
    ),
    galactooligosaccharides: extractMetric(
      text,
      /galactooligosaccharides|(?<!\w)gos(?!\w)/i,
    ),
    xylooligosaccharides: extractMetric(
      text,
      /xylooligosaccharides|(?<!\w)xos(?!\w)/i,
    ),
    isomaltooligosaccharides: extractMetric(
      text,
      /isomaltooligosaccharides|(?<!\w)imos(?!\w)/i,
    ),
    protein_breakdown: extractMetric(text, /protein\s+breakdown/i),
    trimethylamine: extractMetric(text, /\btrimethylamine\b(?!\s+n-?oxide)/i),
    ammonia: extractMetric(text, /\bammonia\b/i),
    branched_chain_amino_acids: extractMetric(
      text,
      /branched[- ]chain\s+amino\s+acids|bcaa/i,
    ),
    p_cresol: extractMetric(text, /p-?cresol/i),
    indole_3_propionic_acid: extractMetric(
      text,
      /indole[-\s]3[-\s]propionic\s+acid/i,
    ),
    vitamin_b2: extractMetric(text, /vitamin\s+b2\b/i),
    vitamin_b7: extractMetric(text, /vitamin\s+b7\b/i),
    vitamin_b9: extractMetric(text, /vitamin\s+b9\b|\bfolate\b/i),
    vitamin_b12: extractMetric(text, /vitamin\s+b12\b/i),
    vitamin_k: extractMetric(text, /vitamin\s+k\b/i),
  };
}

function parseDiversity(text: string): GutHealthDiversity {
  return {
    shannon_diversity: extractMetric(text, /shannon\s+(?:diversity|index)/i),
    species_richness: extractMetric(text, /species\s+richness/i),
    microbiome_age: extractMetric(text, /microbiome\s+age/i),
    gut_resilience_score: extractMetric(text, /gut\s+resilience\s+score/i),
    oral_microbes: extractMetric(text, /oral\s+microbes/i),
    bacteroidota: extractMetric(text, /\bbacteroidota\b(?!\s+ratio)/i),
    firmicutes: extractMetric(
      text,
      /\bfirmicutes\b(?!\s*[/\\]|\s+bacteroidota)/i,
    ),
    actinobacteriota: extractMetric(text, /\bactinobacteriota\b(?!\s+ratio)/i),
    proteobacteria: extractMetric(
      text,
      /\bproteobacteria\b(?!\s*[/\\]|\s+actinobacteriota)/i,
    ),
    firmicutes_bacteroidota_ratio: extractMetric(
      text,
      /firmicutes\s*[/\\]\s*bacteroidota\s+ratio|f\/b\s+ratio/i,
    ),
    proteobacteria_actinobacteriota_ratio: extractMetric(
      text,
      /proteobacteria\s*[/\\]\s*actinobacteriota\s+ratio/i,
    ),
    prevotella_bacteroides_ratio: extractMetric(
      text,
      /prevotella\s*[/\\]\s*bacteroides\s+ratio|p\/b\s+ratio/i,
    ),
    bacteroides: extractMetric(text, /\bbacteroides\b(?!\s+ratio)/i),
    prevotella: extractMetric(
      text,
      /\bprevotella\b(?!\s*[/\\]|\s+bacteroides)/i,
    ),
    ruminococcus: extractMetric(text, /\bruminococcus\b/i),
    blautia: extractMetric(text, /\bblautia\b/i),
    roseburia: extractMetric(text, /\broseburia\b/i),
    phocaeicola_dorei: extractMetric(text, /phocaeicola\s+dorei/i),
  };
}

function parseEnzymes(text: string): GutHealthEnzymes {
  return {
    histamine_index: extractMetric(text, /histamine\s+index/i),
    beta_glucuronidase_capacity: extractMetric(
      text,
      /beta[-\s]glucuronidase\s+(?:capacity|activity)/i,
    ),
    gaba_production: extractMetric(text, /gaba\s+production/i),
    gaba_breakdown: extractMetric(text, /gaba\s+breakdown/i),
    unconjugated_bile_acids: extractMetric(
      text,
      /unconjugated\s+bile\s+acids/i,
    ),
    secondary_bile_acids: extractMetric(text, /secondary\s+bile\s+acids/i),
    urolithin_producing_species: extractMetric(
      text,
      /urolithin.producing\s+species/i,
    ),
  };
}

function parseCategoryStatuses(text: string): GutHealthCategoryStatuses {
  return {
    beneficial_microbes: extractCategoryStatus(text, /beneficial\s+microbes/i),
    disruptive_microbes: extractCategoryStatus(text, /disruptive\s+microbes/i),
    gut_barrier_inflammation: extractCategoryStatus(
      text,
      /gut\s+barrier\s+(?:&|and)?\s*inflammation/i,
    ),
    short_chain_fatty_acids: extractCategoryStatus(
      text,
      /short[-\s]chain\s+fatty\s+acids?/i,
    ),
    digestive_capacity: extractCategoryStatus(text, /digestive\s+capacity/i),
    diversity_resilience: extractCategoryStatus(
      text,
      /diversity\s+(?:&|and)?\s*resilience/i,
    ),
    microbial_enzymes_metabolites: extractCategoryStatus(
      text,
      /microbial\s+enzymes?\s+(?:&|and)?\s*metabolites?/i,
    ),
  };
}

/**
 * Extract species entries from the species-list section (typically page 24+).
 *
 * Tiny Health format: each species appears as `Name X.XXX%`, grouped under
 * "Beneficial / Variable / Unfriendly / Unknown" section headers.
 */
function parseSpecies(text: string): GutHealthSpeciesEntry[] {
  const species: GutHealthSpeciesEntry[] = [];

  // Find the species-list section. It starts after a heading like
  // "All Species" / "All Detected" / or after page ~24.
  const sectionMarker =
    /all\s+(?:detected\s+)?(?:microorganisms?|species|microbes)|full\s+species\s+list/i;
  const markerMatch = sectionMarker.exec(text);
  const searchText = markerMatch ? text.substring(markerMatch.index) : text;

  // Classification headers we might see
  const CLASS_RE =
    /\b(beneficial|variable|unfriendly|unknown)\b(?:\s+microbes?)?\s*:/i;

  // Species line: a name (letters, spaces, dots, hyphens) followed by a %
  // We work through the text tracking the current classification context.
  let currentClass: GutHealthSpeciesEntry["classification"] = "unknown";

  // Process line by line (pages are separated by double newlines)
  const lines = searchText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // Update classification context
    const classMatch = CLASS_RE.exec(line);
    if (classMatch) {
      const raw = classMatch[1].toLowerCase();
      if (raw === "beneficial") currentClass = "beneficial";
      else if (raw === "variable") currentClass = "variable";
      else if (raw === "unfriendly") currentClass = "unfriendly";
      else currentClass = "unknown";
      continue;
    }

    // Match species entries: "Name ... X.XXX%"
    // Name: 2+ words of letters/dots/hyphens, abundance: decimal %
    const speciesMatch =
      /^([A-Za-z][A-Za-z.\-\s]{3,60}?)\s+(\d+\.\d+)\s*%/.exec(line);
    if (speciesMatch) {
      const name = speciesMatch[1].trim();
      const abundance_pct = parseFloat(speciesMatch[2]);
      // Skip obvious header / non-species text
      if (abundance_pct >= 0 && name.length > 3) {
        species.push({ name, abundance_pct, classification: currentClass });
      }
    }
  }

  return species;
}

// --- Detection ---

export function looksLikeGutHealthReport(rawText: string): boolean {
  const lower = rawText.toLowerCase();
  return (
    lower.includes("microbiome score") ||
    lower.includes("tiny health") ||
    lower.includes("gut microbiome") ||
    (lower.includes("bifidobacterium") &&
      lower.includes("akkermansia") &&
      lower.includes("faecalibacterium")) ||
    (lower.includes("shannon diversity") && lower.includes("butyrate")) ||
    (lower.includes("lachnospiraceae") && lower.includes("microbiome"))
  );
}

// --- Main parser ---

export function parseGutHealthReport(
  rawText: string,
): GutHealthReportData | null {
  if (!rawText || !looksLikeGutHealthReport(rawText)) return null;

  // Normalise: collapse runs of whitespace to a single space but preserve
  // newlines so the species extractor can work line-by-line.
  const norm = rawText.replace(/[ \t]+/g, " ");
  const lower = norm.toLowerCase();

  // --- Metadata ---
  const provider = "tiny_health";

  const kitIdMatch = norm.match(
    /(?:kit|sample|report)\s+id[:\s#]+([A-Z0-9\-]{4,})/i,
  );
  const kit_id = kitIdMatch?.[1];

  const collectionMatch = norm.match(
    /(?:collected?|collection\s+date)[:\s]+(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/i,
  );
  const collection_date = collectionMatch?.[1];

  const reportDateMatch = norm.match(
    /(?:report\s+date|reported?)[:\s]+(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/i,
  );
  const report_date = reportDateMatch?.[1];

  const sexMatch = norm.match(/(?:sex|gender)[:\s]+(male|female)/i);
  const patient_sex = sexMatch?.[1]?.toLowerCase();

  const versionMatch = norm.match(
    /(?:report\s+version|version)[:\s]+([\d.]+)/i,
  );
  const report_version = versionMatch?.[1];

  // --- Summary ---
  const scoreMatch =
    norm.match(/(\d{1,3})\s*\/\s*100\s*microbiome\s*score/i) ||
    norm.match(/microbiome\s*score[:\s]+(\d{1,3})/i);
  const microbiome_score = scoreMatch ? parseInt(scoreMatch[1], 10) : undefined;

  // Gut type: "Type Lachnospiraceae" or "your gut type is X"
  const gutTypeMatch =
    norm.match(/\btype\s+([A-Z][a-z]{3,}(?:aceae|idota|ales)?)\b/) ||
    norm.match(/gut\s+type(?:\s+is)?[:\s]+([A-Z][a-z]{3,})/i);
  const gut_type = gutTypeMatch?.[1];

  // Composition %
  const beneficialPctMatch = lower.match(/beneficial\s+(\d+(?:\.\d+)?)\s*%/);
  const variablePctMatch = lower.match(/variable\s+(\d+(?:\.\d+)?)\s*%/);
  const unfriendlyPctMatch = lower.match(/unfriendly\s+(\d+(?:\.\d+)?)\s*%/);
  const unknownPctMatch = lower.match(/unknown\s+(\d+(?:\.\d+)?)\s*%/);

  // --- Categories ---
  const category_statuses = parseCategoryStatuses(norm);

  // --- Structured metrics ---
  const metrics: GutHealthMetrics = {
    beneficial_microbes: parseBeneficialMicrobes(norm),
    disruptive_microbes: parseDisruptiveMicrobes(norm),
    gut_barrier_inflammation: parseBarrier(norm),
    short_chain_fatty_acids: parseSCFA(norm),
    digestive_capacity: parseDigestive(norm),
    diversity_resilience: parseDiversity(norm),
    microbial_enzymes_metabolites: parseEnzymes(norm),
  };

  // --- Species list ---
  const species = parseSpecies(rawText);

  // --- Confidence ---
  let hits = 0;
  if (microbiome_score !== undefined) hits++;
  if (gut_type) hits++;
  if (beneficialPctMatch) hits++;
  if (category_statuses.beneficial_microbes) hits++;
  if (metrics.beneficial_microbes.bifidobacterium) hits++;
  if (metrics.short_chain_fatty_acids.butyrate) hits++;
  if (metrics.diversity_resilience.shannon_diversity) hits++;
  if (species.length > 0) hits++;
  const confidence = Math.min(1, Math.max(0.1, hits / 8));

  return {
    type: "gut-health",
    provider,
    kit_id,
    collection_date,
    report_date,
    patient_sex,
    report_version,
    summary: {
      microbiome_score,
      gut_type,
      beneficial_pct: beneficialPctMatch
        ? parseFloat(beneficialPctMatch[1])
        : undefined,
      variable_pct: variablePctMatch
        ? parseFloat(variablePctMatch[1])
        : undefined,
      unfriendly_pct: unfriendlyPctMatch
        ? parseFloat(unfriendlyPctMatch[1])
        : undefined,
      unknown_pct: unknownPctMatch ? parseFloat(unknownPctMatch[1]) : undefined,
    },
    category_statuses,
    metrics,
    species,
    rawText,
    confidence,
  };
}
