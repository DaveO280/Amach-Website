/**
 * Check if an address has a profile on the Secure Health Profile contract.
 * Usage: pnpm exec tsx scripts/check-has-profile.ts [address]
 * Default address: 0x58147e61cc2683295c6eD00D5daeB8052B3D0c87
 */

import { createPublicClient, http } from "viem";
import { zkSyncSepoliaTestnet } from "viem/chains";

const PROXY = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a" as const;
const DEFAULT_ADDR =
  "0x58147e61cc2683295c6eD00D5daeB8052B3D0c87" as `0x${string}`;

const abi = [
  {
    inputs: [{ name: "user", type: "address" }],
    name: "hasProfile",
    outputs: [{ type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

async function main() {
  const address = (process.argv[2] || DEFAULT_ADDR) as `0x${string}`;
  const client = createPublicClient({
    chain: zkSyncSepoliaTestnet,
    transport: http("https://sepolia.era.zksync.dev"),
  });
  const hasProfile = await client.readContract({
    address: PROXY,
    abi,
    functionName: "hasProfile",
    args: [address],
  });
  console.log("Address:", address);
  console.log("hasProfile:", hasProfile);
  process.exit(hasProfile ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
