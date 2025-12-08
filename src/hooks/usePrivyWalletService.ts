"use client";

/**
 * React hook for Privy Wallet Service
 *
 * This hook provides a service interface that uses Privy hooks internally.
 * It returns methods that match ZkSyncSsoWalletService for easy migration.
 *
 * Usage:
 *   const service = usePrivyWalletService();
 *   await service.connect();
 *   const address = service.getAddress();
 */

// Define types locally since we removed ZkSyncSsoWalletService
export interface EncryptedHealthProfile {
  encryptedBirthDate: `0x${string}`;
  encryptedSex: `0x${string}`;
  encryptedHeight: `0x${string}`;
  encryptedWeight: `0x${string}`;
  encryptedEmail: `0x${string}`;
  dataHash: `0x${string}`;
  timestamp: number;
  isActive: boolean;
  version: number;
  zkProofHash: `0x${string}`;
  nonce?: string; // AES-GCM nonce for decryption (stored on blockchain)
}

export interface HealthProfileData {
  birthDate?: string;
  sex?: string;
  height?: number;
  weight?: number;
  email?: string;
  isActive: boolean;
  version: number;
  timestamp?: number; // Optional for backward compatibility
}
import type { WalletContextVault } from "@/types/contextVault";
import { trackingService } from "@/utils/trackingService";
import React, { useCallback, useMemo, useState } from "react";

// Static import - PrivyProvider handles SSR automatically
import { usePrivy, useSignMessage, useWallets } from "@privy-io/react-auth";

export interface PrivyWalletServiceReturn {
  // Connection methods
  connect: () => Promise<{ success: boolean; error?: string }>;
  disconnect: () => Promise<void>;
  isWalletConnected: () => boolean;
  getAddress: () => string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAccountInfo: () => any;

  // Profile methods
  updateHealthProfile: (
    profile: HealthProfileData,
  ) => Promise<{ success: boolean; error?: string; txHash?: string }>;
  loadHealthProfileFromBlockchain: () => Promise<{
    success: boolean;
    error?: string;
    profile?: EncryptedHealthProfile;
  }>;
  loadProfileFromBlockchain: () => Promise<{
    success: boolean;
    error?: string;
    profile?: EncryptedHealthProfile;
  }>; // Alias for compatibility
  getHealthProfile: () => EncryptedHealthProfile | null;
  getDecryptedProfile: (
    profileOverride?: EncryptedHealthProfile,
  ) => Promise<HealthProfileData | null>;

  // Verification & allocation
  verifyProfileZKsync: (
    email: string,
  ) => Promise<{ success: boolean; txHash?: string; error?: string }>;
  claimAllocation: () => Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }>;

  // Context vault
  saveContextVault: (
    vault: WalletContextVault,
  ) => Promise<{ success: boolean; error?: string }>;
  loadContextVault: () => Promise<WalletContextVault | null>;
  clearContextVault: () => Promise<void>;

  // Utility methods
  signMessage: (message: string) => Promise<string>;
  getBalance: () => Promise<{
    success: boolean;
    balance?: string;
    error?: string;
  }>;
  sendETH: (
    to: string,
    amount: string,
  ) => Promise<{ success: boolean; txHash?: string; error?: string }>;
  isEmailWhitelisted: (
    email: string,
  ) => Promise<{ success: boolean; isWhitelisted?: boolean; error?: string }>;

  // State
  isConnected: boolean;
  ready: boolean;
  authenticated: boolean;

  // Additional properties for compatibility with SSO interface
  address: string | null;
  balance: string | null;
  tokens: Array<{ symbol: string; balance: string; address: string }> | null;
  healthProfile: EncryptedHealthProfile | null;
  isProfileLoading: boolean;
  error: string | null;

  // Additional methods for compatibility
  getTokenBalances: () => Promise<{
    success: boolean;
    tokens?: Array<{ symbol: string; balance: string; address: string }>;
    error?: string;
  }>;
  clearError: () => void;
  refreshProfile: () => void;
}

export function usePrivyWalletService(): PrivyWalletServiceReturn {
  const [healthProfile, setHealthProfile] =
    useState<EncryptedHealthProfile | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Array<{
    symbol: string;
    balance: string;
    address: string;
  }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  // IMPORTANT: React Hooks must be called unconditionally
  // PrivyProvider is in the layout, so these hooks should always be available
  // If PrivyProvider isn't in the tree, these hooks will throw, but that's expected
  const { wallets } = useWallets();
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { signMessage: privySignMessage } = useSignMessage();

  // Get wallet address
   
  const wallet = wallets?.[0] as
    | { address?: string; getEthereumProvider?: () => Promise<unknown> }
    | undefined;
   
  const address = wallet?.address as string | undefined;
  const isConnected = ready && authenticated && !!address;

  // Debug: Log Privy state on mount and when it changes
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      console.log("🔍 Privy State Updated:", {
        ready,
        authenticated,
        hasUser: !!user,
        userId: user?.id?.substring(0, 20),
        walletsCount: wallets?.length || 0,
        hasAddress: !!address,
        address: address?.substring(0, 10) + "...",
        isConnected,
      });
    }
  }, [ready, authenticated, user, wallets, address, isConnected]);

  // Sign message helper
  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!isConnected || !address) {
        throw new Error("Wallet not connected");
      }

      try {
        console.log(
          "📝 Requesting signature from Privy (popup should appear)...",
        );
        console.log(
          "💡 IMPORTANT: Please wait for the popup and click 'Approve'",
        );
        console.log(
          "💡 The popup may take a moment to appear - please do not close or reload the page",
        );

        // Ensure we're still connected before requesting signature
        if (!isConnected || !address) {
          throw new Error(
            "Wallet connection lost - please reconnect and try again",
          );
        }

        // Request signature - this will open the Privy modal
        const result = await privySignMessage(
          { message },
          {
            address,
            uiOptions: {
              title: "Sign Message for Encryption Key",
              description:
                "Sign this message to derive your encryption key for decrypting your health profile. This signature is only used to generate your encryption key and is not shared. Please click 'Approve' to continue.",
            },
          },
        );

         
        const signature = result.signature as string;

        if (!signature || signature.length < 132) {
          throw new Error(
            "Invalid signature received from Privy - signature too short",
          );
        }

        console.log("✍️ Message signed successfully with Privy");
        return signature;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("❌ Failed to sign message:", errorMessage);

        // Re-throw with more context
        if (
          errorMessage.includes("User rejected") ||
          errorMessage.includes("User denied")
        ) {
          throw new Error(
            "Signature request was cancelled. Please try again and approve the signature.",
          );
        }

        throw new Error(`Failed to sign message: ${errorMessage}`);
      }
    },
    [isConnected, address, privySignMessage],
  );

  // Get wallet-derived encryption key
  const getWalletDerivedEncryptionKey = useCallback(async (): Promise<
    import("@/utils/walletEncryption").WalletEncryptionKey
  > => {
    if (!address) {
      throw new Error("No wallet connected");
    }

    console.log(
      "🔑 getWalletDerivedEncryptionKey: Starting key derivation for",
      address,
    );

    try {
      const { getCachedWalletEncryptionKey } =
        await import("@/utils/walletEncryption");

      console.log("🔑 Attempting signature-based key derivation with Privy...");
      const encryptionKey = await getCachedWalletEncryptionKey(
        address,
        signMessage,
      );

      console.log("✅ Successfully derived key using Privy wallet signature");
      return encryptionKey;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "";
      console.error("❌ Failed to derive encryption key:", errorMessage);
      throw error;
    }
  }, [address, signMessage]);

  // Connect method
  const connect = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    try {
      console.log("🔌 Attempting to connect with Privy...", {
        ready,
        authenticated,
        hasAddress: !!address,
        hasWallets: !!wallets?.length,
      });

      // If already authenticated with wallet, just return success
      if (ready && authenticated && address) {
        console.log("✅ Already connected to Privy wallet:", address);
        return { success: true };
      }

      // Call Privy login - this should open the modal
      console.log("📱 Calling Privy login()...");
      await login();
      console.log("✅ Privy login() completed");

      // Wait for connection to establish with longer timeout
      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (ready && authenticated && address) {
        console.log("✅ Connected to Privy wallet:", address);
        return { success: true };
      } else {
        console.warn("⚠️ Login completed but wallet not connected:", {
          ready,
          authenticated,
          hasAddress: !!address,
          walletsCount: wallets?.length || 0,
        });
        return { success: false, error: "Failed to connect to wallet" };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Privy connection failed:", errorMessage, error);
      return { success: false, error: errorMessage };
    }
  }, [login, ready, authenticated, address, wallets]);

  // Disconnect method
  const disconnect = useCallback(async (): Promise<void> => {
    try {
      // Clear encryption key cache on disconnect for security
      if (address) {
        const { clearEncryptionKeyOnDisconnect } =
          await import("@/utils/walletEncryption");
        clearEncryptionKeyOnDisconnect(address);
      }

      await logout();
      setHealthProfile(null);
      console.log(
        "🔌 Disconnected from Privy wallet and cleared encryption cache",
      );
    } catch (error) {
      console.error("Error disconnecting from wallet:", error);
    }
  }, [logout, address]);

  // Helper: Switch wallet to correct chain if needed
  const ensureCorrectChain = useCallback(async (): Promise<boolean> => {
    if (!wallet) return false;

    try {
      const { getActiveChain } = await import("@/lib/networkConfig");
      const targetChain = getActiveChain();
      const targetChainId = targetChain.id;

      // Get current chain from wallet
      if (!wallet.getEthereumProvider) {
        console.warn("⚠️ Wallet does not have getEthereumProvider method");
        return false;
      }

       
      const provider = (await wallet.getEthereumProvider()) as {
        request?: (args: {
          method: string;
          params?: unknown[];
        }) => Promise<unknown>;
      } | null;
      if (!provider || !provider.request) {
        console.warn("⚠️ Wallet does not have Ethereum provider");
        return false;
      }

      // Check current chain ID
       
      const currentChainId = await provider.request({ method: "eth_chainId" });
      const currentChainIdNumber = parseInt(currentChainId as string, 16);

      console.log(
        `🔗 Current chain ID: ${currentChainIdNumber}, Target chain ID: ${targetChainId}`,
      );

      if (currentChainIdNumber === targetChainId) {
        console.log("✅ Wallet is already on the correct chain");
        return true;
      }

      // Switch to target chain
      console.log(`🔄 Switching wallet to chain ${targetChainId}...`);
      try {
        // Try to switch using wallet_switchEthereumChain
        if (!provider.request) {
          throw new Error("Provider request method not available");
        }
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${targetChainId.toString(16)}` }],
        });
        console.log("✅ Successfully switched to target chain");
        return true;
      } catch (switchError: unknown) {
        // If chain doesn't exist, try to add it
        const error = switchError as { code?: number };
        if (error.code === 4902 || error.code === -32603) {
          console.log("📝 Chain not found in wallet, attempting to add it...");
          try {
            if (!provider.request) {
              throw new Error("Provider request method not available");
            }
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: `0x${targetChainId.toString(16)}`,
                  chainName: targetChain.name,
                  nativeCurrency: {
                    name: targetChain.nativeCurrency.name,
                    symbol: targetChain.nativeCurrency.symbol,
                    decimals: targetChain.nativeCurrency.decimals,
                  },
                  rpcUrls: targetChain.rpcUrls.default.http,
                  blockExplorerUrls: targetChain.blockExplorers?.default?.url
                    ? [targetChain.blockExplorers.default.url]
                    : [],
                },
              ],
            });
            console.log("✅ Successfully added and switched to target chain");
            return true;
          } catch (addError) {
            console.error("❌ Failed to add chain:", addError);
            return false;
          }
        } else {
          console.error("❌ Failed to switch chain:", switchError);
          return false;
        }
      }
    } catch (error) {
      console.error("❌ Error ensuring correct chain:", error);
      return false;
    }
  }, [wallet]);

  // Helper: Get wallet client for contract interactions
  const getWalletClient = useCallback(async (): Promise<
    import("viem").WalletClient | null
  > => {
    if (!wallet || !address) return null;

    try {
      // First, ensure we're on the correct chain
      const chainSwitched = await ensureCorrectChain();
      if (!chainSwitched) {
        console.warn("⚠️ Could not switch to correct chain, but continuing...");
      }

      // Privy wallets have getEthereumProvider method
      if (!wallet?.getEthereumProvider) {
        console.warn("⚠️ Wallet does not have getEthereumProvider method");
        return null;
      }
       
      const provider = await wallet.getEthereumProvider();
      if (!provider) {
        console.warn("⚠️ Wallet does not have Ethereum provider");
        return null;
      }

      // Create viem wallet client from provider
      const { createWalletClient, custom } = await import("viem");
      const { getActiveChain } = await import("@/lib/networkConfig");

      // Type assertion for provider - Privy's getEthereumProvider returns an EthereumProvider
      // Privy's provider implements the EthereumProvider interface but TypeScript doesn't know this
      // We need to cast it because viem's custom() expects a specific type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const providerAsAny = provider as any;
      const client = createWalletClient({
        account: address as `0x${string}`,
        chain: getActiveChain(),
         
        transport: custom(providerAsAny),
      });

      return client;
    } catch (error) {
      console.error("Failed to create wallet client:", error);
      return null;
    }
  }, [wallet, address, ensureCorrectChain]);

  // Helper: Get public client for read operations
  const getPublicClient = useCallback(async (): Promise<
    import("viem").PublicClient | null
  > => {
    try {
      const { createPublicClient, http } = await import("viem");
      const { getActiveChain } = await import("@/lib/networkConfig");

      // Explicitly set RPC URL to ensure it works
      const rpcUrl =
        process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
        "https://sepolia.era.zksync.dev";

      const client = createPublicClient({
        chain: getActiveChain(),
        transport: http(rpcUrl), // Explicitly pass RPC URL
      });

      return client;
    } catch (error) {
      console.error("Failed to create public client:", error);
      return null;
    }
  }, []);

  // Update health profile
  const updateHealthProfile = useCallback(
    async (
      profile: HealthProfileData,
    ): Promise<{ success: boolean; error?: string; txHash?: string }> => {
      if (!isConnected || !address) {
        return { success: false, error: "Wallet not connected" };
      }

      try {
        console.log("💾 Updating health profile on blockchain with Privy...");

        // 1. Encrypt the profile data
        const { encryptHealthData: encryptSecureData } =
          await import("@/utils/secureHealthEncryption");

        const secureProfile = {
          birthDate: profile.birthDate || "",
          sex: profile.sex || "",
          height: profile.height || 0,
          weight: profile.weight || 0,
          email: profile.email || "",
        };

        const encryptedProfile = await encryptSecureData(
          secureProfile,
          address,
          undefined,
        );

        // 2. No need to store weight in localStorage anymore - V3 contract stores it on-chain!
        console.log("✅ Weight will be stored on-chain with V3 contract");

        // 3. Generate data hash (V3 contract stores weight on-chain, include it in hash)
        const { keccak256 } = await import("viem");
        // Hash ALL fields including weight (V3 stores weight on-chain)
        const dataToHash = `${encryptedProfile.encryptedBirthDate}-${encryptedProfile.encryptedSex}-${encryptedProfile.encryptedHeight}-${encryptedProfile.encryptedWeight}-${encryptedProfile.encryptedEmail}`;
        const dataHash = keccak256(new TextEncoder().encode(dataToHash));

        // 4. Check if profile exists
        const publicClient = await getPublicClient();
        if (!publicClient) {
          return { success: false, error: "Failed to create public client" };
        }

        const { secureHealthProfileAbi } = await import("@/lib/contractConfig");
        const { getContractAddresses } = await import("@/lib/networkConfig");
        const contracts = getContractAddresses();

        const profileExists = await publicClient.readContract({
          address: contracts.SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
          abi: secureHealthProfileAbi,
          functionName: "hasProfile",
          args: [address as `0x${string}`],
        });

        console.log(`🔍 Profile exists: ${profileExists ? "YES" : "NO"}`);

        // 5. Prepare transaction with V3 functions (includes weight)
        const functionName = profileExists
          ? "updateProfileWithWeight"
          : "createProfileWithWeight";

        // Use the nonce from encryption (12 bytes = 24 hex chars)
        // This is critical - the nonce must match what was used for encryption!
        const nonce = encryptedProfile.nonce;

        console.log("🔑 Using encryption nonce:", {
          nonce,
          length: nonce.length,
          expectedLength: 26, // "0x" + 24 hex chars
        });

        // V3 contract function signature: (birthDate, sex, height, weight, email, dataHash, nonce)
        const args = [
          encryptedProfile.encryptedBirthDate as string,
          encryptedProfile.encryptedSex as string,
          encryptedProfile.encryptedHeight as string,
          encryptedProfile.encryptedWeight as string, // NEW: Weight included for V3
          encryptedProfile.encryptedEmail as string,
          dataHash as `0x${string}`,
          nonce,
        ] as const;

        // 6. Execute transaction
        const walletClient = await getWalletClient();
        if (!walletClient) {
          return { success: false, error: "Failed to create wallet client" };
        }

        const { getActiveChain } = await import("@/lib/networkConfig");

        // Get current gas price from public client and set higher fees for zkSync
        if (!publicClient) {
          return { success: false, error: "Failed to get public client" };
        }
        const gasPrice = await publicClient.getGasPrice();
        const maxFeePerGas = (gasPrice * 150n) / 100n; // 50% buffer
        const maxPriorityFeePerGas = (gasPrice * 10n) / 100n; // 10% tip

        console.log("🔐 Preparing transaction for user approval...");
        console.log("📝 Transaction details:", {
          contract: contracts.SECURE_HEALTH_PROFILE_CONTRACT,
          function: functionName,
          exists: profileExists,
        });

        const hash = await walletClient.writeContract({
          address: contracts.SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
          abi: secureHealthProfileAbi,
          functionName,
          args,
          account: address as `0x${string}`,
          chain: getActiveChain(),
          gas: 2000000n, // Very high gas limit for Privy smart contract wallet deployment + profile creation
          maxFeePerGas,
          maxPriorityFeePerGas,
        });

        console.log("✍️ User approved transaction!");

        console.log("📝 Transaction submitted:", hash);

        // 6. Wait for confirmation
        if (publicClient) {
          const receipt = await publicClient.waitForTransactionReceipt({
            hash,
          });
          if (receipt.status === "success") {
            console.log("✅ Transaction confirmed!");

            // Update local state
            setHealthProfile({
              encryptedBirthDate:
                encryptedProfile.encryptedBirthDate as `0x${string}`,
              encryptedSex: encryptedProfile.encryptedSex as `0x${string}`,
              encryptedHeight:
                encryptedProfile.encryptedHeight as `0x${string}`,
              encryptedWeight:
                encryptedProfile.encryptedWeight as `0x${string}`,
              encryptedEmail: encryptedProfile.encryptedEmail as `0x${string}`,
              dataHash: dataHash as `0x${string}`,
              timestamp: Math.floor(Date.now() / 1000),
              isActive: profile.isActive,
              version: profile.version,
              zkProofHash:
                "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
            });

            // Store encrypted data in localStorage
            const walletEncryptionKey = await getWalletDerivedEncryptionKey();
            const { encryptWithWalletKey } =
              await import("@/utils/walletEncryption");
            const storageKey = `health_profile_${address}`;
            const encryptedProfileStorage = {
              birthDate: profile.birthDate
                ? encryptWithWalletKey(profile.birthDate, walletEncryptionKey)
                : undefined,
              sex: profile.sex
                ? encryptWithWalletKey(profile.sex, walletEncryptionKey)
                : undefined,
              height: profile.height
                ? encryptWithWalletKey(
                    profile.height.toString(),
                    walletEncryptionKey,
                  )
                : undefined,
              weight: profile.weight
                ? encryptWithWalletKey(
                    profile.weight.toString(),
                    walletEncryptionKey,
                  )
                : undefined,
              email: profile.email
                ? encryptWithWalletKey(profile.email, walletEncryptionKey)
                : undefined,
              isActive: profile.isActive,
              version: profile.version,
              timestamp: Date.now(),
            };
            localStorage.setItem(
              storageKey,
              JSON.stringify(encryptedProfileStorage),
            );

            // Track profile creation
            if (profile.email) {
              try {
                await trackingService.trackProfileCreation(
                  profile.email,
                  profile as unknown as Record<string, unknown>,
                  address,
                );
              } catch (trackingError) {
                console.warn(
                  "Failed to track profile creation:",
                  trackingError,
                );
              }
            }

            return { success: true, txHash: hash };
          } else {
            return { success: false, error: "Transaction reverted" };
          }
        }

        return { success: true, txHash: hash };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("❌ Failed to update health profile:", errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    [
      isConnected,
      address,
      getWalletClient,
      getPublicClient,
      getWalletDerivedEncryptionKey,
    ],
  );

  // Load health profile from blockchain
  const loadHealthProfileFromBlockchain = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
    profile?: EncryptedHealthProfile;
  }> => {
    if (!isConnected || !address) {
      return { success: false, error: "No account connected" };
    }

    try {
      // Silent load - don't log unless there's an actual profile
      // This prevents console spam from background checks

      const publicClient = await getPublicClient();
      if (!publicClient) {
        return { success: false, error: "Failed to create public client" };
      }

      const { secureHealthProfileAbi } = await import("@/lib/contractConfig");
      const { getContractAddresses } = await import("@/lib/networkConfig");
      const contracts = getContractAddresses();

      const profileResponse = await publicClient.readContract({
        address: contracts.SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
        abi: secureHealthProfileAbi,
        functionName: "getProfileWithWeight",
        args: [address as `0x${string}`],
      });

      console.log("📖 Loading health profile from blockchain...");
      console.log("✅ Retrieved encrypted profile from blockchain");

      // Log the full response to see what we actually got
      console.log("🔍 Full encrypted profile response:", profileResponse);

      // V3 contract returns [profile, weight] tuple
      // Destructure the response: [0] = profile object, [1] = weight string
      const [encryptedProfile, encryptedWeight] = profileResponse as [
        {
          encryptedBirthDate: string;
          encryptedSex: string;
          encryptedHeight: string;
          encryptedEmail: string;
          dataHash: `0x${string}`;
          timestamp: bigint;
          isActive: boolean;
          version: number;
          nonce: string;
        },
        string,
      ];

      console.log("🔍 Encrypted profile fields:", {
        hasBirthDate: !!encryptedProfile.encryptedBirthDate,
        hasSex: !!encryptedProfile.encryptedSex,
        hasHeight: !!encryptedProfile.encryptedHeight,
        hasWeight: !!encryptedWeight,
        hasEmail: !!encryptedProfile.encryptedEmail,
        hasNonce: !!encryptedProfile.nonce,
        nonceValue: encryptedProfile.nonce,
        nonceLength: encryptedProfile.nonce?.length,
        weightSource: "blockchain",
      });

      // Validate nonce before setting state
      if (!encryptedProfile.nonce || encryptedProfile.nonce.trim() === "") {
        console.error(
          "❌ CRITICAL: Nonce is missing or empty in blockchain profile!",
          {
            nonce: encryptedProfile.nonce,
            profile: encryptedProfile,
          },
        );
        throw new Error(
          "Profile loaded from blockchain but nonce is missing. Cannot decrypt without nonce.",
        );
      }

      // Update state - include nonce for decryption
      // Note: V3 contract stores weight on-chain
      setHealthProfile({
        encryptedBirthDate:
          encryptedProfile.encryptedBirthDate as `0x${string}`,
        encryptedSex: encryptedProfile.encryptedSex as `0x${string}`,
        encryptedHeight: encryptedProfile.encryptedHeight as `0x${string}`,
        encryptedWeight: encryptedWeight as `0x${string}`, // From blockchain (V3)
        encryptedEmail: encryptedProfile.encryptedEmail as `0x${string}`,
        dataHash: encryptedProfile.dataHash as `0x${string}`,
        timestamp: Number(encryptedProfile.timestamp),
        isActive: encryptedProfile.isActive,
        version: Number(encryptedProfile.version),
        zkProofHash:
          "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
        nonce: encryptedProfile.nonce as string, // Store nonce for decryption
      });

      // localStorage sync is DISABLED by default to prevent freezing
      // Profile is fully functional from blockchain without localStorage caching
      // localStorage sync can be enabled later if needed via explicit user action
      console.log(
        "ℹ️ Profile loaded from blockchain - localStorage sync skipped (can cause freezing)",
      );

      // IMPORTANT: Return the profile data so callers can use it immediately
      // This avoids React state timing issues in production builds
      return {
        success: true,
        profile: {
          encryptedBirthDate:
            encryptedProfile.encryptedBirthDate as `0x${string}`,
          encryptedSex: encryptedProfile.encryptedSex as `0x${string}`,
          encryptedHeight: encryptedProfile.encryptedHeight as `0x${string}`,
          encryptedWeight: encryptedWeight as `0x${string}`,
          encryptedEmail: encryptedProfile.encryptedEmail as `0x${string}`,
          dataHash: encryptedProfile.dataHash as `0x${string}`,
          timestamp: Number(encryptedProfile.timestamp),
          isActive: encryptedProfile.isActive,
          version: Number(encryptedProfile.version),
          zkProofHash:
            "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
          nonce: encryptedProfile.nonce as string,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Only log if it's NOT a "Profile does not exist" error
      // This prevents console spam from background checks
      if (!errorMessage.includes("Profile does not exist")) {
        console.error("❌ Failed to load health profile:", errorMessage);
      }

      return { success: false, error: errorMessage };
    }
  }, [isConnected, address, getPublicClient]);

  // Get decrypted profile
  // Optionally accepts a profile parameter to avoid React state timing issues
  const getDecryptedProfile = useCallback(
    async (
      profileOverride?: EncryptedHealthProfile,
    ): Promise<HealthProfileData | null> => {
      if (!address) return null;

      // Use provided profile or fall back to state (helps with production timing issues)
      const profileToUse = profileOverride || healthProfile;

      // Priority 1: Decrypt from blockchain-loaded healthProfile state (includes weight from localStorage)
      // This is the preferred method since it has the latest data including weight
      console.log("🔍 getDecryptedProfile check:", {
        hasHealthProfile: !!healthProfile,
        hasProfileOverride: !!profileOverride,
        hasNonce: !!profileToUse?.nonce,
        nonceValue: profileToUse?.nonce,
        address,
      });

      if (profileToUse && profileToUse.nonce) {
        try {
          console.log(
            "🔓 Decrypting profile from blockchain-loaded state (includes weight)...",
          );
          const { decryptHealthData } =
            await import("@/utils/secureHealthEncryption");

          const onChainProfile = {
            encryptedBirthDate: profileToUse.encryptedBirthDate,
            encryptedSex: profileToUse.encryptedSex,
            encryptedHeight: profileToUse.encryptedHeight,
            encryptedWeight: profileToUse.encryptedWeight || "",
            encryptedEmail: profileToUse.encryptedEmail,
            dataHash: profileToUse.dataHash,
            timestamp: profileToUse.timestamp,
            version: profileToUse.version,
            nonce: profileToUse.nonce,
          };

          const decryptedData = await decryptHealthData(
            onChainProfile,
            address,
            undefined,
          );

          if (decryptedData) {
            return {
              birthDate: decryptedData.birthDate,
              sex: decryptedData.sex,
              height: decryptedData.height,
              weight: decryptedData.weight,
              email: decryptedData.email,
              isActive: profileToUse.isActive,
              version: profileToUse.version,
              timestamp: profileToUse.timestamp,
            };
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          console.error(
            "❌ Failed to decrypt from blockchain state:",
            errorMessage,
            error,
          );
          // Fall through to localStorage fallback
        }
      } else {
        // Profile loaded but missing nonce - try to reload from blockchain
        if (profileToUse && !profileToUse.nonce) {
          console.warn(
            "⚠️ Profile loaded but nonce is missing. Attempting to reload from blockchain...",
          );
          try {
            await loadHealthProfileFromBlockchain();
            // Wait a bit for state to update, then retry
            await new Promise((resolve) => setTimeout(resolve, 200));
            // Retry decryption - the state should be updated now
            return getDecryptedProfile();
          } catch (reloadError) {
            console.error("❌ Failed to reload profile:", reloadError);
          }
        } else if (!healthProfile) {
          console.warn(
            "⚠️ No health profile loaded. Attempting to load from blockchain...",
          );
          try {
            await loadHealthProfileFromBlockchain();
            // Wait a bit for state to update, then retry
            await new Promise((resolve) => setTimeout(resolve, 200));
            // Retry decryption - the state should be updated now
            return getDecryptedProfile();
          } catch (loadError) {
            console.error("❌ Failed to load profile:", loadError);
          }
        }
      }

      // Priority 2: Fall back to old localStorage format (for backward compatibility)
      const storageKey = `health_profile_${address}`;
      const stored = localStorage.getItem(storageKey);

      if (!stored) {
        console.log("🔍 No encrypted profile found in localStorage");
        return null;
      }

      try {
        const encryptedProfile = JSON.parse(stored);
        const walletEncryptionKey = await getWalletDerivedEncryptionKey();
        const { decryptWithWalletKey } =
          await import("@/utils/walletEncryption");

        // Also try to load weight from separate localStorage key if available
        let decryptedWeight: number | undefined;
        try {
          const storedWeight = localStorage.getItem(
            `amach-encrypted-weight-${address}`,
          );
          if (storedWeight && healthProfile?.nonce) {
            // Weight is encrypted with on-chain encryption, so decrypt using decryptField
            const { decryptField } =
              await import("@/utils/secureHealthEncryption");
            // Derive the key for decryption
            const { deriveSecureKey } =
              await import("@/utils/secureHealthEncryption");
            const key = await deriveSecureKey(address, undefined);

            // Parse nonce (same format as in decryptHealthData)
            let nonceHex = healthProfile.nonce;
            if (nonceHex.startsWith("0x")) {
              nonceHex = nonceHex.slice(2);
            }
            const hexBytes = nonceHex.match(/.{1,2}/g) || [];
            const nonceBytes = new Uint8Array(
              hexBytes.map((byte) => parseInt(byte, 16)),
            );

            const weightString = await decryptField(
              storedWeight,
              key,
              nonceBytes,
            );
            if (weightString) {
              decryptedWeight = parseFloat(weightString);
            }
          }
        } catch (weightError) {
          console.warn(
            "⚠️ Failed to decrypt weight from localStorage:",
            weightError,
          );
        }

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
            : decryptedWeight, // Use weight from separate localStorage if available
          email: encryptedProfile.email
            ? decryptWithWalletKey(encryptedProfile.email, walletEncryptionKey)
            : undefined,
          isActive: encryptedProfile.isActive,
          version: encryptedProfile.version,
          timestamp: encryptedProfile.timestamp,
        };

        return profile;
      } catch (error) {
        console.error("❌ Failed to decrypt stored profile:", error);
        return null;
      }
    },
    [address, getWalletDerivedEncryptionKey, healthProfile],
  );

  // Verify profile
  const verifyProfileZKsync = useCallback(
    async (
      email: string,
    ): Promise<{ success: boolean; txHash?: string; error?: string }> => {
      if (!isConnected || !address) {
        return { success: false, error: "Wallet not connected" };
      }

      try {
        console.log("🔐 Verifying profile using Privy wallet...");

        const walletClient = await getWalletClient();
        if (!walletClient) {
          return { success: false, error: "Failed to create wallet client" };
        }

        const { PROFILE_VERIFICATION_CONTRACT } =
          await import("@/lib/contractConfig");

        const { getActiveChain } = await import("@/lib/networkConfig");

        // Get current gas price from public client and set higher fees for zkSync
        const publicClient = await getPublicClient();
        if (!publicClient) {
          return { success: false, error: "Failed to get public client" };
        }
        const gasPrice = await publicClient.getGasPrice();
        const maxFeePerGas = (gasPrice * 150n) / 100n; // 50% buffer
        const maxPriorityFeePerGas = (gasPrice * 10n) / 100n; // 10% tip

        const hash = await walletClient.writeContract({
          address: PROFILE_VERIFICATION_CONTRACT as `0x${string}`,
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
          account: address as `0x${string}`,
          chain: getActiveChain(),
          gas: 5000000n, // Very high gas limit - verification contract needs ~4M gas
          maxFeePerGas,
          maxPriorityFeePerGas,
        });

        console.log("✅ Profile verification transaction submitted:", hash);

        // Track verification
        try {
          await trackingService.trackProfileVerification(email, address);
        } catch (trackingError) {
          console.warn("Failed to track verification:", trackingError);
        }

        return { success: true, txHash: hash };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("❌ Failed to verify profile:", errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    [isConnected, address, getWalletClient, getPublicClient],
  );

  // Claim allocation
  const claimAllocation = useCallback(async (): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> => {
    if (!isConnected || !address) {
      return { success: false, error: "Wallet not connected" };
    }

    try {
      console.log("🎁 Claiming token allocation with Privy wallet...");

      const walletClient = await getWalletClient();
      if (!walletClient) {
        return { success: false, error: "Failed to create wallet client" };
      }

      const { getContractAddresses } = await import("@/lib/networkConfig");
      const contracts = getContractAddresses();

      const { getActiveChain } = await import("@/lib/networkConfig");

      // Get current gas price from public client and set higher fees for zkSync
      const publicClient = await getPublicClient();
      if (!publicClient) {
        return { success: false, error: "Failed to get public client" };
      }
      const gasPrice = await publicClient.getGasPrice();
      const maxFeePerGas = (gasPrice * 150n) / 100n; // 50% buffer
      const maxPriorityFeePerGas = (gasPrice * 10n) / 100n; // 10% tip

      const hash = await walletClient.writeContract({
        address: contracts.PROFILE_VERIFICATION_CONTRACT as `0x${string}`,
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
        account: address as `0x${string}`,
        chain: getActiveChain(),
        gas: 5000000n, // Very high gas limit for token transfer
        maxFeePerGas,
        maxPriorityFeePerGas,
      });

      console.log("✅ Token allocation claimed successfully:", hash);

      // Track allocation claim
      try {
        await trackingService.trackAllocationClaim(
          "anonymous@privacy.com",
          address,
          "1000",
          hash,
        );
      } catch (trackingError) {
        console.warn("Failed to track allocation claim:", trackingError);
      }

      return { success: true, txHash: hash };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to claim allocation:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [isConnected, address, getWalletClient, getPublicClient]);

  // Save context vault
  const saveContextVault = useCallback(
    async (
      vault: WalletContextVault,
    ): Promise<{ success: boolean; error?: string }> => {
      if (!address) {
        return { success: false, error: "No wallet connected" };
      }

      try {
        const walletEncryptionKey = await getWalletDerivedEncryptionKey();
        const { encryptWithWalletKey } =
          await import("@/utils/walletEncryption");

        const payload = JSON.stringify(vault);
        const storageKey = `context_vault_${address}`;
        const envelope = {
          version: vault.version ?? 1,
          savedAt: vault.savedAt,
          encryptedPayload: encryptWithWalletKey(payload, walletEncryptionKey),
        };

        localStorage.setItem(storageKey, JSON.stringify(envelope));
        console.log("💾 Context vault saved locally (wallet-encrypted)");

        return { success: true };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error("❌ Failed to save context vault:", message);
        return { success: false, error: message };
      }
    },
    [address, getWalletDerivedEncryptionKey],
  );

  // Load context vault
  const loadContextVault =
    useCallback(async (): Promise<WalletContextVault | null> => {
      if (!address) return null;

      const storageKey = `context_vault_${address}`;
      const stored = localStorage.getItem(storageKey);
      if (!stored) return null;

      try {
        const walletEncryptionKey = await getWalletDerivedEncryptionKey();
        const { decryptWithWalletKey } =
          await import("@/utils/walletEncryption");

        const envelope = JSON.parse(stored) as {
          encryptedPayload: string;
        };

        if (!envelope?.encryptedPayload) {
          return null;
        }

        const decrypted = decryptWithWalletKey(
          envelope.encryptedPayload,
          walletEncryptionKey,
        );
        const vault = JSON.parse(decrypted) as WalletContextVault;

        return vault;
      } catch (error) {
        console.error("❌ Failed to load context vault:", error);
        return null;
      }
    }, [address, getWalletDerivedEncryptionKey]);

  // Clear context vault
  const clearContextVault = useCallback(async (): Promise<void> => {
    if (!address) return;
    const storageKey = `context_vault_${address}`;
    localStorage.removeItem(storageKey);
    console.log("🗑️ Cleared local context vault cache");
  }, [address]);

  // Get balance
  const getBalance = useCallback(async (): Promise<{
    success: boolean;
    balance?: string;
    error?: string;
  }> => {
    if (!isConnected || !address) {
      setError("Wallet not connected");
      return { success: false, error: "Wallet not connected" };
    }

    try {
      const publicClient = await getPublicClient();
      if (!publicClient) {
        const errorMsg = "Failed to create public client";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }

      const { formatEther } = await import("viem");
      const balanceResult = await publicClient.getBalance({
        address: address as `0x${string}`,
      });

      const balanceStr = formatEther(balanceResult);
      setBalance(balanceStr);
      setError(null);
      return {
        success: true,
        balance: balanceStr,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("❌ Failed to get balance:", errorMessage);
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [isConnected, address, getPublicClient]);

  // Get token balances (placeholder - implement if needed)
  const getTokenBalances = useCallback(async (): Promise<{
    success: boolean;
    tokens?: Array<{ symbol: string; balance: string; address: string }>;
    error?: string;
  }> => {
    // TODO: Implement token balance fetching if needed
    // For now, return empty array
    setTokens([]);
    return { success: true, tokens: [] };
  }, []);

  // Clear error
  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  // Refresh profile
  const refreshProfile = useCallback(async (): Promise<void> => {
    if (!isConnected || !address) return;
    setIsProfileLoading(true);
    try {
      await loadHealthProfileFromBlockchain();
    } catch (err) {
      console.error("Failed to refresh profile:", err);
    } finally {
      setIsProfileLoading(false);
    }
  }, [isConnected, address, loadHealthProfileFromBlockchain]);

  // Send ETH
  const sendETH = useCallback(
    async (
      to: string,
      amount: string,
    ): Promise<{ success: boolean; txHash?: string; error?: string }> => {
      if (!isConnected || !address) {
        return { success: false, error: "Wallet not connected" };
      }

      try {
        const walletClient = await getWalletClient();
        if (!walletClient) {
          return { success: false, error: "Failed to create wallet client" };
        }

        const { parseEther } = await import("viem");
        const { getActiveChain } = await import("@/lib/networkConfig");
        const hash = await walletClient.sendTransaction({
          to: to as `0x${string}`,
          value: parseEther(amount),
          account: address as `0x${string}`,
          chain: getActiveChain(),
        });

        console.log("📝 ETH transaction submitted:", hash);
        return { success: true, txHash: hash };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("❌ ETH transaction failed:", errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    [isConnected, address, getWalletClient],
  );

  // Check if email is whitelisted
  const isEmailWhitelisted = useCallback(
    async (
      email: string,
    ): Promise<{
      success: boolean;
      isWhitelisted?: boolean;
      error?: string;
    }> => {
      const maxRetries = 3;
      const timeout = 30000; // 30 seconds timeout per attempt

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `🔍 Checking email whitelist on blockchain with Privy... (attempt ${attempt}/${maxRetries})`,
          );

          const publicClient = await getPublicClient();
          if (!publicClient) {
            return { success: false, error: "Failed to create public client" };
          }

          const { profileVerificationAbi } =
            await import("@/lib/contractConfig");
          const { getContractAddresses } = await import("@/lib/networkConfig");
          const contracts = getContractAddresses();

          // Create a timeout promise
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Request timeout")), timeout);
          });

          // Race between the contract call and timeout
          const isWhitelisted = (await Promise.race([
            publicClient.readContract({
              address: contracts.PROFILE_VERIFICATION_CONTRACT as `0x${string}`,
              abi: profileVerificationAbi,
              functionName: "isEmailWhitelisted",
              args: [email],
            }),
            timeoutPromise,
          ])) as boolean;

          console.log(`✅ Email ${email} whitelist status:`, isWhitelisted);
          return { success: true, isWhitelisted };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          const isTimeout =
            errorMessage.toLowerCase().includes("timeout") ||
            errorMessage.toLowerCase().includes("took too long");

          if (isTimeout && attempt < maxRetries) {
            console.warn(`⏳ Timeout on attempt ${attempt}, retrying...`);
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
            continue;
          }

          console.error(
            `❌ Failed to check email whitelist (attempt ${attempt}/${maxRetries}):`,
            errorMessage,
          );

          if (attempt === maxRetries) {
            return {
              success: false,
              error: isTimeout
                ? "Network timeout. Please check your connection and try again."
                : errorMessage,
            };
          }
        }
      }

      return { success: false, error: "Failed after multiple attempts" };
    },
    [getPublicClient],
  );

  // Return service interface
  return useMemo(
    () => ({
      // Connection methods
      connect,
      disconnect,
      isWalletConnected: () => isConnected,
      getAddress: () => address || null,
      getAccountInfo: () => (address ? { address } : null),

      // Profile methods
      updateHealthProfile,
      loadHealthProfileFromBlockchain,
      loadProfileFromBlockchain: loadHealthProfileFromBlockchain, // Alias for compatibility
      getHealthProfile: () => healthProfile,
      getDecryptedProfile,

      // Verification & allocation
      verifyProfileZKsync,
      claimAllocation,

      // Context vault
      saveContextVault,
      loadContextVault,
      clearContextVault,

      // Utility methods
      signMessage,
      getBalance,
      getTokenBalances,
      sendETH,
      isEmailWhitelisted,

      // State
      isConnected,
      ready,
      authenticated,
      address: address || null,
      balance,
      tokens,
      healthProfile,
      isProfileLoading,
      error,
      clearError,
      refreshProfile,
    }),
    [
      connect,
      disconnect,
      isConnected,
      address,
      healthProfile,
      signMessage,
      ready,
      authenticated,
      updateHealthProfile,
      loadHealthProfileFromBlockchain,
      getDecryptedProfile,
      verifyProfileZKsync,
      claimAllocation,
      saveContextVault,
      loadContextVault,
      clearContextVault,
      getBalance,
      getTokenBalances,
      sendETH,
      isEmailWhitelisted,
      balance,
      tokens,
      isProfileLoading,
      error,
      clearError,
      refreshProfile,
    ],
  );
}
