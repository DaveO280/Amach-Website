/**
 * Integration test against the 16 named synthetic datasets.
 *
 * Acceptance criteria from the Spring Push session brief, Layer 1:
 *   5. All L1–L5 datasets score > 0.85
 *   6. All A1–A8 datasets fail at least one diagnostic check (and score < 0.70)
 *   7. No false positives on E1–E3 (score > 0.70, may have warnings)
 *   8. Runtime < 10s for a 365-day dataset
 *
 * This file is the single source of truth for whether the implementation
 * meets the brief. If a dataset behaves unexpectedly, do NOT loosen the
 * threshold here — fix the check or the dataset.
 */

import {
  L1, L2, L3, L4, L5,
  A1, A2, A3, A4, A5, A6, A7, A8,
  E1, E2, E3
} from "../src/generator/datasets";
import {
  buildMerkleTree
} from "../src/merkle";
import { runLegitimacyPipeline } from "../src/pipeline";
import { serializeLeafV2 } from "../src/leaf";
import { generateSeries } from "../src/generator/synthetic";

import type { NamedDataset } from "../src/generator/datasets";
import type { LegitimacyReport } from "../src/types";

function runOn(ds: NamedDataset, opts: { honestRoot?: boolean } = {}): LegitimacyReport {
  const sorted = ds.leaves.slice().sort((a, b) => a.dayId - b.dayId);
  const honestRoot = (opts.honestRoot ?? true)
    ? buildMerkleTree(sorted.map((l) => serializeLeafV2(l))).root
    : 0xdeadbeefn;
  return runLegitimacyPipeline({
    walletAddress:
      "0x" + sorted[0].wallet.toString("hex").slice(0, 40),
    expectedRoot: "0x" + honestRoot.toString(16),
    expectedLeafCount: sorted.length,
    expectedStartDayId: sorted[0].dayId,
    expectedEndDayId: sorted[sorted.length - 1].dayId,
    leaves: sorted,
    commitTimestamps: ds.commitTimestamps,
    network: "test"
  });
}

describe("datasets — legitimate (L1–L5) score > 0.85", () => {
  test.each([L1, L2, L3, L4, L5])(
    "%p produces score > 0.85 with PASS recommendation",
    (factory) => {
      const ds = factory();
      const report = runOn(ds);
      expect(report.recommendation).toBe("pass");
      expect(report.score).toBeGreaterThan(0.85);
      // Category A must pass for legitimate datasets.
      const a = report.categories.find((c) => c.category === "A")!;
      expect(a.status).toBe("pass");
    }
  );
});

describe("datasets — adversarial (A1–A8) fail at least one C/D/E check and score < 0.70", () => {
  test.each([A1, A2, A3, A4, A5, A6, A7, A8])(
    "%p fails diagnostic checks with score < 0.70",
    (factory) => {
      const ds = factory();
      const report = runOn(ds);
      expect(report.recommendation).toBe("fail");
      expect(report.score).toBeLessThan(0.7);

      // Spec: "fail at least one Category C, D, or E check"
      const categoryFailures = report.categories
        .filter((c) => c.category === "C" || c.category === "D" || c.category === "E")
        .flatMap((c) => c.checks)
        .filter((r) => r.status === "fail");
      expect(categoryFailures.length).toBeGreaterThanOrEqual(1);
    }
  );
});

describe("datasets — edge cases (E1–E3) score > 0.70 with warnings allowed", () => {
  test.each([E1, E2, E3])(
    "%p does not produce a false rejection",
    (factory) => {
      const ds = factory();
      const report = runOn(ds);
      expect(report.recommendation).toBe("pass");
      expect(report.score).toBeGreaterThan(0.7);
    }
  );
});

describe("datasets — Category A halts when root mismatches", () => {
  test("score is forced to 0 when computed root does not match", () => {
    const ds = L1();
    const report = runOn(ds, { honestRoot: false });
    expect(report.score).toBe(0);
    expect(report.recommendation).toBe("fail");
    const a = report.categories.find((c) => c.category === "A")!;
    expect(a.status).toBe("fail");
    // Categories B–E should be empty / not have run.
    for (const cat of report.categories) {
      if (cat.category === "B" || cat.category === "C" || cat.category === "D" || cat.category === "E") {
        expect(cat.checks).toHaveLength(0);
      }
    }
  });
});

describe("datasets — performance budget", () => {
  test("365-day dataset completes in < 10 seconds", () => {
    const out = generateSeries({
      seed: "perf-365",
      days: 365,
      vo2maxStart: 32,
      vo2maxEnd: 38
    });
    const sorted = out.leaves.slice().sort((a, b) => a.dayId - b.dayId);
    const root = buildMerkleTree(
      sorted.map((l) => serializeLeafV2(l))
    ).root;

    const start = Date.now();
    const report = runLegitimacyPipeline({
      walletAddress:
        "0x" + sorted[0].wallet.toString("hex").slice(0, 40),
      expectedRoot: "0x" + root.toString(16),
      expectedLeafCount: sorted.length,
      expectedStartDayId: sorted[0].dayId,
      expectedEndDayId: sorted[sorted.length - 1].dayId,
      leaves: sorted,
      commitTimestamps: [1716_000_000, 1716_000_000 + 90 * 86400, 1716_000_000 + 180 * 86400],
      network: "test"
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10_000);
    expect(report.leafCount).toBe(365);
  });
});
