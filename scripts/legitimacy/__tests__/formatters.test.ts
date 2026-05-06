import { formatJson } from "../src/formatters/json";
import { formatMarkdown } from "../src/formatters/markdown";
import type { LegitimacyReport } from "../src/types";

const REPORT: LegitimacyReport = {
  version: "0.1.0",
  generatedAt: "2026-05-05T00:00:00.000Z",
  network: "zksync-sepolia",
  walletAddress: "0xabc",
  expectedRoot: "0x1234",
  computedRoot: "0x1234",
  leafCount: 90,
  dayRange: { startDayId: 19000, endDayId: 19089 },
  categories: [
    {
      category: "A",
      status: "pass",
      checks: [
        { id: "A.1", category: "A", name: "Merkle root match", status: "pass", message: "ok" }
      ]
    },
    {
      category: "B",
      status: "warn",
      checks: [
        {
          id: "B.1.steps",
          category: "B",
          name: "steps mean",
          status: "warn",
          message: "warn message",
          value: 5000,
          bound: "1500–30000"
        }
      ]
    },
    {
      category: "F",
      status: "pass",
      checks: [
        { id: "F.1", category: "F", name: "Aggregate", status: "pass", message: "0.95" }
      ]
    }
  ],
  score: 0.95,
  threshold: 0.7,
  recommendation: "pass",
  failures: [],
  warnings: ["[B.1.steps] warn message"],
  notes: ["sample note"]
};

const FAIL_REPORT: LegitimacyReport = {
  ...REPORT,
  recommendation: "fail",
  score: 0.5,
  failures: ["[C.1] failure message"],
  warnings: [],
  categories: [
    ...REPORT.categories,
    {
      category: "C",
      status: "fail",
      checks: [
        { id: "C.1", category: "C", name: "RHR-HRV", status: "fail", message: "failure | with pipe" }
      ]
    }
  ]
};

describe("formatters — JSON", () => {
  test("emits stable, parseable JSON", () => {
    const s = formatJson(REPORT);
    const parsed = JSON.parse(s);
    expect(parsed.score).toBe(0.95);
    expect(parsed.recommendation).toBe("pass");
  });
});

describe("formatters — Markdown", () => {
  test("contains the executive summary, root, and recommendation", () => {
    const md = formatMarkdown(REPORT);
    expect(md).toContain("# Amach Health — Legitimacy Report");
    expect(md).toContain("Executive summary");
    expect(md).toContain("zksync-sepolia");
    expect(md).toContain("0x1234");
    expect(md).toContain("PASS");
  });

  test("renders findings section when failures are present", () => {
    const md = formatMarkdown(FAIL_REPORT);
    expect(md).toContain("Failures (1)");
    expect(md).toContain("[C.1]");
  });

  test("renders 'no findings' when both lists are empty", () => {
    const md = formatMarkdown({ ...REPORT, warnings: [], failures: [] });
    expect(md).toContain("No findings. All checks passed.");
  });

  test("escapes pipe characters in cell content", () => {
    const md = formatMarkdown(FAIL_REPORT);
    // The failure message contains `|` — it must appear as `\|` in the table row.
    expect(md).toMatch(/failure \\\| with pipe/);
  });
});
