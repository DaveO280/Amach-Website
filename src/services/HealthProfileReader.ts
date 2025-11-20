import { ethers } from "ethers";
import { SECURE_HEALTH_PROFILE_CONTRACT } from "../lib/zksync-sso-config";

// Contract configuration
const CONTRACT_ADDRESS = SECURE_HEALTH_PROFILE_CONTRACT; // Import from config (永 permanent proxy address)
const RPC_URL = "https://rpc.ankr.com/zksync_era_sepolia";

// Contract ABI for reading profile data (V1 Upgradeable)
const CONTRACT_ABI = [
  "function getProfile(address user) view returns (tuple(string encryptedBirthDate, string encryptedSex, string encryptedHeight, string encryptedEmail, bytes32 dataHash, uint256 timestamp, bool isActive, uint8 version, string nonce))",
  "function hasProfile(address user) view returns (bool)",
  "function isProfileActive(address user) view returns (bool)",
  "function getProfileMetadata(address user) view returns (uint256 timestamp, bool isActive, uint8 version, bytes32 dataHash)",
  "function getTotalProfiles() view returns (uint256)",
  "function getVersion() view returns (uint8)",
  "function owner() view returns (address)",
  // Timeline functions
  "function getHealthTimeline(address user) view returns (tuple(uint256 timestamp, uint8 eventType, string encryptedData, bytes32 eventHash, bool isActive)[])",
  "function getEventCount(address user) view returns (uint256)",
];

export interface OnChainProfile {
  userAddress: string;
  encryptedBirthDate: string;
  encryptedSex: string;
  encryptedHeight: string;
  encryptedEmail: string;
  dataHash: string;
  timestamp: number;
  isActive: boolean;
  exists: boolean;
  version: number;
  nonce: string;
}

export class HealthProfileReader {
  private provider: ethers.providers.JsonRpcProvider;
  private contract: ethers.Contract;

  constructor() {
    this.provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    this.contract = new ethers.Contract(
      CONTRACT_ADDRESS,
      CONTRACT_ABI,
      this.provider,
    );
  }

  /**
   * Check if a user has a profile on-chain
   */
  async hasProfile(userAddress: string): Promise<boolean> {
    try {
      console.log("🔍 Checking if profile exists for:", userAddress);
      const hasProfile = await this.contract.hasProfile(userAddress);
      console.log("Profile exists:", hasProfile);
      return hasProfile;
    } catch (error) {
      console.error("Error checking profile existence:", error);
      return false;
    }
  }

  /**
   * Read encrypted profile data from the blockchain
   */
  async getProfile(userAddress: string): Promise<OnChainProfile | null> {
    try {
      console.log("📖 Reading profile from chain for:", userAddress);

      // Check if profile exists first
      const exists = await this.hasProfile(userAddress);
      if (!exists) {
        console.log("No profile found for address:", userAddress);
        return null;
      }

      // Read the profile data using getProfile function (V1)
      const profile = await this.contract.getProfile(userAddress);
      console.log("Raw profile data:", profile);

      // Check if profile is active
      if (profile.timestamp === 0n || !profile.isActive) {
        console.log("Profile exists but is not active");
        return null;
      }

      const onChainProfile: OnChainProfile = {
        userAddress,
        encryptedBirthDate: profile.encryptedBirthDate,
        encryptedSex: profile.encryptedSex,
        encryptedHeight: profile.encryptedHeight,
        encryptedEmail: profile.encryptedEmail,
        dataHash: profile.dataHash,
        timestamp: Number(profile.timestamp),
        isActive: profile.isActive,
        version: Number(profile.version),
        nonce: profile.nonce,
        exists: true,
      };

      console.log("✅ Profile read successfully:", {
        userAddress,
        timestamp: new Date(onChainProfile.timestamp * 1000).toLocaleString(),
        isActive: onChainProfile.isActive,
        dataHash: onChainProfile.dataHash,
      });

      return onChainProfile;
    } catch (error) {
      console.error("Error reading profile from chain:", error);
      return null;
    }
  }

  /**
   * Get profile metadata (timestamp, isActive, version, dataHash)
   */
  async getProfileMetadata(userAddress: string): Promise<{
    timestamp: number;
    isActive: boolean;
    version: number;
    dataHash: string;
  } | null> {
    try {
      const metadata = await this.contract.getProfileMetadata(userAddress);
      return {
        timestamp: Number(metadata.timestamp),
        isActive: metadata.isActive,
        version: Number(metadata.version),
        dataHash: metadata.dataHash,
      };
    } catch (error) {
      console.error("Error getting profile metadata:", error);
      return null;
    }
  }

  /**
   * Get profile timestamp
   */
  async getProfileTimestamp(userAddress: string): Promise<number | null> {
    const metadata = await this.getProfileMetadata(userAddress);
    return metadata?.timestamp ?? null;
  }

  /**
   * Get profile data hash for verification
   */
  async getProfileDataHash(userAddress: string): Promise<string | null> {
    const metadata = await this.getProfileMetadata(userAddress);
    return metadata?.dataHash ?? null;
  }

  /**
   * Test contract connectivity
   */
  async testContractAccess(): Promise<boolean> {
    try {
      console.log("🔍 Testing contract access...");

      // Check if contract exists
      const code = await this.provider.getCode(CONTRACT_ADDRESS);
      if (code === "0x") {
        console.log("❌ Contract not found on RPC");
        return false;
      }

      // Test owner function
      const owner = await this.contract.owner();
      console.log("✅ Contract owner:", owner);

      console.log("✅ Contract access test passed!");
      return true;
    } catch (error) {
      console.error("❌ Contract access test failed:", error);
      return false;
    }
  }
}

// Export singleton instance
export const healthProfileReader = new HealthProfileReader();
