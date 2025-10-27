import { useEffect, useState } from "react";

interface ProfileData {
  age?: number;
  weight?: number;
  height?: number;
  biologicalSex?: string;
}

interface WalletConnection {
  isConnected: boolean;
  address: string | null;
  profile: ProfileData | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export const useWalletConnection = (): WalletConnection => {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if wallet is available (Web3-style)
  const checkWalletAvailability = (): boolean => {
    return (
      typeof window !== "undefined" &&
      !!(window as unknown as { amachWallet?: unknown }).amachWallet
    );
  };

  // Connect to wallet (Web3-style)
  const connect = async (): Promise<void> => {
    try {
      setError(null);

      // Check if wallet is available (like window.ethereum)
      if (!checkWalletAvailability()) {
        throw new Error(
          "Amach Wallet not found. Please open the wallet app first.",
        );
      }

      // Get wallet instance (like window.ethereum)
      const wallet = (window as unknown as { amachWallet: unknown })
        .amachWallet as {
        isAuthenticated: () => boolean;
        request: (method: string) => Promise<unknown>;
        getAddress: () => string;
      };

      // Check if wallet is authenticated
      if (!wallet.isAuthenticated()) {
        throw new Error("Please unlock your wallet first.");
      }

      // Get real data from wallet using Web3 API
      const profileData = (await wallet.request(
        "amach_getProfile",
      )) as ProfileData;
      const accounts = (await wallet.request("eth_accounts")) as string[];
      const zkSyncAddress = (await wallet.request(
        "amach_getZkSyncAddress",
      )) as string;

      setIsConnected(true);
      setAddress(accounts[0] || zkSyncAddress || wallet.getAddress());
      setProfile(profileData);

      console.log("Connected to Amach Wallet (zkSync):", {
        address: accounts[0] || zkSyncAddress,
        profile: profileData,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to connect to wallet";
      setError(errorMessage);
      console.error("Wallet connection error:", errorMessage);
    }
  };

  // Disconnect from wallet
  const disconnect = (): void => {
    setIsConnected(false);
    setAddress(null);
    setProfile(null);
    setError(null);
    console.log("Disconnected from wallet");
  };

  // Listen for wallet updates
  useEffect(() => {
    const checkWalletStatus = (): void => {
      if (checkWalletAvailability()) {
        const wallet = (window as unknown as { amachWallet: unknown })
          .amachWallet as {
          isAuthenticated: () => boolean;
          getAddress: () => string;
          getProfile: () => ProfileData;
        };
        if (wallet.isAuthenticated()) {
          setIsConnected(true);
          setAddress(wallet.getAddress());
          setProfile(wallet.getProfile());
        } else {
          setIsConnected(false);
          setAddress(null);
          setProfile(null);
        }
      }
    };

    // Check on mount
    checkWalletStatus();

    // Set up polling for wallet status changes
    const interval = setInterval(checkWalletStatus, 1000);

    return (): void => {
      clearInterval(interval);
    };
  }, []);

  return {
    isConnected,
    address,
    profile,
    error,
    connect,
    disconnect,
  } as WalletConnection;
};
