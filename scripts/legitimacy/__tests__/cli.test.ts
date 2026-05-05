import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { runCli } from "../src/cli";
import { serializeLeafV2 } from "../src/leaf";
import { buildMerkleTree } from "../src/merkle";
import { generateSeries } from "../src/generator/synthetic";

async function tmpFile(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return path.join(dir, "input.json");
}

async function writeHonestFixture(): Promise<{ path: string; root: string }> {
  const out = generateSeries({
    seed: "cli-honest",
    days: 30,
    vo2maxStart: 32,
    vo2maxEnd: 36
  });
  const sorted = out.leaves.slice().sort((a, b) => a.dayId - b.dayId);
  const root = buildMerkleTree(sorted.map((l) => serializeLeafV2(l))).root;
  const fp = await tmpFile("amach-legit-");
  await fs.writeFile(
    fp,
    JSON.stringify({
      walletAddress: "0x" + sorted[0].wallet.toString("hex").slice(0, 40),
      expectedRoot: "0x" + root.toString(16),
      expectedLeafCount: sorted.length,
      expectedStartDayId: sorted[0].dayId,
      expectedEndDayId: sorted[sorted.length - 1].dayId,
      leaves: sorted.map((l) => serializeLeafV2(l).toString("hex"))
    }),
    "utf8"
  );
  return { path: fp, root: "0x" + root.toString(16) };
}

describe("CLI", () => {
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  test("--help prints usage and exits 0", async () => {
    const code = await runCli(["--help"]);
    expect(code).toBe(0);
    const out = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    expect(out).toContain("amach-legitimacy-check");
  });

  test("missing --data exits with non-zero code", async () => {
    const code = await runCli([]);
    expect(code).not.toBe(0);
  });

  test("rejects --leaf-version 1", async () => {
    const code = await runCli(["--data", "/tmp/nope.json", "--leaf-version", "1"]);
    expect(code).not.toBe(0);
    expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toMatch(
      /v2 only|leaf-version 1/
    );
  });

  test("rejects unknown flag", async () => {
    const code = await runCli(["--bogus"]);
    expect(code).toBe(2);
  });

  test("rejects invalid --format", async () => {
    const code = await runCli([
      "--data",
      "/tmp/nope.json",
      "--format",
      "xml"
    ]);
    expect(code).toBe(2);
  });

  test("happy path: honest data with markdown output writes a file", async () => {
    const { path: input, root } = await writeHonestFixture();
    const outPath = path.join(path.dirname(input), "report.md");
    const code = await runCli([
      "--data",
      input,
      "--output",
      outPath,
      "--format",
      "markdown",
      "--root",
      root,
      "--network",
      "test"
    ]);
    expect(code).toBe(0);
    const md = await fs.readFile(outPath, "utf8");
    expect(md).toContain("Recommendation:**");
    expect(md).toContain("PASS");
  });

  test("--format both writes both .md and .json siblings", async () => {
    const { path: input } = await writeHonestFixture();
    const outBase = path.join(path.dirname(input), "report.md");
    const code = await runCli([
      "--data",
      input,
      "--output",
      outBase,
      "--format",
      "both"
    ]);
    expect(code).toBe(0);
    const md = await fs.readFile(
      path.join(path.dirname(outBase), "report.md"),
      "utf8"
    );
    const js = await fs.readFile(
      path.join(path.dirname(outBase), "report.json"),
      "utf8"
    );
    expect(md).toContain("Amach Health");
    expect(JSON.parse(js).recommendation).toBe("pass");
  });

  test("nonexistent data file exits with non-zero", async () => {
    const code = await runCli(["--data", "/tmp/definitely-missing-xyz.json"]);
    expect(code).not.toBe(0);
  });

  test("malformed JSON exits with non-zero", async () => {
    const fp = await tmpFile("amach-legit-bad-");
    await fs.writeFile(fp, "{not json", "utf8");
    const code = await runCli(["--data", fp]);
    expect(code).not.toBe(0);
  });
});
