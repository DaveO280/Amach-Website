/**
 * Regenerate stats.golden.json from the fixture export.
 *
 *   AMACH_HEALTH_FIXTURE_DIR=/path/to/fixtures pnpm exec tsx \
 *     tests/health-pipeline/reference/generateGolden.ts
 *
 * Writes stats.golden.json INTO the fixture dir (out-of-git). Regenerating is a
 * deliberate act: when a change is *supposed* to move numbers, you rerun this and
 * the diff is reviewed. Prints the Apple-Health-confirmed sentinels for a fast
 * eyeball. See docs/architecture/13-data-integrity-harness.md.
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { loadFixture } from "../loadFixture";
import { computeReferenceStats } from "./computeReferenceStats";

function main(): void {
  const fx = loadFixture();
  const stats = computeReferenceStats(fx.records);
  const golden = {
    generatedFrom: "export.csv",
    recordCount: fx.records.length,
    metrics: stats,
  };
  const out = join(fx.dir, "stats.golden.json");
  writeFileSync(out, JSON.stringify(golden, null, 2));

  const steps = stats["HKQuantityTypeIdentifierStepCount"];
  const n = (x: number): string => Math.round(x).toLocaleString("en-US");
  console.log(`\nWrote ${out}`);
  console.log(
    `Records: ${fx.records.length.toLocaleString("en-US")}, metrics: ${Object.keys(stats).length}`,
  );
  console.log(`\n── Steps sentinels (Apple-Health-confirmed truth) ──`);
  console.log(
    `  9/27/2025 daily : ${n(steps.daily["2025-09-27"] ?? 0)}   (expect 25,712)`,
  );
  console.log(
    `  all-time high   : ${n(steps.windows.allTime.high)}   (expect 25,712)`,
  );
  console.log(
    `  all-time avg    : ${n(steps.windows.allTime.avg)}   (expect 11,521)`,
  );
  console.log(
    `  all-time low    : ${n(steps.windows.allTime.low)}   (expect 28)`,
  );
  console.log(`  last date       : ${steps.lastDate}`);
  console.log(
    `  7d/30d/90d avg  : ${n(steps.windows.d7.avg)} / ${n(steps.windows.d30.avg)} / ${n(steps.windows.d90.avg)}   (expect 11,690 / 11,863 / 11,006)`,
  );
  console.log(`\n── Per-metric confidence ──`);
  for (const m of Object.values(stats)) {
    console.log(
      `  ${m.metric.replace(/HK\w+Identifier/, "").padEnd(28)} ${m.aggregationType.padEnd(12)} days=${String(m.daysWithData).padStart(4)}  ${m.confidence}`,
    );
  }
}

main();
