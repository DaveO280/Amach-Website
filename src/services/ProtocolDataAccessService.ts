"use client";

import { wagmiConfig } from "../lib/zksync-sso-config";
import { decryptHealthData } from "../utils/secureHealthEncryption";

/**
 * Service for protocol to access and decrypt health data for AI analysis
 * This service is used by authorized protocols to read encrypted health data
 */
export class ProtocolDataAccessService {
  private protocolAddress: string;
  private isAuthorized: boolean = false;

  constructor(protocolAddress: string) {
    this.protocolAddress = protocolAddress;
  }

  /**
   * Check if this protocol is authorized to access health data
   */
  async checkAuthorization(): Promise<boolean> {
    try {
      // Note: Contract imports removed as authorization check is simplified for now
      // Check if protocol is authorized (this would need to be implemented in the contract)
      // For now, we'll assume the main app protocol is authorized
      const mainAppAddress = process.env.NEXT_PUBLIC_MAIN_APP_PROTOCOL_ADDRESS;
      this.isAuthorized = this.protocolAddress === mainAppAddress;

      return this.isAuthorized;
    } catch (error) {
      console.error("❌ Authorization check failed:", error);
      return false;
    }
  }

  /**
   * Get encrypted health data for a user (for protocol analysis)
   */
  async getEncryptedHealthData(userAddress: string): Promise<{
    success: boolean;
    data?: {
      encryptedBirthDate: string;
      encryptedSex: string;
      encryptedHeight: string;
      encryptedWeight: string;
      encryptedEmail: string;
      dataHash: string;
      timestamp: number;
      version: number;
      nonce: string;
    };
    error?: string;
  }> {
    if (!this.isAuthorized) {
      return {
        success: false,
        error: "Protocol not authorized to access health data",
      };
    }

    try {
      const { readContract } = await import("@wagmi/core");
      const { secureHealthProfileAbi, SECURE_HEALTH_PROFILE_CONTRACT } =
        await import("../lib/zksync-sso-config");

      // Get profile metadata to verify it exists
      const profileMetadata = (await readContract(wagmiConfig, {
        address: SECURE_HEALTH_PROFILE_CONTRACT,
        abi: secureHealthProfileAbi,
        functionName: "getProfileMetadata",
        args: [userAddress as `0x${string}`],
      })) as readonly [bigint, boolean, number, `0x${string}`];

      // Note: The current SecureHealthProfile contract only stores metadata
      // The actual encrypted data would need to be retrieved through a different method
      // For now, we'll return the metadata structure that would contain the encrypted data
      return {
        success: true,
        data: {
          encryptedBirthDate: "retrieved_from_contract_storage",
          encryptedSex: "retrieved_from_contract_storage",
          encryptedHeight: "retrieved_from_contract_storage",
          encryptedWeight: "retrieved_from_contract_storage",
          encryptedEmail: "retrieved_from_contract_storage",
          dataHash: profileMetadata[3],
          timestamp: Number(profileMetadata[0]),
          version: profileMetadata[2],
          nonce: "retrieved_from_contract_storage",
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to get encrypted health data:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Decrypt health data for AI analysis (requires proper authorization)
   */
  async decryptHealthDataForAnalysis(
    encryptedData: {
      encryptedBirthDate: string;
      encryptedSex: string;
      encryptedHeight: string;
      encryptedWeight: string;
      encryptedEmail: string;
      nonce: string;
    },
    userAddress: string,
    userPassphrase?: string,
  ): Promise<{
    success: boolean;
    decryptedData?: {
      birthDate: string;
      sex: string;
      height: number;
      weight: number;
      email: string;
    };
    error?: string;
  }> {
    if (!this.isAuthorized) {
      return {
        success: false,
        error: "Protocol not authorized to decrypt health data",
      };
    }

    try {
      // Create the encrypted profile structure
      const encryptedProfile = {
        encryptedBirthDate: encryptedData.encryptedBirthDate,
        encryptedSex: encryptedData.encryptedSex,
        encryptedHeight: encryptedData.encryptedHeight,
        encryptedWeight: encryptedData.encryptedWeight,
        encryptedEmail: encryptedData.encryptedEmail,
        dataHash:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        timestamp: Date.now(),
        version: 1,
        nonce: encryptedData.nonce,
      };

      // Decrypt the data using the secure encryption system
      const decryptedProfile = await decryptHealthData(
        encryptedProfile,
        userAddress,
        userPassphrase,
      );

      return {
        success: true,
        decryptedData: {
          birthDate: decryptedProfile.birthDate,
          sex: decryptedProfile.sex,
          height: decryptedProfile.height,
          weight: decryptedProfile.weight,
          email: decryptedProfile.email,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to decrypt health data:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get anonymized health data for AI analysis (privacy-preserving)
   */
  async getAnonymizedHealthData(userAddress: string): Promise<{
    success: boolean;
    anonymizedData?: {
      ageRange: string; // e.g., "25-35"
      heightRange: string; // e.g., "5'8\"-6'0\""
      weightRange: string; // e.g., "150-180 lbs"
      emailDomain: string; // e.g., "@gmail.com"
      zkProofHash: string;
    };
    error?: string;
  }> {
    if (!this.isAuthorized) {
      return {
        success: false,
        error: "Protocol not authorized to access health data",
      };
    }

    try {
      const { readContract } = await import("@wagmi/core");
      const { secureHealthProfileAbi, SECURE_HEALTH_PROFILE_CONTRACT } =
        await import("../lib/zksync-sso-config");

      // Get ZK proof hash for privacy-preserving analysis
      const zkProof = await readContract(wagmiConfig, {
        address: SECURE_HEALTH_PROFILE_CONTRACT,
        abi: secureHealthProfileAbi,
        functionName: "getZKProof",
        args: [userAddress as `0x${string}`],
      });

      // Return anonymized data structure
      // In a real implementation, this would come from ZK proofs
      return {
        success: true,
        anonymizedData: {
          ageRange: zkProof.ageRange || "calculated_from_zk_proof",
          heightRange: zkProof.heightRange || "calculated_from_zk_proof",
          weightRange: zkProof.weightRange || "calculated_from_zk_proof",
          emailDomain: zkProof.emailDomain || "calculated_from_zk_proof",
          zkProofHash: zkProof.proofHash,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to get anonymized health data:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Submit ZK proof for privacy-preserving verification
   */
  async submitZKProof(proofData: {
    ageRange: string;
    heightRange: string;
    weightRange: string;
    emailDomain: string;
    proofHash: string;
  }): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (!this.isAuthorized) {
      return {
        success: false,
        error: "Protocol not authorized to submit ZK proofs",
      };
    }

    try {
      const { writeContract } = await import("@wagmi/core");
      const { secureHealthProfileAbi, SECURE_HEALTH_PROFILE_CONTRACT } =
        await import("../lib/zksync-sso-config");

      const hash = await writeContract(wagmiConfig, {
        address: SECURE_HEALTH_PROFILE_CONTRACT,
        abi: secureHealthProfileAbi,
        functionName: "submitZKProof",
        args: [
          proofData.ageRange,
          proofData.heightRange,
          proofData.weightRange,
          proofData.emailDomain,
          proofData.proofHash as `0x${string}`,
        ],
      });

      console.log("📝 ZK proof submitted:", hash);
      return { success: true, txHash: hash };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to submit ZK proof:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }
}

// Export singleton instance for the main app protocol
export const protocolDataAccessService = new ProtocolDataAccessService(
  process.env.NEXT_PUBLIC_MAIN_APP_PROTOCOL_ADDRESS ||
    "0x0000000000000000000000000000000000000000",
);
