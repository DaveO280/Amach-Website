/**
 * Test script for the attestation system
 * Tests the TypeScript side - completeness calculations, tier determination
 */

import {
  HealthDataType,
  calculateAppleHealthCompleteness,
  calculateDexaCompleteness,
  getAttestationTier,
  getAllAppleHealthMetrics,
  APPLE_HEALTH_CORE_METRICS,
  APPLE_HEALTH_RECOMMENDED_METRICS,
} from "../src/types/healthDataAttestation";
import { AttestationService } from "../src/storage/AttestationService";

console.log("🧪 Testing Health Data Attestation System\n");
console.log("=".repeat(60));

// Test 1: Apple Health metrics count
console.log("\n📊 Test 1: Apple Health Metrics Configuration");
const allMetricsList = getAllAppleHealthMetrics();
console.log(`   Total metrics defined: ${allMetricsList.length}`);
console.log(`   Core metrics: ${APPLE_HEALTH_CORE_METRICS.length}`);
console.log(
  `   Recommended metrics: ${APPLE_HEALTH_RECOMMENDED_METRICS.length}`,
);
console.log(
  `   Other metrics: ${allMetricsList.length - APPLE_HEALTH_CORE_METRICS.length - APPLE_HEALTH_RECOMMENDED_METRICS.length}`,
);

// Test 2: Apple Health completeness - gold tier (all metrics)
console.log("\n🥇 Test 2: Apple Health Gold Tier (all metrics, 90+ days)");
const allMetrics = [...allMetricsList];
const startDate = new Date("2025-01-01");
const endDate = new Date("2025-04-01"); // 90 days for gold tier
const goldCompleteness = calculateAppleHealthCompleteness(
  allMetrics,
  startDate,
  endDate,
);
console.log(
  `   Metrics present: ${goldCompleteness.presentCount}/${goldCompleteness.totalPossible}`,
);
console.log(`   Core complete: ${goldCompleteness.coreComplete}`);
console.log(`   Days covered: ${goldCompleteness.daysCovered}`);
console.log(`   Score: ${goldCompleteness.score}%`);
console.log(`   Tier: ${getAttestationTier(goldCompleteness)}`);

// Test 3: Apple Health completeness - silver tier (core + some recommended, 60 days)
console.log(
  "\n🥈 Test 3: Apple Health Silver Tier (core + some recommended, 60 days)",
);
const silverStartDate = new Date("2025-01-01");
const silverEndDate = new Date("2025-03-02"); // 60 days
const silverMetrics = [
  ...APPLE_HEALTH_CORE_METRICS,
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKQuantityTypeIdentifierVO2Max",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierAppleExerciseTime",
];
const silverCompleteness = calculateAppleHealthCompleteness(
  silverMetrics,
  silverStartDate,
  silverEndDate,
);
console.log(
  `   Metrics present: ${silverCompleteness.presentCount}/${silverCompleteness.totalPossible}`,
);
console.log(`   Core complete: ${silverCompleteness.coreComplete}`);
console.log(`   Days covered: ${silverCompleteness.daysCovered}`);
console.log(`   Score: ${silverCompleteness.score}%`);
console.log(`   Tier: ${getAttestationTier(silverCompleteness)}`);

// Test 4: Apple Health completeness - bronze tier (core + 2 recommended, 30 days)
console.log(
  "\n🥉 Test 4: Apple Health Bronze Tier (core + 2 recommended, 30 days)",
);
const bronzeStartDate = new Date("2025-01-01");
const bronzeEndDate = new Date("2025-01-31"); // 30 days
const bronzeMetrics = [
  ...APPLE_HEALTH_CORE_METRICS,
  "HKQuantityTypeIdentifierVO2Max",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
];
const bronzeCompleteness = calculateAppleHealthCompleteness(
  bronzeMetrics,
  bronzeStartDate,
  bronzeEndDate,
);
console.log(
  `   Metrics present: ${bronzeCompleteness.presentCount}/${bronzeCompleteness.totalPossible}`,
);
console.log(`   Core complete: ${bronzeCompleteness.coreComplete}`);
console.log(`   Days covered: ${bronzeCompleteness.daysCovered}`);
console.log(`   Score: ${bronzeCompleteness.score}%`);
console.log(`   Tier: ${getAttestationTier(bronzeCompleteness)}`);

// Test 5: Apple Health completeness - no tier (missing core)
console.log("\n❌ Test 5: Apple Health No Tier (missing core metrics)");
const incompleteMetrics = [
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierStepCount",
  // Missing: RestingHeartRate, ActiveEnergyBurned, SleepAnalysis
];
const incompleteCompleteness = calculateAppleHealthCompleteness(
  incompleteMetrics,
  bronzeStartDate,
  bronzeEndDate,
);
console.log(
  `   Metrics present: ${incompleteCompleteness.presentCount}/${incompleteCompleteness.totalPossible}`,
);
console.log(`   Core complete: ${incompleteCompleteness.coreComplete}`);
console.log(
  `   Missing core: ${incompleteCompleteness.missingCore.join(", ")}`,
);
console.log(`   Score: ${incompleteCompleteness.score}%`);
console.log(`   Tier: ${getAttestationTier(incompleteCompleteness)}`);

// Test 6: DEXA completeness - full report
console.log("\n🦴 Test 6: DEXA Completeness - Full Report");
const fullDexaFields = [
  "totalBodyFatPercent",
  "totalLeanMassKg",
  "boneDensityTotal.bmd",
  "boneDensityTotal.tScore",
  "boneDensityTotal.zScore",
  "visceralFatRating",
  "visceralFatVolumeCm3",
  "visceralFatAreaCm2",
  "androidGynoidRatio",
];
const fullDexaCompleteness = calculateDexaCompleteness(fullDexaFields);
console.log(`   Fields present: ${fullDexaFields.length}/9`);
console.log(`   Core complete: ${fullDexaCompleteness.coreComplete}`);
console.log(`   Score: ${fullDexaCompleteness.score}%`);
console.log(
  `   Missing: ${fullDexaCompleteness.missing.length === 0 ? "none" : fullDexaCompleteness.missing.join(", ")}`,
);

// Test 7: DEXA completeness - partial report
console.log("\n🦴 Test 7: DEXA Completeness - Partial Report");
const partialDexaFields = [
  "totalBodyFatPercent",
  "totalLeanMassKg",
  // Missing: bone density, visceral fat, A/G ratio
];
const partialDexaCompleteness = calculateDexaCompleteness(partialDexaFields);
console.log(`   Fields present: ${partialDexaFields.length}/9`);
console.log(`   Core complete: ${partialDexaCompleteness.coreComplete}`);
console.log(`   Score: ${partialDexaCompleteness.score}%`);
console.log(`   Missing: ${partialDexaCompleteness.missing.join(", ")}`);

// Test 8: Content hash computation
console.log("\n🔐 Test 8: Content Hash Computation");
const testData = {
  type: "dexa",
  scanDate: "2025-01-15",
  totalBodyFatPercent: 18.5,
};
const hash = AttestationService.computeContentHash(testData);
console.log(`   Input: ${JSON.stringify(testData)}`);
console.log(`   Hash: ${hash}`);
console.log(`   Is hex: ${hash.startsWith("0x")}`);
console.log(`   Length: ${hash.length} chars (should be 66 for 0x + 64 hex)`);

// Test 9: Tier thresholds (requires 90 days for gold, 60 for silver, 30 for bronze)
console.log("\n📈 Test 9: Tier Threshold Verification");
const testCases = [
  { score: 100, days: 90, desc: "100% / 90 days" },
  { score: 80, days: 90, desc: "80% / 90 days" },
  { score: 79, days: 90, desc: "79% / 90 days" },
  { score: 80, days: 60, desc: "80% / 60 days (no gold, days too low)" },
  { score: 60, days: 60, desc: "60% / 60 days" },
  { score: 59, days: 60, desc: "59% / 60 days" },
  { score: 40, days: 30, desc: "40% / 30 days" },
  { score: 39, days: 30, desc: "39% / 30 days" },
];
for (const { score, days, desc } of testCases) {
  const completeness = {
    score,
    coreComplete: true,
    categoryScores: {},
    missingCore: [],
    missingRecommended: [],
    presentCount: 0,
    totalPossible: 0,
    startDate: "",
    endDate: "",
    daysCovered: days,
  };
  const tier = getAttestationTier(completeness);
  console.log(`   ${desc} => ${tier}`);
}

// Test 10: HealthDataType enum values
console.log("\n🏷️  Test 10: HealthDataType Enum Values");
console.log(`   DEXA: ${HealthDataType.DEXA}`);
console.log(`   BLOODWORK: ${HealthDataType.BLOODWORK}`);
console.log(`   APPLE_HEALTH: ${HealthDataType.APPLE_HEALTH}`);
console.log(`   CGM: ${HealthDataType.CGM}`);

console.log("\n" + "=".repeat(60));
console.log("✅ All attestation tests completed!\n");

// Summary
console.log("📋 Summary:");
console.log(`   - ${allMetricsList.length} Apple Health metrics configured`);
console.log(`   - Tier thresholds: Gold ≥80%, Silver ≥60%, Bronze ≥40%`);
console.log(
  `   - Core metrics required for any tier (except bronze allows 80%)`,
);
console.log(`   - Day coverage: Gold 90+, Silver 60+, Bronze 30+`);
