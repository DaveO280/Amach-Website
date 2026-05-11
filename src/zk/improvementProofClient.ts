"use client";

import type { WalletClient } from "viem";
import { getActiveChain } from "@/lib/networkConfig";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import { buildImprovementWitness } from "@/zk/improvementWitnessBuilder";

/**
 * Client-side helper for the Spring Push "Submit Proof" flow.
 *
 * The escrow contract (`SpringPushEscrowV1.submitProof`) takes the raw
 * Groth16 proof components plus the full 5-element public-signals tuple,
 * forwarded verbatim to the snarkjs-generated `AverageImprovementProofV1Verifier`:
 *   - `uint[2]    pA`
 *   - `uint[2][2] pB`
 *   - `uint[2]    pC`
 *   - `uint[5]    pubSignals`   — [baselineRoot, finishRoot, metricPointer,
 *                                  claimedMagnitudeBp, claimedSignFlag]
 *
 * The improvement circuit is the `AverageImprovementProofV1` Groth16 circuit
 * (N=2, M=2, treeDepth=7, metricPointer=64, metric=vo2max). Spring Push
 * entries must be positive improvements, so the escrow asserts
 * `claimedSignFlag == 0` before forwarding to the verifier.
 *
 * Artifacts live at `public/zk/improvement/` and are served at:
 *   /zk/improvement/improvement.wasm
 *   /zk/improvement/improvement_final.zkey
 *   /zk/improvement/verification_key.json
 */

const SUBMIT_PROOF_ABI = [
  {
    type: "function",
    name: "submitProof",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pA", type: "uint256[2]" },
      { name: "pB", type: "uint256[2][2]" },
      { name: "pC", type: "uint256[2]" },
      { name: "pubSignals", type: "uint256[5]" },
    ],
    outputs: [],
  },
] as const;

const WASM_URL = "/zk/improvement/improvement.wasm";
const ZKEY_URL = "/zk/improvement/improvement_final.zkey";

/**
 * Circuit metric pointer for VO2 max — must match `improvement.circom`'s
 * `AverageImprovementProof(2, 2, 7, 2, 2)` instantiation:
 *   pointer = METRIC_CHUNK_IDX * 31 + METRIC_BYTE_OFFSET_IN_CHUNK = 2*31 + 2.
 * The circuit asserts pointer equality, so this value is fixed.
 */
const METRIC_POINTER = 2 * 31 + 2;

interface SnarkjsGroth16Proof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
}

export type Groth16ProofPoints = {
  pA: [bigint, bigint];
  pB: [[bigint, bigint], [bigint, bigint]];
  pC: [bigint, bigint];
};

/**
 * Convert a snarkjs Groth16 proof object into the (pA, pB, pC) triple expected
 * by the snarkjs-generated Solidity verifier. snarkjs serializes pB as
 * `[[x1, x2], ...]` but the verifier expects the inner pair swapped, hence the
 * reordering below.
 */
function snarkjsProofToPoints(proof: SnarkjsGroth16Proof): Groth16ProofPoints {
  return {
    pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    pB: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
  };
}

export interface GeneratedImprovementProof {
  points: Groth16ProofPoints;
  pubSignals: [bigint, bigint, bigint, bigint, bigint];
}

/**
 * Witness inputs for the AverageImprovementProof circuit.
 *
 * Field names mirror `improvement.circom` exactly — snarkjs maps these
 * directly onto circuit signals by name. All numeric values must be decimal
 * strings (snarkjs converts them to field elements internally).
 *
 * Shape constraints (N=2, M=2, depth=7):
 *   - baselineLeafHashes:  length N
 *   - baselineChunks:      N × 4 (each leaf chunked into 4 × 31-byte field elements)
 *   - baselinePaths:       N × depth (Merkle inclusion siblings, leaf-to-root)
 *   - baselineIdx:         N × depth (direction bits, '0' = left, '1' = right)
 *   - finish* same shape with M = 2.
 */
export interface ImprovementWitnessInput {
  baselineRoot: string;
  finishRoot: string;
  claimedMagnitudeBp: string;
  claimedSignFlag: "0" | "1";
  baselineLeafHashes: [string, string];
  baselineChunks: [
    [string, string, string, string],
    [string, string, string, string],
  ];
  baselinePaths: [string[], string[]];
  baselineIdx: [string[], string[]];
  finishLeafHashes: [string, string];
  finishChunks: [
    [string, string, string, string],
    [string, string, string, string],
  ];
  finishPaths: [string[], string[]];
  finishIdx: [string[], string[]];
}

interface SnarkjsFullProveResult {
  proof: SnarkjsGroth16Proof;
  publicSignals: string[];
}

interface SnarkjsGroth16 {
  fullProve(
    input: Record<string, unknown>,
    wasm: ArrayBuffer | Uint8Array | string,
    zkey: ArrayBuffer | Uint8Array | string,
  ): Promise<SnarkjsFullProveResult>;
}

interface SnarkjsModule {
  groth16: SnarkjsGroth16;
}

/**
 * Fetch a static artifact from `public/` as an ArrayBuffer. snarkjs accepts
 * ArrayBuffers directly in the browser, avoiding any fs/path shims.
 */
async function fetchArtifact(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch ZK artifact ${url}: ${res.status} ${res.statusText}`,
    );
  }
  return res.arrayBuffer();
}

/**
 * Run the Groth16 prover for the improvement circuit. Exported so that a
 * future v2-leaf-builder can plug in the witness data without duplicating the
 * artifact loading + proof-shaping boilerplate.
 *
 * The snarkjs public-signal order mirrors the `public` declaration in
 * `improvement.circom` and matches what the verifier (and escrow) expect:
 *   [baselineRoot, finishRoot, metricPointer, claimedMagnitudeBp, claimedSignFlag]
 *
 * The escrow asserts `claimedSignFlag == 0` (Spring Push entries must be
 * positive improvements).
 */
export async function proveImprovement(
  witness: ImprovementWitnessInput,
): Promise<GeneratedImprovementProof> {
  const witnessInput: Record<string, unknown> = {
    baselineRoot: witness.baselineRoot,
    finishRoot: witness.finishRoot,
    metricPointer: METRIC_POINTER.toString(10),
    claimedMagnitudeBp: witness.claimedMagnitudeBp,
    claimedSignFlag: witness.claimedSignFlag,
    baselineLeafHashes: witness.baselineLeafHashes,
    baselineChunks: witness.baselineChunks,
    baselinePaths: witness.baselinePaths,
    baselineIdx: witness.baselineIdx,
    finishLeafHashes: witness.finishLeafHashes,
    finishChunks: witness.finishChunks,
    finishPaths: witness.finishPaths,
    finishIdx: witness.finishIdx,
  };

  const [wasm, zkey] = await Promise.all([
    fetchArtifact(WASM_URL),
    fetchArtifact(ZKEY_URL),
  ]);

  // snarkjs has no published types; cast through unknown after dynamic import.
  const snarkjs = (await import("snarkjs")) as unknown as SnarkjsModule;
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    witnessInput,
    new Uint8Array(wasm),
    new Uint8Array(zkey),
  );

  if (publicSignals.length !== 5) {
    throw new Error(
      `Unexpected publicSignals length ${publicSignals.length} (expected 5).`,
    );
  }

  return {
    points: snarkjsProofToPoints(proof),
    pubSignals: [
      BigInt(publicSignals[0]),
      BigInt(publicSignals[1]),
      BigInt(publicSignals[2]),
      BigInt(publicSignals[3]),
      BigInt(publicSignals[4]),
    ],
  };
}

/**
 * Generate a Groth16 improvement proof for the given wallet. Builds the v2
 * Merkle witness via `buildImprovementWitness` (see
 * `improvementWitnessBuilder.ts`) and runs it through the bundled circuit
 * artifacts via `proveImprovement`.
 *
 * The witness builder loads encrypted v2 leaf bundles from Storj, so the
 * caller must supply the wallet's derived encryption key (typically obtained
 * via `walletService.getWalletDerivedEncryptionKey()`).
 */
async function generateImprovementProof(
  walletAddress: string,
  encryptionKey: WalletEncryptionKey,
): Promise<GeneratedImprovementProof> {
  const witness = await buildImprovementWitness(walletAddress, encryptionKey);
  return proveImprovement(witness);
}

/**
 * Generates a Groth16 improvement proof for the caller and submits it to the
 * Spring Push escrow contract. Returns the submission tx hash.
 *
 * The widget calls this from its Submit Proof button handler; loading and
 * error state are owned by the widget. `encryptionKey` is required so the
 * witness builder can decrypt the wallet's v2 leaf bundles from Storj.
 */
export async function generateAndSubmitProof(
  walletAddress: string,
  encryptionKey: WalletEncryptionKey,
  walletClient: WalletClient,
  escrowAddress: string,
): Promise<`0x${string}`> {
  const { points, pubSignals } = await generateImprovementProof(
    walletAddress,
    encryptionKey,
  );

  return walletClient.writeContract({
    address: escrowAddress as `0x${string}`,
    abi: SUBMIT_PROOF_ABI,
    functionName: "submitProof",
    args: [points.pA, points.pB, points.pC, pubSignals],
    account: walletAddress as `0x${string}`,
    chain: getActiveChain(),
  });
}

export const __testing = {
  snarkjsProofToPoints,
};
