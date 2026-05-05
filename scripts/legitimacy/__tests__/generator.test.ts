import {
  generateSeries,
  SeededRandom,
  sourceHashFor,
  walletFromSeed
} from "../src/generator/synthetic";
import { serializeLeafV2 } from "../src/leaf";

describe("generator", () => {
  test("SeededRandom is deterministic", () => {
    const a = new SeededRandom("seed");
    const b = new SeededRandom("seed");
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  test("SeededRandom different seeds diverge", () => {
    const a = new SeededRandom("s1");
    const b = new SeededRandom("s2");
    expect(a.next()).not.toBe(b.next());
  });

  test("SeededRandom.normal produces ~unit-variance samples", () => {
    const rng = new SeededRandom("normal");
    const samples = Array.from({ length: 10_000 }, () => rng.normal());
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance =
      samples.reduce((acc, x) => acc + (x - mean) ** 2, 0) / samples.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(variance).toBeGreaterThan(0.85);
    expect(variance).toBeLessThan(1.15);
  });

  test("walletFromSeed returns a 32-byte buffer", () => {
    const w = walletFromSeed("alice");
    expect(w.length).toBe(32);
    expect(walletFromSeed("alice")).toEqual(w);
    expect(walletFromSeed("bob")).not.toEqual(w);
  });

  test("sourceHashFor depends on device + salt", () => {
    expect(sourceHashFor("apple-watch", "x").length).toBe(32);
    expect(sourceHashFor("apple-watch", "x")).toEqual(
      sourceHashFor("apple-watch", "x")
    );
    expect(sourceHashFor("apple-watch", "x")).not.toEqual(
      sourceHashFor("garmin", "x")
    );
  });

  test("generateSeries returns the requested number of valid leaves", () => {
    const out = generateSeries({ seed: "g1", days: 50 });
    expect(out.leaves.length).toBe(50);
    for (const leaf of out.leaves) {
      const buf = serializeLeafV2(leaf);
      expect(buf.length).toBe(124);
      expect(leaf.version).toBe(0x02);
      expect(leaf.leafType).toBe(0x00);
      expect(leaf.schemaVersion).toBe(0x01);
    }
  });

  test("generated dayIds are contiguous starting at startDayId", () => {
    const out = generateSeries({ seed: "g2", days: 10, startDayId: 12345 });
    const ids = out.leaves.map((l) => l.dayId);
    expect(ids).toEqual(Array.from({ length: 10 }, (_, i) => 12345 + i));
  });

  test("VO2 max trajectory honoured at the boundaries", () => {
    const out = generateSeries({
      seed: "g3",
      days: 90,
      vo2maxStart: 30,
      vo2maxEnd: 50,
      presence: { vo2max: 1.0 }
    });
    const firstVO2 = out.leaves[0].vo2max / 10;
    const lastVO2 = out.leaves[out.leaves.length - 1].vo2max / 10;
    expect(firstVO2).toBeCloseTo(30, 0);
    expect(lastVO2).toBeCloseTo(50, 0);
  });

  test("days=1 produces a single valid leaf", () => {
    const out = generateSeries({ seed: "g-1day", days: 1 });
    expect(out.leaves.length).toBe(1);
  });
});
