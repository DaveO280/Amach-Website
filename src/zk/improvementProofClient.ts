"use client";

import type { WalletClient } from "viem";
import { encodeAbiParameters } from "viem";
import { getActiveChain } from "@/lib/networkConfig";

/**
 * Client-side helper for the Spring Push "Submit Proof" flow.
 *
 * The escrow contract (`SpringPushEscrowV1.submitProof`) takes:
 *   - `bytes proof`              — ABI-encoded Groth16 proof
 *   - `uint256[4] pubSignals`    — [baselineRoot, finishRoot, metricPointer, claimedMagnitudeBp]
 *
 * The improvement circuit is the `AverageImprovementProofV1` Groth16 circuit
 * (N=2, M=2, treeDepth=7, metricPointer=64, metric=vo2max). The circuit itself
 * exposes 5 public signals; the on-chain `IGroth16Verifier` wrapper that the
 * escrow calls drops `claimedSignFlag` (a Spring Push entry must be a positive
 * improvement, so signFlag is forced to 0 by the wrapper).
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
      { name: "proof", type: "bytes" },
      { name: "pubSignals", type: "uint256[4]" },
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

/**
 * Encodes a snarkjs Groth16 proof object into the `bytes` payload that the
 * escrow contract forwards to its verifier. The encoding scheme is
 * `abi.encode(uint[2] pA, uint[2][2] pB, uint[2] pC)` — the standard wrapping
 * used when a verifier exposes a bytes-blob entry point instead of split
 * (a, b, c) arguments. Note that snarkjs serializes pB as `[[x1, x2], ...]`
 * but Solidity verifiers expect the inner pair swapped, hence the reordering.
 */
function encodeGroth16ProofToBytes(proof: SnarkjsGroth16Proof): `0x${string}` {
  return encodeAbiParameters(
    [{ type: "uint256[2]" }, { type: "uint256[2][2]" }, { type: "uint256[2]" }],
    [
      [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
      [
        [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
        [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
      ],
      [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
    ],
  );
}

export interface GeneratedImprovementProof {
  proofBytes: `0x${string}`;
  pubSignals: [bigint, bigint, bigint, bigint];
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
 * artifact loading + ABI encoding boilerplate.
 *
 * The snarkjs public-signal order mirrors the `public` declaration in
 * `improvement.circom`:
 *   [baselineRoot, finishRoot, metricPointer, claimedMagnitudeBp, claimedSignFlag]
 *
 * The escrow's 4-element `pubSignals` drops `claimedSignFlag` (the on-chain
 * verifier wrapper enforces signFlag = 0).
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
    proofBytes: encodeGroth16ProofToBytes(proof),
    // Drop publicSignals[4] (claimedSignFlag) — the escrow takes only the
    // first four signals, with the wrapper verifier forcing signFlag = 0.
    pubSignals: [
      BigInt(publicSignals[0]),
      BigInt(publicSignals[1]),
      BigInt(publicSignals[2]),
      BigInt(publicSignals[3]),
    ],
  };
}

/**
 * Generate a Groth16 improvement proof for the given wallet.
 *
 * TODO: replace with real witness inputs. Constructing the witness requires:
 *   1. Loading the user's v2 (124-byte) baseline + finish leaves containing
 *      VO2 max readings (decrypt from Storj via walletEncryption, then
 *      decode with a browser port of `zk/scripts/hash_leaf.js`).
 *   2. Building both Merkle trees (depth=7, Poseidon2 nodes over Poseidon4
 *      leaf hashes — see `AmachHealth-iOS/zk/scripts/build_tree.js`).
 *   3. Choosing N=2 baseline indices and M=2 finish indices, then assembling
 *      leaf-hash / chunks / path / index arrays via the witness-builder logic
 *      in `AmachHealth-iOS/zk/scripts/build_improvement_witness.js`.
 *   4. Asserting that the resulting baselineRoot matches the escrow's
 *      `baselineRoot()` storage slot (the contract reverts with
 *      `BaselineMismatch` otherwise).
 *
 * Until that v2 leaf infrastructure is ported into the web codebase, this
 * function intentionally throws so the Submit Proof button surfaces a clear
 * message rather than silently producing a bogus proof.
 *
 * The snarkjs prover itself is fully wired below via `proveImprovement` —
 * once a witness builder exists, it can call that function directly.
 */
async function generateImprovementProof(
  _walletAddress: string,
): Promise<GeneratedImprovementProof> {
  // TODO: replace with real witness inputs (see docstring above).
  throw new Error(
    "Improvement proof generation is not yet enabled in the browser. " +
      "The Groth16 circuit artifacts are bundled and the snarkjs prover is " +
      "wired (see proveImprovement), but the v2 Merkle leaf builder needed " +
      "to construct a real witness has not been ported to the web yet. " +
      "Submit Proof will become available once that lands.",
  );
}

/**
 * Generates a Groth16 improvement proof for the caller and submits it to the
 * Spring Push escrow contract. Returns the submission tx hash.
 *
 * The widget calls this from its Submit Proof button handler; loading and
 * error state are owned by the widget.
 */
export async function generateAndSubmitProof(
  walletAddress: string,
  walletClient: WalletClient,
  escrowAddress: string,
): Promise<`0x${string}`> {
  const { proofBytes, pubSignals } =
    await generateImprovementProof(walletAddress);

  return walletClient.writeContract({
    address: escrowAddress as `0x${string}`,
    abi: SUBMIT_PROOF_ABI,
    functionName: "submitProof",
    args: [proofBytes, pubSignals],
    account: walletAddress as `0x${string}`,
    chain: getActiveChain(),
  });
}

export const __testing = {
  encodeGroth16ProofToBytes,
};
