#!/usr/bin/env tsx
/**
 * test-seed-flow.ts
 *
 * End-to-end flow test for the Spring Push seed path:
 *   1. Derives the test wallet address + encryption key from PRIVATE_KEY
 *   2. Builds the same 4-leaf baseline + finish fixture the widget uses
 *   3. POSTs both windows to /api/merkle/v2/upload
 *   4. Verifies Storj round-trip by checking each upload response
 *   5. Computes the baseline Merkle root (matches what register() commits)
 *   6. Reads live contract state from zkSync Era Sepolia
 *
 * Auth: the upload route requires a Privy identity token.
 *   Option A (browser): log in at the preview URL, open DevTools console, run
 *     const { getIdentityToken } = await import('@privy-io/react-auth');
 *     console.log(await getIdentityToken());
 *   then pass it: PRIVY_IDENTITY_TOKEN=<token> pnpm exec tsx scripts/test-seed-flow.ts
 *
 *   Option B (dev bypass): set SKIP_PRIVY_AUTH=true + SEED_BYPASS_SECRET=<secret>
 *   in .env.local, and ensure those same vars are set on the target server.
 *   This script sends Authorization: Bearer bypass:<secret> in that mode.
 *
 * Usage:
 *   # Against local dev server:
 *   PRIVATE_KEY=0x... PRIVY_IDENTITY_TOKEN=<tok> BASE_URL=http://localhost:3000 \
 *     pnpm exec tsx scripts/test-seed-flow.ts
 *
 *   # Against Vercel preview:
 *   PRIVATE_KEY=0x... PRIVY_IDENTITY_TOKEN=<tok> \
 *     BASE_URL=https://amach-website-7w6jh21re-daveo280s-projects.vercel.app \
 *     pnpm exec tsx scripts/test-seed-flow.ts
 */

import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { defineChain } from "viem";
import {
  deriveEncryptionKeyFromSignature,
  getKeyDerivationMessage,
  type WalletEncryptionKey,
} from "../src/utils/walletEncryption";
import {
  __internal as witnessInternal,
  hashLeafV2,
  serializeLeafV2,
  type AmachLeafV2Fields,
} from "../src/zk/improvementWitnessBuilder";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL =
  process.env.BASE_URL ??
  "https://amach-website-7w6jh21re-daveo280s-projects.vercel.app";

const ESCROW_ADDRESS = "0x99A695c61fC6775C03e3359D50613A2c8bc90806";

const zkSyncSepolia = defineChain({
  id: 300,
  name: "zkSync Era Sepolia",
  network: "zksync-era-sepolia",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: ["https://sepolia.era.zksync.dev"] },
    public: { http: ["https://sepolia.era.zksync.dev"] },
  },
  blockExplorers: {
    default: {
      name: "zkSync Explorer",
      url: "https://explorer.sepolia.era.zksync.dev",
    },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Leaf fixture — mirrors SEED_* constants in SpringPushWidget.tsx
// ─────────────────────────────────────────────────────────────────────────────

const SEED_BASELINE_DAY_IDS = [0, 1, 2, 3];
const SEED_FINISH_DAY_IDS = [90, 91, 92, 93];
const SEED_BASELINE_VO2 = [490, 510, 530, 550];
const SEED_FINISH_VO2 = [600, 580, 590, 620];

function buildSeedLeaf(
  wallet: string,
  dayId: number,
  vo2max: number,
): AmachLeafV2Fields {
  return {
    wallet,
    dayId,
    timezoneOffset: -300,
    steps: 8000,
    activeEnergy: 35000,
    exerciseMins: 40,
    hrv: 42,
    restingHR: 58,
    sleepMins: 450,
    workoutCount: 1,
    sourceCount: 2,
    dataFlags: 0x0000_03ff,
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
  };
}

function computeBaselineRoot(leaves: AmachLeafV2Fields[]): bigint {
  const TARGET = 128;
  const DEPTH = 7;
  const dummy = witnessInternal.makeDummyLeafV2();
  const bufs: Uint8Array[] = leaves.map(serializeLeafV2);
  while (bufs.length < TARGET) bufs.push(dummy);
  const hashes = bufs.map(hashLeafV2);
  const tree = witnessInternal.buildMerkleTree(hashes, DEPTH);
  return tree[tree.length - 1][0];
}

function bigintToBytes32Hex(value: bigint): string {
  return "0x" + value.toString(16).padStart(64, "0");
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract ABI (read-only calls only)
// ─────────────────────────────────────────────────────────────────────────────

const ESCROW_ABI = [
  {
    type: "function",
    name: "state",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "prizePool",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "participantCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "MAX_PARTICIPANTS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "MIN_PARTICIPANTS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "registered",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // ── Credentials ──────────────────────────────────────────────────────────
  const rawKey = process.env.TEST_WALLET_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
  if (!rawKey) {
    throw new Error(
      "Set PRIVATE_KEY or TEST_WALLET_PRIVATE_KEY to a 0x-prefixed key.",
    );
  }
  const pk = (
    rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`
  ) as `0x${string}`;
  const account = privateKeyToAccount(pk);
  const walletAddress = account.address;

  // Auth token: real Privy identity token OR bypass secret
  const identityToken = process.env.PRIVY_IDENTITY_TOKEN;
  const bypassSecret = process.env.SEED_BYPASS_SECRET;
  const authHeader = identityToken
    ? `Bearer ${identityToken}`
    : bypassSecret
      ? `Bearer bypass:${bypassSecret}`
      : null;

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  Spring Push Seed Flow — end-to-end test             ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log("🔑  Test wallet :", walletAddress);
  console.log("🌐  Base URL    :", BASE_URL);
  console.log(
    "🪪  Auth        :",
    identityToken
      ? `real Privy token (${identityToken.slice(0, 20)}…)`
      : bypassSecret
        ? "bypass secret"
        : "❌  NONE — upload will be skipped (set PRIVY_IDENTITY_TOKEN or SEED_BYPASS_SECRET)",
  );

  // ── Derive encryption key ─────────────────────────────────────────────────
  console.log("\n[1/5] Deriving encryption key from private-key signature…");
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
  console.log("   ✅ Key derived:", derivedKey.slice(0, 12) + "…");

  // ── Build leaves ──────────────────────────────────────────────────────────
  console.log("\n[2/5] Building leaf fixtures…");
  const baselineLeaves = SEED_BASELINE_DAY_IDS.map((day, i) =>
    buildSeedLeaf(walletAddress, day, SEED_BASELINE_VO2[i]),
  );
  const finishLeaves = SEED_FINISH_DAY_IDS.map((day, i) =>
    buildSeedLeaf(walletAddress, day, SEED_FINISH_VO2[i]),
  );
  const baselineRoot = computeBaselineRoot(baselineLeaves);
  const rootHex = bigintToBytes32Hex(baselineRoot);
  console.log("   baseline leaves:", baselineLeaves.length);
  console.log("   finish leaves  :", finishLeaves.length);
  console.log("   baselineRoot   :", rootHex);

  // ── Upload to API ─────────────────────────────────────────────────────────
  if (!authHeader) {
    console.log(
      "\n[3/5] ⚠️  Skipping API upload — no auth token available.\n" +
        "     To upload, provide PRIVY_IDENTITY_TOKEN or SEED_BYPASS_SECRET.\n" +
        "     Get a real token: log in at the app, open DevTools console, run:\n" +
        '       const { getIdentityToken } = await import("@privy-io/react-auth");\n' +
        "       console.log(await getIdentityToken());\n" +
        "     Then re-run: PRIVY_IDENTITY_TOKEN=<token> pnpm exec tsx scripts/test-seed-flow.ts",
    );
  } else {
    const upload = async (
      window: "baseline" | "finish",
      leaves: AmachLeafV2Fields[],
    ): Promise<void> => {
      const res = await fetch(`${BASE_URL}/api/merkle/v2/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ walletAddress, encryptionKey, window, leaves }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        storjUri?: string;
        leafCount?: number;
        dataType?: string;
      };
      if (!res.ok || json.success === false) {
        throw new Error(
          `[${window}] upload failed (HTTP ${res.status}): ${json.error ?? "unknown"}`,
        );
      }
      console.log(
        `   ✅ [${window}]  leafCount=${json.leafCount}  dataType=${json.dataType}`,
      );
      console.log(`         storjUri : ${json.storjUri ?? "n/a"}`);
    };

    console.log("\n[3/5] Uploading baseline window…");
    await upload("baseline", baselineLeaves);
    console.log("\n[4/5] Uploading finish window…");
    await upload("finish", finishLeaves);
  }

  // ── Contract state ────────────────────────────────────────────────────────
  const stepLabel = authHeader ? "[5/5]" : "[3/3]";
  console.log(`\n${stepLabel} Reading contract state from zkSync Era Sepolia…`);
  const client = createPublicClient({
    chain: zkSyncSepolia,
    transport: http(),
  });

  const stateNames = [
    "UNINITIALIZED",
    "REGISTRATION_OPEN",
    "ACTIVE",
    "CLAIMING",
    "FINISHED",
    "FAILED",
  ];

  const [rawState, rawPrize, rawCount, rawMax, rawMin, isRegistered] =
    await Promise.all([
      client.readContract({
        address: ESCROW_ADDRESS as `0x${string}`,
        abi: ESCROW_ABI,
        functionName: "state",
      }),
      client.readContract({
        address: ESCROW_ADDRESS as `0x${string}`,
        abi: ESCROW_ABI,
        functionName: "prizePool",
      }),
      client.readContract({
        address: ESCROW_ADDRESS as `0x${string}`,
        abi: ESCROW_ABI,
        functionName: "participantCount",
      }),
      client.readContract({
        address: ESCROW_ADDRESS as `0x${string}`,
        abi: ESCROW_ABI,
        functionName: "MAX_PARTICIPANTS",
      }),
      client.readContract({
        address: ESCROW_ADDRESS as `0x${string}`,
        abi: ESCROW_ABI,
        functionName: "MIN_PARTICIPANTS",
      }),
      client.readContract({
        address: ESCROW_ADDRESS as `0x${string}`,
        abi: ESCROW_ABI,
        functionName: "registered",
        args: [walletAddress as `0x${string}`],
      }),
    ]);

  const stateName = stateNames[Number(rawState)] ?? `UNKNOWN(${rawState})`;
  const prizeEth = (Number(rawPrize) / 1e18).toFixed(4);
  const participants = Number(rawCount);
  const maxP = Number(rawMax);
  const minP = Number(rawMin);
  const canRegister = stateName === "REGISTRATION_OPEN" && !isRegistered;

  console.log("\n   ┌──────────────────────────────────────────────────┐");
  console.log(`   │  Contract : ${ESCROW_ADDRESS}  │`);
  console.log(`   │  State    : ${stateName.padEnd(36)}│`);
  console.log(
    `   │  Prize    : ${prizeEth} ETH${" ".repeat(33 - prizeEth.length)}│`,
  );
  console.log(
    `   │  Parts    : ${participants}/${maxP} (min ${minP})${" ".repeat(22 - String(participants).length - String(maxP).length)}│`,
  );
  console.log(
    `   │  Registered (${walletAddress.slice(0, 8)}…): ${String(isRegistered).padEnd(26)}│`,
  );
  console.log(`   │  baselineRoot : ${rootHex.slice(0, 18)}…  │`);
  console.log("   └──────────────────────────────────────────────────┘");

  if (stateName !== "REGISTRATION_OPEN") {
    console.log(
      `\n⚠️  Contract is in ${stateName} — registration may not be possible.`,
    );
  } else if (isRegistered) {
    console.log(
      "\n✅  Wallet is already registered. No register() call needed.",
    );
  } else if (!authHeader) {
    console.log(
      "\n⏭️  Leaves not uploaded (no auth). Once you provide a Privy identity",
      "\n   token, re-run this script then call register() with the baselineRoot",
      "\n   printed above.",
    );
  } else {
    console.log(
      "\n🏁  Leaves uploaded. Next step: call register() on the widget with",
      `\n   baselineRoot ${rootHex}`,
    );
  }

  if (canRegister && !authHeader) {
    console.log(
      "\n🔔  ACTION NEEDED:",
      "\n   1. Get a Privy identity token from the browser (see above)",
      "\n   2. Re-run: PRIVY_IDENTITY_TOKEN=<token> pnpm exec tsx scripts/test-seed-flow.ts",
      "\n   3. Then click Register in the Spring Push widget",
    );
  }
}

main().catch((err: unknown) => {
  console.error("\n❌ test-seed-flow failed:", err);
  process.exit(1);
});
