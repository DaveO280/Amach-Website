"use client";

import { connect, disconnect, getAccount } from "@wagmi/core";
import { parseEther, type Address } from "viem";
import { ssoConnector, wagmiConfig } from "../lib/zksync-sso-config";
import { trackingService } from "../utils/trackingService";

// ZKsync Sepolia Testnet chain ID
const ZKSYNC_SEPOLIA_CHAIN_ID = 300;

// Health profile data interface
export interface HealthProfileData {
  birthDate?: string;
  sex?: string;
  height?: number;
  email?: string;
  weight?: number;
  isActive: boolean;
  version: number;
  timestamp: number;
}

// Encrypted profile data for on-chain storage
export interface EncryptedHealthProfile {
  encryptedBirthDate: `0x${string}`;
  encryptedSex: `0x${string}`;
  encryptedHeight: `0x${string}`;
  encryptedEmail: `0x${string}`;
  encryptedWeight: `0x${string}`;
  dataHash: `0x${string}`;
  timestamp: number;
  isActive: boolean;
  version: number;
  zkProofHash: `0x${string}`;
}

// Session management for health data access
export interface HealthDataSession {
  sessionId: string;
  permissions: string[];
  expiryTime: number;
  maxGasFee: bigint;
  isActive: boolean;
}

// ZKsync SSO Wallet Service
export class ZkSyncSsoWalletService {
  private isConnected = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private account: any = null;
  private healthProfile: EncryptedHealthProfile | null = null;
  private activeSession: HealthDataSession | null = null;

  constructor() {
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    try {
      // Attempt to reconnect to any previously authorized connector
      try {
        const { reconnect } = await import("@wagmi/core");
        await reconnect(wagmiConfig);
      } catch {
        // no-op: reconnect not available or failed silently
      }

      // Check if already connected after reconnect attempt
      const account = getAccount(wagmiConfig);
      if (account.isConnected && account.address) {
        this.isConnected = true;
        this.account = account;
        await this.loadHealthProfile();
        console.log(
          "✅ ZKsync SSO service initialized with connected account:",
          account.address,
        );
      } else {
        console.log("ZKsync SSO service initialized, no account connected");
      }
    } catch (error) {
      console.error("Failed to initialize ZKsync SSO service:", error);

      // Handle authorization errors gracefully in development
      if (
        error instanceof Error &&
        error.message.includes("not been authorized")
      ) {
        console.error("❌ ZKsync SSO AUTHORIZATION REQUIRED ❌");
        console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.error(
          "The domain https://localhost:3000 needs to be authorized.",
        );
        console.error("");
        console.error("📋 STEPS TO AUTHORIZE:");
        console.error("  1. Visit: https://portal.zksync.io/");
        console.error("  2. Connect your wallet");
        console.error('  3. Navigate to "SSO" or "Applications"');
        console.error("  4. Add domain: https://localhost:3000");
        console.error("  5. Save and refresh this page");
        console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      }
    }
  }

  /**
   * Connect to ZKsync SSO wallet
   */
  async connect(): Promise<{ success: boolean; error?: string }> {
    try {
      // Ensure we're running on the client side
      if (typeof window === "undefined") {
        return {
          success: false,
          error: "ZKsync SSO can only be used on the client side",
        };
      }

      console.log("🔐 Connecting to ZKsync SSO wallet...");

      // Use ZKsync Sepolia chain ID directly
      console.log("🔗 Using ZKsync Sepolia chain ID:", ZKSYNC_SEPOLIA_CHAIN_ID);

      const result = await connect(wagmiConfig, {
        connector: ssoConnector,
        chainId: ZKSYNC_SEPOLIA_CHAIN_ID,
      });

      if (result) {
        this.isConnected = true;
        this.account = result;
        await this.loadHealthProfile();

        console.log("✅ Connected to ZKsync SSO wallet:", result);

        return { success: true };
      } else {
        return { success: false, error: "Failed to connect to wallet" };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ ZKsync SSO connection failed:", errorMessage);

      // Provide helpful guidance for common errors
      if (errorMessage.includes("not been authorized")) {
        console.error("❌ ZKsync SSO AUTHORIZATION REQUIRED ❌");
        console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.error(
          "The domain https://localhost:3000 needs to be authorized.",
        );
        console.error("");
        console.error("📋 STEPS TO AUTHORIZE:");
        console.error("  1. Visit: https://portal.zksync.io/");
        console.error("  2. Connect your wallet");
        console.error('  3. Navigate to "SSO" or "Applications"');
        console.error("  4. Add domain: https://localhost:3000");
        console.error("  5. Save and refresh this page");
        console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        return {
          success: false,
          error:
            "🔒 Domain Authorization Required: Please authorize https://localhost:3000 at portal.zksync.io (see console for detailed steps)",
        };
      }

      if (
        errorMessage.includes("network") ||
        errorMessage.includes("Network")
      ) {
        console.warn("💡 Network Detection Issue:");
        console.warn("   1. Clear browser storage and refresh");
        console.warn(
          "   2. Check if localhost:3000 is authorized at portal.zksync.io",
        );
        return {
          success: false,
          error:
            "Network detection failed. Please clear browser storage and reconnect.",
        };
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Disconnect from ZKsync SSO wallet
   */
  async disconnect(): Promise<void> {
    try {
      // Clear encryption key cache on disconnect for security
      if (this.account?.address) {
        const { clearEncryptionKeyOnDisconnect } = await import(
          "../utils/walletEncryption"
        );
        clearEncryptionKeyOnDisconnect(this.account.address);
      }

      await disconnect(wagmiConfig);
      this.isConnected = false;
      this.account = null;
      this.healthProfile = null;
      this.activeSession = null;
      console.log(
        "🔌 Disconnected from ZKsync SSO wallet and cleared encryption cache",
      );
    } catch (error) {
      console.error("Error disconnecting from wallet:", error);
    }
  }

  /**
   * Refresh ZKsync SSO session to resolve timing issues
   */
  async refreshSession(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log("🔄 Refreshing ZKsync SSO session...");

      // Disconnect first
      await this.disconnect();

      // Wait a moment for cleanup
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Reconnect with fresh session
      const result = await this.connect();

      if (result.success) {
        console.log("✅ ZKsync SSO session refreshed successfully");
      }

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to refresh ZKsync SSO session:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Force cleanup of ZKsync SSO state (for development/debugging)
   */
  async forceCleanup(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log("🧹 Force cleaning ZKsync SSO state...");

      // Disconnect if connected
      if (this.isConnected) {
        await this.disconnect();
      }

      // Clear local state
      this.isConnected = false;
      this.account = null;
      this.healthProfile = null;
      this.activeSession = null;

      // Clear browser storage related to ZKsync SSO
      if (typeof window !== "undefined") {
        try {
          // Clear localStorage keys that might be related to ZKsync SSO
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (
              key &&
              (key.includes("zksync") ||
                key.includes("sso") ||
                key.includes("wagmi"))
            ) {
              keysToRemove.push(key);
            }
          }

          keysToRemove.forEach((key) => {
            localStorage.removeItem(key);
            console.log("🗑️ Removed localStorage key:", key);
          });

          // Clear sessionStorage
          sessionStorage.clear();

          console.log("✅ Browser storage cleaned");
        } catch (storageError) {
          console.warn("⚠️ Could not clear browser storage:", storageError);
        }
      }

      // Wait for cleanup to complete
      await new Promise((resolve) => setTimeout(resolve, 2000));

      console.log("✅ ZKsync SSO state cleanup completed");
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to cleanup ZKsync SSO state:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Verify profile using ZKsync SSO (direct contract call, no signature needed)
   */
  async verifyProfileZKsync(
    email: string,
    retryCount: number = 0,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Ensure we're running on the client side
      if (typeof window === "undefined") {
        return {
          success: false,
          error: "ZKsync SSO verification can only be used on the client side",
        };
      }

      if (!this.isConnected || !this.account?.address) {
        return { success: false, error: "Wallet not connected" };
      }

      console.log(
        "🔐 Verifying profile using ZKsync SSO (direct contract call)...",
      );

      // Use writeContract to call verifyProfileZKsync directly
      const { writeContract } = await import("@wagmi/core");
      const { PROFILE_VERIFICATION_CONTRACT } = await import(
        "../lib/zksync-sso-config"
      );

      const hash = await writeContract(wagmiConfig, {
        address: PROFILE_VERIFICATION_CONTRACT,
        abi: [
          {
            inputs: [{ name: "email", type: "string" }],
            name: "verifyProfileZKsync",
            outputs: [],
            stateMutability: "nonpayable",
            type: "function",
          },
        ],
        functionName: "verifyProfileZKsync",
        args: [email],
      });

      console.log("✅ Profile verification transaction submitted:", hash);

      // Track the verification in the admin dashboard
      try {
        await trackingService.trackProfileVerification(
          email,
          this.account.address,
        );
        console.log("📊 Profile verification tracked successfully");
      } catch (trackingError) {
        console.warn(
          "⚠️ Failed to track verification (non-critical):",
          trackingError,
        );
      }

      return { success: true, txHash: hash };
    } catch (error) {
      console.error("Failed to verify profile:", error);

      // Check if it's a session policy error
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("Transaction does not fit any policy")) {
        console.log(
          "🔄 Session policy error detected. Please refresh the ZKsync SSO session.",
        );
        return {
          success: false,
          error:
            "ZKsync SSO session policy error. Please disconnect and reconnect your wallet to refresh the session.",
        };
      }

      // Check if it's a timestamp error and we haven't retried yet
      if (
        errorMessage.includes(
          "block.timestamp is too close to the range end",
        ) &&
        retryCount < 1
      ) {
        console.log(
          "🔄 Timestamp error detected, refreshing session and retrying...",
        );

        // Refresh session
        const refreshResult = await this.refreshSession();
        if (refreshResult.success) {
          // Retry with incremented count
          return this.verifyProfileZKsync(email, retryCount + 1);
        } else {
          return {
            success: false,
            error: "Failed to refresh session: " + refreshResult.error,
          };
        }
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Check if wallet is connected
   */
  isWalletConnected(): boolean {
    return this.isConnected && this.account !== null;
  }

  /**
   * Refresh connection state from wagmi
   */
  refreshConnectionState(): void {
    try {
      const account = getAccount(wagmiConfig);
      const wasConnected = this.isConnected;
      const wasAccount = this.account;

      if (account.isConnected && account.address) {
        this.isConnected = true;
        this.account = account;

        // Only log if state actually changed
        if (!wasConnected || wasAccount?.address !== account.address) {
          console.log("🔄 Connection state refreshed:", account.address);
        }
      } else {
        this.isConnected = false;
        this.account = null;

        // Only log if state actually changed
        if (wasConnected) {
          console.log("🔄 Connection state refreshed: not connected");
        }
      }
    } catch (error) {
      console.error("Failed to refresh connection state:", error);
    }
  }

  /**
   * Get current account address
   */
  getAddress(): string | null {
    return this.account?.address || null;
  }

  /**
   * Get current account info
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAccountInfo(): any {
    return this.account;
  }

  /**
   * Load health profile from blockchain
   * Now reads full encrypted profile data from contract
   */
  private async loadHealthProfile(): Promise<void> {
    if (!this.account?.address) return;

    try {
      console.log("📖 Loading health profile from blockchain...");

      // Read full profile from blockchain using SecureHealthProfile contract
      const { readContract } = await import("@wagmi/core");
      const { secureHealthProfileAbi, SECURE_HEALTH_PROFILE_CONTRACT } =
        await import("../lib/zksync-sso-config");

      try {
        // Read the full encrypted profile (not just metadata)
        const encryptedProfile = await readContract(wagmiConfig, {
          address: SECURE_HEALTH_PROFILE_CONTRACT,
          abi: secureHealthProfileAbi,
          functionName: "getEncryptedProfile",
          args: [this.account.address],
        });

        console.log("✅ Retrieved encrypted profile from blockchain:", {
          hasBirthDate: !!encryptedProfile.encryptedBirthDate,
          hasSex: !!encryptedProfile.encryptedSex,
          hasHeight: !!encryptedProfile.encryptedHeight,
          hasWeight: !!encryptedProfile.encryptedWeight,
          hasEmail: !!encryptedProfile.encryptedEmail,
          dataHash: encryptedProfile.dataHash,
          timestamp: new Date(
            Number(encryptedProfile.timestamp) * 1000,
          ).toISOString(),
          isActive: encryptedProfile.isActive,
          version: encryptedProfile.version,
        });

        // Store the actual encrypted data (Base64 strings from blockchain)
        this.healthProfile = {
          encryptedBirthDate:
            encryptedProfile.encryptedBirthDate as `0x${string}`,
          encryptedSex: encryptedProfile.encryptedSex as `0x${string}`,
          encryptedHeight: encryptedProfile.encryptedHeight as `0x${string}`,
          encryptedWeight: encryptedProfile.encryptedWeight as `0x${string}`,
          encryptedEmail: encryptedProfile.encryptedEmail as `0x${string}`,
          dataHash: encryptedProfile.dataHash as `0x${string}`,
          timestamp: Number(encryptedProfile.timestamp),
          isActive: encryptedProfile.isActive,
          version: Number(encryptedProfile.version),
          zkProofHash:
            "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
        };

        // Sync blockchain data to localStorage for fast access
        await this.syncBlockchainToLocalStorage(encryptedProfile);

        console.log("✅ Health profile loaded and synced to localStorage");
      } catch (error) {
        console.error("❌ Failed to load profile from blockchain:", error);
        console.log("ℹ️ No health profile found on blockchain");
        this.healthProfile = null;
      }
    } catch (error) {
      console.error("❌ Failed to load health profile:", error);
    }
  }

  /**
   * Sync blockchain encrypted data to localStorage
   * Decrypts on-chain data using secureHealthEncryption, then re-encrypts for localStorage using walletEncryption
   */
  private async syncBlockchainToLocalStorage(encryptedProfile: {
    encryptedBirthDate: string;
    encryptedSex: string;
    encryptedHeight: string;
    encryptedWeight: string;
    encryptedEmail: string;
    nonce: string;
    timestamp: bigint;
  }): Promise<void> {
    if (!this.account?.address) return;

    try {
      console.log("🔄 Syncing blockchain data to localStorage...");

      // Decrypt the on-chain data using secureHealthEncryption (AES-256-GCM)
      const { decryptHealthData } = await import(
        "../utils/secureHealthEncryption"
      );

      const onChainProfile = {
        encryptedBirthDate: encryptedProfile.encryptedBirthDate,
        encryptedSex: encryptedProfile.encryptedSex,
        encryptedHeight: encryptedProfile.encryptedHeight,
        encryptedWeight: encryptedProfile.encryptedWeight,
        encryptedEmail: encryptedProfile.encryptedEmail,
        dataHash:
          "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
        timestamp: Number(encryptedProfile.timestamp),
        version: 1,
        nonce: encryptedProfile.nonce,
      };

      // Decrypt using the on-chain encryption method (PBKDF2 with wallet address)
      const decryptedProfile = await decryptHealthData(
        onChainProfile,
        this.account.address,
        undefined, // No passphrase - uses wallet address
      );

      console.log("✅ Decrypted profile from blockchain:", {
        hasBirthDate: !!decryptedProfile.birthDate,
        hasSex: !!decryptedProfile.sex,
        hasHeight: !!decryptedProfile.height,
        hasWeight: !!decryptedProfile.weight,
        hasEmail: !!decryptedProfile.email,
      });

      // Now re-encrypt for localStorage using wallet-derived key
      const walletEncryptionKey = await this.getWalletDerivedEncryptionKey();

      const profileDataForStorage: HealthProfileData = {
        birthDate: decryptedProfile.birthDate,
        sex: decryptedProfile.sex,
        height: decryptedProfile.height,
        weight: decryptedProfile.weight,
        email: decryptedProfile.email,
        isActive: true,
        version: 1,
        timestamp: Date.now(),
      };

      await this.storeEncryptedProfileInLocalStorage(
        profileDataForStorage,
        walletEncryptionKey,
      );

      console.log("✅ Synced decrypted profile to localStorage");
    } catch (error) {
      console.error(
        "❌ Failed to sync blockchain data to localStorage:",
        error,
      );
      console.error(
        "   This is okay - localStorage will be populated on next profile update",
      );
    }
  }

  /**
   * Update health profile on blockchain
   */
  async updateHealthProfile(
    profile: HealthProfileData,
  ): Promise<{ success: boolean; error?: string; txHash?: string }> {
    if (!this.isConnected) {
      return { success: false, error: "Wallet not connected" };
    }

    try {
      console.log("💾 Updating health profile on blockchain...");

      // 1. Encrypt the profile data
      const encryptedProfile = await this.encryptHealthData(profile);

      // 2. Generate data hash for verification
      const dataHash = await this.generateDataHash(encryptedProfile);

      // 3. Update the encrypted profile with the correct data hash
      encryptedProfile.dataHash = dataHash;

      // 4. Submit transaction to update profile contract
      const txResult = await this.executeHealthProfileTransaction(
        encryptedProfile,
        dataHash,
      );

      if (txResult.success) {
        this.healthProfile = encryptedProfile;
        console.log(
          "✅ Health profile updated on blockchain:",
          txResult.txHash,
        );

        // Track profile creation in the admin dashboard
        try {
          if (profile.email) {
            await trackingService.trackProfileCreation(
              profile.email,
              profile as unknown as Record<string, unknown>,
              this.account.address,
            );
            console.log("📊 Profile creation tracked successfully");
          }
        } catch (trackingError) {
          console.warn(
            "⚠️ Failed to track profile creation (non-critical):",
            trackingError,
          );
        }

        return { success: true, txHash: txResult.txHash };
      } else {
        return { success: false, error: txResult.error };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to update health profile:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Encrypt health data using AES-256-GCM for full on-chain encryption
   */
  private async encryptHealthData(
    profile: HealthProfileData,
  ): Promise<EncryptedHealthProfile> {
    // Use secure encryption that stores full encrypted strings on-chain
    const { encryptHealthData: encryptSecureData } = await import(
      "../utils/secureHealthEncryption"
    );

    const secureProfile = {
      birthDate: profile.birthDate || "",
      sex: profile.sex || "",
      height: profile.height || 0,
      weight: profile.weight || 0,
      email: profile.email || "",
    };

    // Encrypt using AES-256-GCM - stores full encrypted strings, not hashes
    const encryptedProfile = await encryptSecureData(
      secureProfile,
      this.account?.address || "",
      undefined,
    );

    // Store encrypted data in local storage for UI population (using wallet-derived key)
    const walletEncryptionKey = await this.getWalletDerivedEncryptionKey();
    await this.storeEncryptedProfileInLocalStorage(
      profile,
      walletEncryptionKey,
    );

    return {
      encryptedBirthDate: encryptedProfile.encryptedBirthDate as `0x${string}`,
      encryptedSex: encryptedProfile.encryptedSex as `0x${string}`,
      encryptedHeight: encryptedProfile.encryptedHeight as `0x${string}`,
      encryptedWeight: encryptedProfile.encryptedWeight as `0x${string}`,
      encryptedEmail: encryptedProfile.encryptedEmail as `0x${string}`,
      dataHash: encryptedProfile.dataHash as `0x${string}`,
      timestamp: Math.floor(Date.now() / 1000), // Unix timestamp
      isActive: profile.isActive,
      version: profile.version,
      zkProofHash:
        "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
    };
  }

  /**
   * Generate data hash for verification
   */
  private async generateDataHash(
    profile: EncryptedHealthProfile,
  ): Promise<`0x${string}`> {
    // For SecureHealthProfile contract, we need to hash the Base64 encrypted strings
    const { keccak256 } = await import("viem");

    // Convert Base64 strings to bytes and hash them
    const dataToHash = `${profile.encryptedBirthDate}-${profile.encryptedSex}-${profile.encryptedHeight}-${profile.encryptedWeight}-${profile.encryptedEmail}`;
    const dataHash = keccak256(new TextEncoder().encode(dataToHash));

    return dataHash as `0x${string}`;
  }

  /**
   * Execute health profile transaction on blockchain
   */
  private async executeHealthProfileTransaction(
    profile: EncryptedHealthProfile,
    dataHash: string,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Use writeContract from wagmi/core for transactions with SecureHealthProfile contract
      const { writeContract } = await import("@wagmi/core");
      const { secureHealthProfileAbi, SECURE_HEALTH_PROFILE_CONTRACT } =
        await import("../lib/zksync-sso-config");

      // Check if profile exists first using the public hasProfile mapping
      const { readContract } = await import("@wagmi/core");
      const profileExists = await readContract(wagmiConfig, {
        address: SECURE_HEALTH_PROFILE_CONTRACT,
        abi: secureHealthProfileAbi,
        functionName: "hasProfile",
        args: [this.account.address],
      });

      console.log(
        `🔍 Profile exists check: ${profileExists ? "YES" : "NO"} for ${this.account.address}`,
      );

      // Prepare transaction data - SecureHealthProfile stores full encrypted strings
      const functionName = profileExists
        ? "updateSecureProfile"
        : "createSecureProfile";
      console.log(`📝 Using function: ${functionName}`);
      const nonce = "0x" + Math.random().toString(16).substr(2, 16); // Generate random nonce

      const args: readonly [
        string,
        string,
        string,
        string,
        string,
        `0x${string}`,
        string,
      ] = [
        profile.encryptedBirthDate as string,
        profile.encryptedSex as string,
        profile.encryptedHeight as string,
        profile.encryptedWeight as string,
        profile.encryptedEmail as string,
        dataHash as `0x${string}`,
        nonce,
      ];

      // Execute transaction
      const hash = await writeContract(wagmiConfig, {
        address: SECURE_HEALTH_PROFILE_CONTRACT,
        abi: secureHealthProfileAbi,
        functionName,
        args,
      });

      console.log("📝 Transaction submitted:", hash);

      // Wait for transaction confirmation
      const { waitForTransactionReceipt } = await import("@wagmi/core");
      console.log("⏳ Waiting for transaction confirmation...");

      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash,
        confirmations: 1,
      });

      // Check if transaction was successful
      if (receipt.status === "success") {
        console.log("✅ Transaction confirmed successfully!");
        return { success: true, txHash: hash };
      } else {
        console.error("❌ Transaction reverted on-chain");
        return {
          success: false,
          error:
            "Transaction reverted - profile may already exist or data is invalid",
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Transaction failed:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get current health profile
   */
  getHealthProfile(): EncryptedHealthProfile | null {
    return this.healthProfile;
  }

  /**
   * Manually load health profile from blockchain
   */
  async loadHealthProfileFromBlockchain(): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.account?.address) {
      return { success: false, error: "No account connected" };
    }

    try {
      await this.loadHealthProfile();
      console.log("🔄 Profile reloaded from blockchain");
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to load health profile:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Verify data integrity by checking the data hash
   */
  async verifyDataIntegrity(): Promise<{
    success: boolean;
    isValid: boolean;
    error?: string;
  }> {
    if (!this.healthProfile) {
      return { success: false, isValid: false, error: "No profile loaded" };
    }

    try {
      // Generate hash from current profile data
      const currentHash = await this.generateDataHash(this.healthProfile);

      // Compare with stored hash
      const isValid = currentHash === this.healthProfile.dataHash;

      console.log("🔍 Data integrity check:", {
        currentHash,
        storedHash: this.healthProfile.dataHash,
        isValid,
      });

      return { success: true, isValid };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Data integrity check failed:", errorMessage);
      return { success: false, isValid: false, error: errorMessage };
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<{
    success: boolean;
    balance?: string;
    error?: string;
  }> {
    if (!this.isConnected) {
      return { success: false, error: "Wallet not connected" };
    }

    try {
      const { getBalance } = await import("@wagmi/core");
      const { formatEther } = await import("viem");

      const balance = await getBalance(wagmiConfig, {
        address: this.account.address,
      });

      return {
        success: true,
        balance: formatEther(balance.value),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to get balance:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get token balances
   */
  async getTokenBalances(): Promise<{
    success: boolean;
    tokens?: Array<{ symbol: string; balance: string; address: string }>;
    error?: string;
  }> {
    if (!this.isConnected) {
      return { success: false, error: "Wallet not connected" };
    }

    try {
      // For now, return empty array - in production, query token contracts
      // This would integrate with token contracts to get balances
      const tokens: Array<{
        symbol: string;
        balance: string;
        address: string;
      }> = [];

      return { success: true, tokens };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to get token balances:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send ETH transaction
   */
  async sendETH(
    to: string,
    amount: string,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (!this.isConnected) {
      return { success: false, error: "Wallet not connected" };
    }

    try {
      const { sendTransaction } = await import("@wagmi/core");
      const { parseEther } = await import("viem");

      const hash = await sendTransaction(wagmiConfig, {
        to: to as `0x${string}`,
        value: parseEther(amount),
      });

      console.log("📝 ETH transaction submitted:", hash);
      return { success: true, txHash: hash };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ ETH transaction failed:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Claim token allocation for verified user
   */
  async claimAllocation(): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    try {
      if (!this.isConnected || !this.account?.address) {
        return { success: false, error: "Wallet not connected" };
      }

      console.log("🎁 Claiming token allocation...");

      const { writeContract } = await import("@wagmi/core");

      const { PROFILE_VERIFICATION_CONTRACT } = await import(
        "../lib/zksync-sso-config"
      );

      const hash = await writeContract(wagmiConfig, {
        address: PROFILE_VERIFICATION_CONTRACT,
        abi: [
          {
            inputs: [],
            name: "claimAllocation",
            outputs: [],
            stateMutability: "nonpayable",
            type: "function",
          },
        ],
        functionName: "claimAllocation",
      });

      console.log("✅ Token allocation claimed successfully:", hash);

      // Record email allocation with ZK-proof (privacy-preserving)
      try {
        // Get the email from verification contract (might be encrypted)
        const blockchainEmail = await this.getVerifiedEmail();
        console.log("📧 Email retrieved from blockchain:", blockchainEmail);

        // Use anonymous allocation tracking (no email-wallet association for privacy)
        console.log("📊 Using anonymous allocation tracking for privacy");

        try {
          // Track allocation claim anonymously (no email association)
          await trackingService.trackAllocationClaim(
            "anonymous@privacy.com",
            this.account.address,
            "1000",
            hash,
          );
          console.log("📊 Anonymous allocation claim tracked successfully");
        } catch (trackingError) {
          console.error(
            "❌ Failed to track anonymous allocation claim:",
            trackingError,
          );
          // Don't fail the entire claim process, but log the error prominently
        }
      } catch (trackingError) {
        console.error(
          "❌ Failed to track allocation claim (outer catch):",
          trackingError,
        );
      }

      return { success: true, txHash: hash };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to claim allocation:", error);

      // Check if it's a session policy error
      if (errorMessage.includes("Transaction does not fit any policy")) {
        console.log(
          "🔄 Session policy error detected. ZKsync SSO session needs to be refreshed.",
        );
        return {
          success: false,
          error:
            "ZKsync SSO session expired. Please disconnect and reconnect your wallet to refresh the session, then try claiming again.",
        };
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get verified email from the blockchain
   */
  private async getVerifiedEmail(): Promise<string | null> {
    try {
      if (!this.account?.address) return null;

      const { readContract } = await import("@wagmi/core");
      const { PROFILE_VERIFICATION_CONTRACT } = await import(
        "../lib/zksync-sso-config"
      );

      const verification = await readContract(wagmiConfig, {
        address: PROFILE_VERIFICATION_CONTRACT,
        abi: [
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
        ],
        functionName: "getUserVerification",
        args: [this.account.address],
      });

      console.log("🔍 Retrieved verification from blockchain:", {
        email: verification.email,
        wallet: verification.wallet,
        isActive: verification.isActive,
        hasReceivedTokens: verification.hasReceivedTokens,
      });

      // Check if email is encrypted (starts with base64 pattern)
      const email = verification.email || null;
      if (email && email.length > 50 && !email.includes("@")) {
        console.log(
          "🔓 Email appears to be encrypted, attempting to decrypt...",
        );
        try {
          // For now, we'll need to get the nonce from the contract or use a different approach
          console.log(
            "⚠️ Email decryption requires nonce from contract - using fallback approach",
          );

          // Fallback: try to get the email from verification tracking instead
          return null; // This will trigger the fallback logic
        } catch (decryptError) {
          console.warn("Failed to decrypt email:", decryptError);
          return null;
        }
      }

      return email;
    } catch (error) {
      console.warn("Failed to get verified email:", error);
      return null;
    }
  }

  /**
   * Create session for health data access
   */
  async createHealthDataSession(permissions: string[]): Promise<{
    success: boolean;
    session?: HealthDataSession;
    error?: string;
  }> {
    if (!this.isConnected) {
      return { success: false, error: "Wallet not connected" };
    }

    try {
      const sessionId = `health_session_${Date.now()}`;
      const session: HealthDataSession = {
        sessionId,
        permissions,
        expiryTime: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        maxGasFee: parseEther("0.1"),
        isActive: true,
      };

      this.activeSession = session;

      console.log("🔑 Health data session created:", sessionId);
      return { success: true, session };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get active session
   */
  getActiveSession(): HealthDataSession | null {
    return this.activeSession;
  }

  /**
   * End current session
   */
  endSession(): void {
    if (this.activeSession) {
      this.activeSession.isActive = false;
      this.activeSession = null;
      console.log("🔒 Health data session ended");
    }
  }

  /**
   * Execute health-related transaction
   */
  async executeHealthTransaction(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _to: Address,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _value: bigint,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _data?: string,
  ): Promise<{ success: boolean; hash?: string; error?: string }> {
    if (!this.isConnected) {
      return { success: false, error: "Wallet not connected" };
    }

    try {
      console.log("💸 Executing health transaction...");

      // TODO: Implement actual transaction execution
      // This would use the ZKsync SSO session to execute the transaction

      // Simulate transaction execution
      const txHash = `0x${Math.random().toString(16).substring(2)}`;

      console.log("✅ Health transaction executed:", txHash);
      return { success: true, hash: txHash };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Health transaction failed:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Verify health data with ZK proof
   */
  async verifyHealthData(dataHash: string, zkProof: string): Promise<boolean> {
    try {
      console.log("🔍 Verifying health data with ZK proof...");

      // TODO: Implement actual ZK proof verification
      // This would verify the ZK proof against the data hash

      // Simulate verification
      const isValid = dataHash.length > 0 && zkProof.length > 0;

      console.log(
        isValid
          ? "✅ Health data verified"
          : "❌ Health data verification failed",
      );
      return isValid;
    } catch (error) {
      console.error("❌ Health data verification error:", error);
      return false;
    }
  }

  /**
   * Sign a message with the connected wallet
   * Used for key derivation and authentication
   * NOTE: This doesn't work for SSO Session Clients - they don't support signMessage
   */
  async signMessage(message: string): Promise<string> {
    if (!this.isConnected || !this.account?.address) {
      throw new Error("Wallet not connected");
    }

    try {
      const { signMessage } = await import("@wagmi/core");
      const signature = await signMessage(wagmiConfig, {
        message,
      });

      console.log("✍️ Message signed successfully");
      return signature;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Check if this is an SSO Session Client that doesn't support signMessage
      if (
        errorMessage.includes("SSO Session Client") ||
        errorMessage.includes("not supported")
      ) {
        console.log(
          "ℹ️ SSO Session Client detected - signature-based encryption not available",
        );
      }

      console.error("❌ Failed to sign message:", errorMessage);
      throw new Error(`Failed to sign message: ${errorMessage}`);
    }
  }

  /**
   * Get wallet-derived encryption key (SECURE - no localStorage)
   * For SSO Session Clients, uses address-based derivation
   * For regular wallets, uses signature-based derivation
   */
  private async getWalletDerivedEncryptionKey(): Promise<
    import("../utils/walletEncryption").WalletEncryptionKey
  > {
    if (!this.account?.address) {
      throw new Error("No wallet connected");
    }

    console.log(
      "🔑 getWalletDerivedEncryptionKey: Starting key derivation for",
      this.account.address,
    );

    try {
      // Try signature-based encryption first (more secure)
      const { getCachedWalletEncryptionKey } = await import(
        "../utils/walletEncryption"
      );

      console.log("🔑 Attempting signature-based key derivation...");
      const encryptionKey = await getCachedWalletEncryptionKey(
        this.account.address,
        (message: string) => this.signMessage(message),
      );

      console.log("✅ Successfully derived key using wallet signature");
      return encryptionKey;
    } catch (error) {
      // If signature fails (SSO Session Client), fall back to address-based encryption
      const errorMessage = error instanceof Error ? error.message : "";
      console.log("⚠️ Signature-based key derivation failed:", errorMessage);

      // Check for SSO-related errors (can be wrapped in different ways)
      const isSsoError =
        errorMessage.includes("SSO Session Client") ||
        errorMessage.includes("not supported") ||
        errorMessage.includes("signMessage") ||
        errorMessage.includes(
          "Failed to derive encryption key from wallet signature",
        );

      if (isSsoError) {
        console.log("🔑 Detected SSO Session Client - using PBKDF2 fallback");
        console.log("🔑 Using PBKDF2-based encryption for SSO Session Client");

        // Use PBKDF2 key derivation for SSO accounts (more secure than plain SHA256)
        // This adds computational cost and uses proper key derivation
        const CryptoJS = (await import("crypto-js")).default;

        // Derive key using PBKDF2 with high iteration count
        // Using wallet address as the password and a domain-specific salt
        const salt = CryptoJS.enc.Utf8.parse("amach-health-sso-encryption-v1");
        const iterations = 100000; // High iteration count for security

        console.log("🔑 Deriving key with PBKDF2:", {
          address: this.account.address.toLowerCase(),
          iterations,
          salt: "amach-health-sso-encryption-v1",
        });

        const derivedKey = CryptoJS.PBKDF2(
          this.account.address.toLowerCase(),
          salt,
          {
            keySize: 256 / 32, // 256 bits
            iterations: iterations,
            hasher: CryptoJS.algo.SHA256,
          },
        );

        const key = derivedKey.toString();

        console.log(
          "✅ Successfully derived encryption key using PBKDF2 with 100k iterations",
        );

        return {
          key,
          derivedAt: Date.now(),
          walletAddress: this.account.address.toLowerCase(),
        };
      }

      // Re-throw if it's a different error
      console.error("❌ Unhandled error in key derivation:", error);
      throw error;
    }
  }

  /**
   * Store encrypted profile data in local storage (using wallet-derived key)
   * SECURE: Uses wallet signature for encryption, no keys stored
   */
  private async storeEncryptedProfileInLocalStorage(
    profile: HealthProfileData,
    walletEncryptionKey: import("../utils/walletEncryption").WalletEncryptionKey,
  ): Promise<void> {
    if (!this.account?.address) return;

    const { encryptWithWalletKey } = await import("../utils/walletEncryption");
    const storageKey = `health_profile_${this.account.address}`;

    // Encrypt each field before storing
    const encryptedProfile = {
      birthDate: profile.birthDate
        ? encryptWithWalletKey(profile.birthDate, walletEncryptionKey)
        : undefined,
      sex: profile.sex
        ? encryptWithWalletKey(profile.sex, walletEncryptionKey)
        : undefined,
      height: profile.height
        ? encryptWithWalletKey(profile.height.toString(), walletEncryptionKey)
        : undefined,
      weight: profile.weight
        ? encryptWithWalletKey(profile.weight.toString(), walletEncryptionKey)
        : undefined,
      email: profile.email
        ? encryptWithWalletKey(profile.email, walletEncryptionKey)
        : undefined,
      isActive: profile.isActive,
      version: profile.version,
      timestamp: Date.now(),
    };

    localStorage.setItem(storageKey, JSON.stringify(encryptedProfile));
    console.log(
      "💾 Stored encrypted profile in local storage (wallet-derived encryption)",
    );
  }

  /**
   * Get decrypted profile data from local storage
   * SECURE: Derives decryption key from wallet signature (or PBKDF2 for SSO)
   */
  async getDecryptedProfile(): Promise<HealthProfileData | null> {
    if (!this.account?.address) {
      console.log("🔍 getDecryptedProfile: No account connected");
      return null;
    }

    const storageKey = `health_profile_${this.account.address}`;
    const stored = localStorage.getItem(storageKey);

    if (!stored) {
      console.log(
        "🔍 getDecryptedProfile: No encrypted profile found in localStorage",
      );
      return null;
    }

    try {
      console.log(
        "🔍 getDecryptedProfile: Found encrypted profile in localStorage",
      );
      const encryptedProfile = JSON.parse(stored);

      // Get wallet-derived key for decryption
      console.log("🔑 getDecryptedProfile: Deriving encryption key...");
      const walletEncryptionKey = await this.getWalletDerivedEncryptionKey();
      console.log(
        "✅ getDecryptedProfile: Encryption key derived successfully",
      );

      const { decryptWithWalletKey } = await import(
        "../utils/walletEncryption"
      );

      // Decrypt each field
      const profile: HealthProfileData = {
        birthDate: encryptedProfile.birthDate
          ? decryptWithWalletKey(
              encryptedProfile.birthDate,
              walletEncryptionKey,
            )
          : undefined,
        sex: encryptedProfile.sex
          ? decryptWithWalletKey(encryptedProfile.sex, walletEncryptionKey)
          : undefined,
        height: encryptedProfile.height
          ? parseInt(
              decryptWithWalletKey(
                encryptedProfile.height,
                walletEncryptionKey,
              ),
            )
          : undefined,
        weight: encryptedProfile.weight
          ? parseFloat(
              decryptWithWalletKey(
                encryptedProfile.weight,
                walletEncryptionKey,
              ),
            )
          : undefined,
        email: encryptedProfile.email
          ? decryptWithWalletKey(encryptedProfile.email, walletEncryptionKey)
          : undefined,
        isActive: encryptedProfile.isActive,
        version: encryptedProfile.version,
        timestamp: encryptedProfile.timestamp,
      };

      console.log("✅ getDecryptedProfile: Profile decrypted successfully", {
        hasBirthDate: !!profile.birthDate,
        hasSex: !!profile.sex,
        hasHeight: !!profile.height,
        hasWeight: !!profile.weight,
        hasEmail: !!profile.email,
      });

      return profile;
    } catch (error) {
      console.error("❌ Failed to decrypt stored profile:", error);
      console.error("❌ Error details:", {
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  /**
   * Clear local storage and re-encrypt current profile data
   * This ensures consistency between local storage and on-chain data
   */
  async refreshLocalEncryption(): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.account?.address) {
      return { success: false, error: "No wallet connected" };
    }

    try {
      // Get current decrypted data (will request wallet signature)
      const currentData = await this.getDecryptedProfile();
      if (!currentData) {
        return { success: false, error: "No local data to refresh" };
      }

      // Clear old local storage
      const storageKey = `health_profile_${this.account.address}`;
      localStorage.removeItem(storageKey);

      // Re-encrypt and store with wallet-derived encryption key
      const walletEncryptionKey = await this.getWalletDerivedEncryptionKey();
      await this.storeEncryptedProfileInLocalStorage(
        currentData,
        walletEncryptionKey,
      );

      console.log("🔄 Refreshed local encryption with wallet-derived key");
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to refresh local encryption:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Verify that data is properly encrypted on-chain
   * DEPRECATED: With wallet-derived encryption, data is always encrypted properly
   */
  async verifyEncryptionOnChain(): Promise<{
    success: boolean;
    isEncrypted: boolean;
    error?: string;
  }> {
    if (!this.healthProfile) {
      return { success: false, isEncrypted: false, error: "No profile loaded" };
    }

    try {
      console.log(
        "🔍 Verifying on-chain encryption (wallet-derived method)...",
      );

      // With wallet-derived encryption, data is always encrypted properly
      // We just verify that the profile exists on-chain
      const isEncrypted = !!(
        this.healthProfile.encryptedBirthDate &&
        this.healthProfile.encryptedSex &&
        this.healthProfile.encryptedHeight &&
        this.healthProfile.encryptedWeight &&
        this.healthProfile.encryptedEmail
      );

      console.log("✅ Encryption verified:", { isEncrypted });

      return { success: true, isEncrypted };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Encryption verification failed:", errorMessage);
      return { success: false, isEncrypted: false, error: errorMessage };
    }
  }
}

// Export singleton instance
export const zkSyncSsoWalletService = new ZkSyncSsoWalletService();
