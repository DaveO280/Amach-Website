import { createConfig } from "@wagmi/core";
import { defineChain, http, parseEther, parseUnits } from "viem";
import { callPolicy, zksyncSsoConnector } from "zksync-sso/connector";

// Define ZKsync Sepolia Testnet chain
const zkSyncSepoliaTestnet = defineChain({
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

// Secure Health Profile contract ABI for encrypted data operations
const secureHealthProfileAbi = [
  {
    inputs: [
      { name: "_encryptedBirthDate", type: "string" },
      { name: "_encryptedSex", type: "string" },
      { name: "_encryptedHeight", type: "string" },
      { name: "_encryptedWeight", type: "string" },
      { name: "_encryptedEmail", type: "string" },
      { name: "_dataHash", type: "bytes32" },
      { name: "_nonce", type: "string" },
    ],
    name: "createSecureProfile",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "_encryptedBirthDate", type: "string" },
      { name: "_encryptedSex", type: "string" },
      { name: "_encryptedHeight", type: "string" },
      { name: "_encryptedWeight", type: "string" },
      { name: "_encryptedEmail", type: "string" },
      { name: "_dataHash", type: "bytes32" },
      { name: "_nonce", type: "string" },
    ],
    name: "updateSecureProfile",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getProfileMetadata",
    outputs: [
      { name: "timestamp", type: "uint256" },
      { name: "isActive", type: "bool" },
      { name: "version", type: "uint8" },
      { name: "dataHash", type: "bytes32" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getEncryptedProfile",
    outputs: [
      {
        components: [
          { name: "encryptedBirthDate", type: "string" },
          { name: "encryptedSex", type: "string" },
          { name: "encryptedHeight", type: "string" },
          { name: "encryptedWeight", type: "string" },
          { name: "encryptedEmail", type: "string" },
          { name: "dataHash", type: "bytes32" },
          { name: "timestamp", type: "uint256" },
          { name: "isActive", type: "bool" },
          { name: "version", type: "uint8" },
          { name: "nonce", type: "string" },
        ],
        name: "profile",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "_ageRange", type: "string" },
      { name: "_heightRange", type: "string" },
      { name: "_weightRange", type: "string" },
      { name: "_emailDomain", type: "string" },
      { name: "_proofHash", type: "bytes32" },
    ],
    name: "submitZKProof",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getZKProofHash",
    outputs: [{ name: "", type: "bytes32" }],
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
    inputs: [],
    name: "currentVersion",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Profile Verification contract ABI for verification operations
const profileVerificationAbi = [
  {
    inputs: [
      { name: "email", type: "string" },
      { name: "signature", type: "bytes" },
    ],
    name: "verifyProfile",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "email", type: "string" }],
    name: "verifyProfileZKsync",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getUserVerification",
    outputs: [
      {
        components: [
          { name: "email", type: "string" },
          { name: "wallet", type: "address" },
          { name: "userId", type: "uint256" },
          { name: "timestamp", type: "uint256" },
          { name: "isActive", type: "bool" },
          { name: "hasReceivedTokens", type: "bool" },
          { name: "tokenAllocation", type: "uint256" },
        ],
        name: "verification",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "email", type: "string" }],
    name: "emailToWallet",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "claimAllocation",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_healthToken", type: "address" }],
    name: "setHealthToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "email", type: "string" }],
    name: "isEmailWhitelisted",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "email", type: "string" }],
    name: "isEmailInUse",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getAllocationConfig",
    outputs: [
      {
        components: [
          { name: "maxAllocations", type: "uint256" },
          { name: "allocationPerUser", type: "uint256" },
          { name: "totalAllocated", type: "uint256" },
          { name: "isActive", type: "bool" },
        ],
        name: "config",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Health profile contract ABI for health data operations
const healthProfileAbi = [
  {
    inputs: [
      { name: "encryptedBirthDate", type: "bytes32" },
      { name: "encryptedSex", type: "bytes32" },
      { name: "encryptedHeight", type: "bytes32" },
      { name: "encryptedWeight", type: "bytes32" },
      { name: "dataHash", type: "bytes32" },
    ],
    name: "createProfile",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "encryptedBirthDate", type: "bytes32" },
      { name: "encryptedSex", type: "bytes32" },
      { name: "encryptedHeight", type: "bytes32" },
      { name: "encryptedWeight", type: "bytes32" },
      { name: "dataHash", type: "bytes32" },
    ],
    name: "updateProfile",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "encryptedWeight", type: "bytes32" },
      { name: "dataHash", type: "bytes32" },
    ],
    name: "updateWeight",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getProfile",
    outputs: [
      {
        components: [
          { name: "encryptedBirthDate", type: "bytes32" },
          { name: "encryptedSex", type: "bytes32" },
          { name: "encryptedHeight", type: "bytes32" },
          { name: "encryptedWeight", type: "bytes32" },
          { name: "dataHash", type: "bytes32" },
          { name: "timestamp", type: "uint256" },
          { name: "isActive", type: "bool" },
          { name: "version", type: "uint8" },
          { name: "zkProofHash", type: "bytes32" },
        ],
        name: "profile",
        type: "tuple",
      },
    ],
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
    name: "hasActiveProfile",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getProfileCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Contract addresses (Fresh deployment - October 2025)
// Complete system redeployment with clean slate for beta testing
const HEALTH_PROFILE_CONTRACT = "0x6C7e52F1FfBCc0Bf001BB9458B64D85d7D7eC9F8"; // Legacy (deprecated)
const HEALTH_TOKEN_CONTRACT = "0x34f947904bb4fdb9CD9bA42168Dd457EeD00cf6A"; // Fresh deployment Oct 2025
const SECURE_HEALTH_PROFILE_CONTRACT =
  "0xa71CE608264b96bf3D7ca480180eE528B7733fdc"; // With getEncryptedProfile getter
const PROFILE_VERIFICATION_CONTRACT =
  "0x3212DA87f72690a0833B7cBe01ecE792b296260f"; // Fresh deployment Oct 2025

// Export the ABIs and contract addresses
export {
  HEALTH_PROFILE_CONTRACT,
  HEALTH_TOKEN_CONTRACT,
  healthProfileAbi,
  PROFILE_VERIFICATION_CONTRACT,
  profileVerificationAbi,
  SECURE_HEALTH_PROFILE_CONTRACT,
  secureHealthProfileAbi,
};

// Token decimals for health-related transactions
const HEALTH_TOKEN_DECIMALS = 18;

// ZKsync SSO Connector with health-specific session configuration
export const ssoConnector = zksyncSsoConnector({
  // Use ZKsync hosted auth server (default)
  // No authServerUrl needed - uses ZKsync's hosted service

  // Session configuration for health data operations
  session: {
    // Session expires in 7 days (extended for better timing flexibility)
    expiry: "7 days",

    // Allow up to 0.1 ETH to be spent in gas fees for health operations
    feeLimit: parseEther("0.1"),

    // Allow ETH transfers for health-related payments
    transfers: [
      {
        // Allow transfers to health data contract
        to: HEALTH_PROFILE_CONTRACT,
        valueLimit: parseEther("0.05"),
      },
      // Add more health-related addresses as needed
    ],

    // Allow calling health profile and verification smart contracts
    contractCalls: [
      // Profile verification (with signature)
      callPolicy({
        address: PROFILE_VERIFICATION_CONTRACT,
        abi: profileVerificationAbi,
        functionName: "verifyProfile",
        constraints: [],
      }),
      // Profile verification (ZKsync SSO - no signature required)
      callPolicy({
        address: PROFILE_VERIFICATION_CONTRACT,
        abi: profileVerificationAbi,
        functionName: "verifyProfileZKsync",
        constraints: [],
      }),
      // Health profile creation
      callPolicy({
        address: HEALTH_PROFILE_CONTRACT,
        abi: healthProfileAbi,
        functionName: "createProfile",
        constraints: [],
      }),
      // Health profile updates
      callPolicy({
        address: HEALTH_PROFILE_CONTRACT,
        abi: healthProfileAbi,
        functionName: "updateProfile",
        constraints: [],
      }),
      // Weight updates (most frequent operation)
      callPolicy({
        address: HEALTH_PROFILE_CONTRACT,
        abi: healthProfileAbi,
        functionName: "updateWeight",
        constraints: [],
      }),
      // Token allocation claiming
      callPolicy({
        address: PROFILE_VERIFICATION_CONTRACT,
        abi: profileVerificationAbi,
        functionName: "claimAllocation",
        constraints: [],
      }),
      // Secure profile creation (encrypted data)
      callPolicy({
        address: SECURE_HEALTH_PROFILE_CONTRACT,
        abi: secureHealthProfileAbi,
        functionName: "createSecureProfile",
        constraints: [],
      }),
      // Secure profile updates (encrypted data)
      callPolicy({
        address: SECURE_HEALTH_PROFILE_CONTRACT,
        abi: secureHealthProfileAbi,
        functionName: "updateSecureProfile",
        constraints: [],
      }),
      // ZK-proof submission
      callPolicy({
        address: SECURE_HEALTH_PROFILE_CONTRACT,
        abi: secureHealthProfileAbi,
        functionName: "submitZKProof",
        constraints: [],
      }),
    ],
  },
});

// Wagmi configuration for ZKsync SSO
export const wagmiConfig = createConfig({
  connectors: [ssoConnector],
  chains: [zkSyncSepoliaTestnet],
  transports: {
    [zkSyncSepoliaTestnet.id]: http("https://sepolia.era.zksync.dev"), // Explicit RPC URL
  },
});

// Health-specific SSO configuration
export const healthSsoConfig = {
  // Contract addresses
  contracts: {
    healthProfile: HEALTH_PROFILE_CONTRACT,
    profileVerification: PROFILE_VERIFICATION_CONTRACT,
    // Add other health-related contracts as needed
  },

  // Network configuration
  network: {
    chainId: zkSyncSepoliaTestnet.id,
    name: zkSyncSepoliaTestnet.name,
    rpcUrl: zkSyncSepoliaTestnet.rpcUrls.default.http[0],
  },

  // Session limits for health operations
  sessionLimits: {
    maxGasFee: parseEther("0.1"),
    maxTransferValue: parseEther("0.05"),
    maxHealthTokenAmount: parseUnits("1.0", HEALTH_TOKEN_DECIMALS),
    sessionDuration: "1 day",
  },

  // Health data permissions
  healthDataPermissions: {
    read: "READ_ONLY",
    write: "READ_WRITE",
    admin: "FULL_ACCESS",
  },
} as const;

export default healthSsoConfig;
