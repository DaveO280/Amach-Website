import { createHash, randomBytes } from "crypto";
import { hashEmail, hashDeviceFingerprint, hashProfile } from "./database";

// ZK-Proof interfaces
export interface EmailOwnershipProof {
  emailHash: string;
  ownershipProof: string;
  timestamp: number;
  nonce: string;
}

export interface DeviceConsistencyProof {
  deviceHash: string;
  consistencyProof: string;
  timestamp: number;
  sessionId: string;
}

export interface ProfileCompletionProof {
  profileHash: string;
  completionProof: string;
  timestamp: number;
  completenessScore: number;
}

export interface VerificationProof {
  walletAddress: string;
  verificationProof: string;
  timestamp: number;
  blockNumber: number;
}

export interface AllocationProof {
  allocationAmount: string;
  allocationProof: string;
  timestamp: number;
  transactionHash: string;
}

// ZK-Proof generation functions
export class ZKProofGenerator {
  /**
   * Generate email ownership proof without revealing the email
   */
  static async generateEmailOwnershipProof(
    email: string,
    whitelistProof: string,
  ): Promise<EmailOwnershipProof> {
    const emailHash = hashEmail(email);
    const nonce = randomBytes(16).toString("hex");
    const timestamp = Date.now();

    // Create a proof that the user owns the email and it's whitelisted
    // This is a simplified version - in production, you'd use a proper ZK library
    const proofData = `${emailHash}:${whitelistProof}:${nonce}:${timestamp}`;
    const ownershipProof = createHash("sha256").update(proofData).digest("hex");

    return {
      emailHash,
      ownershipProof,
      timestamp,
      nonce,
    };
  }

  /**
   * Generate device consistency proof without revealing device details
   */
  static async generateDeviceConsistencyProof(
    deviceFingerprint: Record<string, unknown>,
    previousDeviceHash?: string,
  ): Promise<DeviceConsistencyProof> {
    const deviceHash = hashDeviceFingerprint(deviceFingerprint);
    const sessionId = randomBytes(8).toString("hex");
    const timestamp = Date.now();

    // Create a proof that this is the same device as previous sessions
    const consistencyData = previousDeviceHash
      ? `${deviceHash}:${previousDeviceHash}:${sessionId}:${timestamp}`
      : `${deviceHash}:${sessionId}:${timestamp}`;

    const consistencyProof = createHash("sha256")
      .update(consistencyData)
      .digest("hex");

    return {
      deviceHash,
      consistencyProof,
      timestamp,
      sessionId,
    };
  }

  /**
   * Generate profile completion proof without revealing profile content
   */
  static async generateProfileCompletionProof(
    profile: Record<string, unknown>,
  ): Promise<ProfileCompletionProof> {
    const profileHash = hashProfile(profile);
    const timestamp = Date.now();

    // Calculate completeness score (0-100) without revealing data
    const requiredFields = ["email", "birthDate", "sex", "height", "weight"];
    const completenessScore = Math.round(
      (requiredFields.filter((field) => profile[field]).length /
        requiredFields.length) *
        100,
    );

    // Create proof that profile is complete
    const completionData = `${profileHash}:${completenessScore}:${timestamp}`;
    const completionProof = createHash("sha256")
      .update(completionData)
      .digest("hex");

    return {
      profileHash,
      completionProof,
      timestamp,
      completenessScore,
    };
  }

  /**
   * Generate verification proof for on-chain verification
   */
  static async generateVerificationProof(
    walletAddress: string,
    blockNumber: number,
  ): Promise<VerificationProof> {
    const timestamp = Date.now();

    // Create proof that wallet was verified on-chain
    const verificationData = `${walletAddress}:${blockNumber}:${timestamp}`;
    const verificationProof = createHash("sha256")
      .update(verificationData)
      .digest("hex");

    return {
      walletAddress,
      verificationProof,
      timestamp,
      blockNumber,
    };
  }

  /**
   * Generate allocation proof for token claiming
   */
  static async generateAllocationProof(
    allocationAmount: string,
    transactionHash: string,
  ): Promise<AllocationProof> {
    const timestamp = Date.now();

    // Create proof that allocation was claimed
    const allocationData = `${allocationAmount}:${transactionHash}:${timestamp}`;
    const allocationProof = createHash("sha256")
      .update(allocationData)
      .digest("hex");

    return {
      allocationAmount,
      allocationProof,
      timestamp,
      transactionHash,
    };
  }
}

// ZK-Proof verification functions
export class ZKProofVerifier {
  /**
   * Verify email ownership proof
   */
  static verifyEmailOwnershipProof(
    proof: EmailOwnershipProof,
    expectedWhitelistProof: string,
  ): boolean {
    try {
      const proofData = `${proof.emailHash}:${expectedWhitelistProof}:${proof.nonce}:${proof.timestamp}`;
      const expectedProof = createHash("sha256")
        .update(proofData)
        .digest("hex");
      return expectedProof === proof.ownershipProof;
    } catch (error) {
      console.error("Email ownership proof verification failed:", error);
      return false;
    }
  }

  /**
   * Verify device consistency proof
   */
  static verifyDeviceConsistencyProof(
    proof: DeviceConsistencyProof,
    previousDeviceHash?: string,
  ): boolean {
    try {
      const consistencyData = previousDeviceHash
        ? `${proof.deviceHash}:${previousDeviceHash}:${proof.sessionId}:${proof.timestamp}`
        : `${proof.deviceHash}:${proof.sessionId}:${proof.timestamp}`;

      const expectedProof = createHash("sha256")
        .update(consistencyData)
        .digest("hex");
      return expectedProof === proof.consistencyProof;
    } catch (error) {
      console.error("Device consistency proof verification failed:", error);
      return false;
    }
  }

  /**
   * Verify profile completion proof
   */
  static verifyProfileCompletionProof(
    proof: ProfileCompletionProof,
    minCompletenessScore: number = 80,
  ): boolean {
    try {
      // Verify the proof is valid
      const completionData = `${proof.profileHash}:${proof.completenessScore}:${proof.timestamp}`;
      const expectedProof = createHash("sha256")
        .update(completionData)
        .digest("hex");

      const proofValid = expectedProof === proof.completionProof;
      const scoreValid = proof.completenessScore >= minCompletenessScore;

      return proofValid && scoreValid;
    } catch (error) {
      console.error("Profile completion proof verification failed:", error);
      return false;
    }
  }

  /**
   * Verify verification proof
   */
  static verifyVerificationProof(proof: VerificationProof): boolean {
    try {
      const verificationData = `${proof.walletAddress}:${proof.blockNumber}:${proof.timestamp}`;
      const expectedProof = createHash("sha256")
        .update(verificationData)
        .digest("hex");
      return expectedProof === proof.verificationProof;
    } catch (error) {
      console.error("Verification proof verification failed:", error);
      return false;
    }
  }

  /**
   * Verify allocation proof
   */
  static verifyAllocationProof(proof: AllocationProof): boolean {
    try {
      const allocationData = `${proof.allocationAmount}:${proof.transactionHash}:${proof.timestamp}`;
      const expectedProof = createHash("sha256")
        .update(allocationData)
        .digest("hex");
      return expectedProof === proof.allocationProof;
    } catch (error) {
      console.error("Allocation proof verification failed:", error);
      return false;
    }
  }
}

// Utility functions for device fingerprinting
export function generateDeviceFingerprint(): Record<string, unknown> {
  // Generate a privacy-preserving device fingerprint
  // In production, you'd collect more sophisticated device characteristics
  const fingerprint = {
    userAgent: typeof window !== "undefined" ? window.navigator.userAgent : "",
    language: typeof window !== "undefined" ? window.navigator.language : "",
    platform: typeof window !== "undefined" ? window.navigator.platform : "",
    screenResolution:
      typeof window !== "undefined"
        ? `${window.screen.width}x${window.screen.height}`
        : "",
    timezone:
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "",
    timestamp: Date.now(),
  };

  return fingerprint;
}

export function generateSourceFingerprint(): string {
  // Generate a privacy-preserving source fingerprint
  const source = {
    referrer: typeof document !== "undefined" ? document.referrer : "",
    origin: typeof window !== "undefined" ? window.location.origin : "",
    timestamp: Date.now(),
  };

  return JSON.stringify(source);
}

const zkProofsExport = {
  ZKProofGenerator,
  ZKProofVerifier,
  generateDeviceFingerprint,
  generateSourceFingerprint,
};

export default zkProofsExport;
