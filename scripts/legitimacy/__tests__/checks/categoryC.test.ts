import { runCategoryC } from "../../src/checks/categoryC";
import { DEFAULT_CONFIG } from "../../src/config";
import { buildLeafV2 } from "../../src/leaf";
import { generateSeries } from "../../src/generator/synthetic";

describe("Category C — multi-metric correlations", () => {
  test("legitimate synthetic data passes C.1–C.4", () => {
    const out = generateSeries({
      seed: "C-legit",
      days: 90,
      vo2maxStart: 32,
      vo2maxEnd: 38
    });
    const r = runCategoryC(out.leaves, DEFAULT_CONFIG);
    for (const id of ["C.1", "C.2", "C.3", "C.4"]) {
      const check = r.find((x) => x.id === id);
      expect(check).toBeDefined();
      expect(check!.status).not.toBe("fail");
    }
  });

  test("C.1 fails when RHR↔HRV correlation is positive (impossible direction)", () => {
    const days = 30;
    const leaves = Array.from({ length: days }, (_, i) =>
      buildLeafV2({
        dayId: 19000 + i,
        // RHR rises and HRV rises together — wrong sign
        restingHR: 500 + i * 5,
        hrv: 300 + i * 5,
        dataFlags: 0xff_07ff
      })
    );
    const r = runCategoryC(leaves, DEFAULT_CONFIG);
    expect(r.find((x) => x.id === "C.1")!.status).toBe("fail");
  });

  test("C.5 flags inconsistent sleep stage sums", () => {
    const leaves = Array.from({ length: 10 }, (_, i) =>
      buildLeafV2({
        dayId: 19000 + i,
        sleepMins: 480,
        // Stages sum to ~600 — far from 480
        deepSleepMins: 160,
        remSleepMins: 160,
        lightSleepMins: 240,
        awakeMins: 40,
        dataFlags: 0xff_07ff
      })
    );
    const r = runCategoryC(leaves, DEFAULT_CONFIG);
    expect(r.find((x) => x.id === "C.5")!.status).toBe("fail");
  });

  test("C.6 flags mass-balance violations", () => {
    const leaves = Array.from({ length: 10 }, (_, i) =>
      buildLeafV2({
        dayId: 19000 + i,
        // Weight 75 kg, body fat 10%, lean mass should be ~67.5kg.
        // Setting lean mass to 30 kg makes the balance break.
        weight: 7500,
        bodyFatPct: 1000,
        leanMass: 3000,
        dataFlags: 0xff_07ff
      })
    );
    const r = runCategoryC(leaves, DEFAULT_CONFIG);
    expect(r.find((x) => x.id === "C.6")!.status).toBe("fail");
  });

  test("C.7 fails when workout days and rest days have inverted exercise mins", () => {
    const leaves: ReturnType<typeof buildLeafV2>[] = [];
    for (let i = 0; i < 30; i++) {
      const isWorkout = i % 2 === 0;
      leaves.push(
        buildLeafV2({
          dayId: 19000 + i,
          workoutCount: isWorkout ? 1 : 0,
          // Workout days have *fewer* exercise mins than rest days — inversion
          exerciseMins: isWorkout ? 5 : 90,
          dataFlags: 0xff_07ff
        })
      );
    }
    const r = runCategoryC(leaves, DEFAULT_CONFIG);
    expect(r.find((x) => x.id === "C.7")!.status).toBe("fail");
  });

  test("warns when sample size is insufficient", () => {
    const leaves = Array.from({ length: 4 }, (_, i) =>
      buildLeafV2({
        dayId: 19000 + i,
        restingHR: 600,
        hrv: 400,
        dataFlags: 0xff_07ff
      })
    );
    const r = runCategoryC(leaves, DEFAULT_CONFIG);
    expect(r.find((x) => x.id === "C.1")!.status).toBe("warn");
  });
});
