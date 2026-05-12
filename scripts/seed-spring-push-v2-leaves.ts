/**
 * Seed v2 Spring Push leaf bundles into Storj for a test wallet.
 *
 * Posts 4 baseline-window leaves (dayIds 20490-20493, modest VO2max) and 4
 * finish-window leaves (dayIds 20580-20583, meaningfully improved VO2max +
 * step count) to `POST /api/merkle/v2/upload`, which produces both
 * `merkle-v2-baseline-leaves` and `merkle-v2-finish-leaves` Storj entries
 * that `buildImprovementWitness` consumes.
 *
 * Wallet + encryption key are derived deterministically from a private key
 * (env: TEST_WALLET_PRIVATE_KEY → PRIVATE_KEY) so the witness-test script
 * picks up the same encryption key and can decrypt the bundles.
 *
 * Requires the Next.js dev server (pnpm dev) to be running. Override the
 * base URL via the BASE_URL env var (default http://localhost:3000).
 *
 * Usage:
 *   PRIVATE_KEY=0x... pnpm exec tsx scripts/seed-spring-push-v2-leaves.ts
 */

import { privateKeyToAccount } from "viem/accounts";
import {
  deriveEncryptionKeyFromSignature,
  getKeyDerivationMessage,
  type WalletEncryptionKey,
} from "../src/utils/walletEncryption";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

interface WireLeaf {
  wallet: string;
  dayId: number;
  timezoneOffset: number;
  steps: number;
  activeEnergy: number;
  exerciseMins: number;
  hrv: number;
  restingHR: number;
  sleepMins: number;
  workoutCount: number;
  sourceCount: number;
  dataFlags: number;
  vo2max: number;
  weight: number;
  bodyFatPct: number;
  leanMass: number;
  deepSleepMins: number;
  remSleepMins: number;
  lightSleepMins: number;
  awakeMins: number;
  sourceHash?: string;
}

interface UploadResponse {
  success?: boolean;
  error?: string;
  storjUri?: string;
  contentHash?: string;
  uploadedAt?: number;
  leafCount?: number;
  window?: string;
  dataType?: string;
  hashes?: string[];
}

function buildLeaf(
  wallet: string,
  dayId: number,
  vo2max: number,
  steps: number,
  overrides: Partial<WireLeaf> = {},
): WireLeaf {
  return {
    wallet,
    dayId,
    timezoneOffset: -300,
    steps,
    activeEnergy: 300,
    exerciseMins: 30,
    hrv: 40,
    restingHR: 65,
    sleepMins: 420,
    workoutCount: 1,
    sourceCount: 2,
    dataFlags: 0x000f_03ff,
    vo2max,
    weight: 7800,
    bodyFatPct: 1850,
    leanMass: 6300,
    deepSleepMins: 75,
    remSleepMins: 95,
    lightSleepMins: 240,
    awakeMins: 20,
    sourceHash:
      "1111111111111111111111111111111111111111111111111111111111111111",
    ...overrides,
  };
}

async function uploadWindow(
  walletAddress: string,
  encryptionKey: WalletEncryptionKey,
  window: "baseline" | "finish",
  leaves: WireLeaf[],
): Promise<UploadResponse> {
  const res = await fetch(`${BASE_URL}/api/merkle/v2/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, encryptionKey, window, leaves }),
  });
  const json = (await res.json()) as UploadResponse;
  if (!res.ok || json.success === false) {
    throw new Error(
      `[${window}] upload failed (${res.status}): ${json.error ?? "unknown error"}`,
    );
  }
  return json;
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
  console.log(
    `🔐 Encryption key derived (hex, ${derivedKey.length} chars):`,
    derivedKey.slice(0, 12) + "…",
  );

  // dayId is the v2 schema's epoch-day proxy. The exact value doesn't affect
  // the circuit (only the leaf hash); these are spaced 90 days apart to mirror
  // the Spring Push baseline → finish window cadence.
  const baselineDayIds = [20490, 20491, 20492, 20493];
  const finishDayIds = [20580, 20581, 20582, 20583];

  // VO2max is encoded as u16 in tenths of mL/kg/min (490 → 49.0). The witness
  // builder picks the 2 lowest-non-zero baseline values and the 2 highest
  // finish values, so the spread between selected leaves drives improvementBp.
  //
  // The circuit's SignedImprovementCheck enforces
  //   claimedMagnitudeBp · baselineCross === diff · 10000
  // as strict equality, so the chosen sums must make the honest improvement
  // land on an integer bp. These values do — matches the working fixture in
  // `scripts/test-spring-push-proof.ts`:
  //   baseline picks: 490 + 510 = 1000 (indices 0, 1)
  //   finish   picks: 620 + 600 = 1220 (indices 3, 0)
  //   baselineCross = 1000·2 = 2000, finishCross = 1220·2 = 2440, diff = 440
  //   claimedMagnitudeBp = 440·10000 / 2000 = 2200 (+22.00%)
  const baselineVO2 = [490, 510, 530, 550];
  const baselineSteps = [7800, 8100, 7950, 8200];
  const finishVO2 = [600, 580, 590, 620];
  const finishSteps = [11200, 10800, 11500, 12000];

  const baselineLeaves = baselineDayIds.map((day, i) =>
    buildLeaf(walletAddress, day, baselineVO2[i], baselineSteps[i], {
      activeEnergy: 250 + i * 10,
      exerciseMins: 20 + i,
    }),
  );
  const finishLeaves = finishDayIds.map((day, i) =>
    buildLeaf(walletAddress, day, finishVO2[i], finishSteps[i], {
      activeEnergy: 500 + i * 10,
      exerciseMins: 55 + i,
      hrv: 60,
      restingHR: 56,
    }),
  );

  console.log("\n📤 Uploading baseline window (4 leaves)…");
  const baselineRes = await uploadWindow(
    walletAddress,
    encryptionKey,
    "baseline",
    baselineLeaves,
  );
  console.log(`   dataType:    ${baselineRes.dataType}`);
  console.log(`   storjUri:    ${baselineRes.storjUri}`);
  console.log(`   contentHash: ${baselineRes.contentHash}`);
  console.log(`   leafCount:   ${baselineRes.leafCount}`);
  baselineRes.hashes?.forEach((h, i) => {
    console.log(`   leaf[${i}].hashDec: ${h}`);
  });

  console.log("\n📤 Uploading finish window (4 leaves)…");
  const finishRes = await uploadWindow(
    walletAddress,
    encryptionKey,
    "finish",
    finishLeaves,
  );
  console.log(`   dataType:    ${finishRes.dataType}`);
  console.log(`   storjUri:    ${finishRes.storjUri}`);
  console.log(`   contentHash: ${finishRes.contentHash}`);
  console.log(`   leafCount:   ${finishRes.leafCount}`);
  finishRes.hashes?.forEach((h, i) => {
    console.log(`   leaf[${i}].hashDec: ${h}`);
  });

  console.log("\n✨ Seed complete. Next:");
  console.log("   pnpm exec tsx scripts/test-improvement-proof-witness.ts");
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
