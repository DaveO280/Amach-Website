import { runCategoryD } from "../../src/checks/categoryD";
import { DEFAULT_CONFIG } from "../../src/config";
import { buildLeafV2 } from "../../src/leaf";
import { generateSeries } from "../../src/generator/synthetic";

describe("Category D — temporal patterns", () => {
  test("legitimate synthetic data passes D.1–D.5", () => {
    const out = generateSeries({
      seed: "D-legit",
      days: 90,
      vo2maxStart: 32,
      vo2maxEnd: 36
    });
    const r = runCategoryD(out.leaves, DEFAULT_CONFIG);
    for (const id of ["D.1", "D.2", "D.3", "D.5"]) {
      const c = r.find((x) => x.id === id);
      expect(c).toBeDefined();
      expect(c!.status).not.toBe("fail");
    }
  });

  test("D.2 fails on identical weekday/weekend behaviour", () => {
    const leaves = Array.from({ length: 30 }, (_, i) =>
      buildLeafV2({
        dayId: 19000 + i,
        steps: 8500, // identical every day
        dataFlags: 0xff_07ff
      })
    );
    const r = runCategoryD(leaves, DEFAULT_CONFIG);
    expect(r.find((x) => x.id === "D.2")!.status).toBe("fail");
  });

  test("D.3 flags zero-variance sleep series", () => {
    const leaves = Array.from({ length: 30 }, (_, i) =>
      buildLeafV2({
        dayId: 19000 + i,
        sleepMins: 450,
        dataFlags: 0xff_07ff
      })
    );
    const r = runCategoryD(leaves, DEFAULT_CONFIG);
    expect(r.find((x) => x.id === "D.3")!.status).toBe("fail");
  });

  test("D.4 fails when commits are backloaded", () => {
    const out = generateSeries({ seed: "D4", days: 30 });
    const lastWeekStart = 1716_000_000;
    const commits = Array.from({ length: 10 }, (_, i) => lastWeekStart + i * 60);
    const r = runCategoryD(out.leaves, DEFAULT_CONFIG, commits);
    expect(r.find((x) => x.id === "D.4")!.status).toBe("fail");
  });

  test("D.4 warns when no commit timestamps are supplied", () => {
    const out = generateSeries({ seed: "D4-warn", days: 30 });
    const r = runCategoryD(out.leaves, DEFAULT_CONFIG);
    expect(r.find((x) => x.id === "D.4")!.status).toBe("warn");
  });

  test("D.5 fails for an alternating no-coherence series", () => {
    // Strictly alternating high/low values produce strongly negative lag-1
    // autocorrelation — well below the 0.15 RHR / 0.05 steps thresholds.
    const leaves: ReturnType<typeof buildLeafV2>[] = [];
    for (let i = 0; i < 60; i++) {
      leaves.push(
        buildLeafV2({
          dayId: 19000 + i,
          restingHR: i % 2 === 0 ? 500 : 700,
          steps: i % 2 === 0 ? 4000 : 14000,
          dataFlags: 0xff_07ff
        })
      );
    }
    const r = runCategoryD(leaves, DEFAULT_CONFIG);
    expect(r.find((x) => x.id === "D.5")!.status).toBe("fail");
  });
});
