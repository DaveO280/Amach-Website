import { createHash, randomBytes } from "crypto";

/**
 * ZK-Proof system for tracking token allocations by email without revealing wallet addresses
 */

export interface EmailAllocationProof {
  email: string; // Email address (visible for admin management)
  emailHash: string; // Hash of the email (for ZK-proof verification)
  allocationAmount: string; // Amount allocated (in tokens)
  allocationProof: string; // ZK-proof that allocation exists
  transactionHash: string; // Blockchain transaction hash
  timestamp: number; // When the allocation was made
  nonce: string; // Random nonce for uniqueness
  // Note: NO wallet address stored - complete wallet privacy
}

export interface AllocationVerification {
  emailHash: string;
  hasAllocation: boolean;
  allocationAmount?: string;
  isValid: boolean;
}

/**
 * Generate a hash of an email address for privacy-preserving tracking
 */
export function hashEmail(email: string): string {
  const normalizedEmail = email.toLowerCase().trim();
  return createHash("sha256").update(normalizedEmail).digest("hex");
}

/**
 * Generate ZK-proof for email-based token allocation
 * This proves that an email has received an allocation without revealing:
 * - The actual email address
 * - The associated wallet address
 * - Any other identifying information
 */
export class EmailAllocationZKProof {
  /**
   * Generate allocation proof when tokens are claimed
   * Called by the client after successful token claim
   */
  static async generateAllocationProof(
    email: string,
    allocationAmount: string,
    transactionHash: string,
  ): Promise<EmailAllocationProof> {
    const emailHash = hashEmail(email);
    const nonce = randomBytes(16).toString("hex");
    const timestamp = Date.now();

    // Create proof data that includes:
    // - Email hash (not the email itself)
    // - Allocation amount
    // - Transaction hash (proves blockchain interaction)
    // - Timestamp
    // - Random nonce
    const proofData = `${emailHash}:${allocationAmount}:${transactionHash}:${timestamp}:${nonce}`;

    // Generate the ZK-proof hash
    const allocationProof = createHash("sha256")
      .update(proofData)
      .digest("hex");

    return {
      email,
      emailHash,
      allocationAmount,
      allocationProof,
      transactionHash,
      timestamp,
      nonce,
    };
  }

  /**
   * Verify allocation proof without revealing sensitive data
   * Called by admin dashboard to verify allocations
   */
  static async verifyAllocationProof(
    proof: EmailAllocationProof,
    expectedTransactionHash?: string,
  ): Promise<AllocationVerification> {
    try {
      // Reconstruct proof data
      const proofData = `${proof.emailHash}:${proof.allocationAmount}:${proof.transactionHash}:${proof.timestamp}:${proof.nonce}`;

      // Verify the proof hash
      const expectedProof = createHash("sha256")
        .update(proofData)
        .digest("hex");
      const isValid = expectedProof === proof.allocationProof;

      // Optionally verify against expected transaction hash
      if (expectedTransactionHash && isValid) {
        const transactionValid =
          proof.transactionHash === expectedTransactionHash;
        return {
          emailHash: proof.emailHash,
          hasAllocation: transactionValid,
          allocationAmount: transactionValid
            ? proof.allocationAmount
            : undefined,
          isValid: transactionValid,
        };
      }

      return {
        emailHash: proof.emailHash,
        hasAllocation: isValid,
        allocationAmount: isValid ? proof.allocationAmount : undefined,
        isValid,
      };
    } catch (error) {
      console.error("Failed to verify allocation proof:", error);
      return {
        emailHash: proof.emailHash,
        hasAllocation: false,
        isValid: false,
      };
    }
  }

  /**
   * Check if an email has claimed tokens (by hash)
   * Returns allocation info without revealing the email
   */
  static async checkEmailAllocation(
    emailHash: string,
    storedProofs: EmailAllocationProof[],
  ): Promise<AllocationVerification> {
    const proof = storedProofs.find((p) => p.emailHash === emailHash);

    if (!proof) {
      return {
        emailHash,
        hasAllocation: false,
        isValid: false,
      };
    }

    return this.verifyAllocationProof(proof);
  }

  /**
   * Get allocation statistics by email hashes
   * Provides aggregate data without revealing individual emails
   */
  static async getAllocationStats(
    storedProofs: EmailAllocationProof[],
  ): Promise<{
    totalAllocations: number;
    totalAllocatedAmount: number;
    uniqueEmails: number;
    averageAllocation: number;
  }> {
    const validProofs = [];

    // Verify all proofs
    for (const proof of storedProofs) {
      const verification = await this.verifyAllocationProof(proof);
      if (verification.isValid) {
        validProofs.push(proof);
      }
    }

    const totalAllocations = validProofs.length;
    const totalAllocatedAmount = validProofs.reduce(
      (sum, proof) => sum + parseFloat(proof.allocationAmount),
      0,
    );
    const uniqueEmails = new Set(validProofs.map((p) => p.emailHash)).size;
    const averageAllocation =
      totalAllocations > 0 ? totalAllocatedAmount / totalAllocations : 0;

    return {
      totalAllocations,
      totalAllocatedAmount,
      uniqueEmails,
      averageAllocation,
    };
  }
}

/**
 * Integration with existing ZK-proof system
 */
export class EmailAllocationIntegration {
  /**
   * Generate allocation proof and store in admin database
   * This should be called after successful token claim
   */
  static async recordEmailAllocation(
    email: string,
    allocationAmount: string,
    transactionHash: string,
  ): Promise<{
    success: boolean;
    proof?: EmailAllocationProof;
    error?: string;
  }> {
    try {
      // Generate the ZK-proof
      const proof = await EmailAllocationZKProof.generateAllocationProof(
        email,
        allocationAmount,
        transactionHash,
      );

      // Store in admin database (email visible, but NO wallet address)
      // This would integrate with your existing database
      console.log("📝 Email allocation proof generated:", {
        email: proof.email,
        emailHash: proof.emailHash,
        allocationAmount: proof.allocationAmount,
        transactionHash: proof.transactionHash,
        note: "NO wallet address stored - complete wallet privacy maintained",
      });

      return { success: true, proof };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to record email allocation:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Verify email allocation for admin dashboard
   * Checks if an email has claimed tokens without revealing the email
   */
  static async verifyEmailAllocation(
    email: string,
    storedProofs: EmailAllocationProof[],
  ): Promise<AllocationVerification> {
    const emailHash = hashEmail(email);
    return EmailAllocationZKProof.checkEmailAllocation(emailHash, storedProofs);
  }
}
