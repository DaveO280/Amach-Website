/**
 * LLM Parser Reliability Test
 *
 * Runs the gut health and DEXA parsers 20 times each against real PDFs,
 * then analyzes:
 *   - Consistency: do numeric fields return the same value every run?
 *   - Null discipline: does any field return a value it shouldn't have?
 *   - Schema compliance: every run returns valid typed output
 *   - Coverage: % of expected fields that were populated vs null
 *
 * Usage:
 *   VENICE_API_KEY=<key> pnpm exec tsx scripts/reliability-test.ts
 *
 * Or let the script auto-load from amach-agent/.env (same machine only).
 */

/* eslint-disable */
// @ts-nocheck  — test-only script, strict types relaxed for conciseness

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// ── Key injection (read from amach-agent/.env if not already set) ──────────
if (!process.env.VENICE_API_KEY) {
  try {
    const agentEnv = readFileSync(
      join(__dirname, "../../amach-agent/.env"),
      "utf-8",
    );
    const match = agentEnv.match(/VENICE_API_KEY=(.+)/);
    if (match) process.env.VENICE_API_KEY = match[1].trim();
  } catch {
    /* key must be in environment */
  }
}

if (!process.env.VENICE_API_KEY) {
  console.error(
    "❌  VENICE_API_KEY not found.  Set it in the environment or ensure amach-agent/.env is present.",
  );
  process.exit(1);
}

// ── Imports (after env is set so callVenice picks up the key) ─────────────
import type {
  GutHealthReportData,
  DexaReportData,
  BloodworkReportData,
} from "../src/types/reportData";
import { extractGutHealthWithLlm } from "../src/utils/reportParsers/gutHealthLlmExtractor";
import { parseDexaReportWithAI } from "../src/utils/reportParsers/aiDexaParser";
import { parseBloodworkReportWithAI } from "../src/utils/reportParsers/aiBloodworkParser";

// ── Config ─────────────────────────────────────────────────────────────────

const RUNS = 20;
const CONCURRENCY = 4; // Venice calls in parallel
const NUMERIC_TOLERANCE = 0.5; // values within ±0.5 count as "consistent"

const GUT_PDF = "/Users/dave/Desktop/tiny_health_report_GCF795 (1).pdf";
const DEXA_PDF = "/Users/dave/Downloads/DXA O'Gara, David.pdf";
const BLOODWORK_TXT = join(__dirname, "../tests/fixtures/sample_bloodwork.txt");

// ── PDF text extraction ────────────────────────────────────────────────────

async function extractPdfText(filePath: string): Promise<string> {
  const buffer = readFileSync(filePath);

  // pdfjs-dist v4 removed the "fake worker" empty-string trick.
  // Provide the real worker file path so Node.js can spawn a WorkerThread.
  const { pathToFileURL } = await import("url");
  const { resolve } = await import("path");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerPath = resolve(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  );
  (pdfjs as any).GlobalWorkerOptions.workerSrc =
    pathToFileURL(workerPath).toString();

  const data = new Uint8Array(buffer);
  const loadingTask = (pdfjs as any).getDocument({
    data,
    verbosity: 0,
    useSystemFonts: true,
    isEvalSupported: false,
  });

  const pdf = await loadingTask.promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => ("str" in item ? item.str : ""))
        .join("");
      fullText += `Page ${i}:\n${pageText}\n\n`;
    } catch {
      fullText += `Page ${i}:\n[error reading page]\n\n`;
    }
  }

  return fullText.trim();
}

// ── Batch runner ───────────────────────────────────────────────────────────

async function runBatched<T>(
  fn: () => Promise<T>,
  count: number,
  concurrency: number,
  label: string,
): Promise<Array<T | null>> {
  const results: Array<T | null> = [];
  let done = 0;

  while (done < count) {
    const batch = Math.min(concurrency, count - done);
    process.stdout.write(
      `  ${label}: running ${done + 1}–${done + batch} / ${count} ...`,
    );
    const batchStart = Date.now();
    const batchResults = await Promise.all(
      Array.from({ length: batch }, () =>
        fn().catch((e: Error) => {
          console.error(`\n  ⚠️  Run failed: ${e.message}`);
          return null;
        }),
      ),
    );
    const elapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
    process.stdout.write(` ✓ (${elapsed}s)\n`);
    results.push(...batchResults);
    done += batch;

    // Polite delay between batches to avoid rate-limiting
    if (done < count) await sleep(1000);
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Field extractors ───────────────────────────────────────────────────────

/** Flatten a GutHealthReportData into path→value pairs for analysis. */
function flattenGutHealth(
  r: GutHealthReportData | null,
): Record<string, unknown> {
  if (!r) return { _null_result: true };
  const m = r.metrics ?? {};
  const bm = m.beneficial_microbes ?? {};
  const dm = m.disruptive_microbes ?? {};
  const gb = m.gut_barrier_inflammation ?? {};
  const sc = m.short_chain_fatty_acids ?? {};
  const dc = m.digestive_capacity ?? {};
  const dr = m.diversity_resilience ?? {};
  const em = m.microbial_enzymes_metabolites ?? {};
  const cs = r.category_statuses ?? {};

  return {
    // Summary
    "summary.microbiome_score": r.summary?.microbiome_score ?? null,
    "summary.gut_type": r.summary?.gut_type ?? null,
    "summary.beneficial_pct": r.summary?.beneficial_pct ?? null,
    "summary.variable_pct": r.summary?.variable_pct ?? null,
    "summary.unfriendly_pct": r.summary?.unfriendly_pct ?? null,
    "summary.unknown_pct": r.summary?.unknown_pct ?? null,
    // Category statuses
    "cs.beneficial_microbes": cs.beneficial_microbes ?? null,
    "cs.disruptive_microbes": cs.disruptive_microbes ?? null,
    "cs.gut_barrier_inflammation": cs.gut_barrier_inflammation ?? null,
    "cs.short_chain_fatty_acids": cs.short_chain_fatty_acids ?? null,
    "cs.digestive_capacity": cs.digestive_capacity ?? null,
    "cs.diversity_resilience": cs.diversity_resilience ?? null,
    "cs.microbial_enzymes_metabolites":
      cs.microbial_enzymes_metabolites ?? null,
    // Beneficial microbes
    "bm.bifidobacterium": bm.bifidobacterium?.value ?? null,
    "bm.akkermansia": bm.akkermansia?.value ?? null,
    "bm.faecalibacterium": bm.faecalibacterium?.value ?? null,
    "bm.lactobacillaceae": bm.lactobacillaceae?.value ?? null,
    // Disruptive microbes (nulls here = good null discipline check)
    "dm.enterobacteriaceae": dm.enterobacteriaceae?.value ?? null,
    "dm.h_pylori": dm.h_pylori?.value ?? null,
    "dm.candida": dm.candida?.value ?? null,
    "dm.antibiotic_resistance_abundance_idx":
      dm.antibiotic_resistance_abundance_index?.value ?? null,
    "dm.methane_production_capacity":
      dm.methane_production_capacity?.value ?? null,
    // Gut barrier inflammation
    "gb.hexa_lps_index": gb.hexa_lps_index?.value ?? null,
    "gb.mucus_degradation_index": gb.mucus_degradation_index?.value ?? null,
    "gb.hydrogen_sulfide_index": gb.hydrogen_sulfide_index?.value ?? null,
    "gb.host_dna": gb.host_dna?.value ?? null,
    // SCFAs
    "sc.butyrate": sc.butyrate?.value ?? null,
    "sc.propionate": sc.propionate?.value ?? null,
    "sc.acetate": sc.acetate?.value ?? null,
    // Digestive capacity (sample)
    "dc.cellulose": dc.cellulose?.value ?? null,
    "dc.resistant_starch": dc.resistant_starch?.value ?? null,
    "dc.butyrate_producers": dc.protein_breakdown?.value ?? null,
    "dc.vitamin_b12": dc.vitamin_b12?.value ?? null,
    // Diversity & resilience
    "dr.shannon_diversity": dr.shannon_diversity?.value ?? null,
    "dr.species_richness": dr.species_richness?.value ?? null,
    "dr.microbiome_age": dr.microbiome_age?.value ?? null,
    "dr.gut_resilience_score": dr.gut_resilience_score?.value ?? null,
    "dr.bacteroidota": dr.bacteroidota?.value ?? null,
    "dr.firmicutes": dr.firmicutes?.value ?? null,
    "dr.proteobacteria": dr.proteobacteria?.value ?? null,
    "dr.firmicutes_bacteroidota_ratio":
      dr.firmicutes_bacteroidota_ratio?.value ?? null,
    "dr.bacteroides": dr.bacteroides?.value ?? null,
    "dr.prevotella": dr.prevotella?.value ?? null,
    // Enzymes & metabolites
    "em.histamine_index": em.histamine_index?.value ?? null,
    "em.beta_glucuronidase": em.beta_glucuronidase_capacity?.value ?? null,
    "em.gaba_production": em.gaba_production?.value ?? null,
    "em.secondary_bile_acids": em.secondary_bile_acids?.value ?? null,
    // Composite
    "species.count": r.species?.length ?? null,
    "recommendations.count": r.recommendations?.length ?? null,
    confidence: r.confidence ?? null,
  };
}

/** Flatten a DexaReportData into path→value pairs for analysis. */
function flattenDexa(r: DexaReportData | null): Record<string, unknown> {
  if (!r) return { _null_result: true };

  const findRegion = (name: string) =>
    r.regions?.find((rg) => rg.region === name);

  const arms = findRegion("arms");
  const legs = findRegion("legs");
  const trunk = findRegion("trunk");
  const total = findRegion("total");

  return {
    scanDate: r.scanDate ?? null,
    totalBodyFatPercent: r.totalBodyFatPercent ?? null,
    totalLeanMassKg: r.totalLeanMassKg ?? null,
    visceralFatRating: r.visceralFatRating ?? null,
    visceralFatAreaCm2: r.visceralFatAreaCm2 ?? null,
    visceralFatVolumeCm3: r.visceralFatVolumeCm3 ?? null,
    androidGynoidRatio: r.androidGynoidRatio ?? null,
    "bmd.total": r.boneDensityTotal?.bmd ?? null,
    "bmd.tScore": r.boneDensityTotal?.tScore ?? null,
    "bmd.zScore": r.boneDensityTotal?.zScore ?? null,
    "regions.count": r.regions?.length ?? null,
    "arms.bodyFatPct": arms?.bodyFatPercent ?? null,
    "arms.leanMassKg": arms?.leanMassKg ?? null,
    "legs.bodyFatPct": legs?.bodyFatPercent ?? null,
    "legs.leanMassKg": legs?.leanMassKg ?? null,
    "trunk.bodyFatPct": trunk?.bodyFatPercent ?? null,
    "total.bodyFatPct": total?.bodyFatPercent ?? null,
    "total.boneDensityGPerCm2": total?.boneDensityGPerCm2 ?? null,
    "total.tScore": total?.tScore ?? null,
    confidence: r.confidence ?? null,
  };
}

/** Flatten BloodworkReportData into path→value pairs for analysis. */
function flattenBloodwork(
  r: BloodworkReportData | null,
): Record<string, unknown> {
  if (!r) return { _null_result: true };

  // Helper: find a metric by name (case-insensitive, partial match)
  const find = (name: string): BloodworkMetric | undefined => {
    const lower = name.toLowerCase();
    return r.metrics?.find(
      (m) =>
        m.name?.toLowerCase().includes(lower) ||
        lower.includes(m.name?.toLowerCase() ?? ""),
    );
  };

  const val = (name: string) => find(name)?.value ?? null;
  const flag = (name: string) => find(name)?.flag ?? null;

  return {
    // Report metadata
    reportDate: r.reportDate ?? null,
    laboratory: r.laboratory ?? null,
    metricCount: r.metrics?.length ?? null,
    confidence: r.confidence ?? null,

    // CBC
    "cbc.wbc": val("white blood cell"),
    "cbc.rbc": val("red blood cell"),
    "cbc.hemoglobin": val("hemoglobin"),
    "cbc.hematocrit": val("hematocrit"),
    "cbc.platelets": val("platelet"),
    "cbc.mcv": val("mcv"),
    "cbc.neutrophils_pct": val("neutrophil"),
    "cbc.lymphocytes_pct": val("lymphocyte"),

    // Metabolic
    "met.glucose": val("glucose"),
    "met.creatinine": val("creatinine"),
    "met.egfr": val("egfr"),
    "met.sodium": val("sodium"),
    "met.potassium": val("potassium"),
    "met.alt": val("alt"),
    "met.ast": val("ast"),
    "met.alk_phos": val("alkaline phosphatase"),

    // Lipid panel
    "lipid.total_chol": val("total cholesterol"),
    "lipid.hdl": val("hdl"),
    "lipid.ldl": val("ldl"),
    "lipid.triglycerides": val("triglyceride"),
    "lipid.ldl_flag": flag("ldl"),

    // HbA1c
    hba1c: val("hba1c"),

    // Thyroid
    "thyroid.tsh": val("tsh"),
    "thyroid.free_t4": val("free t4"),

    // Vitamins & minerals
    "vit.d": val("vitamin d"),
    "vit.b12": val("vitamin b12"),
    "vit.ferritin": val("ferritin"),
    "vit.magnesium": val("magnesium"),

    // Inflammatory
    "inflam.hscrp": val("hscrp"),
    "inflam.homocysteine": val("homocysteine"),

    // Hormones
    "hormone.testosterone_total": val("testosterone, total"),
    "hormone.testosterone_free": val("testosterone, free"),
    "hormone.dheas": val("dhea"),
    "hormone.cortisol": val("cortisol"),
    "hormone.igf1": val("igf-1"),

    // Misc
    uric_acid: val("uric acid"),
  };
}

// ── Analysis ───────────────────────────────────────────────────────────────

interface FieldStats {
  field: string;
  values: unknown[];
  nullCount: number;
  nullRate: number; // 0-100 %
  consistent: boolean;
  representativeValue: unknown;
  notes: string;
}

function analyzeField(field: string, values: unknown[]): FieldStats {
  const nulls = values.filter((v) => v === null || v === undefined);
  const nonNulls = values.filter((v) => v !== null && v !== undefined);
  const nullRate = Math.round((nulls.length / values.length) * 100);

  if (nonNulls.length === 0) {
    return {
      field,
      values,
      nullCount: nulls.length,
      nullRate,
      consistent: true,
      representativeValue: null,
      notes: "all null",
    };
  }

  const representative = nonNulls[0];
  let consistent = true;
  let notes = "";

  if (typeof representative === "number") {
    const nums = nonNulls as number[];
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const range = max - min;
    if (range > NUMERIC_TOLERANCE) {
      consistent = false;
      notes = `range ${min.toFixed(3)}–${max.toFixed(3)} (Δ${range.toFixed(3)})`;
    } else if (range > 0) {
      notes = `minor float drift ±${(range / 2).toFixed(3)}`;
    }
  } else if (typeof representative === "string") {
    const unique = [...new Set(nonNulls as string[])];
    if (unique.length > 1) {
      consistent = false;
      notes = `${unique.length} distinct values: ${unique.slice(0, 3).join(", ")}`;
    }
  } else if (typeof representative === "boolean") {
    const unique = [...new Set(nonNulls as boolean[])];
    if (unique.length > 1) {
      consistent = false;
      notes = "mixed true/false";
    }
  }

  return {
    field,
    values,
    nullCount: nulls.length,
    nullRate,
    consistent,
    representativeValue: representative,
    notes,
  };
}

// ── Null discipline check ──────────────────────────────────────────────────
// These are fields that should be null if the corresponding finding is absent
// from the report. A non-null value across multiple runs is strong hallucination signal.

const GUT_HEALTH_SHOULD_BE_NULL_FIELDS = new Set([
  // Pathogen fields — only present if detected. High null rate is expected and correct.
  "dm.h_pylori",
  "dm.candida",
]);

// ── Table printer ──────────────────────────────────────────────────────────

function printTable(title: string, stats: FieldStats[]): string {
  const COL1 = 42;
  const COL2 = 12;
  const COL3 = 12;

  const header = [
    `Field`.padEnd(COL1),
    `Consistent`.padEnd(COL2),
    `Null rate`.padEnd(COL3),
    `Notes`,
  ].join("| ");

  const sep = [
    "─".repeat(COL1),
    "─".repeat(COL2),
    "─".repeat(COL3),
    "─".repeat(30),
  ].join("+");

  const rows = stats.map((s) => {
    const field = s.field.padEnd(COL1);
    const nonNull = RUNS - s.nullCount;
    const consCell = s.consistent
      ? `✓ ${nonNull}/${RUNS}`.padEnd(COL2)
      : `✗ ${nonNull}/${RUNS}`.padEnd(COL2);
    const nullCell = `${s.nullRate}%`.padEnd(COL3);
    const notesCell =
      s.notes ||
      (s.representativeValue !== null
        ? String(s.representativeValue).substring(0, 40)
        : "");
    return [field, consCell, nullCell, notesCell].join("| ");
  });

  const totalFields = stats.length;
  const consistentFields = stats.filter(
    (s) => s.consistent && s.nullRate < 100,
  ).length;
  const populatedFields = stats.filter((s) => s.nullRate < 100).length;
  const coverage = Math.round((populatedFields / totalFields) * 100);
  const consistencyRate =
    populatedFields > 0
      ? Math.round((consistentFields / populatedFields) * 100)
      : 0;

  const summary = [
    `\n📊 Coverage: ${populatedFields}/${totalFields} fields populated (${coverage}%)`,
    `📊 Consistency: ${consistentFields}/${populatedFields} populated fields consistent (${consistencyRate}%)`,
  ].join("\n");

  const lines = [
    `\n${"═".repeat(110)}`,
    `  ${title}`,
    `${"═".repeat(110)}`,
    header,
    sep,
    ...rows,
    sep,
    summary,
  ];

  return lines.join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const outputLines: string[] = [];
  const log = (line: string) => {
    console.log(line);
    outputLines.push(line);
  };

  log(`\n🧪 LLM Parser Reliability Test`);
  log(`   Runs per report type: ${RUNS}`);
  log(`   Concurrency: ${CONCURRENCY}`);
  log(`   Numeric tolerance: ±${NUMERIC_TOLERANCE}`);
  log(
    `   Venice model: ${process.env.NEXT_PUBLIC_VENICE_MODEL_NAME ?? "zai-org-glm-4.7 (default)"}`,
  );
  log(`   Date: ${new Date().toISOString()}\n`);

  // ── Gut Health ────────────────────────────────────────────────────────────

  log("📄 Extracting gut health PDF text...");
  let gutText: string;
  try {
    gutText = await extractPdfText(GUT_PDF);
    log(
      `   ✓ Extracted ${gutText.length.toLocaleString()} chars from ${gutText.split("Page ").length - 1} pages\n`,
    );
  } catch (e: any) {
    log(`   ❌ Failed to extract gut health PDF: ${e.message}`);
    process.exit(1);
  }

  log(`🔬 Running gut health extractor ${RUNS}× ...`);
  const gutResults = await runBatched(
    () => extractGutHealthWithLlm(gutText),
    RUNS,
    CONCURRENCY,
    "gut-health",
  );

  const nullGutRuns = gutResults.filter((r) => r === null).length;
  log(
    `\n   Schema compliance: ${RUNS - nullGutRuns}/${RUNS} runs returned non-null result`,
  );

  const gutFlattened = gutResults.map(flattenGutHealth);
  const gutFieldNames = Object.keys(gutFlattened[0] ?? {}).filter(
    (k) => k !== "_null_result",
  );

  const gutStats = gutFieldNames.map((field) => {
    const values = gutFlattened.map((r) => r[field] ?? null);
    const stats = analyzeField(field, values);

    // Null discipline annotation
    if (GUT_HEALTH_SHOULD_BE_NULL_FIELDS.has(field) && stats.nullRate < 100) {
      stats.notes = `⚠️ HALLUCINATION RISK — expected null, got values in ${RUNS - stats.nullCount} runs. ${stats.notes}`;
    }

    return stats;
  });

  const gutTable = printTable(
    `GUT HEALTH — ${GUT_PDF.split("/").pop()}`,
    gutStats,
  );
  log(gutTable);

  // ── DEXA ──────────────────────────────────────────────────────────────────

  log("\n\n📄 Extracting DEXA PDF text...");
  let dexaText: string;
  try {
    dexaText = await extractPdfText(DEXA_PDF);
    log(
      `   ✓ Extracted ${dexaText.length.toLocaleString()} chars from ${dexaText.split("Page ").length - 1} pages\n`,
    );
  } catch (e: any) {
    log(`   ❌ Failed to extract DEXA PDF: ${e.message}`);
    process.exit(1);
  }

  log(`🔬 Running DEXA extractor ${RUNS}× ...`);
  const dexaResults = await runBatched(
    () => parseDexaReportWithAI(dexaText),
    RUNS,
    CONCURRENCY,
    "dexa",
  );

  const nullDexaRuns = dexaResults.filter((r) => r === null).length;
  log(
    `\n   Schema compliance: ${RUNS - nullDexaRuns}/${RUNS} runs returned non-null result`,
  );

  const dexaFlattened = dexaResults.map(flattenDexa);
  const dexaFieldNames = Object.keys(dexaFlattened[0] ?? {}).filter(
    (k) => k !== "_null_result",
  );

  const dexaStats = dexaFieldNames.map((field) => {
    const values = dexaFlattened.map((r) => r[field] ?? null);
    return analyzeField(field, values);
  });

  const dexaTable = printTable(
    `DEXA — ${DEXA_PDF.split("/").pop()}`,
    dexaStats,
  );
  log(dexaTable);

  // ── Bloodwork ─────────────────────────────────────────────────────────────

  log("\n\n📄 Loading bloodwork text fixture...");
  let bloodText: string;
  try {
    bloodText = readFileSync(BLOODWORK_TXT, "utf-8");
    log(`   ✓ Loaded ${bloodText.length.toLocaleString()} chars\n`);
  } catch (e: any) {
    log(`   ❌ Failed to load bloodwork fixture: ${e.message}`);
    process.exit(1);
  }

  log(`🔬 Running bloodwork extractor ${RUNS}× ...`);
  const bloodResults = await runBatched(
    () => parseBloodworkReportWithAI(bloodText),
    RUNS,
    CONCURRENCY,
    "bloodwork",
  );

  const nullBloodRuns = bloodResults.filter((r) => r === null).length;
  log(
    `\n   Schema compliance: ${RUNS - nullBloodRuns}/${RUNS} runs returned non-null result`,
  );

  const bloodFlattened = bloodResults.map(flattenBloodwork);
  const bloodFieldNames = Object.keys(bloodFlattened[0] ?? {}).filter(
    (k) => k !== "_null_result",
  );

  const bloodStats = bloodFieldNames.map((field) => {
    const values = bloodFlattened.map((r) => r[field] ?? null);
    return analyzeField(field, values);
  });

  const bloodTable = printTable("BLOODWORK — sample_bloodwork.txt", bloodStats);
  log(bloodTable);

  // ── Final summary ─────────────────────────────────────────────────────────

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  log(`\n\n⏱  Total time: ${elapsed} min`);

  const gutInconsistent = gutStats.filter(
    (s) => !s.consistent && s.nullRate < 100,
  );
  const dexaInconsistent = dexaStats.filter(
    (s) => !s.consistent && s.nullRate < 100,
  );
  const bloodInconsistent = bloodStats.filter(
    (s) => !s.consistent && s.nullRate < 100,
  );

  log("\n📋 FINAL VERDICT");
  log("─".repeat(60));
  if (gutInconsistent.length === 0 && nullGutRuns === 0) {
    log("✅ Gut health: STABLE — all fields consistent, no null results");
  } else {
    if (nullGutRuns > 0)
      log(`⚠️  Gut health: ${nullGutRuns} runs returned null (call failures)`);
    if (gutInconsistent.length > 0) {
      log(`⚠️  Gut health: ${gutInconsistent.length} inconsistent field(s):`);
      gutInconsistent.forEach((s) => log(`     ${s.field}: ${s.notes}`));
    }
  }

  if (dexaInconsistent.length === 0 && nullDexaRuns === 0) {
    log("✅ DEXA: STABLE — all fields consistent, no null results");
  } else {
    if (nullDexaRuns > 0)
      log(`⚠️  DEXA: ${nullDexaRuns} runs returned null (call failures)`);
    if (dexaInconsistent.length > 0) {
      log(`⚠️  DEXA: ${dexaInconsistent.length} inconsistent field(s):`);
      dexaInconsistent.forEach((s) => log(`     ${s.field}: ${s.notes}`));
    }
  }

  if (bloodInconsistent.length === 0 && nullBloodRuns === 0) {
    log("✅ Bloodwork: STABLE — all fields consistent, no null results");
  } else {
    if (nullBloodRuns > 0)
      log(`⚠️  Bloodwork: ${nullBloodRuns} runs returned null (call failures)`);
    if (bloodInconsistent.length > 0) {
      log(`⚠️  Bloodwork: ${bloodInconsistent.length} inconsistent field(s):`);
      bloodInconsistent.forEach((s) => log(`     ${s.field}: ${s.notes}`));
    }
  }

  // Write results to file
  const outputPath = join(__dirname, "reliability-test-results.txt");
  writeFileSync(outputPath, outputLines.join("\n"), "utf-8");
  console.log(`\n💾 Results saved to ${outputPath}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
