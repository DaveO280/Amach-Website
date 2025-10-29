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
  {
    inputs: [{ name: "user", type: "address" }],
    name: "hasProfile",
    outputs: [{ name: "", type: "bool" }],
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
const HEALTH_TOKEN_CONTRACT = "0x057df807987f284b55ba6A9ab89d089fd8398B99"; // Clean Slate - Oct 29 2025
const SECURE_HEALTH_PROFILE_CONTRACT =
  "0xb1e41c4913D52E20aAaF4728c0449Bc6320a45A3"; // Clean Slate - Oct 29 2025
const PROFILE_VERIFICATION_CONTRACT =
  "0xA2D3b1b8080895C5bE335d8352D867e4b6e51ab3"; // Clean Slate - Oct 29 2025

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
// 🔒 SECURITY CONFIGURATION FOR MAINNET READINESS
export const ssoConnector = zksyncSsoConnector({
  // Use ZKsync hosted auth server (default)
  // No authServerUrl needed - uses ZKsync's hosted service

  // Session configuration for health data operations
  session: {
    // 🔐 Session expires in 1 day (reduced from 7 days for security)
    // User will need to reconnect daily, balancing security with UX
    expiry: "1 day",

    // 🔐 Allow up to 0.05 ETH in gas fees per session (reduced from 0.1 ETH)
    // Limits damage if session key is compromised
    feeLimit: parseEther("0.05"),

    // 🔐 Allow ETH transfers for health-related payments
    transfers: [
      {
        // Allow transfers to legacy health profile contract
        to: HEALTH_PROFILE_CONTRACT,
        valueLimit: parseEther("0.01"), // Max 0.01 ETH per transfer (reduced from 0.05 ETH)
      },
      // Add more health-related addresses as needed
    ],

    // 🔐 Smart contracts enforce one-time operations at the contract level:
    //   - claimAllocation: Only once per wallet (contract enforces)
    //   - createProfile/createSecureProfile: Only once per wallet (contract enforces)
    //   - verifyProfile: Only once per wallet (contract enforces)
    // SSO session provides UX (no explicit signatures), contracts provide security
    contractCalls: [
      // Profile verification (with signature)
      // Contract enforces: One verification per wallet
      callPolicy({
        address: PROFILE_VERIFICATION_CONTRACT,
        abi: profileVerificationAbi,
        functionName: "verifyProfile",
      }),
      // Profile verification (ZKsync SSO - no signature)
      // Contract enforces: One verification per wallet
      callPolicy({
        address: PROFILE_VERIFICATION_CONTRACT,
        abi: profileVerificationAbi,
        functionName: "verifyProfileZKsync",
      }),
      // Health profile creation (legacy)
      // Contract enforces: One profile per wallet
      callPolicy({
        address: HEALTH_PROFILE_CONTRACT,
        abi: healthProfileAbi,
        functionName: "createProfile",
      }),
      // Health profile updates (legacy)
      // Unlimited updates allowed (frequent operation)
      callPolicy({
        address: HEALTH_PROFILE_CONTRACT,
        abi: healthProfileAbi,
        functionName: "updateProfile",
      }),
      // Weight updates (legacy)
      // Unlimited updates allowed (daily tracking)
      callPolicy({
        address: HEALTH_PROFILE_CONTRACT,
        abi: healthProfileAbi,
        functionName: "updateWeight",
      }),
      // 🚨 CRITICAL: Token allocation claiming
      // Contract enforces: One claim per wallet (prevents token drainage)
      callPolicy({
        address: PROFILE_VERIFICATION_CONTRACT,
        abi: profileVerificationAbi,
        functionName: "claimAllocation",
      }),
      // Secure profile creation (encrypted data)
      // Contract enforces: One profile per wallet
      callPolicy({
        address: SECURE_HEALTH_PROFILE_CONTRACT,
        abi: secureHealthProfileAbi,
        functionName: "createSecureProfile",
      }),
      // Secure profile updates (encrypted data)
      // Unlimited updates allowed (frequent operation)
      callPolicy({
        address: SECURE_HEALTH_PROFILE_CONTRACT,
        abi: secureHealthProfileAbi,
        functionName: "updateSecureProfile",
      }),
      // ZK-proof submission
      // Unlimited submissions allowed (future proofs)
      callPolicy({
        address: SECURE_HEALTH_PROFILE_CONTRACT,
        abi: secureHealthProfileAbi,
        functionName: "submitZKProof",
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
