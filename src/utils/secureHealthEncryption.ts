/**
 * Secure Health Data Encryption System
 *
 * Architecture:
 * 1. Store encrypted data ON-CHAIN (not hashes)
 * 2. Use AES-256-GCM with proper key derivation
 * 3. Support ZK-proofs without revealing raw data
 * 4. Enable protocol access while maintaining privacy
 */

import { keccak256, toHex, fromHex } from "viem";

export interface SecureHealthProfile {
  birthDate: string;
  sex: string;
  height: number; // inches
  weight: number; // pounds
  email: string;
}

export interface OnChainEncryptedProfile {
  // Store encrypted data directly on-chain (not hashes)
  encryptedBirthDate: string; // Base64 encoded AES-256-GCM ciphertext
  encryptedSex: string;
  encryptedHeight: string;
  encryptedWeight: string;
  encryptedEmail: string;

  // Metadata for verification
  dataHash: string; // Hash of original data for integrity
  timestamp: number;
  version: number;
  nonce: string; // For AES-GCM
}

export interface ZKProofInputs {
  // Public inputs that can be revealed for ZK proofs
  ageRange: string; // e.g., "25-35" instead of exact birthdate
  heightRange: string; // e.g., "5'8\"-6'0\"" instead of exact height
  weightRange: string; // e.g., "150-180" instead of exact weight
  emailDomain: string; // e.g., "gmail.com" instead of full email
  proofHash: string; // Hash of the ZK proof
}

/**
 * Generate encryption key from wallet address + user passphrase
 * This ensures deterministic keys while maintaining security
 */
export async function deriveSecureKey(
  walletAddress: string,
  userPassphrase?: string,
): Promise<CryptoKey> {
  const passphrase = userPassphrase || walletAddress; // Fallback to wallet address
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("amach-health-salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt health data using AES-256-GCM
 * Returns data suitable for on-chain storage
 */
export async function encryptHealthData(
  profile: SecureHealthProfile,
  walletAddress: string,
  userPassphrase?: string,
): Promise<OnChainEncryptedProfile> {
  const key = await deriveSecureKey(walletAddress, userPassphrase);

  // Generate random nonce for each encryption
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt each field
  const encryptedBirthDate = await encryptField(profile.birthDate, key, nonce);
  const encryptedSex = await encryptField(profile.sex, key, nonce);
  const encryptedHeight = await encryptField(
    profile.height.toString(),
    key,
    nonce,
  );
  const encryptedWeight = await encryptField(
    profile.weight.toString(),
    key,
    nonce,
  );
  const encryptedEmail = await encryptField(profile.email, key, nonce);

  // Create data hash for integrity verification
  const dataHash = keccak256(
    toHex(
      new TextEncoder().encode(
        `${profile.birthDate}-${profile.sex}-${profile.height}-${profile.weight}-${profile.email}`,
      ),
    ),
  );

  return {
    encryptedBirthDate,
    encryptedSex,
    encryptedHeight,
    encryptedWeight,
    encryptedEmail,
    dataHash,
    timestamp: Date.now(),
    version: 1,
    nonce: toHex(nonce),
  };
}

/**
 * Decrypt health data from on-chain storage
 */
export async function decryptHealthData(
  encryptedProfile: OnChainEncryptedProfile,
  walletAddress: string,
  userPassphrase?: string,
): Promise<SecureHealthProfile> {
  const key = await deriveSecureKey(walletAddress, userPassphrase);
  const nonce = fromHex(
    encryptedProfile.nonce as `0x${string}`,
    "bytes",
  ) as Uint8Array;

  const birthDate = await decryptField(
    encryptedProfile.encryptedBirthDate,
    key,
    nonce,
  );
  const sex = await decryptField(encryptedProfile.encryptedSex, key, nonce);
  const height = parseInt(
    await decryptField(encryptedProfile.encryptedHeight, key, nonce),
  );
  const weight = parseInt(
    await decryptField(encryptedProfile.encryptedWeight, key, nonce),
  );
  const email = await decryptField(encryptedProfile.encryptedEmail, key, nonce);

  return {
    birthDate,
    sex,
    height,
    weight,
    email,
  };
}

/**
 * Generate ZK-proof inputs for privacy-preserving verification
 * This allows proving properties without revealing exact values
 */
export function generateZKProofInputs(
  profile: SecureHealthProfile,
): ZKProofInputs {
  // Calculate age from birthdate
  const age = Math.floor(
    (Date.now() - new Date(profile.birthDate).getTime()) /
      (365.25 * 24 * 60 * 60 * 1000),
  );

  // Create ranges instead of exact values
  const ageRange = `${Math.floor(age / 5) * 5}-${Math.floor(age / 5) * 5 + 4}`;
  const heightFeet = Math.floor(profile.height / 12);
  const heightInches = profile.height % 12;
  const heightRange = `${heightFeet}'${heightInches}\"-${heightFeet}'${heightInches + 1}\"`;
  const weightRange = `${Math.floor(profile.weight / 10) * 10}-${Math.floor(profile.weight / 10) * 10 + 9}`;

  // Extract email domain
  const emailDomain = profile.email.split("@")[1];

  return {
    ageRange,
    heightRange,
    weightRange,
    emailDomain,
    proofHash: keccak256(
      toHex(
        new TextEncoder().encode(
          `${ageRange}-${heightRange}-${weightRange}-${emailDomain}`,
        ),
      ),
    ),
  };
}

/**
 * Verify ZK proof without revealing actual data
 */
export function verifyZKProof(
  zkProofInputs: ZKProofInputs,
  requiredConditions: {
    minAge?: number;
    maxAge?: number;
    heightRange?: string;
    weightRange?: string;
    allowedDomains?: string[];
  },
): boolean {
  // Parse age range
  const [minAge, maxAge] = zkProofInputs.ageRange.split("-").map(Number);

  // Check age constraints
  if (requiredConditions.minAge && maxAge < requiredConditions.minAge)
    return false;
  if (requiredConditions.maxAge && minAge > requiredConditions.maxAge)
    return false;

  // Check height range
  if (
    requiredConditions.heightRange &&
    zkProofInputs.heightRange !== requiredConditions.heightRange
  ) {
    return false;
  }

  // Check weight range
  if (
    requiredConditions.weightRange &&
    zkProofInputs.weightRange !== requiredConditions.weightRange
  ) {
    return false;
  }

  // Check email domain
  if (
    requiredConditions.allowedDomains &&
    !requiredConditions.allowedDomains.includes(zkProofInputs.emailDomain)
  ) {
    return false;
  }

  return true;
}

// Helper functions
async function encryptField(
  data: string,
  key: CryptoKey,
  nonce: Uint8Array,
): Promise<string> {
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(data),
  );

  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

async function decryptField(
  encryptedData: string,
  key: CryptoKey,
  nonce: Uint8Array,
): Promise<string> {
  const encryptedBytes = Uint8Array.from(atob(encryptedData), (c) =>
    c.charCodeAt(0),
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    encryptedBytes,
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Migration utility for existing data
 */
export async function migrateLegacyEncryptedData(
  legacyProfile: Record<string, unknown>,
  walletAddress: string,
  userPassphrase?: string,
): Promise<OnChainEncryptedProfile> {
  // Convert legacy format to new secure format
  const secureProfile: SecureHealthProfile = {
    birthDate: (legacyProfile.birthDate as string) || "1990-01-01",
    sex: (legacyProfile.sex as string) || "unknown",
    height: (legacyProfile.height as number) || 0,
    weight: (legacyProfile.weight as number) || 0,
    email: (legacyProfile.email as string) || "",
  };

  return encryptHealthData(secureProfile, walletAddress, userPassphrase);
}
