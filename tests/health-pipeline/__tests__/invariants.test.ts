/**
 * Layer 2 — Invariants. Structural laws that must hold for ANY export, including
 * future ones with new metrics. These need no golden numbers; they catch the
 * "flow silently lost or diverged data" class — e.g. the June parse pass that
 * dropped Apple Watch step records. See docs/architecture/13-data-integrity-harness.md.
 *
 * Runs against the reference engine now (proving parser fidelity + the harness
 * itself). When the production daily-summary module is consolidated (Phase 2),
 * the SAME assertions get pointed at it — that is when they guard the pipeline.
 */

import {
  fixtureAvailable,
  loadFixture,
  skipReason,
  type Fixture,
} from "../loadFixture";
import { recordDay, recordDevice } from "../reference/parseHealthCsv";
import { computeReferenceStats } from "../reference/computeReferenceStats";

const run = fixtureAvailable() ? describe : describe.skip;
if (!fixtureAvailable()) console.warn(skipReason());

run("Layer 2 — data-integrity invariants", () => {
  let fx: Fixture;
  beforeAll(() => {
    fx = loadFixture();
  });

  it("drops no metric: every metric in the input appears in output with data", () => {
    const inputMetrics = new Set(fx.records.map((r) => r.metric));
    const stats = computeReferenceStats(fx.records);
    for (const m of inputMetrics) {
      expect(stats[m]).toBeDefined();
      expect(stats[m].daysWithData).toBeGreaterThan(0);
    }
  });

  it("drops no device: both iPhone and Apple Watch step records survive parsing", () => {
    const stepRecs = fx.records.filter(
      (r) => r.metric === "HKQuantityTypeIdentifierStepCount",
    );
    const devices = new Set(stepRecs.map(recordDevice));
    // The iPhone-only artifact bug manifested as watch records vanishing.
    expect(devices.has("watch")).toBe(true);
    expect(devices.has("iphone")).toBe(true);
  });

  it("daily total equals the sum of that day's records (cumulative metric)", () => {
    const day = "2025-09-27";
    const rawSum = fx.records
      .filter(
        (r) =>
          r.metric === "HKQuantityTypeIdentifierStepCount" &&
          recordDay(r) === day,
      )
      .reduce((a, r) => a + Number(r.value), 0);
    const stats = computeReferenceStats(fx.records);
    expect(stats["HKQuantityTypeIdentifierStepCount"].daily[day]).toBeCloseTo(
      rawSum,
      6,
    );
  });

  it("window average is arithmetically consistent with the daily values it averages", () => {
    const stats = computeReferenceStats(fx.records);
    const steps = stats["HKQuantityTypeIdentifierStepCount"];
    const end = steps.lastDate;
    const start = new Date(end + "T00:00:00Z");
    start.setUTCDate(start.getUTCDate() - 29);
    const startDay = start.toISOString().slice(0, 10);
    const vals = Object.entries(steps.daily)
      .filter(([d]) => d >= startDay && d <= end)
      .map(([, v]) => v);
    const recomputed = vals.reduce((a, c) => a + c, 0) / vals.length;
    expect(steps.windows.d30.avg).toBeCloseTo(recomputed, 6);
    expect(steps.windows.d30.daysWithData).toBe(vals.length);
  });
});
