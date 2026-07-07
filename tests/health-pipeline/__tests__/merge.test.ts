/**
 * Layer 3 — Merge / append correctness. The contamination class: does integrity
 * hold as data grows? The two-week loop was caused by stale/partial stores
 * diverging from source, so this is the highest-value layer once the production
 * merge is wired in. See docs/architecture/13-data-integrity-harness.md.
 *
 * What the REFERENCE can assert now: additivity over disjoint date ranges —
 * appending newer days must not change older days' values. That is the exact
 * "new upload corrupted old numbers" guarantee.
 *
 * PENDING (Phase 2/3, needs the production store): true merge idempotence —
 * merge(store, sameData) === store — which requires the record-identity dedup
 * that the store performs and the reference intentionally does not model.
 */

import {
  fixtureAvailable,
  loadFixture,
  skipReason,
  type Fixture,
} from "../loadFixture";
import { recordDay } from "../reference/parseHealthCsv";
import { computeMetricStats } from "../reference/computeReferenceStats";

const run = fixtureAvailable() ? describe : describe.skip;
if (!fixtureAvailable()) console.warn(skipReason());

const STEPS = "HKQuantityTypeIdentifierStepCount";

run("Layer 3 — merge/append correctness (reference-level)", () => {
  let fx: Fixture;
  beforeAll(() => {
    fx = loadFixture();
  });

  it("appending newer days does not change older days' values", () => {
    const stepRecs = fx.records.filter((r) => r.metric === STEPS);
    const days = [...new Set(stepRecs.map(recordDay))].sort();
    const cut = days[Math.floor(days.length / 2)];

    const older = stepRecs.filter((r) => recordDay(r) < cut);
    const full = computeMetricStats(STEPS, stepRecs).daily;
    const olderOnly = computeMetricStats(STEPS, older).daily;

    // Every day present in the older-only computation must be byte-identical
    // in the full computation — newer data cannot rewrite history.
    for (const [day, v] of Object.entries(olderOnly)) {
      expect(full[day]).toBeCloseTo(v, 6);
    }
  });

  it("partition additivity: union of disjoint-day partitions equals the whole", () => {
    const stepRecs = fx.records.filter((r) => r.metric === STEPS);
    const days = [...new Set(stepRecs.map(recordDay))].sort();
    const cut = days[Math.floor(days.length / 2)];

    const a = computeMetricStats(
      STEPS,
      stepRecs.filter((r) => recordDay(r) < cut),
    ).daily;
    const b = computeMetricStats(
      STEPS,
      stepRecs.filter((r) => recordDay(r) >= cut),
    ).daily;
    const whole = computeMetricStats(STEPS, stepRecs).daily;

    const merged: Record<string, number> = { ...a, ...b };
    expect(Object.keys(merged).sort()).toEqual(Object.keys(whole).sort());
    for (const [day, v] of Object.entries(whole)) {
      expect(merged[day]).toBeCloseTo(v, 6);
    }
  });
});
