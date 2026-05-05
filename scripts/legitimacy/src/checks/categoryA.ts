/**
 * Category A — Cryptographic anchoring.
 *
 * If A fails, the rest of the script is meaningless: we'd be analyzing data
 * that wasn't actually committed. The pipeline halts here and reports.
 *
 *   A.1 Merkle root match
 *   A.2 Day count match
 *   A.3 Date range match (startDayId / endDayId)
 *   A.4 Leaf envelope integrity (version, leafType, schemaVersion)
 */

import type { CheckResult } from "../types";
import type { AmachLeafV2 } from "../types";
import { buildMerkleTree } from "../merkle";
import { serializeLeafV2, validateLeafEnvelopeV2 } from "../leaf";

export interface CategoryAInput {
  leaves: AmachLeafV2[];
  expectedRoot: bigint;
  expectedRootHex: string;
  expectedLeafCount?: number;
  expectedStartDayId?: number;
  expectedEndDayId?: number;
}

export interface CategoryAOutput {
  results: CheckResult[];
  computedRoot: bigint | null;
  computedRootHex: string | null;
  /** True only if every Category A check passed. */
  allPass: boolean;
  startDayId: number | null;
  endDayId: number | null;
}

export function runCategoryA(input: CategoryAInput): CategoryAOutput {
  const results: CheckResult[] = [];

  // A.4 — leaf envelopes are checked first, before we do any expensive
  // hashing. If a leaf has the wrong version we shouldn't be reconstructing
  // the tree from it.
  const envelopeProblems: string[] = [];
  for (let i = 0; i < input.leaves.length; i++) {
    const err = validateLeafEnvelopeV2(input.leaves[i]);
    if (err) envelopeProblems.push(`leaf #${i}: ${err}`);
  }
  results.push({
    id: "A.4",
    category: "A",
    name: "Leaf envelope integrity (version 0x02 / leafType 0x00 / schemaVersion 0x01)",
    status: envelopeProblems.length === 0 ? "pass" : "fail",
    message:
      envelopeProblems.length === 0
        ? `All ${input.leaves.length} leaves carry the v2.0 daily_summary envelope.`
        : `Envelope problems: ${envelopeProblems.slice(0, 3).join("; ")}${
            envelopeProblems.length > 3
              ? ` (+ ${envelopeProblems.length - 3} more)`
              : ""
          }`,
    value: envelopeProblems.length,
    bound: "0",
    weight: 1.0
  });

  // A.2 — leaf count
  const countOk =
    input.expectedLeafCount === undefined ||
    input.leaves.length === input.expectedLeafCount;
  results.push({
    id: "A.2",
    category: "A",
    name: "Day count match",
    status: countOk ? "pass" : "fail",
    message:
      input.expectedLeafCount === undefined
        ? `expectedLeafCount not provided; observed ${input.leaves.length}.`
        : countOk
          ? `Observed ${input.leaves.length} leaves matches the on-chain commitment.`
          : `Observed ${input.leaves.length} leaves; on-chain commitment was ${input.expectedLeafCount}.`,
    value: input.leaves.length,
    bound: input.expectedLeafCount?.toString() ?? "(unspecified)",
    weight: 1.0
  });

  // A.3 — date range. Compute observed start/end from leaf data.
  let startDayId: number | null = null;
  let endDayId: number | null = null;
  if (input.leaves.length > 0) {
    startDayId = input.leaves[0].dayId;
    endDayId = input.leaves[0].dayId;
    for (const l of input.leaves) {
      if (l.dayId < startDayId) startDayId = l.dayId;
      if (l.dayId > endDayId) endDayId = l.dayId;
    }
  }
  const startOk =
    input.expectedStartDayId === undefined ||
    startDayId === input.expectedStartDayId;
  const endOk =
    input.expectedEndDayId === undefined || endDayId === input.expectedEndDayId;
  const rangeStatus = startOk && endOk ? "pass" : "fail";
  results.push({
    id: "A.3",
    category: "A",
    name: "Date range match",
    status: rangeStatus,
    message:
      input.expectedStartDayId === undefined &&
      input.expectedEndDayId === undefined
        ? `Range not specified; observed [${startDayId}, ${endDayId}].`
        : startOk && endOk
          ? `Date range [${startDayId}, ${endDayId}] matches the on-chain commitment.`
          : `Date range mismatch — observed [${startDayId}, ${endDayId}], expected [${
              input.expectedStartDayId ?? "?"
            }, ${input.expectedEndDayId ?? "?"}].`,
    value: `${startDayId}-${endDayId}`,
    bound: `${input.expectedStartDayId ?? "?"}-${
      input.expectedEndDayId ?? "?"
    }`,
    weight: 1.0
  });

  // A.1 — Merkle root match. Always last in this output so failure messages
  // surface the root mismatch alongside any envelope/range issues. The tree
  // must be built from the leaves in the order the participant supplied,
  // matching how iOS commits the tree (sorted ascending by dayId at the
  // normalization layer).
  let computedRoot: bigint | null = null;
  let computedRootHex: string | null = null;
  let rootMessage = "";
  let rootStatus: "pass" | "fail" = "fail";

  if (envelopeProblems.length > 0) {
    rootMessage =
      "Skipped — leaf envelope failures make root reconstruction meaningless.";
  } else if (input.leaves.length === 0) {
    rootMessage = "Skipped — empty leaf set.";
  } else {
    try {
      // Sort by dayId so the participant cannot reorder the input to make
      // a different tree. (Real commits are sorted at normalization time;
      // this guards against tampering at the legitimacy boundary.)
      const ordered = input.leaves.slice().sort((a, b) => a.dayId - b.dayId);
      const tree = buildMerkleTree(ordered.map((l) => serializeLeafV2(l)));
      computedRoot = tree.root;
      computedRootHex = "0x" + tree.root.toString(16);
      if (computedRoot === input.expectedRoot) {
        rootStatus = "pass";
        rootMessage = `Reconstructed root matches the on-chain commitment (${computedRootHex}).`;
      } else {
        rootMessage = `Reconstructed root ${computedRootHex} does not match on-chain ${input.expectedRootHex}.`;
      }
    } catch (e) {
      rootMessage = `Tree reconstruction failed: ${(e as Error).message}`;
    }
  }

  results.push({
    id: "A.1",
    category: "A",
    name: "Merkle root match",
    status: rootStatus,
    message: rootMessage,
    value: computedRootHex,
    bound: input.expectedRootHex,
    weight: 1.0
  });

  return {
    results,
    computedRoot,
    computedRootHex,
    allPass: results.every((r) => r.status === "pass"),
    startDayId,
    endDayId
  };
}
