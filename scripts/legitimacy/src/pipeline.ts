/**
 * Legitimacy pipeline — runs Category A → B → C → D → E → F over an input
 * bundle and produces the final report. Halts after Category A if
 * cryptographic anchoring failed (the rest of the report would describe
 * data that wasn't actually committed).
 */

import type {
  CheckResult,
  LegitimacyConfig,
  LegitimacyReport,
  ParticipantInput
} from "./types";
import type { AmachLeafV2 } from "./types";

import { runCategoryA } from "./checks/categoryA";
import { runCategoryB } from "./checks/categoryB";
import { runCategoryC } from "./checks/categoryC";
import { runCategoryD } from "./checks/categoryD";
import { runCategoryE } from "./checks/categoryE";
import { score } from "./checks/categoryF";
import { DEFAULT_CONFIG } from "./config";
import { deserializeLeafV2 } from "./leaf";
import { parseRoot } from "./merkle";

const PACKAGE_VERSION = "0.1.0";

export interface PipelineOptions {
  config?: LegitimacyConfig;
  /** Override the wall-clock timestamp for deterministic test snapshots. */
  now?: () => Date;
}

/**
 * Run the full legitimacy pipeline. The returned report can be passed
 * straight to the JSON or Markdown formatter — the formatters do not do
 * any further computation.
 */
export function runLegitimacyPipeline(
  input: ParticipantInput,
  options: PipelineOptions = {}
): LegitimacyReport {
  const config = options.config ?? DEFAULT_CONFIG;
  const now = options.now ?? (() => new Date());

  const leaves = decodeLeaves(input.leaves);
  const expected = parseRoot(input.expectedRoot);

  const allResults: CheckResult[] = [];

  // Category A — gating
  const a = runCategoryA({
    leaves,
    expectedRoot: expected.value,
    expectedRootHex: expected.hex,
    expectedLeafCount: input.expectedLeafCount,
    expectedStartDayId: input.expectedStartDayId,
    expectedEndDayId: input.expectedEndDayId
  });
  allResults.push(...a.results);
  const categoryAFailed = !a.allPass;

  // Categories B–E run only when cryptographic anchoring succeeded. If A
  // failed we still surface those results in the report so the operator
  // can see _why_ the data was rejected.
  if (!categoryAFailed) {
    allResults.push(...runCategoryB(leaves, config));
    allResults.push(...runCategoryC(leaves, config));
    allResults.push(
      ...runCategoryD(leaves, config, input.commitTimestamps)
    );
    allResults.push(...runCategoryE(leaves, config));
  }

  // Category F — scoring
  const scored = score(allResults, config, categoryAFailed);

  return {
    version: PACKAGE_VERSION,
    generatedAt: now().toISOString(),
    network: input.network ?? null,
    walletAddress: input.walletAddress,
    expectedRoot: expected.hex,
    computedRoot: a.computedRootHex,
    leafCount: leaves.length,
    dayRange: { startDayId: a.startDayId, endDayId: a.endDayId },
    categories: scored.categories,
    score: scored.score,
    threshold: scored.threshold,
    recommendation: scored.recommendation,
    failures: scored.failures,
    warnings: scored.warnings,
    notes: scored.notes
  };
}

function decodeLeaves(input: Array<AmachLeafV2 | string>): AmachLeafV2[] {
  return input.map((entry, i) => {
    if (typeof entry === "string") {
      const buf = Buffer.from(entry.replace(/^0x/, ""), "hex");
      return deserializeLeafV2(buf);
    }
    if (typeof entry === "object" && entry !== null && "version" in entry) {
      return rehydrateBuffers(entry);
    }
    throw new Error(
      `decodeLeaves: leaf #${i} is neither a hex string nor a structured AmachLeafV2 object.`
    );
  });
}

/**
 * When leaves arrive from JSON.parse, Buffer fields come back as plain
 * objects (e.g. `{ type: "Buffer", data: [..] }`) or hex strings. Normalize
 * them to real Buffers so downstream code can use Buffer methods.
 */
function rehydrateBuffers(leaf: AmachLeafV2): AmachLeafV2 {
  return {
    ...leaf,
    wallet: toBuffer(leaf.wallet, 32, "wallet"),
    reservedPayload: toBuffer(leaf.reservedPayload, 12, "reservedPayload"),
    sourceHash: toBuffer(leaf.sourceHash, 32, "sourceHash")
  };
}

function toBuffer(
  raw: unknown,
  expectedLength: number,
  fieldName: string
): Buffer {
  if (Buffer.isBuffer(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    const stripped = raw.startsWith("0x") || raw.startsWith("0X") ? raw.slice(2) : raw;
    const buf = Buffer.from(stripped, "hex");
    if (buf.length !== expectedLength) {
      throw new Error(
        `${fieldName}: hex string decodes to ${buf.length} bytes, expected ${expectedLength}.`
      );
    }
    return buf;
  }
  if (raw && typeof raw === "object") {
    const r = raw as { type?: string; data?: number[] };
    if (r.type === "Buffer" && Array.isArray(r.data)) {
      const buf = Buffer.from(r.data);
      if (buf.length !== expectedLength) {
        throw new Error(
          `${fieldName}: JSON Buffer decodes to ${buf.length} bytes, expected ${expectedLength}.`
        );
      }
      return buf;
    }
    if (Array.isArray((raw as unknown[])[0]) || ArrayBuffer.isView(raw as ArrayBufferView)) {
      const buf = Buffer.from(raw as ArrayBufferLike);
      if (buf.length !== expectedLength) {
        throw new Error(
          `${fieldName}: ArrayBuffer view decodes to ${buf.length} bytes, expected ${expectedLength}.`
        );
      }
      return buf;
    }
  }
  throw new Error(`${fieldName}: cannot coerce ${typeof raw} to Buffer.`);
}
