/**
 * Binary Merkle tree reconstruction matching the iOS / JS implementation.
 *
 * Authoritative reference:
 *   /Users/dave/AmachHealth-iOS/.../zk/scripts/build_tree.js
 *
 * Protocol:
 *   - Leaves are sorted ascending by dayId at the call site (the legitimacy
 *     script enforces this before calling buildMerkleTree).
 *   - Tree is padded to the next power of two with zero-value leaves (0n).
 *   - Internal node: Poseidon2([left, right]).
 *   - Root is the single field element at the top of the tree.
 *
 * The script's Category A.1 reconstructs the tree from the participant's
 * leaves and compares the computed root to the on-chain commitment exactly.
 */

import { poseidon2 } from "poseidon-lite/poseidon2";

import {
  V1_LEAF_BYTES,
  V2_LEAF_BYTES,
  hashLeaf
} from "./leaf";

/** Zero leaf used for padding to a power of two. Matches build_tree.js. */
export const ZERO_LEAF: bigint = 0n;

export interface MerkleTreeResult {
  root: bigint;
  /** All levels of the tree. tree[0] is the padded leaf level; tree[depth] is [root]. */
  tree: bigint[][];
  /** Real (unpadded) leaf hashes. */
  leafHashes: bigint[];
  leafCount: number;
  treeSize: number;
  depth: number;
}

/**
 * Build a Merkle tree from an array of serialized leaf Buffers. Each leaf may
 * be v1 (90 bytes, Poseidon3) or v2 (124 bytes, Poseidon4); `hashLeaf`
 * dispatches on length. Heterogeneous trees are accepted (the protocol does
 * not forbid them) but the legitimacy pipeline always passes homogeneous v2
 * input.
 */
export function buildMerkleTree(leaves: Buffer[]): MerkleTreeResult {
  if (!Array.isArray(leaves) || leaves.length === 0) {
    throw new Error("buildMerkleTree requires a non-empty array of leaves");
  }

  const leafHashes = leaves.map((leaf, i) => {
    if (!Buffer.isBuffer(leaf)) {
      throw new Error(`Leaf ${i} is not a Buffer`);
    }
    if (leaf.length !== V1_LEAF_BYTES && leaf.length !== V2_LEAF_BYTES) {
      throw new Error(
        `Leaf ${i}: unsupported length ${leaf.length}. ` +
          `Expected ${V1_LEAF_BYTES} (v1) or ${V2_LEAF_BYTES} (v2).`
      );
    }
    return hashLeaf(leaf);
  });

  const leafCount = leafHashes.length;
  const treeSize = nextPowerOf2(leafCount);

  let level: bigint[] = leafHashes.slice();
  while (level.length < treeSize) level.push(ZERO_LEAF);

  const tree: bigint[][] = [level];

  while (level.length > 1) {
    const next: bigint[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(BigInt(poseidon2([level[i], level[i + 1]]).toString()));
    }
    tree.push(next);
    level = next;
  }

  return {
    root: level[0],
    tree,
    leafHashes,
    leafCount,
    treeSize,
    depth: tree.length - 1
  };
}

/**
 * Generate the Merkle path for a leaf at `leafIndex`. Used by the future
 * AverageImprovementProof pipeline; the legitimacy script itself only needs
 * the root, but exporting the path keeps this module reusable.
 */
export function getMerklePath(
  tree: bigint[][],
  leafIndex: number
): { siblings: bigint[]; indices: number[]; leaf: bigint } {
  const depth = tree.length - 1;
  const siblings: bigint[] = [];
  const indices: number[] = [];

  let current = leafIndex;
  for (let level = 0; level < depth; level++) {
    const isRight = current % 2 === 1;
    const siblingIndex = isRight ? current - 1 : current + 1;
    const sibling =
      siblingIndex < tree[level].length ? tree[level][siblingIndex] : ZERO_LEAF;
    siblings.push(sibling);
    indices.push(isRight ? 1 : 0);
    current = Math.floor(current / 2);
  }

  return { siblings, indices, leaf: tree[0][leafIndex] };
}

/** Verify a Merkle path locally. */
export function verifyMerklePath(
  leaf: bigint,
  siblings: bigint[],
  indices: number[],
  root: bigint
): boolean {
  let cur = leaf;
  for (let i = 0; i < siblings.length; i++) {
    if (indices[i] === 0) {
      cur = BigInt(poseidon2([cur, siblings[i]]).toString());
    } else {
      cur = BigInt(poseidon2([siblings[i], cur]).toString());
    }
  }
  return cur === root;
}

export function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Normalize a root value supplied by the user. Accepts:
 *   - "0x"-prefixed hex
 *   - decimal string
 *   - bigint
 * Returns a bigint and the canonical hex representation.
 */
export function parseRoot(root: string | bigint): {
  value: bigint;
  hex: string;
} {
  let value: bigint;
  if (typeof root === "bigint") {
    value = root;
  } else if (typeof root === "string") {
    const trimmed = root.trim();
    if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
      value = BigInt(trimmed);
    } else if (/^[0-9]+$/.test(trimmed)) {
      value = BigInt(trimmed);
    } else if (/^[0-9a-fA-F]+$/.test(trimmed)) {
      value = BigInt("0x" + trimmed);
    } else {
      throw new Error(`parseRoot: cannot parse "${root}"`);
    }
  } else {
    throw new Error(`parseRoot: expected string or bigint, got ${typeof root}`);
  }
  return { value, hex: "0x" + value.toString(16) };
}
