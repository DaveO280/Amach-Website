/**
 * Layer 1 — Golden test for the PRODUCTION stat-card computation.
 *
 * This is the test the whole harness was built for. It runs the real
 * `computeHealthMetricStats` (the same function HealthDataContextWrapper feeds
 * to the stat cards, dashboard and agent context) over the frozen fixture and
 * asserts it converges on the Apple-Health-verified truth.
 *
 * Why it matters: the "all-time high" shown in production was once 22,664 when
 * the true peak is 25,712 — caused by the wrapper silently falling back to a
 * shorter-history data source. The computation itself is correct; nothing
 * pinned it. Now something does: if anyone changes the bucketing, the
 * zero-wear-day policy, or the windowing, this fails with a number diff.
 *
 * See docs/architecture/13-data-integrity-harness.md.
 */

import {
  fixtureAvailable,
  loadFixture,
  skipReason,
  type Fixture,
} from "../loadFixture";
import { computeReferenceStats } from "../reference/computeReferenceStats";
import { computeHealthMetricStats } from "../../../src/utils/healthMetricStats";
import type { HealthDataByType } from "../../../src/types/healthData";

const run = fixtureAvailable() ? describe : describe.skip;
if (!fixtureAvailable()) console.warn(skipReason());

const STEPS = "HKQuantityTypeIdentifierStepCount";

/**
 * Fixture CSV records -> the in-memory shape the app's pipeline consumes.
 * endDate matters: sleep durations are derived from start..end intervals.
 */
function toHealthDataByType(fx: Fixture): HealthDataByType {
  const out: Record<
    string,
    Array<{ startDate: string; endDate: string; value: string }>
  > = {};
  for (const r of fx.records) {
    (out[r.metric] ??= []).push({
      startDate: r.start,
      endDate: r.end,
      value: r.value,
    });
  }
  return out as unknown as HealthDataByType;
}

run("Layer 1 — production stat-card stats converge on verified truth", () => {
  let stats: ReturnType<typeof computeHealthMetricStats>;
  let fx: Fixture;

  beforeAll(() => {
    fx = loadFixture();
    stats = computeHealthMetricStats(toHealthDataByType(fx));
  });

  it("steps all-time high is the Apple-Health-verified peak (25,712 on 2025-09-27)", () => {
    // The exact number that was wrong in production (showed 22,664).
    expect(stats.steps.high).toBe(25712);
  });

  it("steps all-time average matches the reference engine (active days only)", () => {
    const ref = computeReferenceStats(fx.records)[STEPS];
    // Both exclude zero-wear days, so they must agree within rounding.
    expect(stats.steps.average).toBe(Math.round(ref.windows.allTime.avg));
    expect(stats.steps.average).toBe(11521);
  });

  it("steps all-time low is the true minimum active day (28), not 0", () => {
    // A zero-wear day must never pin `low` to 0.
    expect(stats.steps.low).toBe(28);
  });

  it("production and reference agree on the step peak (cross-implementation check)", () => {
    const ref = computeReferenceStats(fx.records)[STEPS];
    expect(stats.steps.high).toBe(ref.windows.allTime.high);
  });

  it("every metric produces sane, populated stats (no silent zeroing)", () => {
    for (const [name, m] of Object.entries(stats)) {
      // sleep/efficiency aside, a populated fixture must yield non-zero highs.
      expect(m.high).toBeGreaterThan(0);
      expect(m.average).toBeGreaterThan(0);
      expect(m.high).toBeGreaterThanOrEqual(m.average);
      expect(m.low).toBeLessThanOrEqual(m.average);
      expect(Number.isFinite(m.average)).toBe(true);
      if (!Number.isFinite(m.average)) throw new Error(`${name} average NaN`);
    }
  });

  it("is deterministic — same input yields identical output", () => {
    const again = computeHealthMetricStats(toHealthDataByType(fx));
    expect(again).toEqual(stats);
  });
});
