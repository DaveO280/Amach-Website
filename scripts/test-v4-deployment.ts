/**
 * Post-Deployment Test Script for SecureHealthProfileV4
 *
 * Run this BEFORE and AFTER deployment to verify:
 * 1. Existing functionality (profiles, events) still works
 * 2. New attestation functions work correctly
 * 3. No data was lost during upgrade
 *
 * Usage:
 *   # Before upgrade - capture baseline
 *   NETWORK=sepolia pnpm exec tsx scripts/test-v4-deployment.ts --before
 *
 *   # After upgrade - verify everything works
 *   NETWORK=sepolia pnpm exec tsx scripts/test-v4-deployment.ts --after
 *
 *   # Full test (creates attestation)
 *   NETWORK=sepolia pnpm exec tsx scripts/test-v4-deployment.ts --full
 */

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { zkSyncSepoliaTestnet, zkSync } from "viem/chains";
import * as fs from "fs";

// Contract address
const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a" as const;

// ABI for testing (includes V3 and V4 functions)
const testAbi = [
  // V1-V3 Functions
  {
    inputs: [],
    name: "getContractVersion",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getTotalProfiles",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "hasProfile",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getEventCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  // V4 Attestation Functions
  {
    inputs: [],
    name: "totalAttestations",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "TIER_GOLD_MIN_SCORE",
    outputs: [{ name: "", type: "uint16" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "TIER_SILVER_MIN_SCORE",
    outputs: [{ name: "", type: "uint16" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "TIER_BRONZE_MIN_SCORE",
    outputs: [{ name: "", type: "uint16" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "user", type: "address" },
      { name: "dataType", type: "uint8" },
    ],
    name: "getAttestationCount",
    outputs: [{ name: "count", type: "uint16" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "contentHash", type: "bytes32" }],
    name: "isHashAttested",
    outputs: [
      { name: "attested", type: "bool" },
      { name: "attestor", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "contentHash", type: "bytes32" },
      { name: "dataType", type: "uint8" },
      { name: "startDate", type: "uint40" },
      { name: "endDate", type: "uint40" },
      { name: "completenessScore", type: "uint16" },
      { name: "recordCount", type: "uint16" },
      { name: "coreComplete", type: "bool" },
    ],
    name: "createAttestation",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "score", type: "uint16" }],
    name: "getAttestationTier",
    outputs: [{ name: "tier", type: "uint8" }],
    stateMutability: "pure",
    type: "function",
  },
] as const;

interface TestResults {
  timestamp: string;
  network: string;
  phase: "before" | "after" | "full";
  contractVersion: number;
  totalProfiles: bigint;
  ownerAddress: string;
  tests: {
    name: string;
    passed: boolean;
    value?: unknown;
    error?: string;
  }[];
}

async function main() {
  const args = process.argv.slice(2);
  const phase = args.includes("--before")
    ? "before"
    : args.includes("--after")
      ? "after"
      : "full";
  const network = process.env.NETWORK === "mainnet" ? "mainnet" : "sepolia";

  console.log("🧪 SecureHealthProfileV4 Deployment Test\n");
  console.log(`   Network: ${network}`);
  console.log(`   Phase: ${phase}`);
  console.log(`   Contract: ${PROXY_ADDRESS}\n`);
  console.log("=".repeat(60));

  // Setup clients
  const chain = network === "mainnet" ? zkSync : zkSyncSepoliaTestnet;
  const rpcUrl =
    network === "mainnet"
      ? "https://mainnet.era.zksync.io"
      : "https://sepolia.era.zksync.dev";

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const results: TestResults = {
    timestamp: new Date().toISOString(),
    network,
    phase,
    contractVersion: 0,
    totalProfiles: 0n,
    ownerAddress: "",
    tests: [],
  };

  // Test 1: Contract Version
  console.log("\n📋 Test 1: Contract Version");
  try {
    const version = await publicClient.readContract({
      address: PROXY_ADDRESS,
      abi: testAbi,
      functionName: "getContractVersion",
    });
    results.contractVersion = version;
    const passed = phase === "after" ? version === 4 : version >= 1;
    results.tests.push({ name: "contractVersion", passed, value: version });
    console.log(`   Version: ${version} ${passed ? "✅" : "❌"}`);
    if (phase === "after" && version !== 4) {
      console.log("   ⚠️  Expected version 4 after upgrade!");
    }
  } catch (error) {
    results.tests.push({
      name: "contractVersion",
      passed: false,
      error: String(error),
    });
    console.log(`   ❌ Error: ${error}`);
  }

  // Test 2: Total Profiles (should be preserved)
  console.log("\n📋 Test 2: Total Profiles");
  try {
    const totalProfiles = await publicClient.readContract({
      address: PROXY_ADDRESS,
      abi: testAbi,
      functionName: "getTotalProfiles",
    });
    results.totalProfiles = totalProfiles;
    results.tests.push({
      name: "totalProfiles",
      passed: true,
      value: totalProfiles.toString(),
    });
    console.log(`   Total Profiles: ${totalProfiles} ✅`);
  } catch (error) {
    results.tests.push({
      name: "totalProfiles",
      passed: false,
      error: String(error),
    });
    console.log(`   ❌ Error: ${error}`);
  }

  // Test 3: Owner Address (should be preserved)
  console.log("\n📋 Test 3: Owner Address");
  try {
    const owner = await publicClient.readContract({
      address: PROXY_ADDRESS,
      abi: testAbi,
      functionName: "owner",
    });
    results.ownerAddress = owner;
    results.tests.push({ name: "ownerAddress", passed: true, value: owner });
    console.log(`   Owner: ${owner} ✅`);
  } catch (error) {
    results.tests.push({
      name: "ownerAddress",
      passed: false,
      error: String(error),
    });
    console.log(`   ❌ Error: ${error}`);
  }

  // Test 4: V4 Attestation Functions (only after upgrade)
  if (phase === "after" || phase === "full") {
    console.log("\n📋 Test 4: V4 Attestation Functions");

    // 4a: totalAttestations
    try {
      const totalAttestations = await publicClient.readContract({
        address: PROXY_ADDRESS,
        abi: testAbi,
        functionName: "totalAttestations",
      });
      results.tests.push({
        name: "totalAttestations",
        passed: true,
        value: totalAttestations.toString(),
      });
      console.log(`   totalAttestations(): ${totalAttestations} ✅`);
    } catch (error) {
      results.tests.push({
        name: "totalAttestations",
        passed: false,
        error: String(error),
      });
      console.log(`   ❌ totalAttestations() failed: ${error}`);
    }

    // 4b: Tier thresholds
    try {
      const goldMin = await publicClient.readContract({
        address: PROXY_ADDRESS,
        abi: testAbi,
        functionName: "TIER_GOLD_MIN_SCORE",
      });
      const silverMin = await publicClient.readContract({
        address: PROXY_ADDRESS,
        abi: testAbi,
        functionName: "TIER_SILVER_MIN_SCORE",
      });
      const bronzeMin = await publicClient.readContract({
        address: PROXY_ADDRESS,
        abi: testAbi,
        functionName: "TIER_BRONZE_MIN_SCORE",
      });

      const passed =
        goldMin === 8000 && silverMin === 6000 && bronzeMin === 4000;
      results.tests.push({
        name: "tierThresholds",
        passed,
        value: { gold: goldMin, silver: silverMin, bronze: bronzeMin },
      });
      console.log(
        `   Tier thresholds: Gold=${goldMin} Silver=${silverMin} Bronze=${bronzeMin} ${passed ? "✅" : "❌"}`,
      );
    } catch (error) {
      results.tests.push({
        name: "tierThresholds",
        passed: false,
        error: String(error),
      });
      console.log(`   ❌ Tier thresholds failed: ${error}`);
    }

    // 4c: getAttestationTier (pure function)
    try {
      const tierGold = await publicClient.readContract({
        address: PROXY_ADDRESS,
        abi: testAbi,
        functionName: "getAttestationTier",
        args: [8500], // Should be gold (3)
      });
      const tierSilver = await publicClient.readContract({
        address: PROXY_ADDRESS,
        abi: testAbi,
        functionName: "getAttestationTier",
        args: [6500], // Should be silver (2)
      });
      const tierBronze = await publicClient.readContract({
        address: PROXY_ADDRESS,
        abi: testAbi,
        functionName: "getAttestationTier",
        args: [4500], // Should be bronze (1)
      });
      const tierNone = await publicClient.readContract({
        address: PROXY_ADDRESS,
        abi: testAbi,
        functionName: "getAttestationTier",
        args: [3000], // Should be none (0)
      });

      const passed =
        tierGold === 3 &&
        tierSilver === 2 &&
        tierBronze === 1 &&
        tierNone === 0;
      results.tests.push({
        name: "getAttestationTier",
        passed,
        value: {
          gold: tierGold,
          silver: tierSilver,
          bronze: tierBronze,
          none: tierNone,
        },
      });
      console.log(
        `   getAttestationTier(): 8500→${tierGold} 6500→${tierSilver} 4500→${tierBronze} 3000→${tierNone} ${passed ? "✅" : "❌"}`,
      );
    } catch (error) {
      results.tests.push({
        name: "getAttestationTier",
        passed: false,
        error: String(error),
      });
      console.log(`   ❌ getAttestationTier() failed: ${error}`);
    }

    // 4d: isHashAttested (should return false for random hash)
    try {
      const randomHash = `0x${"a".repeat(64)}` as `0x${string}`;
      const [attested] = await publicClient.readContract({
        address: PROXY_ADDRESS,
        abi: testAbi,
        functionName: "isHashAttested",
        args: [randomHash],
      });
      results.tests.push({
        name: "isHashAttested",
        passed: attested === false,
        value: attested,
      });
      console.log(
        `   isHashAttested(random): ${attested} ${attested === false ? "✅" : "❌"}`,
      );
    } catch (error) {
      results.tests.push({
        name: "isHashAttested",
        passed: false,
        error: String(error),
      });
      console.log(`   ❌ isHashAttested() failed: ${error}`);
    }
  }

  // Test 5: Create attestation (only in full mode with private key)
  if (phase === "full" && process.env.PRIVATE_KEY) {
    console.log("\n📋 Test 5: Create Test Attestation");
    try {
      const account = privateKeyToAccount(
        process.env.PRIVATE_KEY as `0x${string}`,
      );
      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(rpcUrl),
      });

      // Check if user has a profile (required for attestation)
      const hasProfile = await publicClient.readContract({
        address: PROXY_ADDRESS,
        abi: testAbi,
        functionName: "hasProfile",
        args: [account.address],
      });

      if (!hasProfile) {
        console.log(
          `   ⚠️  Account ${account.address} has no profile - skipping attestation test`,
        );
        results.tests.push({
          name: "createAttestation",
          passed: true,
          value: "skipped - no profile",
        });
      } else {
        // Create a test attestation
        const testHash =
          `0x${Date.now().toString(16).padStart(64, "0")}` as `0x${string}`;
        const now = Math.floor(Date.now() / 1000);

        console.log(
          `   Creating attestation with hash: ${testHash.slice(0, 18)}...`,
        );

        const txHash = await walletClient.writeContract({
          address: PROXY_ADDRESS,
          abi: testAbi,
          functionName: "createAttestation",
          args: [
            testHash, // contentHash
            0, // dataType (DEXA)
            now - 86400, // startDate (yesterday)
            now, // endDate (now)
            8500, // completenessScore (85%)
            1, // recordCount
            true, // coreComplete
          ],
        });

        console.log(`   Transaction: ${txHash}`);

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
        });
        console.log(
          `   Status: ${receipt.status === "success" ? "✅ Success" : "❌ Failed"}`,
        );

        // Verify the attestation exists
        const [attested, attestor] = await publicClient.readContract({
          address: PROXY_ADDRESS,
          abi: testAbi,
          functionName: "isHashAttested",
          args: [testHash],
        });

        const passed = attested && attestor === account.address;
        results.tests.push({
          name: "createAttestation",
          passed,
          value: { txHash, attested, attestor },
        });
        console.log(
          `   Verified: attested=${attested} attestor=${attestor} ${passed ? "✅" : "❌"}`,
        );
      }
    } catch (error) {
      results.tests.push({
        name: "createAttestation",
        passed: false,
        error: String(error),
      });
      console.log(`   ❌ Error: ${error}`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Test Summary\n");

  const passed = results.tests.filter((t) => t.passed).length;
  const failed = results.tests.filter((t) => !t.passed).length;

  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total:  ${results.tests.length}`);

  // Save results
  const filename = `test-results-${phase}-${network}-${Date.now()}.json`;
  fs.writeFileSync(
    filename,
    JSON.stringify(
      results,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );
  console.log(`\n   Results saved to: ${filename}`);

  // Compare with before (if after phase)
  if (phase === "after") {
    console.log("\n📋 Comparing with pre-upgrade state...");
    const beforeFiles = fs
      .readdirSync(".")
      .filter((f) => f.startsWith(`test-results-before-${network}`));
    if (beforeFiles.length > 0) {
      const latestBefore = beforeFiles.sort().pop()!;
      const before = JSON.parse(
        fs.readFileSync(latestBefore, "utf-8"),
      ) as TestResults;

      console.log(`   Comparing with: ${latestBefore}`);
      console.log(
        `   Total profiles: ${before.totalProfiles} → ${results.totalProfiles} ${before.totalProfiles.toString() === results.totalProfiles.toString() ? "✅" : "❌ DATA LOSS?"}`,
      );
      console.log(
        `   Owner: ${before.ownerAddress === results.ownerAddress ? "unchanged ✅" : "CHANGED ❌"}`,
      );
      console.log(
        `   Version: ${before.contractVersion} → ${results.contractVersion}`,
      );
    } else {
      console.log(
        "   ⚠️  No pre-upgrade test results found. Run with --before first.",
      );
    }
  }

  if (failed > 0) {
    console.log("\n❌ Some tests failed!");
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed!");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
