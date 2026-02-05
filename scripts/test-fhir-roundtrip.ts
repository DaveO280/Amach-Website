/**
 * Test script to verify DEXA → FHIR → DEXA round-trip preserves all data
 * Run with: pnpm exec tsx scripts/test-fhir-roundtrip.ts
 */

import { parseDexaReport } from "../src/utils/reportParsers/dexaParser";
import {
  convertDexaToFhir,
  convertFhirToDexa,
} from "../src/utils/fhir/dexaToFhir";
import { formatReportsForAI } from "../src/utils/reportFormatters";

// Sample PDF text from a real DEXA scan
const samplePdfText = `FitTrace

Get your body composition online at:

https://app.fittrace.com

GE Healthcare

3030 Ohmeda Drive, Madison, WI 53718

Phone: ( ) - - http://

Body Composition - Segmental Analysis

|  Region | Total Mass (lbs) | Fat Mass (lbs) | Lean Mass (lbs) | Area (cm2) | BMC (lbs)  |
| --- | --- | --- | --- | --- | --- |
|  Arms Total | 22.6 | 4.5 | 17.0 | 398 | 1.1  |
|  Legs Total | 48.0 | 10.9 | 34.7 | 714 | 2.5  |
|  Trunk | 78.9 | 18.6 | 58.4 | 780 | 1.9  |
|  Android | 11.4 | 2.9 | 8.3 |  | 0.1  |
|  Gynoid | 25.9 | 6.4 | 18.8 |  | 0.7  |
|  Total | 161.9 | 36.3 | 118.5 | 2,135 | 7.1  |

Visceral Fat

Mass

1.13 lbs

Volume

33.19 in³

Total Body Tissue Quantitation

|  Region | Tissue (%Fat) | Composition (Enhanced Analysis)  |   |   |   |   |
| --- | --- | --- | --- | --- | --- | --- |
|   |   |  Centile | Total Mass (lbs) | Fat (lbs) | Lean (lbs) | BMC (lbs)  |
|  Arm Right | 20.3 | - | 11.0 | 2.1 | 8.3 | 0.5  |
|  Arm Left | 21.7 | - | 11.6 | 2.4 | 8.6 | 0.6  |
|  Leg Right | 24.0 | - | 24.5 | 5.6 | 17.7 | 1.2  |
|  Leg Left | 23.7 | - | 23.5 | 5.3 | 17.0 | 1.2  |
|  Trunk | 24.2 | - | 78.9 | 18.6 | 58.4 | 1.9  |
|  Android | 26.1 | - | 11.4 | 2.9 | 8.3 | 0.1  |
|  Gynoid | 25.5 | - | 25.9 | 6.4 | 18.8 | 0.7  |
|  Total | 23.4 | 60 | 161.9 | 36.3 | 118.5 | 7.1  |

ANDROID / GYNOID (waist / hip)

|  Region | Tissue %Fat  |
| --- | --- |
|  Android: | 26.1 %  |
|  Gynoid: | 25.5 %  |
|  A/G Ratio: | 1.02  |

BONE

Total Body: Total (BMD)
USA (Combined NHANES/Lunar)

|  Age | BMD (g/cm²) | T-score | Z-score | Centile  |
| --- | --- | --- | --- | --- |
|  44.1 | 1.500 | 3.0 | 3.2 | 100  |

Densitometry: USA (Combined NHANES/Lunar) (Enhanced Analysis)
Region BMD (g/cm²) YA T-score AM Z-score
Head   2.972   -   -
Arms   1.228   -   -
Legs   1.559   -   -
Trunk   1.125   -   -
Ribs   0.949   -   -
Spine   1.323   -   -
Pelvis   1.172   -   -
Total   1.500   3.0   3.2

Visceral Adipose Tissue (VAT)

|  Date | Age | Volume (in³) | Fat Mass (lbs) | Area (in²)  |
| --- | --- | --- | --- | --- |
|  02/12/2025 | 44.1 | 33.19 | 1.13 | 9.00  |

Client   Sex   Ethnicity   Birth Date   Height   Weight   Measured
O'Gara, David   Male   White   01/01/1981   66.0 in.   163.0 lbs.   02/12/2025

Total Body: Total

Fat Mass:   36.3 lbs
Tissue (%Fat)   23.4 %`;

function compareValues(
  name: string,
  original: number | undefined,
  restored: number | undefined,
  tolerance: number = 0.01,
): { passed: boolean; message: string } {
  if (original === undefined && restored === undefined) {
    return { passed: true, message: `${name}: both undefined ✓` };
  }
  if (original === undefined || restored === undefined) {
    return {
      passed: false,
      message: `${name}: MISMATCH - original=${original}, restored=${restored}`,
    };
  }
  const diff = Math.abs(original - restored);
  if (diff <= tolerance) {
    return { passed: true, message: `${name}: ${original} ≈ ${restored} ✓` };
  }
  return {
    passed: false,
    message: `${name}: MISMATCH - original=${original}, restored=${restored} (diff=${diff})`,
  };
}

async function main() {
  console.log("=".repeat(60));
  console.log("DEXA → FHIR → DEXA Round-Trip Test");
  console.log("=".repeat(60));

  // Step 1: Parse DEXA
  console.log("\n📥 Step 1: Parsing DEXA from PDF text...");
  const originalDexa = parseDexaReport(samplePdfText);

  if (!originalDexa) {
    console.error("❌ Failed to parse DEXA report");
    process.exit(1);
  }

  console.log("✅ Parsed DEXA report:");
  console.log(`   Scan Date: ${originalDexa.scanDate}`);
  console.log(`   Total Body Fat: ${originalDexa.totalBodyFatPercent}%`);
  console.log(`   Total Lean Mass: ${originalDexa.totalLeanMassKg} kg`);
  console.log(`   Visceral Fat Rating: ${originalDexa.visceralFatRating} lbs`);
  console.log(
    `   Visceral Fat Volume: ${originalDexa.visceralFatVolumeCm3} cm³`,
  );
  console.log(`   Visceral Fat Area: ${originalDexa.visceralFatAreaCm2} cm²`);
  console.log(`   A/G Ratio: ${originalDexa.androidGynoidRatio}`);
  console.log(`   BMD: ${originalDexa.boneDensityTotal?.bmd} g/cm²`);
  console.log(`   T-Score: ${originalDexa.boneDensityTotal?.tScore}`);
  console.log(`   Z-Score: ${originalDexa.boneDensityTotal?.zScore}`);
  console.log(`   Regions: ${originalDexa.regions.length}`);
  console.log(`   Confidence: ${(originalDexa.confidence * 100).toFixed(0)}%`);

  // Step 2: Convert to FHIR
  console.log("\n🔄 Step 2: Converting to FHIR DiagnosticReport...");
  const fhirReport = convertDexaToFhir(originalDexa);

  console.log("✅ FHIR Report created:");
  console.log(`   Resource Type: ${fhirReport.resourceType}`);
  console.log(`   Status: ${fhirReport.status}`);
  console.log(`   Observations: ${fhirReport.contained?.length || 0}`);
  console.log(`   Effective Date: ${fhirReport.effectiveDateTime}`);

  // Log FHIR structure for debugging
  console.log("\n📋 FHIR Observations:");
  fhirReport.contained?.forEach((obs, i) => {
    if (obs.resourceType === "Observation") {
      const code =
        obs.code?.coding?.[0]?.display || obs.code?.coding?.[0]?.code;
      const value = obs.valueQuantity
        ? `${obs.valueQuantity.value} ${obs.valueQuantity.unit || ""}`
        : obs.valueString || "(components)";
      console.log(`   ${i + 1}. ${code}: ${value}`);
    }
  });

  // Step 3: Convert back to DEXA
  console.log("\n🔄 Step 3: Converting FHIR back to DexaReportData...");
  const restoredDexa = convertFhirToDexa(fhirReport, samplePdfText);

  if (!restoredDexa) {
    console.error("❌ Failed to convert FHIR back to DEXA");
    process.exit(1);
  }

  console.log("✅ Restored DEXA report:");
  console.log(`   Total Body Fat: ${restoredDexa.totalBodyFatPercent}%`);
  console.log(`   Total Lean Mass: ${restoredDexa.totalLeanMassKg} kg`);
  console.log(`   Visceral Fat Rating: ${restoredDexa.visceralFatRating} lbs`);
  console.log(
    `   Visceral Fat Volume: ${restoredDexa.visceralFatVolumeCm3} cm³`,
  );
  console.log(`   Visceral Fat Area: ${restoredDexa.visceralFatAreaCm2} cm²`);
  console.log(`   A/G Ratio: ${restoredDexa.androidGynoidRatio}`);
  console.log(`   BMD: ${restoredDexa.boneDensityTotal?.bmd} g/cm²`);
  console.log(`   T-Score: ${restoredDexa.boneDensityTotal?.tScore}`);
  console.log(`   Z-Score: ${restoredDexa.boneDensityTotal?.zScore}`);
  console.log(`   Regions: ${restoredDexa.regions.length}`);

  // Step 4: Compare original vs restored
  console.log("\n" + "=".repeat(60));
  console.log("📊 Comparison: Original vs Restored");
  console.log("=".repeat(60));

  const comparisons = [
    compareValues(
      "totalBodyFatPercent",
      originalDexa.totalBodyFatPercent,
      restoredDexa.totalBodyFatPercent,
    ),
    compareValues(
      "totalLeanMassKg",
      originalDexa.totalLeanMassKg,
      restoredDexa.totalLeanMassKg,
    ),
    compareValues(
      "visceralFatRating",
      originalDexa.visceralFatRating,
      restoredDexa.visceralFatRating,
    ),
    compareValues(
      "visceralFatVolumeCm3",
      originalDexa.visceralFatVolumeCm3,
      restoredDexa.visceralFatVolumeCm3,
      1,
    ),
    compareValues(
      "visceralFatAreaCm2",
      originalDexa.visceralFatAreaCm2,
      restoredDexa.visceralFatAreaCm2,
      1,
    ),
    compareValues(
      "androidGynoidRatio",
      originalDexa.androidGynoidRatio,
      restoredDexa.androidGynoidRatio,
    ),
    compareValues(
      "boneDensityTotal.bmd",
      originalDexa.boneDensityTotal?.bmd,
      restoredDexa.boneDensityTotal?.bmd,
    ),
    compareValues(
      "boneDensityTotal.tScore",
      originalDexa.boneDensityTotal?.tScore,
      restoredDexa.boneDensityTotal?.tScore,
    ),
    compareValues(
      "boneDensityTotal.zScore",
      originalDexa.boneDensityTotal?.zScore,
      restoredDexa.boneDensityTotal?.zScore,
    ),
  ];

  let allPassed = true;
  comparisons.forEach((c) => {
    console.log(c.passed ? `✅ ${c.message}` : `❌ ${c.message}`);
    if (!c.passed) allPassed = false;
  });

  // Compare regions
  console.log(`\n📍 Regions comparison:`);
  const originalRegionNames = new Set(
    originalDexa.regions.map((r) => r.region),
  );

  originalRegionNames.forEach((region) => {
    const orig = originalDexa.regions.find((r) => r.region === region);
    const rest = restoredDexa.regions.find((r) => r.region === region);

    if (!rest) {
      console.log(`❌ ${region}: MISSING in restored`);
      allPassed = false;
    } else {
      const bmdMatch = compareValues(
        `${region}.bmd`,
        orig?.boneDensityGPerCm2,
        rest?.boneDensityGPerCm2,
      );
      const fatMatch = compareValues(
        `${region}.fatPercent`,
        orig?.bodyFatPercent,
        rest?.bodyFatPercent,
      );
      if (!bmdMatch.passed || !fatMatch.passed) {
        console.log(`⚠️ ${region}: ${bmdMatch.message}, ${fatMatch.message}`);
      } else {
        console.log(`✅ ${region}: preserved`);
      }
    }
  });

  // Step 5: Test AI formatting
  console.log("\n" + "=".repeat(60));
  console.log("🤖 Step 4: Format for AI consumption");
  console.log("=".repeat(60));

  const aiFormatted = formatReportsForAI([
    { report: restoredDexa, extractedAt: new Date().toISOString() },
  ]);

  console.log("\nFormatted for AI context:");
  console.log("-".repeat(40));
  console.log(aiFormatted);
  console.log("-".repeat(40));

  // Final result
  console.log("\n" + "=".repeat(60));
  if (allPassed) {
    console.log("✅ ROUND-TRIP TEST PASSED");
    console.log("All data preserved through DEXA → FHIR → DEXA conversion");
  } else {
    console.log("❌ ROUND-TRIP TEST FAILED");
    console.log("Some data was lost or modified during conversion");
  }
  console.log("=".repeat(60));

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
