/**
 * Quick test to verify BMD promotion fix
 */
import { parseHealthReport } from "../src/utils/reportParsers";

const testRawText = `
Total Body: Total (BMD)
Age   BMD (g/cm²)   T-score   Z-score   Centile
44.1   1.500   3.0   3.2   100

Densitometry: USA (Combined NHANES/Lunar) (Enhanced Analysis)
Region BMD (g/cm²) YA T-score AM Z-score
Arms   1.228   -   -
Legs   1.559   -   -
Trunk   1.125   -   -
Total   1.500   3.0   3.2

Body Composition
Total Body Fat: 23.4%
Lean Mass: 118.5 lbs
A/G Ratio: 1.02
Android %Fat: 26.1
Gynoid %Fat: 25.5

Visceral Fat
Mass: 1.13 lbs
Volume: 33.19 in³
Area: 9.00 in²
`;

async function test() {
  console.log("🧪 Testing BMD promotion fix...\n");

  const results = await parseHealthReport(testRawText, {
    inferredType: "dexa",
    sourceName: "test-bmd-fix.pdf",
  });

  if (results.length === 0) {
    console.log("❌ No report parsed!");
    process.exit(1);
  }

  const report = results[0].report;

  if (report.type !== "dexa") {
    console.log("❌ Not a DEXA report!");
    process.exit(1);
  }

  console.log("📊 Parsed DEXA Report:");
  console.log(`   Total Body Fat: ${report.totalBodyFatPercent}%`);
  console.log(`   Lean Mass: ${report.totalLeanMassKg} kg`);
  console.log(`   A/G Ratio: ${report.androidGynoidRatio}`);
  console.log("");
  console.log("🦴 Bone Density Total:");
  console.log(`   BMD: ${report.boneDensityTotal?.bmd} g/cm²`);
  console.log(`   T-Score: ${report.boneDensityTotal?.tScore}`);
  console.log(`   Z-Score: ${report.boneDensityTotal?.zScore}`);
  console.log("");
  console.log("📍 Regions with BMD:");
  report.regions?.forEach((r) => {
    if (r.boneDensityGPerCm2) {
      console.log(`   ${r.region}: ${r.boneDensityGPerCm2} g/cm²`);
    }
  });

  // Verify the fix
  console.log("\n" + "=".repeat(50));
  if (report.boneDensityTotal?.bmd !== undefined) {
    console.log(
      `✅ BMD PROMOTION WORKING: boneDensityTotal.bmd = ${report.boneDensityTotal.bmd}`,
    );
  } else {
    console.log("❌ BMD PROMOTION FAILED: boneDensityTotal.bmd is undefined!");

    // Check if it's in regions
    const totalRegion = report.regions?.find((r) => r.region === "total");
    if (totalRegion?.boneDensityGPerCm2) {
      console.log(
        `   (Found in regions.total: ${totalRegion.boneDensityGPerCm2} - promotion not working)`,
      );
    }
    process.exit(1);
  }
}

test().catch(console.error);
