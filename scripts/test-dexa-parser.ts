/**
 * Test script to verify DEXA regex parser extracts all required data
 * Run with: pnpm exec tsx scripts/test-dexa-parser.ts
 */

import { parseDexaReport } from "../src/utils/reportParsers/dexaParser";

// Sample PDF text from the user's example
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

async function main() {
  console.log("[Test] Testing DEXA regex parser with sample PDF text...\n");

  const result = parseDexaReport(samplePdfText);

  if (!result) {
    console.error("❌ Parser returned null");
    process.exit(1);
  }

  console.log("✅ Parser returned result\n");
  console.log("Extracted Data:");
  console.log(`- Scan Date: ${result.scanDate || "NOT FOUND"}`);
  console.log(
    `- Total Body Fat: ${result.totalBodyFatPercent || "NOT FOUND"}%`,
  );
  console.log(`- Total Lean Mass: ${result.totalLeanMassKg || "NOT FOUND"} kg`);
  console.log(
    `- Visceral Fat Rating: ${result.visceralFatRating || "NOT FOUND"}`,
  );
  console.log(
    `- Visceral Fat Volume: ${result.visceralFatVolumeCm3 || "NOT FOUND"} cm³`,
  );
  console.log(
    `- Visceral Fat Area: ${result.visceralFatAreaCm2 || "NOT FOUND"} cm²`,
  );
  console.log(`- A/G Ratio: ${result.androidGynoidRatio || "NOT FOUND"}`);
  console.log(`- BMD: ${result.boneDensityTotal?.bmd || "NOT FOUND"} g/cm²`);
  console.log(`- T-Score: ${result.boneDensityTotal?.tScore || "NOT FOUND"}`);
  console.log(`- Z-Score: ${result.boneDensityTotal?.zScore || "NOT FOUND"}`);
  console.log(`- Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  console.log(`- Regions: ${result.regions?.length || 0}\n`);

  if (result.regions && result.regions.length > 0) {
    console.log("Regional Analysis:");
    result.regions.forEach((region) => {
      console.log(`\n${region.region}:`);
      if (region.bodyFatPercent !== undefined) {
        console.log(`  Fat %: ${region.bodyFatPercent}%`);
      }
      if (region.leanMassKg !== undefined) {
        console.log(`  Lean Mass: ${region.leanMassKg} kg`);
      }
      if (region.fatMassKg !== undefined) {
        console.log(`  Fat Mass: ${region.fatMassKg} kg`);
      }
      if (region.boneDensityGPerCm2 !== undefined) {
        console.log(`  BMD: ${region.boneDensityGPerCm2} g/cm²`);
      }
      if (region.tScore !== undefined) {
        console.log(`  T-Score: ${region.tScore}`);
      }
      if (region.zScore !== undefined) {
        console.log(`  Z-Score: ${region.zScore}`);
      }
    });
  }

  // Verify all required fields
  const requiredFields = {
    totalBodyFatPercent: result.totalBodyFatPercent !== undefined,
    totalLeanMassKg: result.totalLeanMassKg !== undefined,
    visceralFatRating: result.visceralFatRating !== undefined,
    visceralFatVolumeCm3: result.visceralFatVolumeCm3 !== undefined,
    visceralFatAreaCm2: result.visceralFatAreaCm2 !== undefined,
    androidGynoidRatio: result.androidGynoidRatio !== undefined,
    bmd: result.boneDensityTotal?.bmd !== undefined,
    tScore: result.boneDensityTotal?.tScore !== undefined,
    zScore: result.boneDensityTotal?.zScore !== undefined,
    regions: result.regions && result.regions.length >= 6, // Should have at least 6 regions
  };

  console.log("\n\nRequired Fields Check:");
  let allPassed = true;
  for (const [field, passed] of Object.entries(requiredFields)) {
    const status = passed ? "✅" : "❌";
    console.log(`${status} ${field}`);
    if (!passed) allPassed = false;
  }

  if (allPassed) {
    console.log("\n✅ All required fields extracted successfully!");
    process.exit(0);
  } else {
    console.log("\n❌ Some required fields are missing");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
