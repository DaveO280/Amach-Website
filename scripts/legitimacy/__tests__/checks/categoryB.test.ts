import { runCategoryB } from "../../src/checks/categoryB";
import { DEFAULT_CONFIG } from "../../src/config";
import { buildLeafV2 } from "../../src/leaf";
import { generateSeries } from "../../src/generator/synthetic";

describe("Category B — statistical bounds", () => {
  test("legitimate synthetic data passes mean / variance / range", () => {
    const out = generateSeries({
      seed: "B-legit",
      days: 90,
      vo2maxStart: 32,
      vo2maxEnd: 36
    });
    const results = runCategoryB(out.leaves, DEFAULT_CONFIG);
    const fails = results.filter((r) => r.status === "fail");
    expect(fails.length).toBe(0);
  });

  test("flags out-of-range mean", () => {
    const leaves = Array.from({ length: 30 }, (_, i) =>
      buildLeafV2({
        dayId: 19000 + i,
        steps: 200000, // wildly above plausibility
        restingHR: 700,
        hrv: 400,
        vo2max: 350,
        sleepMins: 450,
        activeEnergy: 50000,
        weight: 7500,
        bodyFatPct: 1800,
        leanMass: 6150,
        deepSleepMins: 80,
        remSleepMins: 100,
        lightSleepMins: 250,
        awakeMins: 20,
        exerciseMins: 30,
        dataFlags: 0xff_07ff
      })
    );
    const results = runCategoryB(leaves, DEFAULT_CONFIG);
    const stepsMean = results.find((r) => r.id === "B.1.steps")!;
    expect(stepsMean.status).toBe("fail");
  });

  test("flags zero-variance series via B.2", () => {
    const leaves = Array.from({ length: 30 }, (_, i) =>
      buildLeafV2({
        dayId: 19000 + i,
        steps: 8500,
        restingHR: 600, // constant
        hrv: 450,
        sleepMins: 450,
        activeEnergy: 35000,
        vo2max: 340,
        weight: 7500,
        bodyFatPct: 1800,
        leanMass: 6150,
        deepSleepMins: 80,
        remSleepMins: 100,
        lightSleepMins: 250,
        awakeMins: 20,
        exerciseMins: 30,
        dataFlags: 0xff_07ff
      })
    );
    const results = runCategoryB(leaves, DEFAULT_CONFIG);
    const cv = results.find((r) => r.id === "B.2.restingHR")!;
    expect(cv.status).toBe("fail");
  });

  test("flags mode-fraction degeneracy via B.3 (steps)", () => {
    // 95% of days have identical step count.
    const leaves: ReturnType<typeof buildLeafV2>[] = [];
    for (let i = 0; i < 30; i++) {
      leaves.push(
        buildLeafV2({
          dayId: 19000 + i,
          steps: i < 28 ? 8500 : 8501,
          dataFlags: 0xff_07ff,
          restingHR: 600 + (i % 3) * 10,
          hrv: 450 + (i % 4) * 5,
          sleepMins: 450,
          activeEnergy: 35000,
          vo2max: 340,
          deepSleepMins: 80,
          remSleepMins: 100,
          lightSleepMins: 250,
          awakeMins: 20,
          exerciseMins: 30
        })
      );
    }
    const results = runCategoryB(leaves, DEFAULT_CONFIG);
    expect(results.find((r) => r.id === "B.3.steps")!.status).toBe("fail");
  });

  test("skips B.3 entirely for body-comp metrics (legitimately low cardinality)", () => {
    const leaves = Array.from({ length: 30 }, (_, i) =>
      buildLeafV2({
        dayId: 19000 + i,
        weight: 7500,
        leanMass: 6150,
        bodyFatPct: 1800,
        dataFlags: 0xff_07ff
      })
    );
    const results = runCategoryB(leaves, DEFAULT_CONFIG);
    expect(results.find((r) => r.id === "B.3.weight")).toBeUndefined();
    expect(results.find((r) => r.id === "B.3.leanMass")).toBeUndefined();
    expect(results.find((r) => r.id === "B.3.bodyFatPct")).toBeUndefined();
  });

  test("flags step-change exceeding bound via B.4", () => {
    // Step change must exceed the 350-wire (= 35 bpm) bound to fail.
    const leaves = Array.from({ length: 10 }, (_, i) =>
      buildLeafV2({
        dayId: 19000 + i,
        restingHR: i % 2 === 0 ? 400 : 900, // 50 bpm jump per day
        dataFlags: 0xff_07ff
      })
    );
    const results = runCategoryB(leaves, DEFAULT_CONFIG);
    expect(results.find((r) => r.id === "B.4.restingHR")!.status).toBe("fail");
  });

  test("flags excessive range via B.5", () => {
    const leaves: ReturnType<typeof buildLeafV2>[] = [];
    for (let i = 0; i < 10; i++) {
      leaves.push(
        buildLeafV2({
          dayId: 19000 + i,
          // Range of 60_000 steps in a single window
          steps: i === 0 ? 1000 : i === 1 ? 60_001 : 5000,
          dataFlags: 0xff_07ff
        })
      );
    }
    const results = runCategoryB(leaves, DEFAULT_CONFIG);
    const r = results.find((r) => r.id === "B.5.steps")!;
    expect(r.status).toBe("fail");
  });

  test("emits warns when there are no non-zero samples", () => {
    const leaves = Array.from({ length: 10 }, (_, i) =>
      buildLeafV2({
        dayId: 19000 + i,
        steps: 0,
        dataFlags: 0
      })
    );
    const results = runCategoryB(leaves, DEFAULT_CONFIG);
    expect(results.find((r) => r.id === "B.1.steps")!.status).toBe("warn");
    expect(results.find((r) => r.id === "B.3.steps")!.status).toBe("warn");
  });
});
