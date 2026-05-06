import { runCategoryA } from "../../src/checks/categoryA";
import { buildLeafV2, serializeLeafV2 } from "../../src/leaf";
import { buildMerkleTree } from "../../src/merkle";

function someLeaves(count: number = 5) {
  return Array.from({ length: count }, (_, i) =>
    buildLeafV2({ dayId: 19000 + i })
  );
}

function rootOf(leaves: ReturnType<typeof someLeaves>): bigint {
  return buildMerkleTree(leaves.map((l) => serializeLeafV2(l))).root;
}

describe("Category A — cryptographic anchoring", () => {
  test("passes when root, count, and range match", () => {
    const leaves = someLeaves(5);
    const root = rootOf(leaves);
    const out = runCategoryA({
      leaves,
      expectedRoot: root,
      expectedRootHex: "0x" + root.toString(16),
      expectedLeafCount: 5,
      expectedStartDayId: 19000,
      expectedEndDayId: 19004
    });
    expect(out.allPass).toBe(true);
    expect(out.computedRoot).toBe(root);
    expect(out.startDayId).toBe(19000);
    expect(out.endDayId).toBe(19004);
  });

  test("fails when computed root mismatches", () => {
    const leaves = someLeaves(4);
    const out = runCategoryA({
      leaves,
      expectedRoot: 0xdeadbeefn,
      expectedRootHex: "0xdeadbeef",
      expectedLeafCount: 4,
      expectedStartDayId: 19000,
      expectedEndDayId: 19003
    });
    expect(out.allPass).toBe(false);
    const a1 = out.results.find((r) => r.id === "A.1")!;
    expect(a1.status).toBe("fail");
  });

  test("fails when leaf count mismatches expected", () => {
    const leaves = someLeaves(4);
    const root = rootOf(leaves);
    const out = runCategoryA({
      leaves,
      expectedRoot: root,
      expectedRootHex: "0x" + root.toString(16),
      expectedLeafCount: 99
    });
    expect(out.results.find((r) => r.id === "A.2")!.status).toBe("fail");
  });

  test("fails when date range mismatches", () => {
    const leaves = someLeaves(4);
    const root = rootOf(leaves);
    const out = runCategoryA({
      leaves,
      expectedRoot: root,
      expectedRootHex: "0x" + root.toString(16),
      expectedStartDayId: 1
    });
    expect(out.results.find((r) => r.id === "A.3")!.status).toBe("fail");
  });

  test("fails when an envelope is malformed", () => {
    const leaves = someLeaves(3);
    // Compute the honest root *before* tampering, then introduce an
    // envelope error. The check should report the envelope failure and
    // skip Merkle reconstruction.
    const root = rootOf(leaves);
    leaves[1].version = 0x03;
    const out = runCategoryA({
      leaves,
      expectedRoot: root,
      expectedRootHex: "0x" + root.toString(16)
    });
    expect(out.results.find((r) => r.id === "A.4")!.status).toBe("fail");
    const a1 = out.results.find((r) => r.id === "A.1")!;
    expect(a1.status).toBe("fail");
    expect(a1.message).toMatch(/Skipped|envelope/i);
  });

  test("handles empty leaf set without crashing", () => {
    const out = runCategoryA({
      leaves: [],
      expectedRoot: 0n,
      expectedRootHex: "0x0"
    });
    expect(out.allPass).toBe(false);
    expect(out.startDayId).toBeNull();
  });

  test("does not require expected count / range when omitted", () => {
    const leaves = someLeaves(3);
    const root = rootOf(leaves);
    const out = runCategoryA({
      leaves,
      expectedRoot: root,
      expectedRootHex: "0x" + root.toString(16)
    });
    // A.2 / A.3 should pass with informational-only messages.
    expect(out.results.find((r) => r.id === "A.2")!.status).toBe("pass");
    expect(out.results.find((r) => r.id === "A.3")!.status).toBe("pass");
  });

  test("sorts unordered leaves before reconstruction", () => {
    const leaves = someLeaves(5);
    const expectedRoot = rootOf(leaves);
    const shuffled = [leaves[3], leaves[0], leaves[4], leaves[2], leaves[1]];
    const out = runCategoryA({
      leaves: shuffled,
      expectedRoot,
      expectedRootHex: "0x" + expectedRoot.toString(16),
      expectedLeafCount: 5,
      expectedStartDayId: 19000,
      expectedEndDayId: 19004
    });
    expect(out.allPass).toBe(true);
  });
});
