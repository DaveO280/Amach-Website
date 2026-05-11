"use client";

import type { WalletClient } from "viem";
import { encodeAbiParameters } from "viem";
import { getActiveChain } from "@/lib/networkConfig";

/**
 * Client-side helper for the Spring Push "Submit Proof" flow.
 *
 * The escrow contract (`SpringPushEscrowV1.submitProof`) takes:
 *   - `bytes proof`              — ABI-encoded Groth16 proof
 *   - `uint256[4] pubSignals`    — [baselineRoot, currentRoot, dayWindow, improvementBp]
 *
 * The improvement circuit is the `AverageImprovementProofV1` Groth16 circuit
 * (N=2, M=2, treeDepth=7, metricPointer=64, metric=vo2max). See
 * scripts/deploy-improvement-verifier.js for the deployment metadata.
 *
 * Status: the circuit's `.wasm` and `.zkey` artifacts live under
 * `AmachHealth-iOS/zk/build/improvement/` and have not yet been copied into
 * this repo (we only have coverage artifacts under `zk-toolchain/build/`).
 * Once the artifacts land, fill in `generateImprovementProof` and remove the
 * stub error path. The on-chain submission below is the final shape.
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
 * STUB: generate the Groth16 improvement proof in the browser.
 *
 * To make this real, the caller needs:
 *   1. The user's encrypted Merkle genesis (baseline tree) decrypted via
 *      walletEncryption — `loadLatestGenesis` in devZkCoverageService.ts shows
 *      the storage shape. Browser ports must use the IndexedDB fallback path
 *      rather than `fs`, since the Storj retrieval already runs client-side.
 *   2. A current-window Merkle tree covering the most recent N days of
 *      VO2max readings (N=2 per the circuit metadata).
 *   3. The improvement circuit artifacts:
 *        - improvement_js/improvement.wasm
 *        - improvement_final.zkey
 *        - verification_key.json (optional — only for client-side sanity verify)
 *      These currently live at AmachHealth-iOS/zk/build/improvement/ and must
 *      be either bundled into `public/zk/improvement/` for fetch() loading, or
 *      served from the same CDN as the coverage artifacts will be when that
 *      flow ships.
 *   4. The witness input shape, which mirrors coverage but adds the metric
 *      pointer and the current-window leaves:
 *        - baseline_root, current_root
 *        - day_window
 *        - metric_pointer (=64 for VO2max)
 *        - baseline_leaf_hashes[N], baseline_merkle_paths[N], baseline_path_indices[N]
 *        - current_leaf_hashes[M],  current_merkle_paths[M],  current_path_indices[M]
 *        - baseline_metric_values[N], current_metric_values[M]
 *      Confirm the exact field names against the .circom source before wiring.
 *   5. `snarkjs.groth16.fullProve(witness, wasmUrl, zkeyUrl)` produces the
 *      proof + public signals. The signals come out as decimal strings; cast
 *      each to BigInt for `pubSignals[]`. The proof object can then be passed
 *      to `encodeGroth16ProofToBytes` above to get the `bytes` payload.
 *
 * Until those land, throw a clear error so the widget surfaces a useful
 * message instead of a silent failure.
 */
async function generateImprovementProof(
  _walletAddress: string,
): Promise<GeneratedImprovementProof> {
  throw new Error(
    "Improvement proof generation is not yet enabled. The Groth16 " +
      "circuit artifacts (improvement.wasm, improvement_final.zkey) have " +
      "not been bundled into the web build yet. Submit Proof will become " +
      "available once those artifacts are published.",
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
