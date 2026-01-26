/** @jest-environment node */
import { processSleepData, SleepStage } from "../sleepDataProcessor";
import type { HealthDataPoint } from "../../types/healthData";

function rec(
  startDate: string,
  endDate: string,
  value: string,
  overrides: Partial<HealthDataPoint> = {},
): HealthDataPoint {
  return {
    startDate,
    endDate,
    value,
    source: "Apple Watch",
    type: "HKCategoryTypeIdentifierSleepAnalysis",
    ...overrides,
  };
}

describe("sleepDataProcessor - session splitting / naps", () => {
  test("splits consecutive nights even if an InBed marker exists for the next night (InBed must bridge the entire gap to prevent splitting)", () => {
    const data: HealthDataPoint[] = [
      // Night 1
      rec(
        "2024-01-09T22:00:00.000Z",
        "2024-01-10T07:00:00.000Z",
        SleepStage.InBed,
      ),
      rec(
        "2024-01-09T23:00:00.000Z",
        "2024-01-10T06:00:00.000Z",
        SleepStage.Core,
      ),
      // Night 2 (InBed starts during the daytime gap but should NOT prevent a split)
      rec(
        "2024-01-10T22:00:00.000Z",
        "2024-01-11T07:00:00.000Z",
        SleepStage.InBed,
      ),
      rec(
        "2024-01-10T23:00:00.000Z",
        "2024-01-11T06:00:00.000Z",
        SleepStage.Core,
      ),
    ];

    const daily = processSleepData(data);
    expect(daily.map((d) => d.date)).toEqual(["2024-01-09", "2024-01-10"]);
    expect(daily[0].sessions).toHaveLength(1);
    expect(daily[1].sessions).toHaveLength(1);
  });

  test("ignores absurdly-long InBed markers so they don't merge months into one session", () => {
    const data: HealthDataPoint[] = [
      // Bad export: inBed spanning months
      rec(
        "2024-01-09T22:00:00.000Z",
        "2024-08-07T07:00:00.000Z",
        SleepStage.InBed,
      ),
      // Normal overnight sleep on 1/9
      rec(
        "2024-01-09T23:00:00.000Z",
        "2024-01-10T06:00:00.000Z",
        SleepStage.Core,
      ),
      // Separate day sleep on 8/7
      rec(
        "2024-08-07T23:00:00.000Z",
        "2024-08-08T06:00:00.000Z",
        SleepStage.Core,
      ),
    ];

    const daily = processSleepData(data);
    expect(daily.map((d) => d.date)).toEqual(["2024-01-09", "2024-08-07"]);
    expect(daily[0].sessions).toHaveLength(1);
    expect(daily[1].sessions).toHaveLength(1);
  });

  test("does NOT split when gap is ≥120min but an InBed marker overlaps the gap; attributes to start day", () => {
    const data: HealthDataPoint[] = [
      rec(
        "2026-01-01T22:00:00.000Z",
        "2026-01-02T07:00:00.000Z",
        SleepStage.InBed,
      ),
      rec(
        "2026-01-01T22:30:00.000Z",
        "2026-01-01T23:30:00.000Z",
        SleepStage.Core,
      ),
      rec(
        "2026-01-01T23:30:00.000Z",
        "2026-01-01T23:45:00.000Z",
        SleepStage.Awake,
      ),
      // Exactly 120 minute gap from 23:45 -> 01:45
      rec(
        "2026-01-02T01:45:00.000Z",
        "2026-01-02T06:30:00.000Z",
        SleepStage.Core,
      ),
    ];

    const daily = processSleepData(data);
    expect(daily).toHaveLength(1);
    expect(daily[0].date).toBe("2026-01-01");
    expect(daily[0].sessions).toHaveLength(1);
    expect(daily[0].sessions[0].isOvernight).toBe(true);
    // End time should reflect latest end in the session (InBed extends to 07:00)
    expect(daily[0].sessions[0].endTime).toBe("2026-01-02T07:00:00.000Z");
  });

  test("splits into separate sessions when gap is ≥120min and there are no InBed markers; overnight session belongs to start day", () => {
    const data: HealthDataPoint[] = [
      // Overnight session (no InBed markers)
      rec(
        "2026-01-03T23:00:00.000Z",
        "2026-01-04T06:00:00.000Z",
        SleepStage.Core,
      ),
      // Nap the next day
      rec(
        "2026-01-04T14:00:00.000Z",
        "2026-01-04T14:30:00.000Z",
        SleepStage.Core,
      ),
    ];

    const daily = processSleepData(data);
    expect(daily.map((d) => d.date)).toEqual(["2026-01-03", "2026-01-04"]);

    const overnightDay = daily.find((d) => d.date === "2026-01-03");
    expect(overnightDay?.sessions).toHaveLength(1);
    expect(overnightDay?.sessions[0].isOvernight).toBe(true);

    const napDay = daily.find((d) => d.date === "2026-01-04");
    expect(napDay?.sessions).toHaveLength(1);
    expect(napDay?.sessions[0].isOvernight).toBe(false);
  });

  test("splits when gap is exactly 120 minutes and there are no InBed markers (gap is inclusive)", () => {
    const data: HealthDataPoint[] = [
      rec(
        "2026-01-05T09:00:00.000Z",
        "2026-01-05T10:00:00.000Z",
        SleepStage.Core,
      ),
      // Exactly 120 min later (10:00 -> 12:00)
      rec(
        "2026-01-05T12:00:00.000Z",
        "2026-01-05T13:00:00.000Z",
        SleepStage.Core,
      ),
    ];

    const daily = processSleepData(data);
    expect(daily).toHaveLength(1);
    expect(daily[0].date).toBe("2026-01-05");
    expect(daily[0].sessions).toHaveLength(2);
  });

  test("skips ultra-short sessions (<15 minutes) to avoid noise", () => {
    const data: HealthDataPoint[] = [
      rec(
        "2026-01-06T14:00:00.000Z",
        "2026-01-06T14:10:00.000Z",
        SleepStage.Core,
      ),
    ];

    const daily = processSleepData(data);
    expect(daily).toEqual([]);
  });
});
