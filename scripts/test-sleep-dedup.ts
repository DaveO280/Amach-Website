#!/usr/bin/env tsx
/**
 * Test script to verify sleep data deduplication
 * Usage: pnpm exec tsx scripts/test-sleep-dedup.ts <path-to-health-data.json>
 */

import { readFileSync } from "fs";
import { processSleepData } from "../src/utils/sleepDataProcessor";
import type { HealthDataByType } from "../src/types/healthData";

const dataPath = process.argv[2];
if (!dataPath) {
  console.error(
    "Usage: pnpm exec tsx scripts/test-sleep-dedup.ts <path-to-health-data.json>",
  );
  process.exit(1);
}

console.log(`\n=== Loading health data from ${dataPath} ===\n`);

let rawData: HealthDataByType;
try {
  const fileContent = readFileSync(dataPath, "utf-8");
  rawData = JSON.parse(fileContent) as HealthDataByType;
} catch (error) {
  console.error(`Failed to load data file: ${error}`);
  process.exit(1);
}

const sleepData = rawData["HKCategoryTypeIdentifierSleepAnalysis"] || [];
console.log(`Raw sleep records: ${sleepData.length}`);

if (sleepData.length === 0) {
  console.log("No sleep data found in file.");
  process.exit(0);
}

console.log("\n=== Processing sleep data ===\n");
const processed = processSleepData(sleepData);

console.log(`Processed daily summaries: ${processed.length}\n`);

// Analyze for duplicates and suspicious durations
const suspiciousDays: Array<{
  date: string;
  duration: number;
  hours: number;
  sessionCount: number;
}> = [];

processed.forEach((day) => {
  const hours = day.sleepDuration / 60;
  if (hours > 12) {
    suspiciousDays.push({
      date: day.date,
      duration: day.sleepDuration,
      hours,
      sessionCount: day.sessions.length,
    });
  }
});

if (suspiciousDays.length > 0) {
  console.log("⚠️  SUSPICIOUS DAYS (>12 hours):");
  suspiciousDays.forEach((day) => {
    console.log(
      `  ${day.date}: ${day.hours.toFixed(1)}h (${day.sessionCount} session${day.sessionCount > 1 ? "s" : ""})`,
    );
  });
  console.log();
} else {
  console.log("✅ No days exceeding 12 hours found.\n");
}

// Check for duplicate dates
const dateCounts = new Map<string, number>();
processed.forEach((day) => {
  dateCounts.set(day.date, (dateCounts.get(day.date) || 0) + 1);
});

const duplicateDates = Array.from(dateCounts.entries()).filter(
  ([, count]) => count > 1,
);

if (duplicateDates.length > 0) {
  console.log("❌ DUPLICATE DATES FOUND:");
  duplicateDates.forEach(([date, count]) => {
    console.log(`  ${date}: ${count} entries`);
  });
  console.log();
} else {
  console.log("✅ No duplicate dates found.\n");
}

// Show sample of processed data
console.log("Sample of processed data (first 10 days):");
processed.slice(0, 10).forEach((day) => {
  const hours = day.sleepDuration / 60;
  console.log(
    `  ${day.date}: ${hours.toFixed(1)}h sleep, ${day.sessions.length} session${day.sessions.length > 1 ? "s" : ""}, efficiency ${day.metrics.sleepEfficiency}%`,
  );
});

console.log("\n=== Test complete ===\n");
