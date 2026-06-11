/* eslint-disable */
// @ts-nocheck — test-only script
import { readFileSync } from "fs";
import { join } from "path";

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
  console.error("❌  VENICE_API_KEY not found.");
  process.exit(1);
}

import { parseBloodworkReportWithAI } from "../src/utils/reportParsers/aiBloodworkParser";

const RUNS = 20;
const CONCURRENCY = 4;
const TOLERANCE = 0.5;

const text = readFileSync(
  join(__dirname, "../tests/fixtures/sample_bloodwork.txt"),
  "utf-8",
);
console.log(`\n🧪 Bloodwork Reliability Test — ${RUNS} runs`);
console.log(`📄 Loaded ${text.length} chars from sample_bloodwork.txt\n`);

function findMetric(r, ...names) {
  if (!r?.metrics) return undefined;
  for (const name of names) {
    const m = r.metrics.find(
      (m) =>
        m.name?.toLowerCase().replace(/[^a-z0-9]/g, "") ===
        name.toLowerCase().replace(/[^a-z0-9]/g, ""),
    );
    if (m?.value !== undefined) return m.value;
  }
  return undefined;
}

function flattenBloodwork(r) {
  if (!r) return {};
  return {
    reportDate: r.reportDate,
    "panels.count": r.panels ? Object.keys(r.panels).length : undefined,
    "metrics.total": r.metrics?.length,
    // CBC
    "cbc.wbc": findMetric(r, "White Blood Cell Count", "WBC"),
    "cbc.rbc": findMetric(r, "Red Blood Cell Count", "RBC"),
    "cbc.hemoglobin": findMetric(r, "Hemoglobin"),
    "cbc.hematocrit": findMetric(r, "Hematocrit"),
    "cbc.mcv": findMetric(r, "MCV"),
    "cbc.mch": findMetric(r, "MCH"),
    "cbc.platelets": findMetric(r, "Platelet Count", "Platelets"),
    "cbc.neutrophilsPct": findMetric(r, "Neutrophils (Auto)", "Neutrophils"),
    "cbc.lymphocytesPct": findMetric(r, "Lymphocytes (Auto)", "Lymphocytes"),
    // Metabolic
    "metabolic.glucose": findMetric(r, "Glucose"),
    "metabolic.bun": findMetric(r, "BUN (Urea Nitrogen)", "BUN"),
    "metabolic.creatinine": findMetric(r, "Creatinine"),
    "metabolic.egfr": findMetric(r, "eGFR"),
    "metabolic.sodium": findMetric(r, "Sodium"),
    "metabolic.potassium": findMetric(r, "Potassium"),
    "metabolic.ast": findMetric(r, "AST (SGOT)", "AST"),
    "metabolic.alt": findMetric(r, "ALT (SGPT)", "ALT"),
    // Lipid
    "lipid.totalCholesterol": findMetric(r, "Total Cholesterol"),
    "lipid.hdl": findMetric(r, "HDL Cholesterol"),
    "lipid.ldl": findMetric(r, "LDL Cholesterol (calc)", "LDL Cholesterol"),
    "lipid.triglycerides": findMetric(r, "Triglycerides"),
    "lipid.vldl": findMetric(r, "VLDL Cholesterol"),
    // HbA1c
    hba1c: findMetric(r, "HbA1c", "Hemoglobin A1c"),
    // Thyroid
    "thyroid.tsh": findMetric(r, "TSH"),
    "thyroid.freeT4": findMetric(r, "Free T4"),
    "thyroid.freeT3": findMetric(r, "Free T3"),
    // Vitamins
    "vitamins.vitaminD": findMetric(r, "Vitamin D, 25-OH Total", "Vitamin D"),
    "vitamins.vitaminB12": findMetric(r, "Vitamin B12"),
    "vitamins.folate": findMetric(r, "Folate (Folic Acid)", "Folate"),
    "vitamins.ferritin": findMetric(r, "Ferritin"),
    "vitamins.magnesium": findMetric(r, "Magnesium"),
    "vitamins.zinc": findMetric(r, "Zinc"),
    // Inflammatory
    "inflammatory.hsCrp": findMetric(r, "hsCRP"),
    "inflammatory.homocysteine": findMetric(r, "Homocysteine"),
    // Hormones
    "hormones.testosteroneTotal": findMetric(r, "Testosterone, Total"),
    "hormones.testosteroneFree": findMetric(r, "Testosterone, Free"),
    "hormones.dheas": findMetric(r, "DHEA-S"),
    "hormones.cortisol": findMetric(r, "Cortisol (AM)", "Cortisol"),
    "hormones.igf1": findMetric(r, "IGF-1"),
    uricAcid: findMetric(r, "Uric Acid"),
    confidence: r.confidence,
  };
}

async function runBatched(fn, n, concurrency) {
  const results = [];
  for (let i = 0; i < n; i += concurrency) {
    const batch = Math.min(concurrency, n - i);
    process.stdout.write(`  Running ${i + 1}–${i + batch} / ${n} ...`);
    const start = Date.now();
    const batchResults = await Promise.all(
      Array.from({ length: batch }, () => fn().catch(() => null)),
    );
    results.push(...batchResults);
    console.log(` ✓ (${((Date.now() - start) / 1000).toFixed(1)}s)`);
  }
  return results;
}

async function main() {
  const results = await runBatched(
    () => parseBloodworkReportWithAI(text),
    RUNS,
    CONCURRENCY,
  );

  const nonNull = results.filter(Boolean);
  console.log(
    `\n   Schema compliance: ${nonNull.length}/${RUNS} runs returned non-null result\n`,
  );

  const flattened = results.map(flattenBloodwork);
  const fields = Object.keys(
    flattenBloodwork({
      type: "bloodwork",
      metrics: [],
      panels: {},
      rawText: "",
      confidence: 1,
    }),
  );

  const LINE =
    "─".repeat(42) +
    "+" +
    "─".repeat(12) +
    "+" +
    "─".repeat(12) +
    "+" +
    "─".repeat(30);
  const HEADER = `${"Field".padEnd(42)}| ${"Consistent".padEnd(11)}| ${"Null rate".padEnd(11)}| Notes`;
  const SEP = "═".repeat(110);

  console.log(SEP);
  console.log(`  BLOODWORK — sample_bloodwork.txt`);
  console.log(SEP);
  console.log(HEADER);
  console.log(LINE);

  const inconsistentFields = [];

  for (const field of fields) {
    const vals = flattened.map((f) => f[field]);
    const nonNullVals = vals.filter((v) => v !== null && v !== undefined);
    const nullRate = `${Math.round(((RUNS - nonNullVals.length) / RUNS) * 100)}%`;

    if (nonNullVals.length === 0) {
      console.log(
        `${field.padEnd(42)}| ${"✓ 0/" + RUNS + "     "}| ${nullRate.padEnd(11)}| all null`,
      );
      continue;
    }

    const numericVals = nonNullVals.filter((v) => typeof v === "number");
    const stringVals = nonNullVals.filter((v) => typeof v === "string");

    let consistent = true;
    let note = "";

    if (numericVals.length > 0 && numericVals.length === nonNullVals.length) {
      const min = Math.min(...numericVals);
      const max = Math.max(...numericVals);
      const delta = max - min;
      if (delta > TOLERANCE * 2) {
        consistent = false;
        note = `range ${min.toFixed(3)}–${max.toFixed(3)} (Δ${delta.toFixed(3)})`;
        inconsistentFields.push({ field, note });
      } else if (delta > 0) {
        note = `minor float drift ±${(delta / 2).toFixed(3)}`;
      } else {
        note = String(numericVals[0]);
      }
    } else if (stringVals.length > 0) {
      const unique = new Set(stringVals);
      if (unique.size > 1) {
        consistent = false;
        note = `${unique.size} distinct values`;
        inconsistentFields.push({ field, note });
      } else {
        note = stringVals[0];
      }
    }

    const consistentStr =
      `${consistent ? "✓" : "✗"} ${nonNullVals.length}/${RUNS}    `.slice(
        0,
        11,
      );
    console.log(
      `${field.padEnd(42)}| ${consistentStr}| ${nullRate.padEnd(11)}| ${note}`,
    );
  }

  console.log(LINE);

  const totalFields = fields.length;
  const populated = fields.filter((f) =>
    flattened.some((r) => r[f] !== null && r[f] !== undefined),
  ).length;
  const consistent = populated - inconsistentFields.length;
  console.log(
    `\n📊 Coverage: ${populated}/${totalFields} fields populated (${Math.round((populated / totalFields) * 100)}%)`,
  );
  console.log(
    `📊 Consistency: ${consistent}/${populated} populated fields consistent (${populated > 0 ? Math.round((consistent / populated) * 100) : 0}%)\n`,
  );

  if (inconsistentFields.length > 0) {
    console.log(
      `⚠️  Bloodwork: ${inconsistentFields.length} inconsistent field(s):`,
    );
    for (const { field, note } of inconsistentFields) {
      console.log(`     ${field}: ${note}`);
    }
  } else if (nonNull.length === RUNS) {
    console.log(
      "✅ BLOODWORK: STABLE — all fields consistent, no null results",
    );
  } else {
    console.log(
      `⚠️  Bloodwork: ${RUNS - nonNull.length}/${RUNS} runs returned null`,
    );
  }
}

main().catch(console.error);
