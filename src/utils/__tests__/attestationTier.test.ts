/** @jest-environment node */

import {
  getTierFromScoreBasisPoints,
  getTierFromScorePercent,
  TIER_THRESHOLDS,
} from "../attestationTier";

describe("attestationTier", () => {
  describe("getTierFromScoreBasisPoints", () => {
    it("returns GOLD (3) for score >= 8000", () => {
      expect(getTierFromScoreBasisPoints(8000)).toBe(3);
      expect(getTierFromScoreBasisPoints(8800)).toBe(3);
      expect(getTierFromScoreBasisPoints(10000)).toBe(3);
    });

    it("returns SILVER (2) for 6000 <= score < 8000", () => {
      expect(getTierFromScoreBasisPoints(6000)).toBe(2);
      expect(getTierFromScoreBasisPoints(7999)).toBe(2);
    });

    it("returns BRONZE (1) for 4000 <= score < 6000", () => {
      expect(getTierFromScoreBasisPoints(4000)).toBe(1);
      expect(getTierFromScoreBasisPoints(5999)).toBe(1);
    });

    it("returns NONE (0) for score < 4000", () => {
      expect(getTierFromScoreBasisPoints(0)).toBe(0);
      expect(getTierFromScoreBasisPoints(3999)).toBe(0);
    });
  });

  describe("getTierFromScorePercent", () => {
    it("returns GOLD for 80% and above", () => {
      expect(getTierFromScorePercent(80)).toBe(3);
      expect(getTierFromScorePercent(88)).toBe(3);
      expect(getTierFromScorePercent(100)).toBe(3);
    });

    it("returns SILVER for 60% to below 80%", () => {
      expect(getTierFromScorePercent(60)).toBe(2);
      expect(getTierFromScorePercent(79.99)).toBe(2);
    });

    it("returns BRONZE for 40% to below 60%", () => {
      expect(getTierFromScorePercent(40)).toBe(1);
      expect(getTierFromScorePercent(59.99)).toBe(1);
    });

    it("returns NONE below 40%", () => {
      expect(getTierFromScorePercent(0)).toBe(0);
      expect(getTierFromScorePercent(39.99)).toBe(0);
    });
  });

  describe("TIER_THRESHOLDS", () => {
    it("matches contract thresholds", () => {
      expect(TIER_THRESHOLDS.GOLD_MIN_PERCENT).toBe(80);
      expect(TIER_THRESHOLDS.SILVER_MIN_PERCENT).toBe(60);
      expect(TIER_THRESHOLDS.BRONZE_MIN_PERCENT).toBe(40);
    });
  });
});
