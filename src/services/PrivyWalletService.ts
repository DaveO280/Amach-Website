"use client";

/**
 * Privy Wallet Service
 *
 * This service replaces ZkSyncSsoWalletService and provides the same interface
 * but uses Privy wallets instead of zkSync SSO.
 *
 * Key differences:
 * - Uses Privy hooks (useWallets, usePrivy, useSignMessage) instead of wagmi/zksync-sso
 * - Uses Privy's embedded wallets or external wallets (MetaMask, etc.)
 * - Contract interactions use Privy wallet via viem (same contracts, different wallet)
 *
 * Migration status: Phase 1 - Core service layer
 */

import type { WalletContextVault } from "@/types/contextVault";

// Re-export types from ZkSyncSsoWalletService for compatibility
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

export interface HealthDataSession {
  sessionId: string;
  permissions: string[];
  expiryTime: number;
  maxGasFee: bigint;
  isActive: boolean;
}

/**
 * Privy Wallet Service
 *
 * NOTE: This is a service class, but Privy hooks must be called in React components.
 * We'll need to create a hook wrapper (usePrivyWalletService) that uses this class
 * internally with Privy hooks.
 */
export class PrivyWalletService {
  private isConnected = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private account: any = null;
  // These are placeholders for future implementation
  // They will be used when implementing profile loading and session management
  // @ts-expect-error - Placeholder for future implementation
  private healthProfile: EncryptedHealthProfile | null = null;
  // @ts-expect-error - Placeholder for future implementation
  private activeSession: HealthDataSession | null = null;

  // Privy hooks will be passed in from React components
  private privyHooks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useWallets: () => { wallets: Array<any> };
    usePrivy: () => {
      ready: boolean;
      authenticated: boolean;
      login: () => void | Promise<void>;
      logout: () => void | Promise<void>;
    };
    useSignMessage: () => {
      signMessage: (
        params: { message: string },
        options?: {
          address?: string;
          uiOptions?: { title?: string; description?: string };
        },
      ) => Promise<{ signature: string }>;
    };
  } | null = null;

  /**
   * Initialize service with Privy hooks
   * This must be called from a React component that has access to Privy hooks
   */
  initialize(privyHooks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useWallets: () => { wallets: Array<any> };
    usePrivy: () => {
      ready: boolean;
      authenticated: boolean;
      login: () => void | Promise<void>;
      logout: () => void | Promise<void>;
    };
    useSignMessage: () => {
      signMessage: (
        params: { message: string },
        options?: {
          address?: string;
          uiOptions?: { title?: string; description?: string };
        },
      ) => Promise<{ signature: string }>;
    };
  }): void {
    this.privyHooks = privyHooks;
    this.refreshConnectionState();
  }

  /**
   * Refresh connection state from Privy hooks
   */
  refreshConnectionState(): void {
    if (!this.privyHooks) return;

    try {
      const { wallets } = this.privyHooks.useWallets();
      const { ready, authenticated } = this.privyHooks.usePrivy();

      if (ready && authenticated && wallets.length > 0) {
        const wallet = wallets[0];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const address = wallet.address as string;

        if (address) {
          this.isConnected = true;
          this.account = { address };
          console.log("🔄 Privy connection state refreshed:", address);
        } else {
          this.isConnected = false;
          this.account = null;
        }
      } else {
        this.isConnected = false;
        this.account = null;
      }
    } catch (error) {
      console.error("Failed to refresh Privy connection state:", error);
    }
  }

  /**
   * Connect to Privy wallet
   */
  async connect(): Promise<{ success: boolean; error?: string }> {
    if (!this.privyHooks) {
      return { success: false, error: "Privy hooks not initialized" };
    }

    try {
      const { login } = this.privyHooks.usePrivy();
      await login();

      // Wait a moment for connection to establish
      await new Promise((resolve) => setTimeout(resolve, 1000));

      this.refreshConnectionState();

      if (this.isConnected && this.account?.address) {
        await this.loadHealthProfile();
        console.log("✅ Connected to Privy wallet:", this.account.address);
        return { success: true };
      } else {
        return { success: false, error: "Failed to connect to wallet" };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Privy connection failed:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Disconnect from Privy wallet
   */
  async disconnect(): Promise<void> {
    if (!this.privyHooks) {
      return;
    }

    try {
      // Clear encryption key cache on disconnect for security
      if (this.account?.address) {
        const { clearEncryptionKeyOnDisconnect } = await import(
          "../utils/walletEncryption"
        );
        clearEncryptionKeyOnDisconnect(this.account.address);
      }

      const { logout } = this.privyHooks.usePrivy();
      await logout();

      this.isConnected = false;
      this.account = null;
      this.healthProfile = null;
      this.activeSession = null;
      console.log(
        "🔌 Disconnected from Privy wallet and cleared encryption cache",
      );
    } catch (error) {
      console.error("Error disconnecting from wallet:", error);
    }
  }

  /**
   * Check if wallet is connected
   */
  isWalletConnected(): boolean {
    return this.isConnected && this.account !== null;
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
   * Sign a message with the connected wallet
   * Uses Privy's useSignMessage hook
   */
  async signMessage(message: string): Promise<string> {
    if (!this.isConnected || !this.account?.address) {
      throw new Error("Wallet not connected");
    }

    if (!this.privyHooks) {
      throw new Error("Privy hooks not initialized");
    }

    try {
      const { signMessage: privySignMessage } =
        this.privyHooks.useSignMessage();
      const result = await privySignMessage(
        { message },
        {
          address: this.account.address,
          uiOptions: {
            title: "Sign Message",
            description: "Sign this message to derive your encryption key",
          },
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const signature = result.signature as string;
      console.log("✍️ Message signed successfully with Privy");
      return signature;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to sign message:", errorMessage);
      throw new Error(`Failed to sign message: ${errorMessage}`);
    }
  }

  /**
   * Get wallet-derived encryption key (SECURE - no localStorage)
   * Uses signature-based derivation (validated - signatures are deterministic)
   * This is a placeholder for future implementation
   */
  // @ts-expect-error - Placeholder for future implementation
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
      // Use signature-based encryption (validated - Privy signatures are deterministic)
      const { getCachedWalletEncryptionKey } = await import(
        "../utils/walletEncryption"
      );

      console.log("🔑 Attempting signature-based key derivation with Privy...");
      const encryptionKey = await getCachedWalletEncryptionKey(
        this.account.address,
        (message: string) => this.signMessage(message),
      );

      console.log("✅ Successfully derived key using Privy wallet signature");
      return encryptionKey;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "";
      console.error("❌ Failed to derive encryption key:", errorMessage);
      throw error;
    }
  }

  // TODO: Implement remaining methods:
  // - loadHealthProfile()
  // - updateHealthProfile()
  // - verifyProfileZKsync()
  // - claimAllocation()
  // - saveContextVault()
  // - loadContextVault()
  // - getBalance()
  // - sendETH()
  // etc.

  /**
   * Placeholder for loadHealthProfile - to be implemented
   */
  private async loadHealthProfile(): Promise<void> {
    // TODO: Implement profile loading from blockchain
    console.log("📖 Loading health profile from blockchain (TODO)");
  }

  /**
   * Placeholder for updateHealthProfile - to be implemented
   */
  async updateHealthProfile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _profile: HealthProfileData,
  ): Promise<{ success: boolean; error?: string; txHash?: string }> {
    // TODO: Implement profile update
    return { success: false, error: "Not yet implemented" };
  }

  /**
   * Placeholder for verifyProfileZKsync - to be implemented
   */
  async verifyProfileZKsync(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _email: string,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    // TODO: Implement profile verification
    return { success: false, error: "Not yet implemented" };
  }

  /**
   * Placeholder for claimAllocation - to be implemented
   */
  async claimAllocation(): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    // TODO: Implement token claim
    return { success: false, error: "Not yet implemented" };
  }

  /**
   * Placeholder for saveContextVault - to be implemented
   */
  async saveContextVault(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vault: WalletContextVault,
  ): Promise<{ success: boolean; error?: string }> {
    // TODO: Implement context vault save
    return { success: false, error: "Not yet implemented" };
  }

  /**
   * Placeholder for loadContextVault - to be implemented
   */
  async loadContextVault(): Promise<WalletContextVault | null> {
    // TODO: Implement context vault load
    return null;
  }
}

// Export singleton instance (will be initialized with Privy hooks from React component)
export const privyWalletService = new PrivyWalletService();
