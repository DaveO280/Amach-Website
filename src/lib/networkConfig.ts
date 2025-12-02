/**
 * Network Configuration System
 *
 * Easily switch between testnet and mainnet via environment variable:
 * NEXT_PUBLIC_NETWORK=testnet (default) or NEXT_PUBLIC_NETWORK=mainnet
 */

import { defineChain } from "viem";

// zkSync Sepolia Testnet
export const zkSyncSepoliaTestnet = defineChain({
  id: 300,
  name: "zkSync Era Sepolia Testnet",
  network: "zksync-sepolia-testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://sepolia.era.zksync.dev"],
    },
    public: {
      http: ["https://sepolia.era.zksync.dev"],
    },
  },
  blockExplorers: {
    default: {
      name: "zkSync Era Sepolia Explorer",
      url: "https://sepolia.explorer.zksync.io",
    },
  },
  testnet: true,
});

// zkSync Mainnet
export const zkSyncMainnet = defineChain({
  id: 324,
  name: "zkSync Era Mainnet",
  network: "zksync-mainnet",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://mainnet.era.zksync.io"],
    },
    public: {
      http: ["https://mainnet.era.zksync.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "zkSync Era Explorer",
      url: "https://explorer.zksync.io",
    },
  },
  testnet: false,
});

// Network type
export type NetworkType = "testnet" | "mainnet";

// Get current network from environment variable
export function getCurrentNetwork(): NetworkType {
  if (typeof window !== "undefined") {
    // Client-side: check environment variable
    const network = process.env.NEXT_PUBLIC_NETWORK;
    if (network === "mainnet") return "mainnet";
    return "testnet"; // default
  }

  // Server-side: check environment variable
  const network = process.env.NEXT_PUBLIC_NETWORK;
  if (network === "mainnet") return "mainnet";
  return "testnet"; // default
}

// Get the active chain based on current network
export function getActiveChain():
  | typeof zkSyncMainnet
  | typeof zkSyncSepoliaTestnet {
  const network = getCurrentNetwork();
  return network === "mainnet" ? zkSyncMainnet : zkSyncSepoliaTestnet;
}

// Contract addresses per network
export const CONTRACT_ADDRESSES = {
  testnet: {
    PROFILE_VERIFICATION_CONTRACT: "0xC9950703cE4eD704d2a0B075F7FAC3d968940f57",
    SECURE_HEALTH_PROFILE_CONTRACT:
      "0x2A8015613623A6A8D369BcDC2bd6DD202230785a",
    HEALTH_TOKEN_CONTRACT: "0x057df807987f284b55ba6A9ab89d089fd8398B99",
    HEALTH_PROFILE_CONTRACT: "0x6C7e52F1FfBCc0Bf001BB9458B64D85d7D7eC9F8", // Legacy
  },
  mainnet: {
    // TODO: Update these with your mainnet contract addresses after deployment
    PROFILE_VERIFICATION_CONTRACT: "0x0000000000000000000000000000000000000000", // Placeholder
    SECURE_HEALTH_PROFILE_CONTRACT:
      "0x0000000000000000000000000000000000000000", // Placeholder
    HEALTH_TOKEN_CONTRACT: "0x0000000000000000000000000000000000000000", // Placeholder
    HEALTH_PROFILE_CONTRACT: "0x0000000000000000000000000000000000000000", // Placeholder
  },
} as const;

// Get contract addresses for current network
export function getContractAddresses():
  | typeof CONTRACT_ADDRESSES.testnet
  | typeof CONTRACT_ADDRESSES.mainnet {
  const network = getCurrentNetwork();
  return CONTRACT_ADDRESSES[network];
}

// Network configuration object
export const networkConfig = {
  current: getCurrentNetwork(),
  chain: getActiveChain(),
  contracts: getContractAddresses(),
  isTestnet: getCurrentNetwork() === "testnet",
  isMainnet: getCurrentNetwork() === "mainnet",
} as const;

// Helper to check if we're on mainnet
export function isMainnet(): boolean {
  return getCurrentNetwork() === "mainnet";
}

// Helper to check if we're on testnet
export function isTestnet(): boolean {
  return getCurrentNetwork() === "testnet";
}

// Export default network config
export default networkConfig;
