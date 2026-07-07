/**
 * Fixture loader for the data-integrity harness.
 *
 * Real Apple Health data and the derived golden file NEVER live in the repo
 * (privacy integrity starts at source). They live under $AMACH_HEALTH_FIXTURE_DIR
 * and are CI-injected. See docs/architecture/13-data-integrity-harness.md.
 *
 *   AMACH_HEALTH_FIXTURE_DIR/
 *     export.csv        <- the frozen full-span export (fixture input)
 *     stats.golden.json <- reference stats, regenerated + hand-verified
 *
 * When the env var is unset (e.g. a contributor without the fixture), tests
 * SKIP with a clear message — they never fail silently and never pass vacuously.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  parseHealthCsvFile,
  type HealthRecord,
} from "./reference/parseHealthCsv";

export interface Fixture {
  dir: string;
  csvPath: string;
  goldenPath: string;
  records: HealthRecord[];
}

export function fixtureDir(): string | null {
  return process.env.AMACH_HEALTH_FIXTURE_DIR || null;
}

export function fixtureAvailable(): boolean {
  const dir = fixtureDir();
  return !!dir && existsSync(join(dir, "export.csv"));
}

export function skipReason(): string {
  return "SKIPPED: set AMACH_HEALTH_FIXTURE_DIR to a dir containing export.csv (see docs/architecture/13-data-integrity-harness.md). Fixtures are intentionally out-of-git.";
}

export function loadFixture(): Fixture {
  const dir = fixtureDir();
  if (!dir) throw new Error(skipReason());
  const csvPath = join(dir, "export.csv");
  const goldenPath = join(dir, "stats.golden.json");
  return { dir, csvPath, goldenPath, records: parseHealthCsvFile(csvPath) };
}

export function loadGolden(): Record<string, unknown> | null {
  const dir = fixtureDir();
  if (!dir) return null;
  const p = join(dir, "stats.golden.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}
