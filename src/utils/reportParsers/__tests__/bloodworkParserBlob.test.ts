import { parseBloodworkReport } from "@/utils/reportParsers/bloodworkParser";

describe("bloodworkParser (blob fallback)", () => {
  test("extracts Quest-style metrics from collapsed PDF text", () => {
    // Intentionally keep everything on ONE very long line (common PDF text extraction),
    // so the line-based parser skips it and the blob fallback is exercised.
    const blobLine =
      `Result   Value   Reference Range   Lab ` +
      `CHOLESTEROL, TOTAL   237 H  05/26/25  <200 mg/dL   Z4M  ` +
      `TRIGLYCERIDES   87  05/26/25  <150 mg/dL   Z4M  ` +
      `TSH   1.71  05/26/25  0.40-4.50 mIU/L   NL1  ` +
      `VITAMIN D, 25-OH, D3   46  05/26/25  ng/mL   AMD  ` +
      `BUN/CREATININE RATIO   SEE NOTE:  05/26/25  6-22 (calc)   NL1  ` +
      `We advise having your results reviewed by a licensed medical healthcare professional for proper interpretation of your results. `.repeat(
        8,
      );

    const raw = `Page 1:\n${blobLine}`;

    const report = parseBloodworkReport(raw);
    expect(report).not.toBeNull();
    expect(report?.metrics.length).toBeGreaterThanOrEqual(4);

    const names = (report?.metrics ?? []).map((m) => m.name);
    expect(names).toContain("CHOLESTEROL, TOTAL");
    expect(names).toContain("TRIGLYCERIDES");
    expect(names).toContain("TSH");
    expect(names).toContain("VITAMIN D, 25-OH, D3");
  });
});
