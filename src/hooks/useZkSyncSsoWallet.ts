import { useState, useEffect, useCallback } from "react";
import {
  zkSyncSsoWalletService,
  type HealthProfileData,
  type EncryptedHealthProfile,
  type HealthDataSession,
} from "../services/ZkSyncSsoWalletService";

// Hook return type
interface UseZkSyncSsoWalletReturn {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  account: any;

  // Health profile
  healthProfile: EncryptedHealthProfile | null;
  isProfileLoading: boolean;

  // Crypto balances
  balance: string | null;
  tokens: Array<{ symbol: string; balance: string; address: string }> | null;

  // Session management
  activeSession: HealthDataSession | null;

  // Actions
  connect: () => Promise<{ success: boolean; error?: string }>;
  disconnect: () => Promise<void>;
  updateHealthProfile: (
    profile: HealthProfileData,
  ) => Promise<{ success: boolean; error?: string; txHash?: string }>;
  getBalance: () => Promise<{
    success: boolean;
    balance?: string;
    error?: string;
  }>;
  getTokenBalances: () => Promise<{
    success: boolean;
    tokens?: Array<{ symbol: string; balance: string; address: string }>;
    error?: string;
  }>;
  sendETH: (
    to: string,
    amount: string,
  ) => Promise<{ success: boolean; txHash?: string; error?: string }>;
  verifyDataIntegrity: () => Promise<{
    success: boolean;
    isValid: boolean;
    error?: string;
  }>;
  createHealthDataSession: (
    permissions: string[],
  ) => Promise<{
    success: boolean;
    session?: HealthDataSession;
    error?: string;
  }>;
  endSession: () => void;
  executeHealthTransaction: (
    to: string,
    value: string,
    data?: string,
  ) => Promise<{ success: boolean; hash?: string; error?: string }>;
  verifyHealthData: (dataHash: string, zkProof: string) => Promise<boolean>;
  refreshProfile: () => void;
  loadProfileFromBlockchain: () => Promise<{
    success: boolean;
    error?: string;
  }>;

  // Local storage and encryption
  getDecryptedProfile: () => Promise<HealthProfileData | null>;
  verifyEncryptionOnChain: () => Promise<{
    success: boolean;
    isEncrypted: boolean;
    error?: string;
  }>;
  refreshLocalEncryption: () => Promise<{ success: boolean; error?: string }>;

  // Session cleanup (for development/debugging)
  forceCleanup: () => Promise<{ success: boolean; error?: string }>;

  // Error handling
  error: string | null;
  clearError: () => void;
}

/**
 * React hook for ZKsync SSO wallet integration
 */
export function useZkSyncSsoWallet(): UseZkSyncSsoWalletReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [account, setAccount] = useState<any>(null);
  const [healthProfile, setHealthProfile] =
    useState<EncryptedHealthProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Array<{
    symbol: string;
    balance: string;
    address: string;
  }> | null>(null);
  const [activeSession, setActiveSession] = useState<HealthDataSession | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  // Initialize connection state
  useEffect(() => {
    const initializeConnection = (): void => {
      // Only refresh connection state once on mount
      zkSyncSsoWalletService.refreshConnectionState();

      const connected = zkSyncSsoWalletService.isWalletConnected();
      const addr = zkSyncSsoWalletService.getAddress();
      const acc = zkSyncSsoWalletService.getAccountInfo();
      const profile = zkSyncSsoWalletService.getHealthProfile();
      const session = zkSyncSsoWalletService.getActiveSession();

      setIsConnected(connected);
      setAddress(addr);
      setAccount(acc);
      setHealthProfile(profile);
      setActiveSession(session);
    };

    initializeConnection();

    // Periodically refresh connection state to keep UI in sync across pages
    const intervalId: number = window.setInterval((): void => {
      zkSyncSsoWalletService.refreshConnectionState();
      const connected = zkSyncSsoWalletService.isWalletConnected();
      const addr = zkSyncSsoWalletService.getAddress();
      const acc = zkSyncSsoWalletService.getAccountInfo();
      const session = zkSyncSsoWalletService.getActiveSession();

      setIsConnected(connected);
      setAddress(addr);
      setAccount(acc);
      setActiveSession(session);
    }, 1500);

    return (): void => {
      window.clearInterval(intervalId);
    };
  }, []); // Empty dependency array - only run once on mount

  // Connect to wallet
  const connect = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    setIsConnecting(true);
    setError(null);

    try {
      const result = await zkSyncSsoWalletService.connect();

      if (result.success) {
        setIsConnected(true);
        setAddress(zkSyncSsoWalletService.getAddress());
        setAccount(zkSyncSsoWalletService.getAccountInfo());
        setHealthProfile(zkSyncSsoWalletService.getHealthProfile());
        setActiveSession(zkSyncSsoWalletService.getActiveSession());
      } else {
        setError(result.error || "Failed to connect");
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // Disconnect from wallet
  const disconnect = useCallback(async (): Promise<void> => {
    try {
      await zkSyncSsoWalletService.disconnect();
      setIsConnected(false);
      setAddress(null);
      setAccount(null);
      setHealthProfile(null);
      setActiveSession(null);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
    }
  }, []);

  // Update health profile
  const updateHealthProfile = useCallback(
    async (
      profile: HealthProfileData,
    ): Promise<{ success: boolean; error?: string; txHash?: string }> => {
      setIsProfileLoading(true);
      setError(null);

      try {
        const result =
          await zkSyncSsoWalletService.updateHealthProfile(profile);

        if (result.success) {
          setHealthProfile(zkSyncSsoWalletService.getHealthProfile());
        } else {
          setError(result.error || "Failed to update profile");
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setIsProfileLoading(false);
      }
    },
    [],
  );

  // Get wallet balance
  const getBalance = useCallback(async (): Promise<{
    success: boolean;
    balance?: string;
    error?: string;
  }> => {
    try {
      const result = await zkSyncSsoWalletService.getBalance();

      if (result.success && result.balance) {
        setBalance(result.balance);
      } else {
        setError(result.error || "Failed to get balance");
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  // Get token balances
  const getTokenBalances = useCallback(async (): Promise<{
    success: boolean;
    tokens?: Array<{ symbol: string; balance: string; address: string }>;
    error?: string;
  }> => {
    try {
      const result = await zkSyncSsoWalletService.getTokenBalances();

      if (result.success && result.tokens) {
        setTokens(result.tokens);
      } else {
        setError(result.error || "Failed to get token balances");
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  // Send ETH
  const sendETH = useCallback(
    async (
      to: string,
      amount: string,
    ): Promise<{ success: boolean; txHash?: string; error?: string }> => {
      try {
        const result = await zkSyncSsoWalletService.sendETH(to, amount);

        if (!result.success) {
          setError(result.error || "Failed to send ETH");
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    [],
  );

  // Verify data integrity
  const verifyDataIntegrity = useCallback(async (): Promise<{
    success: boolean;
    isValid: boolean;
    error?: string;
  }> => {
    try {
      const result = await zkSyncSsoWalletService.verifyDataIntegrity();

      if (!result.success) {
        setError(result.error || "Failed to verify data integrity");
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      return { success: false, isValid: false, error: errorMessage };
    }
  }, []);

  // Refresh profile state
  const refreshProfile = useCallback((): void => {
    const profile = zkSyncSsoWalletService.getHealthProfile();
    setHealthProfile(profile);
  }, []);

  // Load profile from blockchain
  const loadProfileFromBlockchain = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    try {
      const result =
        await zkSyncSsoWalletService.loadHealthProfileFromBlockchain();

      if (result.success) {
        // Refresh the profile state after loading
        refreshProfile();
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [refreshProfile]);

  // Create health data session
  const createHealthDataSession = useCallback(
    async (
      permissions: string[],
    ): Promise<{
      success: boolean;
      session?: HealthDataSession;
      error?: string;
    }> => {
      try {
        const result =
          await zkSyncSsoWalletService.createHealthDataSession(permissions);

        if (result.success && result.session) {
          setActiveSession(result.session);
        } else {
          setError(result.error || "Failed to create session");
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    [],
  );

  // End session
  const endSession = useCallback((): void => {
    zkSyncSsoWalletService.endSession();
    setActiveSession(null);
  }, []);

  // Execute health transaction
  const executeHealthTransaction = useCallback(
    async (
      to: string,
      value: string,
      data?: string,
    ): Promise<{ success: boolean; hash?: string; error?: string }> => {
      try {
        const result = await zkSyncSsoWalletService.executeHealthTransaction(
          to as `0x${string}`,
          BigInt(value),
          data,
        );

        if (!result.success) {
          setError(result.error || "Transaction failed");
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    [],
  );

  // Verify health data
  const verifyHealthData = useCallback(
    async (dataHash: string, zkProof: string): Promise<boolean> => {
      try {
        return await zkSyncSsoWalletService.verifyHealthData(dataHash, zkProof);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        return false;
      }
    },
    [],
  );

  // Get decrypted profile from local storage
  const getDecryptedProfile =
    useCallback(async (): Promise<HealthProfileData | null> => {
      return await zkSyncSsoWalletService.getDecryptedProfile();
    }, []);

  // Refresh local encryption
  const refreshLocalEncryption = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    try {
      const result = await zkSyncSsoWalletService.refreshLocalEncryption();

      if (!result.success) {
        setError(result.error || "Failed to refresh local encryption");
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  // Verify encryption on-chain
  const verifyEncryptionOnChain = useCallback(async (): Promise<{
    success: boolean;
    isEncrypted: boolean;
    error?: string;
  }> => {
    try {
      // First reload the profile from blockchain to get the latest data
      await zkSyncSsoWalletService.loadHealthProfileFromBlockchain();

      // Wait a moment for blockchain data to be available
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Then refresh local encryption to ensure consistency
      await zkSyncSsoWalletService.refreshLocalEncryption();

      const result = await zkSyncSsoWalletService.verifyEncryptionOnChain();

      if (!result.success) {
        setError(result.error || "Failed to verify encryption");
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      return { success: false, isEncrypted: false, error: errorMessage };
    }
  }, []);

  // Clear error
  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  // Force cleanup (for development/debugging)
  const forceCleanup = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    try {
      const result = await zkSyncSsoWalletService.forceCleanup();

      if (result.success) {
        // Reset all local state
        setIsConnected(false);
        setAddress(null);
        setAccount(null);
        setHealthProfile(null);
        setActiveSession(null);
        setBalance(null);
        setTokens(null);
        setError(null);
        setIsConnecting(false);
        setIsProfileLoading(false);
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  return {
    // Connection state
    isConnected,
    isConnecting,
    address,
    account,

    // Health profile
    healthProfile,
    isProfileLoading,

    // Crypto balances
    balance,
    tokens,

    // Session management
    activeSession,

    // Actions
    connect,
    disconnect,
    updateHealthProfile,
    getBalance,
    getTokenBalances,
    sendETH,
    verifyDataIntegrity,
    refreshProfile,
    loadProfileFromBlockchain,
    createHealthDataSession,
    endSession,
    executeHealthTransaction,
    verifyHealthData,

    // Local storage and encryption
    getDecryptedProfile,
    verifyEncryptionOnChain,
    refreshLocalEncryption,

    // Session cleanup (for development/debugging)
    forceCleanup,

    // Error handling
    error,
    clearError,
  };
}
