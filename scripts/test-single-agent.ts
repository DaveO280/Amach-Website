#!/usr/bin/env tsx
/**
 * Dev script to test a single agent in isolation with timing diagnostics.
 *
 * Usage:
 *   pnpm exec tsx scripts/test-single-agent.ts [agent-name] [data-file.json]
 *
 * Examples:
 *   pnpm exec tsx scripts/test-single-agent.ts sleep
 *   pnpm exec tsx scripts/test-single-agent.ts activity_energy ./health-data-export.json
 *
 * Agent names: sleep, activity_energy, cardiovascular, recovery_stress, dexa, bloodwork
 *
 * Note: For IndexedDB access, use the browser console script:
 *   scripts/export-health-data-browser.js (paste into browser console to export data)
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { VeniceApiService } from "@/api/venice/VeniceApiService";
import { ActivityEnergyAgent } from "@/agents/ActivityEnergyAgent";
import { BaseHealthAgent } from "@/agents/BaseHealthAgent";
import { BloodworkAgent } from "@/agents/BloodworkAgent";
import { CardiovascularAgent } from "@/agents/CardiovascularAgent";
import { DexaAgent } from "@/agents/DexaAgent";
import { RecoveryStressAgent } from "@/agents/RecoveryStressAgent";
import { SleepAgent } from "@/agents/SleepAgent";
import type {
  AgentExecutionContext,
  AppleHealthMetricMap,
  MetricSample,
} from "@/agents/types";
import type { HealthDataByType } from "@/types/healthData";
import { processSleepData } from "@/utils/sleepDataProcessor";

// Load environment variables
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// Parse CLI arguments
const agentName = process.argv[2] || "sleep";
const dataFile = process.argv[3];

// Agent factory
function createAgent(
  name: string,
  veniceService: VeniceApiService,
): BaseHealthAgent {
  switch (name.toLowerCase()) {
    case "sleep":
      return new SleepAgent(veniceService);
    case "activity_energy":
    case "activity":
      return new ActivityEnergyAgent(veniceService);
    case "cardiovascular":
    case "cardio":
      return new CardiovascularAgent(veniceService);
    case "recovery_stress":
    case "recovery":
      return new RecoveryStressAgent(veniceService);
    case "dexa":
      return new DexaAgent(veniceService);
    case "bloodwork":
    case "blood":
      return new BloodworkAgent(veniceService);
    default:
      throw new Error(
        `Unknown agent: ${name}. Valid: sleep, activity_energy, cardiovascular, recovery_stress, dexa, bloodwork`,
      );
  }
}

// Convert HealthDataByType to AppleHealthMetricMap
function convertToAppleHealthMap(
  rawData: HealthDataByType,
): AppleHealthMetricMap {
  const appleHealth: AppleHealthMetricMap = {};
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  for (const [metricId, points] of Object.entries(rawData)) {
    // Special handling for sleep data: convert raw stages to aggregated durations
    if (metricId === "HKCategoryTypeIdentifierSleepAnalysis") {
      console.log(
        `[Data Loader] Processing ${points.length} raw sleep stage records`,
      );

      // Process raw sleep stages into daily aggregated data
      const processedSleepData = processSleepData(points);
      console.log(
        `[Data Loader] Processed into ${processedSleepData.length} daily sleep summaries`,
      );

      // Convert processed daily data into MetricSample format
      // Deduplicate by date to handle any duplicate daily summaries
      const sleepSamplesByDate = new Map<string, MetricSample>();

      for (const dayData of processedSleepData) {
        const timestamp = new Date(dayData.date);
        if (Number.isNaN(timestamp.getTime())) {
          continue;
        }

        // Filter to last 6 months
        if (timestamp < sixMonthsAgo) {
          continue;
        }

        // Use date string as key for deduplication (normalize to YYYY-MM-DD)
        const dateKey = dayData.date;

        // Sleep duration in seconds (agents expect numeric values)
        const durationSeconds = dayData.sleepDuration * 60; // Convert minutes to seconds

        // If we already have data for this date, merge sessions (sum durations)
        const existing = sleepSamplesByDate.get(dateKey);
        if (existing) {
          console.warn(
            `[Data Loader] Duplicate sleep data detected for date ${dateKey}. Merging sessions.`,
            {
              existingDuration: existing.value / 60,
              newDuration: dayData.sleepDuration,
            },
          );
          // Merge: sum durations, recalculate efficiency, combine stages
          const existingDuration = existing.value / 60; // Convert back to minutes
          const mergedDuration = existingDuration + dayData.sleepDuration;
          const existingTotalDuration =
            (existing.metadata?.totalDuration as number) || 0;
          const mergedTotalDuration =
            existingTotalDuration + dayData.totalDuration;

          // Validate merged duration is reasonable (max 24 hours)
          if (mergedDuration > 24 * 60) {
            console.error(
              `[Data Loader] Merged sleep duration exceeds 24h for ${dateKey}: ${mergedDuration} minutes. Using existing value.`,
            );
            continue; // Skip this duplicate, keep existing
          }

          const existingStages =
            (existing.metadata?.stages as {
              core?: number;
              deep?: number;
              rem?: number;
              awake?: number;
            }) || {};

          sleepSamplesByDate.set(dateKey, {
            timestamp,
            value: mergedDuration * 60, // Back to seconds
            unit: "s",
            metadata: {
              efficiency: Math.round(
                (mergedDuration / mergedTotalDuration) * 100,
              ),
              totalDuration: mergedTotalDuration,
              stages: {
                core:
                  (existingStages.core || 0) + (dayData.stageData.core || 0),
                deep:
                  (existingStages.deep || 0) + (dayData.stageData.deep || 0),
                rem: (existingStages.rem || 0) + (dayData.stageData.rem || 0),
                awake:
                  (existingStages.awake || 0) + (dayData.stageData.awake || 0),
              },
              date: dayData.date,
            },
          });
        } else {
          // First entry for this date
          sleepSamplesByDate.set(dateKey, {
            timestamp,
            value: durationSeconds,
            unit: "s",
            metadata: {
              efficiency: dayData.metrics.sleepEfficiency,
              totalDuration: dayData.totalDuration,
              stages: dayData.stageData,
              date: dayData.date,
            },
          });
        }
      }

      const sleepSamples = Array.from(sleepSamplesByDate.values());

      if (sleepSamples.length > 0) {
        appleHealth[metricId] = sleepSamples;
        console.log(
          `[Data Loader] ${metricId}: ${sleepSamples.length} daily sleep samples (last 6 months)`,
        );
      }
      continue;
    }

    // Handle other metrics (steps, heart rate, HRV, etc.)
    const samples: MetricSample[] = [];

    for (const point of points) {
      if (!point || typeof point.startDate !== "string") {
        continue;
      }

      const timestamp = new Date(point.startDate);
      if (Number.isNaN(timestamp.getTime())) {
        continue;
      }

      // Filter to last 6 months
      if (timestamp < sixMonthsAgo) {
        continue;
      }

      const value = parseFloat(point.value);
      if (!Number.isFinite(value)) {
        continue;
      }

      samples.push({
        timestamp,
        value,
        unit: point.unit,
        metadata: {
          source: point.source,
          device: point.device,
          unit: point.unit,
          type: point.type,
          endDate: point.endDate,
        },
      });
    }

    if (samples.length > 0) {
      appleHealth[metricId] = samples;
      console.log(
        `[Data Loader] ${metricId}: ${samples.length} samples (last 6 months)`,
      );
    }
  }

  return appleHealth;
}

// Expand ~ to home directory (works on both Unix and Windows)
function expandPath(filePath: string): string {
  if (filePath.startsWith("~")) {
    const homeDir = os.homedir();
    return path.join(homeDir, filePath.slice(1));
  }
  return filePath;
}

// Load health data
async function loadHealthData(): Promise<AppleHealthMetricMap> {
  if (dataFile) {
    // Expand ~ to home directory and resolve path
    const expandedPath = expandPath(dataFile);
    const filePath = path.resolve(expandedPath);
    if (!fs.existsSync(filePath)) {
      // Try to suggest common locations
      const homeDir = os.homedir();

      let suggestions = `\n  Searched: ${filePath}`;
      suggestions += `\n  (Expanded from: ${dataFile})`;
      suggestions += `\n\n  Common locations to check:`;
      suggestions += `\n    - ${homeDir}\\Downloads\\`;
      suggestions += `\n    - ${homeDir}\\Desktop\\`;
      suggestions += `\n    - ${process.cwd()}\\`;
      suggestions += `\n\n  To export from browser:`;
      suggestions += `\n    1. Open browser console (F12)`;
      suggestions += `\n    2. Paste: scripts/export-health-data-browser.js`;
      suggestions += `\n    3. File will download automatically`;

      throw new Error(`Data file not found: ${filePath}${suggestions}`);
    }

    console.log(`[Data Loader] Loading from: ${filePath}`);
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(fileContent);

    // Handle both direct HealthDataByType and backup format
    let rawData: HealthDataByType;
    if (parsed.healthData) {
      // Backup format: { healthData: {...}, healthContext: {...} }
      rawData = parsed.healthData;
      console.log(
        "[Data Loader] Detected backup format, extracting healthData",
      );
    } else {
      rawData = parsed;
    }

    return convertToAppleHealthMap(rawData);
  } else {
    console.warn("[Data Loader] No data file provided. Using empty dataset.");
    console.warn("[Data Loader] To export data from IndexedDB:");
    console.warn("   1. Open browser console on the app (F12)");
    console.warn(
      "   2. Copy and paste the contents of: scripts/export-health-data-browser.js",
    );
    console.warn(
      "   3. Or run: node scripts/export-health-data-browser.js (if adapted for Node)",
    );
    console.warn("   4. Use the downloaded JSON file with this script");
    return {};
  }
}

// Main execution
async function main() {
  console.log("=".repeat(80));
  console.log(`🧪 Testing Agent: ${agentName}`);
  console.log("=".repeat(80));

  // Check API key
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) {
    throw new Error("VENICE_API_KEY not set. Check .env.local or .env file.");
  }

  // Load health data
  const startLoadTime = Date.now();
  const appleHealth = await loadHealthData();
  const loadTime = Date.now() - startLoadTime;
  console.log(`\n[Data Loader] Loaded in ${loadTime}ms`);
  console.log(
    `[Data Loader] Metrics: ${Object.keys(appleHealth).length} types, ${Object.values(appleHealth).reduce((sum, samples) => sum + samples.length, 0)} total samples`,
  );

  // Create Venice service
  // In Node.js context, if VENICE_API_ENDPOINT is set to a full URL,
  // we need to ensure it includes /chat/completions
  const veniceEndpoint = process.env.VENICE_API_ENDPOINT;
  if (veniceEndpoint && /^https?:\/\//.test(veniceEndpoint)) {
    // If it's a full URL but doesn't include /chat/completions, append it
    if (!veniceEndpoint.includes("/chat/completions")) {
      const url = new URL(veniceEndpoint);
      url.pathname = url.pathname.replace(/\/$/, "") + "/chat/completions";
      process.env.VENICE_API_ENDPOINT = url.toString();
      console.log(
        `[Venice Service] Updated endpoint to include /chat/completions: ${process.env.VENICE_API_ENDPOINT}`,
      );
    }
  } else if (!process.env.VENICE_API_BASE_URL) {
    // Fallback to dev server if no direct API config
    const devServerUrl = "http://localhost:3000";
    console.log(
      `[Venice Service] No VENICE_API_BASE_URL set. Using dev server: ${devServerUrl}`,
    );
    console.log(
      `[Venice Service] ⚠️  Make sure Next.js dev server is running: pnpm dev`,
    );
    process.env.VENICE_API_BASE_URL = devServerUrl;
  }
  const veniceService = VeniceApiService.fromEnv();

  // Create agent
  const agent = createAgent(agentName, veniceService);
  console.log(`\n[Agent] ${agent.name} (${agent.id})`);
  console.log(`[Agent] Expertise: ${agent.expertise.join(", ")}`);

  // Build execution context
  const now = Date.now();
  const sixMonthsAgo = now - 6 * 30 * 24 * 60 * 60 * 1000;

  const context: AgentExecutionContext = {
    query: "Full specialist analysis of the last 6 months of data.",
    timeWindow: {
      start: new Date(sixMonthsAgo),
      end: new Date(now),
    },
    availableData: {
      appleHealth,
      reports: [],
    },
    analysisMode: "initial",
  };

  // Run agent analysis
  console.log("\n" + "=".repeat(80));
  console.log("🚀 Starting Agent Analysis");
  console.log("=".repeat(80));

  const startAnalysisTime = Date.now();
  let insight;

  try {
    insight = await agent.analyze(context);
    const analysisTime = Date.now() - startAnalysisTime;

    console.log("\n" + "=".repeat(80));
    console.log("✅ Analysis Complete");
    console.log("=".repeat(80));
    console.log(`⏱️  Total Time: ${(analysisTime / 1000).toFixed(2)}s`);
    console.log(`📊 Relevance: ${insight.relevance.toFixed(2)}`);
    console.log(`🎯 Confidence: ${insight.confidence.toFixed(2)}`);
    console.log(`📝 Findings: ${insight.findings.length}`);
    console.log(`📈 Trends: ${insight.trends.length}`);
    console.log(`⚠️  Concerns: ${insight.concerns.length}`);
    console.log(`🔗 Correlations: ${insight.correlations.length}`);
    console.log(`💡 Recommendations: ${insight.recommendations.length}`);

    if (insight.dataLimitations.length > 0) {
      console.log(`\n⚠️  Data Limitations:`);
      insight.dataLimitations.forEach((lim) => console.log(`   - ${lim}`));
    }

    if (insight.findings.length > 0) {
      console.log(`\n📝 Sample Findings:`);
      insight.findings.slice(0, 3).forEach((f, i) => {
        console.log(`   ${i + 1}. ${f.observation}`);
        console.log(`      Evidence: ${f.evidence}`);
      });
    }

    // Check if under 50-55s target
    if (analysisTime < 50000) {
      console.log(
        `\n✅ SUCCESS: Under 50s target (${(analysisTime / 1000).toFixed(2)}s)`,
      );
    } else if (analysisTime < 55000) {
      console.log(
        `\n⚠️  WARNING: Close to 55s limit (${(analysisTime / 1000).toFixed(2)}s)`,
      );
    } else {
      console.log(
        `\n❌ FAIL: Exceeded 55s limit (${(analysisTime / 1000).toFixed(2)}s)`,
      );
    }
  } catch (error) {
    const analysisTime = Date.now() - startAnalysisTime;
    console.error("\n" + "=".repeat(80));
    console.error("❌ Analysis Failed");
    console.error("=".repeat(80));
    console.error(
      `⏱️  Time Before Failure: ${(analysisTime / 1000).toFixed(2)}s`,
    );
    console.error(`Error:`, error);
    process.exit(1);
  }

  console.log("\n" + "=".repeat(80));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
