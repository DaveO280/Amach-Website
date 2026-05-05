import {
  coefficientOfVariation,
  halfWindowVarianceRatio,
  lag1Autocorrelation,
  maxAbsoluteDelta,
  mean,
  modeFraction,
  nonZero,
  pearson,
  range,
  stdev,
  trendSlope
} from "../src/stats";

describe("stats — primitives", () => {
  test("nonZero filters NaN and 0", () => {
    expect(nonZero([1, 0, 2, NaN, 3])).toEqual([1, 2, 3]);
    expect(nonZero([])).toEqual([]);
  });

  test("mean / stdev for trivial inputs", () => {
    expect(mean([])).toBeNaN();
    expect(stdev([1])).toBeNaN();
    expect(mean([1, 2, 3])).toBeCloseTo(2);
    expect(stdev([1, 2, 3, 4, 5])).toBeCloseTo(1.5811, 3);
  });

  test("coefficientOfVariation handles zero mean", () => {
    expect(coefficientOfVariation([0, 0, 0])).toBeNaN();
    expect(coefficientOfVariation([10, 11, 9, 10.5])).toBeGreaterThan(0);
  });

  test("pearson rejects mismatched lengths", () => {
    expect(() => pearson([1, 2, 3], [1, 2])).toThrow(/equal length/);
  });

  test("pearson returns NaN for tiny inputs", () => {
    expect(pearson([1, 2], [3, 4])).toBeNaN();
  });

  test("pearson computes obvious correlations correctly", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    expect(pearson(x, y)).toBeCloseTo(1.0);
    expect(pearson(x, [10, 8, 6, 4, 2])).toBeCloseTo(-1.0);
    expect(pearson([1, 1, 1, 1, 1], [1, 2, 3, 4, 5])).toBeNaN();
  });

  test("maxAbsoluteDelta and range", () => {
    expect(maxAbsoluteDelta([1, 4, 2, 9, 5])).toBe(7);
    expect(maxAbsoluteDelta([1, 0, 9, 0, 5], { skipZero: true })).toBe(8);
    expect(range([1, 5, 9, 3])).toBe(8);
    expect(range([7])).toBe(0);
    expect(range([])).toBe(0);
  });

  test("modeFraction finds the dominant value", () => {
    expect(modeFraction([1, 1, 1, 2])).toBe(0.75);
    expect(modeFraction([1, 2, 3, 4])).toBe(0.25);
    expect(modeFraction([])).toBe(0);
  });

  test("halfWindowVarianceRatio", () => {
    expect(halfWindowVarianceRatio([1, 1, 1])).toBeNaN();
    expect(halfWindowVarianceRatio([1, 1, 1, 1, 1, 1])).toBe(1);
    expect(halfWindowVarianceRatio([1, 1, 1, 1, 1, 1, 5, 10, 5, 10])).toBeGreaterThan(1);
  });

  test("trendSlope", () => {
    expect(trendSlope([1, 2, 3, 4, 5])).toBeCloseTo(1.0);
    expect(trendSlope([5, 4, 3, 2, 1])).toBeCloseTo(-1.0);
    expect(trendSlope([3, 3, 3, 3])).toBe(0);
    expect(trendSlope([1])).toBe(0);
  });

  test("lag1Autocorrelation", () => {
    // Strict trend: high autocorrelation
    const trend = Array.from({ length: 30 }, (_, i) => 50 + i);
    expect(lag1Autocorrelation(trend)).toBeGreaterThan(0.9);
    // Pure alternation: negative
    const alt = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 1 : 100));
    expect(lag1Autocorrelation(alt)).toBeLessThan(0);
    // Too short
    expect(lag1Autocorrelation([1, 2, 3])).toBeNaN();
  });
});
