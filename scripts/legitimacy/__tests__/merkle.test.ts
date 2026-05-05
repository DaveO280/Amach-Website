import {
  buildMerkleTree,
  getMerklePath,
  nextPowerOf2,
  parseRoot,
  verifyMerklePath,
  ZERO_LEAF
} from "../src/merkle";
import { buildLeafV2, serializeLeafV2 } from "../src/leaf";

function leafBufs(n: number): Buffer[] {
  return Array.from({ length: n }, (_, i) =>
    serializeLeafV2(buildLeafV2({ dayId: i }))
  );
}

describe("merkle", () => {
  test("nextPowerOf2", () => {
    expect(nextPowerOf2(1)).toBe(1);
    expect(nextPowerOf2(2)).toBe(2);
    expect(nextPowerOf2(3)).toBe(4);
    expect(nextPowerOf2(5)).toBe(8);
    expect(nextPowerOf2(1000)).toBe(1024);
    expect(nextPowerOf2(1024)).toBe(1024);
  });

  test("ZERO_LEAF is 0n", () => {
    expect(ZERO_LEAF).toBe(0n);
  });

  test("builds tree of size 4 with depth 2", () => {
    const result = buildMerkleTree(leafBufs(4));
    expect(result.leafCount).toBe(4);
    expect(result.treeSize).toBe(4);
    expect(result.depth).toBe(2);
    expect(result.tree).toHaveLength(3);
    expect(result.tree[0]).toHaveLength(4);
    expect(result.tree[2]).toHaveLength(1);
    expect(result.root).toBe(result.tree[2][0]);
  });

  test("pads to next power of two with zero leaves", () => {
    const result = buildMerkleTree(leafBufs(3));
    expect(result.leafCount).toBe(3);
    expect(result.treeSize).toBe(4);
    expect(result.tree[0][3]).toBe(ZERO_LEAF);
  });

  test("Merkle path round-trips for every leaf in a tree", () => {
    const result = buildMerkleTree(leafBufs(7));
    for (let i = 0; i < result.leafCount; i++) {
      const path = getMerklePath(result.tree, i);
      expect(path.leaf).toBe(result.leafHashes[i]);
      const ok = verifyMerklePath(
        path.leaf,
        path.siblings,
        path.indices,
        result.root
      );
      expect(ok).toBe(true);
    }
  });

  test("rejects non-Buffer leaves", () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildMerkleTree([null as unknown as Buffer])
    ).toThrow(/not a Buffer/);
    expect(() => buildMerkleTree([])).toThrow(/non-empty/);
  });

  test("rejects unsupported leaf lengths", () => {
    expect(() => buildMerkleTree([Buffer.alloc(50, 0)])).toThrow(/unsupported/);
  });

  test("parseRoot accepts hex, decimal, raw hex string, and bigint", () => {
    const a = parseRoot(
      "0x21474a5f6dd725de3cee969f2374561f723c58780f08150da005f5244337228f"
    );
    const b = parseRoot(
      "21474a5f6dd725de3cee969f2374561f723c58780f08150da005f5244337228f"
    );
    expect(a.value).toBe(b.value);

    const c = parseRoot("12345");
    expect(c.value).toBe(12345n);

    const d = parseRoot(42n);
    expect(d.value).toBe(42n);
    expect(d.hex).toBe("0x2a");
  });

  test("parseRoot rejects garbage", () => {
    expect(() => parseRoot("not a hex string")).toThrow(/cannot parse/);
  });

  test("verifyMerklePath rejects a tampered sibling", () => {
    const result = buildMerkleTree(leafBufs(8));
    const path = getMerklePath(result.tree, 3);
    const tampered = path.siblings.slice();
    tampered[0] = tampered[0] + 1n;
    expect(
      verifyMerklePath(path.leaf, tampered, path.indices, result.root)
    ).toBe(false);
  });
});
