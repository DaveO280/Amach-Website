import { useCallback, useEffect, useState } from "react";
import {
  healthProfileReader,
  OnChainProfile,
} from "../services/HealthProfileReader";

export interface UseOnChainProfileReturn {
  profile: OnChainProfile | null;
  loading: boolean;
  error: string | null;
  hasProfile: boolean;
  refreshProfile: () => Promise<void>;
  testContractAccess: () => Promise<boolean>;
}

export function useOnChainProfile(
  userAddress?: string,
): UseOnChainProfileReturn {
  const [profile, setProfile] = useState<OnChainProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasProfile, setHasProfile] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!userAddress) {
      setProfile(null);
      setHasProfile(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log("🔄 Loading on-chain profile for:", userAddress);

      // Check if profile exists
      const exists = await healthProfileReader.hasProfile(userAddress);
      setHasProfile(exists);

      if (!exists) {
        setProfile(null);
        console.log("No profile found on-chain");
        return;
      }

      // Load the profile data
      const profileData = await healthProfileReader.getProfile(userAddress);

      if (profileData) {
        setProfile(profileData);
        console.log("✅ Profile loaded from blockchain");
      } else {
        setProfile(null);
        setHasProfile(false);
        console.log("Profile exists but could not be loaded");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error loading on-chain profile:", err);
    } finally {
      setLoading(false);
    }
  }, [userAddress]);

  const refreshProfile = useCallback(async () => {
    await loadProfile();
  }, [loadProfile]);

  const testContractAccess = useCallback(async (): Promise<boolean> => {
    try {
      const result = await healthProfileReader.testContractAccess();
      return result;
    } catch (err) {
      console.error("Contract access test failed:", err);
      return false;
    }
  }, []);

  // Load profile when userAddress changes
  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return {
    profile,
    loading,
    error,
    hasProfile,
    refreshProfile,
    testContractAccess,
  };
}
