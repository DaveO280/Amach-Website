import { runLegitimacyPipeline } from "../src/pipeline";
import { serializeLeafV2 } from "../src/leaf";
import { buildMerkleTree } from "../src/merkle";
import { generateSeries } from "../src/generator/synthetic";
import { formatJson } from "../src/formatters/json";
import { formatMarkdown } from "../src/formatters/markdown";

function honestInput(days = 30) {
  const out = generateSeries({
    seed: "pipe-honest",
    days,
    vo2maxStart: 32,
    vo2maxEnd: 36
  });
  const sorted = out.leaves.slice().sort((a, b) => a.dayId - b.dayId);
  const root = buildMerkleTree(sorted.map((l) => serializeLeafV2(l))).root;
  return {
    leaves: sorted,
    root,
    walletAddress: "0x" + sorted[0].wallet.toString("hex").slice(0, 40)
  };
}

describe("pipeline integration", () => {
  test("accepts hex-encoded leaves as input", () => {
    const { leaves, root, walletAddress } = honestInput();
    const hex = leaves.map((l) => serializeLeafV2(l).toString("hex"));
    const report = runLegitimacyPipeline({
      walletAddress,
      expectedRoot: "0x" + root.toString(16),
      expectedLeafCount: leaves.length,
      expectedStartDayId: leaves[0].dayId,
      expectedEndDayId: leaves[leaves.length - 1].dayId,
      leaves: hex
    });
    expect(report.recommendation).toBe("pass");
    expect(report.computedRoot).toBe("0x" + root.toString(16));
  });

  test("rehydrates Buffer fields from JSON-friendly representations", () => {
    const { leaves, root, walletAddress } = honestInput(10);
    // Simulate JSON.stringify → JSON.parse round-trip
    const serialized = JSON.parse(
      JSON.stringify({
        leaves,
        root: root.toString(),
        walletAddress
      })
    );
    const report = runLegitimacyPipeline({
      walletAddress,
      expectedRoot: serialized.root,
      leaves: serialized.leaves
    });
    expect(report.computedRoot).toBe("0x" + root.toString(16));
  });

  test("rejects an unrecognised leaf entry", () => {
    expect(() =>
      runLegitimacyPipeline({
        walletAddress: "0xabc",
        expectedRoot: "0x0",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        leaves: [42 as any]
      })
    ).toThrow(/neither/);
  });

  test("formats a markdown report end-to-end", () => {
    const { leaves, root, walletAddress } = honestInput(20);
    const report = runLegitimacyPipeline({
      walletAddress,
      expectedRoot: "0x" + root.toString(16),
      leaves
    });
    const md = formatMarkdown(report);
    expect(md).toContain("Amach Health — Legitimacy Report");
    expect(md).toContain("Executive summary");
    expect(md).toContain("PASS");
  });

  test("formats a JSON report end-to-end and round-trips", () => {
    const { leaves, root, walletAddress } = honestInput(20);
    const report = runLegitimacyPipeline({
      walletAddress,
      expectedRoot: "0x" + root.toString(16),
      leaves
    });
    const js = formatJson(report);
    const parsed = JSON.parse(js);
    expect(parsed.score).toBeCloseTo(report.score);
    expect(parsed.recommendation).toBe(report.recommendation);
  });

  test("uses an injected `now` for deterministic snapshotting", () => {
    const { leaves, root, walletAddress } = honestInput(10);
    const report = runLegitimacyPipeline(
      {
        walletAddress,
        expectedRoot: "0x" + root.toString(16),
        leaves
      },
      { now: () => new Date("2026-05-05T00:00:00Z") }
    );
    expect(report.generatedAt).toBe("2026-05-05T00:00:00.000Z");
  });
});
