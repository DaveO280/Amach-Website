import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { poseidon2, poseidon3 } from "poseidon-lite";
import * as snarkjs from "snarkjs";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import { getStorageService } from "@/storage";

const ZERO_LEAF = 0n;

/** Must match `coverage.circom`: `component main = CoverageProof(20, MERKLE_DEPTH)`. */
const MERKLE_DEPTH = 8;
const MAX_LEAVES = 1 << MERKLE_DEPTH;

/** Root folder that contains `build/coverage/` (same layout as AmachHealth-iOS/zk). */
function getZkToolchainRoot(): string {
  if (process.env.ZK_TOOLCHAIN_DIR) {
    return path.resolve(process.env.ZK_TOOLCHAIN_DIR);
  }
  const cwd = process.cwd();
  const fromRepo = path.join(cwd, "zk-toolchain");
  const legacyMac = "/Users/dave/AmachHealth-iOS/zk";
  const hasArtifacts = (root: string): boolean =>
    fs.existsSync(path.join(root, "build", "coverage", "coverage_final.zkey"));
  if (hasArtifacts(fromRepo)) return fromRepo;
  if (hasArtifacts(legacyMac)) return legacyMac;
  return fromRepo;
}

export interface GenesisLeafInput {
  dayId: number;
  steps: number;
  activeEnergy: number;
  exerciseMinutes: number;
  hrvAvg: number;
  restingHR: number;
  sleepMinutes: number;
  stepDayCount: number;
  energyDayCount: number;
  exerciseDayCount: number;
  hrvDayCount: number;
  restingHrDayCount: number;
  sleepDayCount: number;
  workoutCount?: number;
  sourceCount?: number;
  dataFlags: number;
  timezone: number;
  sourceHash: string;
}

interface StoredTree {
  rootPadded: string;
  treeDepth: number;
  tree: string[][];
  leafCount: number;
  startDayId: number;
  endDayId: number;
}

interface StoredLeaves {
  leaves: Array<GenesisLeafInput & { hashDec: string; serializedHex: string }>;
}

function strip0x(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function toHex32(v: bigint): string {
  return `0x${v.toString(16).padStart(64, "0")}`;
}

function walletAddressToBytes32(walletAddress: string): Buffer {
  const hex = strip0x(walletAddress).toLowerCase();
  if (!/^[0-9a-f]*$/.test(hex)) {
    throw new Error(`Invalid walletAddress: ${walletAddress}`);
  }
  const raw = Buffer.from(hex.padStart(40, "0").slice(-40), "hex");
  if (raw.length >= 32) return raw.subarray(raw.length - 32);
  return Buffer.concat([Buffer.alloc(32 - raw.length, 0), raw]);
}

function serializeLeaf(leaf: GenesisLeafInput, walletAddress: string): Buffer {
  const sourceHashHex = strip0x(leaf.sourceHash).padEnd(64, "0").slice(0, 64);
  const sourceHash = Buffer.from(sourceHashHex, "hex");
  const walletBytes32 = walletAddressToBytes32(walletAddress);
  const buf = Buffer.alloc(90, 0);
  buf.writeUInt32BE(leaf.dayId >>> 0, 0);
  walletBytes32.copy(buf, 4);
  buf.writeInt16BE(leaf.timezone, 36);
  buf.writeUInt32BE(leaf.steps >>> 0, 38);
  buf.writeUInt32BE(leaf.activeEnergy >>> 0, 42);
  buf.writeUInt16BE(leaf.exerciseMinutes & 0xffff, 46);
  buf.writeUInt16BE(leaf.hrvAvg & 0xffff, 48);
  buf.writeUInt16BE(leaf.restingHR & 0xffff, 50);
  buf.writeUInt16BE(leaf.sleepMinutes & 0xffff, 52);
  // Prefer canonical fields when provided; keep fallback for current dev callers.
  const workoutCount = leaf.workoutCount ?? leaf.exerciseDayCount ?? 0;
  const sourceCount = leaf.sourceCount ?? leaf.stepDayCount ?? 1;
  buf.writeUInt8(workoutCount & 0xff, 54);
  buf.writeUInt8(sourceCount & 0xff, 55);
  buf.writeUInt16BE(leaf.dataFlags & 0xffff, 56);
  sourceHash.copy(buf, 58);
  return buf;
}

function hashLeaf(serialized: Buffer): bigint {
  const chunk1 = BigInt(`0x${serialized.subarray(0, 31).toString("hex")}`);
  const chunk2 = BigInt(`0x${serialized.subarray(31, 62).toString("hex")}`);
  const chunk3Buf = Buffer.alloc(31, 0);
  serialized.subarray(62, 90).copy(chunk3Buf, 0);
  const chunk3 = BigInt(`0x${chunk3Buf.toString("hex")}`);
  return poseidon3([chunk1, chunk2, chunk3]);
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function buildTree(hashes: bigint[]): bigint[][] {
  const pow2 = nextPow2(Math.max(1, hashes.length));
  const size = Math.max(pow2, MAX_LEAVES);
  if (size > MAX_LEAVES) {
    throw new Error(
      `Too many leaves (${hashes.length}) for coverage circuit depth ${MERKLE_DEPTH} (max ${MAX_LEAVES} leaves).`,
    );
  }
  const level0 = [...hashes];
  while (level0.length < size) level0.push(ZERO_LEAF);
  const tree: bigint[][] = [level0];
  let cur = level0;
  while (cur.length > 1) {
    const next: bigint[] = [];
    for (let i = 0; i < cur.length; i += 2)
      next.push(poseidon2([cur[i], cur[i + 1]]));
    tree.push(next);
    cur = next;
  }
  return tree;
}

function merklePath(
  tree: bigint[][],
  idx: number,
): { siblings: string[]; indices: string[] } {
  const siblings: string[] = [];
  const indices: string[] = [];
  let cursor = idx;
  for (let level = 0; level < tree.length - 1; level += 1) {
    const right = cursor % 2 === 1;
    const sib = right ? cursor - 1 : cursor + 1;
    siblings.push((tree[level][sib] ?? ZERO_LEAF).toString(10));
    indices.push(right ? "1" : "0");
    cursor = Math.floor(cursor / 2);
  }
  if (siblings.length !== MERKLE_DEPTH) {
    throw new Error(
      `Internal: Merkle path length ${siblings.length} !== MERKLE_DEPTH ${MERKLE_DEPTH}`,
    );
  }
  return { siblings, indices };
}

function artifactPath(...parts: string[]): string {
  return path.join(getZkToolchainRoot(), "build", "coverage", ...parts);
}

async function loadLatestGenesis(
  walletAddress: string,
  encryptionKey: WalletEncryptionKey,
): Promise<{
  tree: StoredTree;
  leaves: StoredLeaves;
}> {
  const storage = getStorageService();
  const [treeItems, leavesItems] = await Promise.all([
    storage.listUserData(walletAddress, encryptionKey, "merkle-genesis-tree"),
    storage.listUserData(walletAddress, encryptionKey, "merkle-genesis-leaves"),
  ]);
  if (!treeItems.length || !leavesItems.length) {
    throw new Error("No genesis data found. Generate genesis first.");
  }
  const latestTree = [...treeItems].sort(
    (a, b) => b.uploadedAt - a.uploadedAt,
  )[0];
  const latestLeaves = [...leavesItems].sort(
    (a, b) => b.uploadedAt - a.uploadedAt,
  )[0];
  const [treeRes, leavesRes] = await Promise.all([
    storage.retrieveHealthData<StoredTree>(
      latestTree.uri,
      encryptionKey,
      undefined,
      walletAddress,
    ),
    storage.retrieveHealthData<StoredLeaves>(
      latestLeaves.uri,
      encryptionKey,
      undefined,
      walletAddress,
    ),
  ]);
  return { tree: treeRes.data, leaves: leavesRes.data };
}

export async function createGenesis(
  walletAddress: string,
  encryptionKey: WalletEncryptionKey,
  leaves: GenesisLeafInput[],
): Promise<{
  root: string;
  rootPadded: string;
  startDayId: number;
  endDayId: number;
  leafCount: number;
  treeDepth: number;
  storjPaths: { metadata: string; tree: string; leaves: string };
}> {
  if (!leaves.length) throw new Error("Leaves are required");
  const sorted = [...leaves].sort((a, b) => a.dayId - b.dayId);
  const serialized = sorted.map((leaf) => serializeLeaf(leaf, walletAddress));
  const hashed = serialized.map(hashLeaf);
  const tree = buildTree(hashed);
  const rootPadded = toHex32(tree[tree.length - 1][0]);
  const storage = getStorageService();

  const storedTree = await storage.storeHealthData<StoredTree>(
    {
      rootPadded,
      treeDepth: tree.length - 1,
      tree: tree.map((level) => level.map((n) => n.toString(10))),
      leafCount: sorted.length,
      startDayId: sorted[0].dayId,
      endDayId: sorted[sorted.length - 1].dayId,
    },
    walletAddress,
    encryptionKey,
    { dataType: "merkle-genesis-tree", metadata: { root: rootPadded } },
  );

  const storedLeaves = await storage.storeHealthData<StoredLeaves>(
    {
      leaves: sorted.map((leaf, i) => ({
        ...leaf,
        serializedHex: serialized[i].toString("hex"),
        hashDec: hashed[i].toString(10),
      })),
    },
    walletAddress,
    encryptionKey,
    { dataType: "merkle-genesis-leaves", metadata: { root: rootPadded } },
  );

  const storedMeta = await storage.storeHealthData(
    {
      rootPadded,
      startDayId: sorted[0].dayId,
      endDayId: sorted[sorted.length - 1].dayId,
      leafCount: sorted.length,
      treeDepth: tree.length - 1,
      generatedAt: new Date().toISOString(),
    },
    walletAddress,
    encryptionKey,
    { dataType: "merkle-genesis-metadata", metadata: { root: rootPadded } },
  );

  return {
    root: strip0x(rootPadded),
    rootPadded,
    startDayId: sorted[0].dayId,
    endDayId: sorted[sorted.length - 1].dayId,
    leafCount: sorted.length,
    treeDepth: tree.length - 1,
    storjPaths: {
      metadata: storedMeta.storjUri,
      tree: storedTree.storjUri,
      leaves: storedLeaves.storjUri,
    },
  };
}

export async function generateCoverage(
  walletAddress: string,
  encryptionKey: WalletEncryptionKey,
  startDayId: number,
  endDayId: number,
  minDays: number,
): Promise<{
  proof: unknown;
  publicSignals: string[];
  proofHash: string;
  verified: boolean;
}> {
  if (minDays !== 20) {
    throw new Error("Current dev circuit supports minDays=20 only.");
  }
  const { tree, leaves } = await loadLatestGenesis(
    walletAddress,
    encryptionKey,
  );
  const storedPathDepth = tree.tree.length > 0 ? tree.tree.length - 1 : 0;
  if (storedPathDepth !== MERKLE_DEPTH) {
    throw new Error(
      `Stored genesis tree depth ${storedPathDepth} does not match coverage circuit MERKLE_DEPTH ${MERKLE_DEPTH}. Regenerate Merkle genesis (root will change).`,
    );
  }
  const treeBig = tree.tree.map((level) => level.map((v) => BigInt(v)));
  const selected = leaves.leaves
    .map((leaf, idx) => ({ leaf, idx }))
    .filter((x) => x.leaf.dayId >= startDayId && x.leaf.dayId <= endDayId)
    .slice(0, minDays);
  if (selected.length < minDays) {
    throw new Error(`Only ${selected.length} leaves in range, need ${minDays}`);
  }

  const witnessInput = {
    root: BigInt(tree.rootPadded).toString(10),
    start_day_id: String(startDayId),
    end_day_id: String(endDayId),
    min_days: String(minDays),
    leaf_day_ids: selected.map((x) => String(x.leaf.dayId)),
    leaf_hashes: selected.map((x) => x.leaf.hashDec),
    merkle_paths: selected.map((x) => merklePath(treeBig, x.idx).siblings),
    path_indices: selected.map((x) => merklePath(treeBig, x.idx).indices),
  };

  const wasm = artifactPath("coverage_js", "coverage.wasm");
  const zkey = artifactPath("coverage_final.zkey");
  const vkey = artifactPath("verification_key.json");
  if (!fs.existsSync(wasm) || !fs.existsSync(zkey) || !fs.existsSync(vkey)) {
    const root = getZkToolchainRoot();
    throw new Error(
      [
        "Missing ZK coverage artifacts (wasm, zkey, verification key).",
        `Expected under: ${path.join(root, "build", "coverage")}`,
        "Copy your local build/coverage from the iOS zk repo, set ZK_TOOLCHAIN_DIR to that repo root on the server, and redeploy.",
        `Missing: wasm=${!fs.existsSync(wasm)} zkey=${!fs.existsSync(zkey)} vkey=${!fs.existsSync(vkey)}`,
      ].join(" "),
    );
  }

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    witnessInput,
    wasm,
    zkey,
  );
  const verificationKey = JSON.parse(fs.readFileSync(vkey, "utf8")) as unknown;
  const verified = await snarkjs.groth16.verify(
    verificationKey,
    publicSignals,
    proof,
  );
  const proofHash = `0x${createHash("sha256")
    .update(JSON.stringify({ proof, publicSignals }))
    .digest("hex")}`;

  return { proof, publicSignals, proofHash, verified };
}

export async function verifyCoverage(
  proof: unknown,
  publicSignals: string[],
): Promise<boolean> {
  const vkey = artifactPath("verification_key.json");
  if (!fs.existsSync(vkey)) {
    throw new Error("Missing verification key artifact.");
  }
  const verificationKey = JSON.parse(fs.readFileSync(vkey, "utf8")) as unknown;
  return snarkjs.groth16.verify(verificationKey, publicSignals, proof);
}
