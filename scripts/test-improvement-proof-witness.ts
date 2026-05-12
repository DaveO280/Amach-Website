/**
 * Build the AverageImprovementProof witness for the seeded test wallet and
 * log the improvement signals so we can verify the magnitude/sign math is
 * picking up the seeded baseline → finish spread.
 *
 * This mirrors the in-browser `generateImprovementProof(walletAddress,
 * encryptionKey)` path in `src/zk/improvementProofClient.ts` up through the
 * witness step. The proof-generation and on-chain `writeContract` steps are
 * intentionally skipped because:
 *   1. The testnet escrow contract is in the FINISHED state, so submitProof
 *      would revert with `ContestNotOpen()`.
 *   2. The witness already carries `claimedMagnitudeBp` and `claimedSignFlag`
 *      verbatim — the public signals the prover emits are byte-identical, so
 *      there's no extra signal to learn from running snarkjs locally.
 *
 * Run AFTER `seed-spring-push-v2-leaves.ts` against the same wallet. Both
 * scripts derive the encryption key deterministically from the private key
 * (env: TEST_WALLET_PRIVATE_KEY → PRIVATE_KEY), so the keys match without
 * any shared cache.
 *
 * Requires the Next.js dev server (the witness builder hits `/api/storj` to
 * decrypt the v2 leaf bundles). Override the base URL via the BASE_URL env
 * var (default http://localhost:3000).
 *
 * Usage:
 *   PRIVATE_KEY=0x... pnpm exec tsx scripts/test-improvement-proof-witness.ts
 */

import { privateKeyToAccount } from "viem/accounts";
import {
  deriveEncryptionKeyFromSignature,
  getKeyDerivationMessage,
  type WalletEncryptionKey,
} from "../src/utils/walletEncryption";
import { buildImprovementWitness } from "../src/zk/improvementWitnessBuilder";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

/**
 * The witness builder uses fetch("/api/storj", ...) — a relative path that
 * works in the browser but not in Node. Wrap globalThis.fetch so root-relative
 * paths get rebased onto BASE_URL; other call shapes pass through untouched.
 */
function installFetchShim(): void {
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    if (typeof input === "string" && input.startsWith("/")) {
      return original(`${BASE_URL}${input}`, init);
    }
    return original(input, init);
  }) as typeof fetch;
}

async function main(): Promise<void> {
  const rawKey = process.env.TEST_WALLET_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
  if (!rawKey) {
    throw new Error(
      "Set TEST_WALLET_PRIVATE_KEY (or PRIVATE_KEY) to a 0x-prefixed key for the test wallet.",
    );
  }
  const pk = (
    rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`
  ) as `0x${string}`;
  const account = privateKeyToAccount(pk);
  const walletAddress = account.address;

  console.log("🔑 Test wallet:", walletAddress);
  console.log("🌐 Base URL:   ", BASE_URL);

  const message = getKeyDerivationMessage(walletAddress);
  const signature = await account.signMessage({ message });
  const derivedKey = await deriveEncryptionKeyFromSignature(
    signature,
    walletAddress,
  );
  const encryptionKey: WalletEncryptionKey = {
    key: derivedKey,
    derivedAt: Date.now(),
    walletAddress: walletAddress.toLowerCase(),
  };

  installFetchShim();

  console.log(
    "\n🧮 Building improvement witness from seeded baseline + finish bundles…",
  );
  const witness = await buildImprovementWitness(walletAddress, encryptionKey);

  console.log("\n📊 Witness improvement signals:");
  console.log(`   claimedMagnitudeBp: ${witness.claimedMagnitudeBp}`);
  console.log(
    `   claimedSignFlag:    ${witness.claimedSignFlag}  (0 = positive improvement)`,
  );
  console.log(`   metricPointer:      ${witness.metricPointer}  (vo2max)`);

  console.log("\n🌳 Roots:");
  console.log(`   baselineRoot (dec): ${witness.baselineRoot}`);
  console.log(`   baselineRoot (hex): ${witness.meta.baselineRoot}`);
  console.log(`   finishRoot   (dec): ${witness.finishRoot}`);
  console.log(`   finishRoot   (hex): ${witness.meta.finishRoot}`);

  console.log("\n🔬 Honest-claim derivation (from witness.meta):");
  console.log(
    `   baselineSum × N = ${witness.meta.baselineSum} × ${witness.meta.baselineN}`,
  );
  console.log(
    `   finishSum   × M = ${witness.meta.finishSum} × ${witness.meta.finishM}`,
  );
  console.log(
    `   improvementBp   = ${witness.meta.improvementBp}  (≈ ${(
      Number(witness.meta.improvementBp) / 100
    ).toFixed(2)}%)`,
  );
  console.log(
    `   signFlag        = ${witness.meta.signFlag} (${
      witness.meta.signFlag === 0 ? "finish ≥ baseline" : "finish < baseline"
    })`,
  );

  if (witness.claimedSignFlag !== "0") {
    console.warn(
      "\n⚠️  signFlag is 1 — Spring Push escrow rejects non-positive improvements.",
    );
  }

  console.log(
    "\nℹ️  Skipped proveImprovement() + writeContract() — testnet escrow is in FINISHED state.",
  );
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
