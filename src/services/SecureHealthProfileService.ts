/**
 * Secure Health Profile Service
 *
 * Handles migration from legacy encrypted system to secure on-chain storage
 * Supports ZK-proofs and protocol access while maintaining privacy
 */

import {
  encryptHealthData,
  decryptHealthData,
  generateZKProofInputs,
  verifyZKProof,
  type SecureHealthProfile,
  type OnChainEncryptedProfile,
  type ZKProofInputs,
} from "../utils/secureHealthEncryption";

export interface HealthProfileServiceConfig {
  contractAddress: string;
  rpcUrl: string;
  userPassphrase?: string;
}

export class SecureHealthProfileService {
  private walletAddress: string;
  private config: HealthProfileServiceConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private contract: any; // Will be initialized with ethers contract

  constructor(walletAddress: string, config: HealthProfileServiceConfig) {
    this.walletAddress = walletAddress;
    this.config = config;
  }

  /**
   * Migrate from legacy system to secure on-chain storage
   */
  async migrateFromLegacy(
    legacyProfile: Record<string, unknown>,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      console.log("🔄 Starting migration from legacy system...");

      // Convert legacy data to secure format
      const secureProfile = await this.convertLegacyToSecure(legacyProfile);

      // Encrypt with new secure system
      const encryptedProfile = await encryptHealthData(
        secureProfile,
        this.walletAddress,
        this.config.userPassphrase,
      );

      // Store on-chain
      const result = await this.createSecureProfileOnChain(encryptedProfile);

      if (result.success) {
        console.log("✅ Migration completed successfully");

        // Generate ZK-proof inputs for privacy-preserving verification
        const zkProofInputs = generateZKProofInputs(secureProfile);
        await this.submitZKProof(zkProofInputs);

        // Clean up legacy data from localStorage
        this.cleanupLegacyData();
      }

      return result;
    } catch (error) {
      console.error("❌ Migration failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Create new secure profile on-chain
   */
  async createSecureProfile(
    profile: SecureHealthProfile,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const encryptedProfile = await encryptHealthData(
        profile,
        this.walletAddress,
        this.config.userPassphrase,
      );

      return await this.createSecureProfileOnChain(encryptedProfile);
    } catch (error) {
      console.error("❌ Failed to create secure profile:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Update existing secure profile
   */
  async updateSecureProfile(
    profile: SecureHealthProfile,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const encryptedProfile = await encryptHealthData(
        profile,
        this.walletAddress,
        this.config.userPassphrase,
      );

      // Call updateSecureProfile on contract
      const contract = await this.getContract();
      const tx = await contract.updateSecureProfile(
        encryptedProfile.encryptedBirthDate,
        encryptedProfile.encryptedSex,
        encryptedProfile.encryptedHeight,
        encryptedProfile.encryptedWeight,
        encryptedProfile.encryptedEmail,
        encryptedProfile.dataHash,
        encryptedProfile.nonce,
      );

      await tx.wait();
      console.log("✅ Profile updated successfully");

      // Update ZK-proof inputs
      const zkProofInputs = generateZKProofInputs(profile);
      await this.submitZKProof(zkProofInputs);

      return { success: true, txHash: tx.hash };
    } catch (error) {
      console.error("❌ Failed to update profile:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Read encrypted profile from blockchain and decrypt
   */
  async getDecryptedProfile(): Promise<SecureHealthProfile | null> {
    try {
      const contract = await this.getContract();
      const encryptedProfile = await contract.getEncryptedProfile(
        this.walletAddress,
      );

      if (!encryptedProfile.isActive) {
        return null;
      }

      const onChainProfile: OnChainEncryptedProfile = {
        encryptedBirthDate: encryptedProfile.encryptedBirthDate,
        encryptedSex: encryptedProfile.encryptedSex,
        encryptedHeight: encryptedProfile.encryptedHeight,
        encryptedWeight: encryptedProfile.encryptedWeight,
        encryptedEmail: encryptedProfile.encryptedEmail,
        dataHash: encryptedProfile.dataHash,
        timestamp: Number(encryptedProfile.timestamp),
        version: Number(encryptedProfile.version),
        nonce: encryptedProfile.nonce,
      };

      return await decryptHealthData(
        onChainProfile,
        this.walletAddress,
        this.config.userPassphrase,
      );
    } catch (error) {
      console.error("❌ Failed to get decrypted profile:", error);
      return null;
    }
  }

  /**
   * Get ZK-proof inputs for privacy-preserving verification
   */
  async getZKProofInputs(): Promise<ZKProofInputs | null> {
    try {
      const contract = await this.getContract();
      const zkProof = await contract.getZKProof(this.walletAddress);

      if (!zkProof.isValid) {
        return null;
      }

      return {
        ageRange: zkProof.ageRange,
        heightRange: zkProof.heightRange,
        weightRange: zkProof.weightRange,
        emailDomain: zkProof.emailDomain,
        proofHash: zkProof.proofHash,
      };
    } catch (error) {
      console.error("❌ Failed to get ZK proof inputs:", error);
      return null;
    }
  }

  /**
   * Verify ZK-proof conditions without revealing actual data
   */
  async verifyZKProofConditions(requiredConditions: {
    minAge?: number;
    maxAge?: number;
    heightRange?: string;
    weightRange?: string;
    allowedDomains?: string[];
  }): Promise<boolean> {
    try {
      const zkProofInputs = await this.getZKProofInputs();
      if (!zkProofInputs) {
        return false;
      }

      return verifyZKProof(zkProofInputs, requiredConditions);
    } catch (error) {
      console.error("❌ Failed to verify ZK proof conditions:", error);
      return false;
    }
  }

  /**
   * Check if user has a secure profile
   */
  async hasSecureProfile(): Promise<boolean> {
    try {
      const contract = await this.getContract();
      return await contract.hasProfile(this.walletAddress);
    } catch (error) {
      console.error("❌ Failed to check profile existence:", error);
      return false;
    }
  }

  /**
   * Submit ZK-proof to blockchain
   */
  private async submitZKProof(zkProofInputs: ZKProofInputs): Promise<void> {
    try {
      const contract = await this.getContract();
      const tx = await contract.submitZKProof(
        zkProofInputs.ageRange,
        zkProofInputs.heightRange,
        zkProofInputs.weightRange,
        zkProofInputs.emailDomain,
        zkProofInputs.proofHash,
      );

      await tx.wait();
      console.log("✅ ZK-proof submitted successfully");
    } catch (error) {
      console.error("❌ Failed to submit ZK-proof:", error);
      throw error;
    }
  }

  /**
   * Create secure profile on blockchain
   */
  private async createSecureProfileOnChain(
    encryptedProfile: OnChainEncryptedProfile,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const contract = await this.getContract();
      const tx = await contract.createSecureProfile(
        encryptedProfile.encryptedBirthDate,
        encryptedProfile.encryptedSex,
        encryptedProfile.encryptedHeight,
        encryptedProfile.encryptedWeight,
        encryptedProfile.encryptedEmail,
        encryptedProfile.dataHash,
        encryptedProfile.nonce,
      );

      await tx.wait();
      console.log("✅ Secure profile created on blockchain");

      return { success: true, txHash: tx.hash };
    } catch (error) {
      console.error("❌ Failed to create profile on blockchain:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Convert legacy profile format to secure format
   */
  private async convertLegacyToSecure(
    legacyProfile: Record<string, unknown>,
  ): Promise<SecureHealthProfile> {
    return {
      birthDate: (legacyProfile.birthDate as string) || "1990-01-01",
      sex: (legacyProfile.sex as string) || "unknown",
      height: (legacyProfile.height as number) || 0,
      weight: (legacyProfile.weight as number) || 0,
      email: (legacyProfile.email as string) || "",
    };
  }

  /**
   * Clean up legacy data from localStorage
   */
  private cleanupLegacyData(): void {
    const legacyKeys = [
      `health_encryption_key_${this.walletAddress}`,
      `health_profile_${this.walletAddress}`,
    ];

    legacyKeys.forEach((key) => {
      localStorage.removeItem(key);
    });

    console.log("🧹 Legacy data cleaned up");
  }

  /**
   * Get contract instance
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getContract(): Promise<any> {
    if (!this.contract) {
      const { ethers } = await import("ethers");
      const provider = new ethers.providers.JsonRpcProvider(this.config.rpcUrl);

      // Contract ABI for SecureHealthProfile
      const abi = [
        "function createSecureProfile(string,string,string,string,string,bytes32,string) external",
        "function updateSecureProfile(string,string,string,string,string,bytes32,string) external",
        "function getEncryptedProfile(address) external view returns (tuple(string,string,string,string,string,bytes32,uint256,bool,uint8,string))",
        "function getZKProof(address) external view returns (tuple(string,string,string,string,bytes32,uint256,bool))",
        "function hasProfile(address) external view returns (bool)",
        "function submitZKProof(string,string,string,string,bytes32) external",
        "function verifyZKProofConditions(address,uint256,uint256,string,string,string[]) external view returns (bool)",
        "function deactivateProfile() external",
      ];

      this.contract = new ethers.Contract(
        this.config.contractAddress,
        abi,
        provider.getSigner(),
      );
    }

    return this.contract;
  }
}

/**
 * Migration utility for existing users
 */
export async function migrateUserToSecureSystem(
  walletAddress: string,
  legacyProfile: Record<string, unknown>,
  config: HealthProfileServiceConfig,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const service = new SecureHealthProfileService(walletAddress, config);

  // Check if user already has a secure profile
  const hasSecure = await service.hasSecureProfile();
  if (hasSecure) {
    console.log("ℹ️ User already has a secure profile");
    return { success: true };
  }

  // Migrate from legacy system
  return await service.migrateFromLegacy(legacyProfile);
}
