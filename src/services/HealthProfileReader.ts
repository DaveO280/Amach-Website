import { ethers } from "ethers";

// Contract configuration
const CONTRACT_ADDRESS = "0xdEf7d0e5D56d9A846336edAB3c3BFda25F368287";
const RPC_URL = "https://rpc.ankr.com/zksync_era_sepolia";

// Contract ABI for reading profile data
const CONTRACT_ABI = [
  "function profiles(address user) view returns (tuple(bytes32 encryptedBirthDate, bytes32 encryptedSex, bytes32 encryptedHeight, bytes32 encryptedEmail, bytes32 encryptedWeight, bytes32 dataHash, uint256 timestamp, bool isActive, uint8 version))",
  "function hasProfile(address user) view returns (bool)",
  "function getProfileVersion(address user) view returns (uint8)",
  "function hasWeightData(address user) view returns (bool)",
  "function hasEmailData(address user) view returns (bool)",
  "function getProfileTimestamp(address user) view returns (uint256)",
  "function getProfileDataHash(address user) view returns (bytes32)",
  "function owner() view returns (address)",
];

export interface OnChainProfile {
  userAddress: string;
  encryptedBirthDate: string;
  encryptedSex: string;
  encryptedHeight: string;
  encryptedEmail: string;
  encryptedWeight: string;
  dataHash: string;
  timestamp: number;
  isActive: boolean;
  exists: boolean;
  version: number;
  hasWeight: boolean;
  hasEmail: boolean;
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

      // Read the profile data
      const profile = await this.contract.profiles(userAddress);
      console.log("Raw profile data:", profile);

      // Check if profile is active (timestamp > 0)
      if (profile[5] === 0n) {
        // timestamp is at index 5
        console.log("Profile exists but is not active");
        return null;
      }

      const onChainProfile: OnChainProfile = {
        userAddress,
        encryptedBirthDate: profile[0],
        encryptedSex: profile[1],
        encryptedHeight: profile[2],
        encryptedEmail: profile[3],
        encryptedWeight: profile[4],
        dataHash: profile[5],
        timestamp: Number(profile[6]),
        isActive: profile[7],
        version: Number(profile[8]),
        exists: true,
        hasWeight:
          profile[4] !==
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        hasEmail:
          profile[3] !==
          "0x0000000000000000000000000000000000000000000000000000000000000000",
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
   * Get profile timestamp
   */
  async getProfileTimestamp(userAddress: string): Promise<number | null> {
    try {
      const timestamp = await this.contract.getProfileTimestamp(userAddress);
      return Number(timestamp);
    } catch (error) {
      console.error("Error getting profile timestamp:", error);
      return null;
    }
  }

  /**
   * Get profile data hash for verification
   */
  async getProfileDataHash(userAddress: string): Promise<string | null> {
    try {
      const dataHash = await this.contract.getProfileDataHash(userAddress);
      return dataHash;
    } catch (error) {
      console.error("Error getting profile data hash:", error);
      return null;
    }
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
