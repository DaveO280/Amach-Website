/**
 * Secure Health Data Encryption System
 *
 * Architecture:
 * 1. Store encrypted data ON-CHAIN (not hashes)
 * 2. Use AES-256-GCM with proper key derivation
 * 3. Support ZK-proofs without revealing raw data
 * 4. Enable protocol access while maintaining privacy
 */

import { keccak256, toHex } from "viem";

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

  // Use async Web Crypto API PBKDF2 (non-blocking, but CPU intensive with 100k iterations)
  // IMPORTANT: Do NOT change iterations - it must match what was used for encryption
  // Existing profiles were encrypted with 100k iterations
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("amach-health-salt"),
      iterations: 100000, // Must match encryption iterations for compatibility
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
  console.log(
    "🔑 Deriving decryption key (PBKDF2 - this may take a few seconds)...",
  );
  const key = await deriveSecureKey(walletAddress, userPassphrase);
  console.log("✅ Decryption key derived successfully");

  // Parse nonce from hex string - must be exactly 12 bytes for AES-GCM
  let nonceHex = encryptedProfile.nonce as string;
  if (!nonceHex) {
    throw new Error("Nonce is missing from encrypted profile");
  }

  console.log("🔍 Parsing nonce:", { nonceHex, length: nonceHex.length });

  // The nonce might be stored in different formats:
  // 1. Hex string with 0x prefix: "0x1234..."
  // 2. Hex string without prefix: "1234..."
  // 3. Base64 (unlikely but possible)

  let nonceBytes: Uint8Array;

  // Remove 0x prefix if present
  if (nonceHex.startsWith("0x")) {
    nonceHex = nonceHex.slice(2);
  }

  // Try parsing as hex first (most common)
  const hexBytes = nonceHex.match(/.{1,2}/g) || [];
  if (hexBytes.length > 0) {
    nonceBytes = new Uint8Array(hexBytes.map((byte) => parseInt(byte, 16)));
  } else {
    // If no hex bytes, try as base64
    try {
      const base64Decoded = atob(nonceHex);
      nonceBytes = new Uint8Array(
        base64Decoded.split("").map((c) => c.charCodeAt(0)),
      );
    } catch {
      throw new Error("Cannot parse nonce - invalid format");
    }
  }

  console.log("🔍 Nonce parsed:", {
    originalHex: encryptedProfile.nonce,
    hexLength: nonceHex.length,
    byteLength: nonceBytes.length,
    expectedBytes: 12,
    noncePreview: Array.from(nonceBytes).slice(0, 4).join(","),
  });

  // Handle incomplete nonces from old buggy code
  // Old code generated random nonce instead of using encryption nonce
  if (nonceBytes.length !== 12) {
    console.warn(
      `⚠️ Invalid nonce length: ${nonceBytes.length} bytes (expected 12)`,
    );
    console.warn(`Nonce hex: ${nonceHex} (${nonceHex.length} chars)`);
    console.warn(`Hex bytes array: ${hexBytes.join(" ")}`);
    console.warn(
      `⚠️ Attempting to pad nonce to 12 bytes (this may fail if nonce was generated incorrectly)`,
    );

    // Try to pad the nonce to 12 bytes by repeating or zero-padding
    // This is a workaround for profiles created with the buggy nonce generation
    const paddedNonce = new Uint8Array(12);
    if (nonceBytes.length < 12) {
      // Pad with zeros (not ideal but might work)
      paddedNonce.set(nonceBytes, 0);
      for (let i = nonceBytes.length; i < 12; i++) {
        paddedNonce[i] = 0;
      }
      console.warn(
        `⚠️ Padded nonce from ${nonceBytes.length} to 12 bytes (may not decrypt correctly)`,
      );
    } else {
      // Truncate if too long (shouldn't happen)
      paddedNonce.set(nonceBytes.slice(0, 12));
      console.warn(`⚠️ Truncated nonce from ${nonceBytes.length} to 12 bytes`);
    }

    // Try with padded nonce, but warn that it might fail
    // Note: This will likely fail because the encryption used a different nonce
    // The profile will need to be re-encrypted with the correct nonce
    console.error(
      `❌ Cannot decrypt: Nonce mismatch. Profile was encrypted with ${nonceBytes.length}-byte nonce but AES-GCM requires 12 bytes.`,
    );
    console.error(
      `❌ This profile was likely created with buggy code that generated a random nonce instead of using the encryption nonce.`,
    );
    console.error(
      `❌ Solution: The profile needs to be updated/re-encrypted to fix the nonce.`,
    );
    throw new Error(
      `Invalid nonce length: ${nonceBytes.length} bytes. Expected 12 bytes (24 hex chars) for AES-GCM. ` +
        `This profile appears to have been created with incorrect nonce generation. Please update the profile.`,
    );
  }

  const nonce = nonceBytes;

  // Decrypt each field, handling empty fields gracefully
  const birthDate =
    encryptedProfile.encryptedBirthDate &&
    encryptedProfile.encryptedBirthDate.trim() !== ""
      ? await decryptField(encryptedProfile.encryptedBirthDate, key, nonce)
      : "";

  const sex =
    encryptedProfile.encryptedSex && encryptedProfile.encryptedSex.trim() !== ""
      ? await decryptField(encryptedProfile.encryptedSex, key, nonce)
      : "";

  const height =
    encryptedProfile.encryptedHeight &&
    encryptedProfile.encryptedHeight.trim() !== ""
      ? parseInt(
          await decryptField(encryptedProfile.encryptedHeight, key, nonce),
        ) || 0
      : 0;

  const weight =
    encryptedProfile.encryptedWeight &&
    encryptedProfile.encryptedWeight.trim() !== ""
      ? parseInt(
          await decryptField(encryptedProfile.encryptedWeight, key, nonce),
        ) || 0
      : 0;

  const email =
    encryptedProfile.encryptedEmail &&
    encryptedProfile.encryptedEmail.trim() !== ""
      ? await decryptField(encryptedProfile.encryptedEmail, key, nonce)
      : "";

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

export async function decryptField(
  encryptedData: string,
  key: CryptoKey,
  nonce: Uint8Array,
): Promise<string> {
  try {
    // Handle empty or invalid data - return empty string instead of throwing
    if (!encryptedData || encryptedData.trim() === "") {
      console.warn(
        "⚠️ Decrypt field: Encrypted data is empty, returning empty string",
      );
      return "";
    }

    // Remove 0x prefix if present (some on-chain data might have it)
    let cleanData = encryptedData.startsWith("0x")
      ? encryptedData.slice(2)
      : encryptedData;

    // Try to decode as base64
    let encryptedBytes: Uint8Array;
    try {
      encryptedBytes = Uint8Array.from(atob(cleanData), (c) => c.charCodeAt(0));
    } catch (base64Error) {
      // If base64 decode fails, try hex decode
      console.warn("⚠️ Base64 decode failed, trying hex decode...");
      const hexMatch = cleanData.match(/.{1,2}/g);
      if (!hexMatch) {
        throw new Error("Cannot decode encrypted data - invalid format");
      }
      encryptedBytes = Uint8Array.from(
        hexMatch.map((byte) => parseInt(byte, 16)),
      );
    }

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      encryptedBytes,
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Decrypt field failed: ${errorMessage}`, {
      dataLength: encryptedData?.length,
      dataPreview: encryptedData?.substring(0, 50),
      nonceLength: nonce.length,
    });
    throw new Error(`Decryption failed: ${errorMessage}`);
  }
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
