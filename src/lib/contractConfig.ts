import { getContractAddresses } from "./networkConfig";

// Note: Chain definitions have been moved to networkConfig.ts
// This file now only exports contract ABIs and addresses

// Secure Health Profile V1 contract ABI (UUPS Upgradeable)
// Includes: Core profile + Event-based timeline + ZK proofs
const secureHealthProfileAbi = [
  // ============================================
  // PROFILE MANAGEMENT
  // ============================================
  {
    inputs: [
      { name: "encryptedBirthDate", type: "string" },
      { name: "encryptedSex", type: "string" },
      { name: "encryptedHeight", type: "string" },
      { name: "encryptedEmail", type: "string" },
      { name: "dataHash", type: "bytes32" },
      { name: "nonce", type: "string" },
    ],
    name: "createProfile",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "encryptedBirthDate", type: "string" },
      { name: "encryptedSex", type: "string" },
      { name: "encryptedHeight", type: "string" },
      { name: "encryptedEmail", type: "string" },
      { name: "dataHash", type: "bytes32" },
      { name: "nonce", type: "string" },
    ],
    name: "updateProfile",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "deactivateProfile",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // ============================================
  // V3: PROFILE FUNCTIONS WITH WEIGHT
  // ============================================
  {
    inputs: [
      { name: "encryptedBirthDate", type: "string" },
      { name: "encryptedSex", type: "string" },
      { name: "encryptedHeight", type: "string" },
      { name: "encryptedWeight", type: "string" },
      { name: "encryptedEmail", type: "string" },
      { name: "dataHash", type: "bytes32" },
      { name: "nonce", type: "string" },
    ],
    name: "createProfileWithWeight",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "encryptedBirthDate", type: "string" },
      { name: "encryptedSex", type: "string" },
      { name: "encryptedHeight", type: "string" },
      { name: "encryptedWeight", type: "string" },
      { name: "encryptedEmail", type: "string" },
      { name: "dataHash", type: "bytes32" },
      { name: "nonce", type: "string" },
    ],
    name: "updateProfileWithWeight",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "encryptedWeight", type: "string" }],
    name: "updateWeight",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getProfileWithWeight",
    outputs: [
      {
        components: [
          { name: "encryptedBirthDate", type: "string" },
          { name: "encryptedSex", type: "string" },
          { name: "encryptedHeight", type: "string" },
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
      { name: "weight", type: "string" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getWeight",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getProfile",
    outputs: [
      {
        components: [
          { name: "encryptedBirthDate", type: "string" },
          { name: "encryptedSex", type: "string" },
          { name: "encryptedHeight", type: "string" },
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
    inputs: [{ name: "user", type: "address" }],
    name: "hasProfile",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "isProfileActive",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
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
  // ============================================
  // HEALTH TIMELINE (Immutable Events with Searchable Encryption)
  // ============================================
  {
    inputs: [
      { name: "searchTag", type: "bytes32" }, // keccak256(eventType + userSecret) for privacy-preserving search
      { name: "encryptedData", type: "string" },
      { name: "eventHash", type: "bytes32" },
    ],
    name: "addHealthEvent",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "eventId", type: "uint256" }],
    name: "deactivateHealthEvent",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getHealthTimeline",
    outputs: [
      {
        components: [
          { name: "timestamp", type: "uint256" },
          { name: "searchTag", type: "bytes32" },
          { name: "encryptedData", type: "string" },
          { name: "eventHash", type: "bytes32" },
          { name: "isActive", type: "bool" },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "user", type: "address" },
      { name: "searchTag", type: "bytes32" },
    ],
    name: "getEventsByTag",
    outputs: [
      {
        components: [
          { name: "timestamp", type: "uint256" },
          { name: "searchTag", type: "bytes32" },
          { name: "encryptedData", type: "string" },
          { name: "eventHash", type: "bytes32" },
          { name: "isActive", type: "bool" },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "user", type: "address" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "searchTag", type: "bytes32" },
    ],
    name: "getEventsInRange",
    outputs: [
      {
        components: [
          { name: "timestamp", type: "uint256" },
          { name: "searchTag", type: "bytes32" },
          { name: "encryptedData", type: "string" },
          { name: "eventHash", type: "bytes32" },
          { name: "isActive", type: "bool" },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getActiveEvents",
    outputs: [
      {
        components: [
          { name: "timestamp", type: "uint256" },
          { name: "eventType", type: "uint8" },
          { name: "encryptedData", type: "string" },
          { name: "eventHash", type: "bytes32" },
          { name: "isActive", type: "bool" },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
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
  // ============================================
  // ZK PROOF MANAGEMENT
  // ============================================
  {
    inputs: [
      { name: "ageRange", type: "string" },
      { name: "heightRange", type: "string" },
      { name: "weightRange", type: "string" },
      { name: "emailDomain", type: "string" },
      { name: "proofHash", type: "bytes32" },
    ],
    name: "submitZKProof",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getZKProof",
    outputs: [
      {
        components: [
          { name: "ageRange", type: "string" },
          { name: "heightRange", type: "string" },
          { name: "weightRange", type: "string" },
          { name: "emailDomain", type: "string" },
          { name: "proofHash", type: "bytes32" },
          { name: "timestamp", type: "uint256" },
          { name: "isValid", type: "bool" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "invalidateZKProof",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // ============================================
  // V2: STORJ OFF-CHAIN STORAGE
  // ============================================
  {
    inputs: [
      { name: "searchTag", type: "bytes32" },
      { name: "storjUri", type: "string" },
      { name: "contentHash", type: "bytes32" },
      { name: "eventHash", type: "bytes32" },
    ],
    name: "addHealthEventV2",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "user", type: "address" },
      { name: "eventId", type: "uint256" },
    ],
    name: "getEventStorjUri",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "user", type: "address" },
      { name: "eventId", type: "uint256" },
    ],
    name: "getEventContentHash",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "user", type: "address" },
      { name: "eventId", type: "uint256" },
    ],
    name: "isStorjEvent",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // ============================================
  // CONTRACT INFO
  // ============================================
  {
    inputs: [],
    name: "getTotalProfiles",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getVersion",
    outputs: [{ name: "", type: "uint8" }],
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

// Contract addresses (Upgradeable System - November 2025)
// UUPS Upgradeable architecture with event-based health timeline
const HEALTH_PROFILE_CONTRACT = "0x6C7e52F1FfBCc0Bf001BB9458B64D85d7D7eC9F8"; // Legacy (deprecated)
const HEALTH_TOKEN_CONTRACT = "0x057df807987f284b55ba6A9ab89d089fd8398B99"; // Clean Slate - Oct 29 2025
const SECURE_HEALTH_PROFILE_CONTRACT =
  "0x2A8015613623A6A8D369BcDC2bd6DD202230785a"; // Proxy address - V1 with Searchable Encryption (Nov 20, 2025)
const SECURE_HEALTH_PROFILE_CONTRACT_V1_OLD =
  "0xb1e41c4913D52E20aAaF4728c0449Bc6320a45A3"; // Old non-upgradeable (backed up)
// Get contract address from networkConfig for automatic network switching
const PROFILE_VERIFICATION_CONTRACT =
  process.env.PROFILE_VERIFICATION_CONTRACT ||
  getContractAddresses().PROFILE_VERIFICATION_CONTRACT;

// Export the ABIs and contract addresses
export {
  HEALTH_PROFILE_CONTRACT,
  HEALTH_TOKEN_CONTRACT,
  healthProfileAbi,
  PROFILE_VERIFICATION_CONTRACT,
  profileVerificationAbi,
  SECURE_HEALTH_PROFILE_CONTRACT,
  SECURE_HEALTH_PROFILE_CONTRACT_V1_OLD, // Old non-upgradeable (for migration reference)
  secureHealthProfileAbi,
};

// Note: SSO connector functions have been removed
// All wallet operations now use Privy instead of zkSync SSO
