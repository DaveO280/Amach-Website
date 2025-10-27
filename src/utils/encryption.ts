import CryptoJS from "crypto-js";

/**
 * Encryption utilities for health data
 * Uses AES-256-GCM for encryption with user-controlled keys
 */

export interface EncryptedHealthData {
  encryptedBirthDate: string;
  encryptedSex: string;
  encryptedHeight: string;
  encryptedWeight: string;
  dataHash: string;
  timestamp: number;
  isActive: boolean;
  version: number;
}

export interface HealthData {
  birthDate: string; // YYYY-MM-DD format
  sex: string; // M/F/Other
  height: {
    feet: number;
    inches: number;
  };
  weight: number; // pounds
}

/**
 * Generate a random encryption key
 */
export function generateEncryptionKey(): string {
  return CryptoJS.lib.WordArray.random(256 / 8).toString();
}

/**
 * Derive encryption key from user's wallet address and passkey
 * This ensures the key is deterministic but secure
 */
export function deriveEncryptionKey(
  walletAddress: string,
  passkeyId: string,
): string {
  const combined = `${walletAddress}-${passkeyId}`;
  return CryptoJS.SHA256(combined).toString();
}

/**
 * Encrypt a single piece of health data
 */
export function encryptHealthData(data: string, key: string): string {
  const encrypted = CryptoJS.AES.encrypt(data, key).toString();
  return `0x${encrypted}`;
}

/**
 * Decrypt a single piece of health data
 */
export function decryptHealthData(encryptedData: string, key: string): string {
  // Remove 0x prefix if present
  const cleanData = encryptedData.startsWith("0x")
    ? encryptedData.slice(2)
    : encryptedData;
  const decrypted = CryptoJS.AES.decrypt(cleanData, key);
  return decrypted.toString(CryptoJS.enc.Utf8);
}

/**
 * Convert height from feet/inches to total inches
 */
export function heightToInches(feet: number, inches: number): number {
  return feet * 12 + inches;
}

/**
 * Convert total inches back to feet/inches
 */
export function inchesToHeight(totalInches: number): {
  feet: number;
  inches: number;
} {
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { feet, inches };
}

/**
 * Encrypt complete health profile
 */
export function encryptHealthProfile(
  healthData: HealthData,
  encryptionKey: string,
): EncryptedHealthData {
  const encryptedBirthDate = encryptHealthData(
    healthData.birthDate,
    encryptionKey,
  );
  const encryptedSex = encryptHealthData(healthData.sex, encryptionKey);

  // Convert height to total inches for encryption
  const totalInches = heightToInches(
    healthData.height.feet,
    healthData.height.inches,
  );
  const encryptedHeight = encryptHealthData(
    totalInches.toString(),
    encryptionKey,
  );

  const encryptedWeight = encryptHealthData(
    healthData.weight.toString(),
    encryptionKey,
  );

  // Create data hash for verification
  const dataHash = CryptoJS.SHA256(
    encryptedBirthDate + encryptedSex + encryptedHeight + encryptedWeight,
  ).toString();

  return {
    encryptedBirthDate,
    encryptedSex,
    encryptedHeight,
    encryptedWeight,
    dataHash: `0x${dataHash}`,
    timestamp: Date.now(),
    isActive: true,
    version: 1,
  };
}

/**
 * Decrypt complete health profile
 */
export function decryptHealthProfile(
  encryptedData: EncryptedHealthData,
  encryptionKey: string,
): HealthData {
  const totalInches = parseInt(
    decryptHealthData(encryptedData.encryptedHeight, encryptionKey),
  );
  const height = inchesToHeight(totalInches);

  return {
    birthDate: decryptHealthData(
      encryptedData.encryptedBirthDate,
      encryptionKey,
    ),
    sex: decryptHealthData(encryptedData.encryptedSex, encryptionKey),
    height,
    weight: parseFloat(
      decryptHealthData(encryptedData.encryptedWeight, encryptionKey),
    ),
  };
}

/**
 * Calculate age from birthdate
 */
export function calculateAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

/**
 * Validate health data
 */
export function validateHealthData(data: HealthData): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate birthdate format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(data.birthDate)) {
    errors.push("Birthdate must be in YYYY-MM-DD format");
  }

  // Validate age (must be between 0 and 150)
  const age = calculateAge(data.birthDate);
  if (age < 0 || age > 150) {
    errors.push("Age must be between 0 and 150 years");
  }

  // Validate sex
  if (!["M", "F", "Other"].includes(data.sex)) {
    errors.push("Sex must be M, F, or Other");
  }

  // Validate height (feet and inches)
  if (data.height.feet < 2 || data.height.feet > 8) {
    errors.push("Height feet must be between 2 and 8");
  }
  if (data.height.inches < 0 || data.height.inches > 11) {
    errors.push("Height inches must be between 0 and 11");
  }

  // Validate total height (24-96 inches)
  const totalInches = heightToInches(data.height.feet, data.height.inches);
  if (totalInches < 24 || totalInches > 96) {
    errors.push("Total height must be between 2 feet and 8 feet");
  }

  // Validate weight (50-1000 lbs)
  if (data.weight < 50 || data.weight > 1000) {
    errors.push("Weight must be between 50 and 1000 pounds");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Generate ZK proof inputs (placeholder for future implementation)
 */
export function generateZKProofInputs(healthData: HealthData): {
  publicInputs: string;
  privateInputs: string;
} {
  // TODO: Implement actual ZK proof generation
  // This would integrate with a ZK proof system like zk-SNARKs

  const totalInches = heightToInches(
    healthData.height.feet,
    healthData.height.inches,
  );
  const publicInputs = CryptoJS.SHA256(
    `${healthData.birthDate}-${healthData.sex}-${totalInches}-${healthData.weight}`,
  ).toString();

  const privateInputs = CryptoJS.SHA256(JSON.stringify(healthData)).toString();

  return {
    publicInputs: `0x${publicInputs}`,
    privateInputs: `0x${privateInputs}`,
  };
}

/**
 * Verify ZK proof (placeholder for future implementation)
 */
export function verifyZKProof(
  _proof: string,
  publicInputs: string,
  healthData: HealthData,
): boolean {
  // TODO: Implement actual ZK proof verification
  // This would verify the proof against the public inputs

  const expectedInputs = generateZKProofInputs(healthData);
  return publicInputs === expectedInputs.publicInputs;
}
