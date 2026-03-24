"use client";

import { AlertCircle, CheckCircle, Loader2, Shield, User } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useWalletService } from "../hooks/useWalletService";

// Health Profile Data Interface
interface HealthProfileData {
  birthDate: string;
  sex: string;
  height: number; // in inches
  weight: number; // in pounds
  email: string;
}

// Encrypted Profile from Contract (matches the hook interface)
// interface EncryptedProfile {
//   encryptedBirthDate: string;
//   encryptedSex: string;
//   encryptedHeight: string;
//   encryptedEmail: string;
//   encryptedWeight: string;
//   dataHash: string;
//   timestamp: number;
//   isActive: boolean;
//   version: number;
// }

// Shared class strings for design token consistency
const inputClass =
  "w-full px-3 py-2 rounded-lg border border-[rgba(0,107,79,0.20)] dark:border-[rgba(0,107,79,0.25)] bg-[#F9FAFB] dark:bg-[#0C120E] text-[#0A1A0F] dark:text-[#F0F7F3] text-[13px] outline-none transition-colors focus:border-[rgba(0,107,79,0.50)] dark:focus:border-[rgba(74,222,128,0.45)]";
const labelClass = "block text-xs font-medium text-[#6B8C7A] mb-[5px]";
const selectClass =
  "w-full px-3 py-2 border border-[rgba(0,107,79,0.22)] dark:border-[rgba(0,107,79,0.25)] rounded-md bg-[#F9FAFB] dark:bg-[#0C120E] text-[#0A1A0F] dark:text-[#F0F7F3] focus:outline-none focus:ring-2 focus:ring-[#006B4F]";
const submitBtnClass =
  "w-full bg-[#006B4F] hover:bg-[#005A40] text-white rounded-lg px-4 py-2 font-medium text-[13px] transition-colors flex items-center justify-center gap-2 disabled:opacity-60";

export const HealthProfileManager: React.FC = () => {
  const {
    isConnected,
    address,
    healthProfile,
    updateHealthProfile,
    isProfileLoading,
    loadProfileFromBlockchain,
    refreshProfile,
    error,
    clearError,
  } = useWalletService();

  const [profileData, setProfileData] = useState<HealthProfileData>({
    birthDate: "",
    sex: "",
    height: 0,
    weight: 0,
    email: "",
  });

  // Helper function to format date as MM/DD/YYYY for display
  const formatDateForDisplay = (dateString: string): string => {
    if (!dateString) return "";

    // Check if it's in YYYY-MM-DD format (from date input)
    if (dateString.includes("-") && dateString.split("-").length === 3) {
      const [year, month, day] = dateString.split("-");
      return `${month}/${day}/${year}`;
    }

    // Otherwise return as-is (might already be in MM/DD/YYYY format)
    return dateString;
  };

  // Auto-populate profile data when healthProfile is loaded
  // Decrypt directly from blockchain (no signature required)
  useEffect(() => {
    const loadDecryptedData = async (): Promise<void> => {
      if (healthProfile && isConnected) {
        // Try to decrypt directly from blockchain-encrypted profile (no localStorage, no signature)
        try {
          const { decryptHealthData } =
            await import("@/utils/secureHealthEncryption");

          // Check if nonce is available (required for decryption)
          if (!healthProfile.nonce) {
            throw new Error("Nonce not available in profile - cannot decrypt");
          }

          const onChainProfile = {
            encryptedBirthDate: healthProfile.encryptedBirthDate,
            encryptedSex: healthProfile.encryptedSex,
            encryptedHeight: healthProfile.encryptedHeight,
            encryptedWeight: healthProfile.encryptedWeight || "",
            encryptedEmail: healthProfile.encryptedEmail,
            dataHash: healthProfile.dataHash,
            timestamp: healthProfile.timestamp,
            version: healthProfile.version,
            nonce: healthProfile.nonce, // Use nonce from blockchain
          };

          // Decrypt using blockchain encryption key (no signature needed - uses wallet address)
          // Note: This uses PBKDF2 which may take a few seconds but won't freeze since it's async
          if (!address) {
            throw new Error("Wallet address not available");
          }

          console.log("🔓 Decrypting profile from blockchain for display...");
          const decryptedData = await decryptHealthData(
            onChainProfile,
            address,
            undefined,
          );

          if (decryptedData) {
            setProfileData({
              birthDate: decryptedData.birthDate || "",
              sex: decryptedData.sex || "",
              height: decryptedData.height || 0,
              weight: decryptedData.weight || 0,
              email: decryptedData.email || "",
            });
            console.log("✅ Profile decrypted and displayed successfully", {
              hasBirthDate: !!decryptedData.birthDate,
              hasSex: !!decryptedData.sex,
              hasHeight: !!decryptedData.height,
              hasWeight: !!decryptedData.weight,
              hasEmail: !!decryptedData.email,
            });
          } else {
            console.warn("⚠️ Decryption returned null or undefined");
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "";
          console.warn("⚠️ Could not decrypt profile for display:", error);

          // If decryption fails, try to decrypt individual fields (weight might fail separately)
          // This handles the case where weight was encrypted with a different nonce
          console.log("🔄 Attempting to decrypt fields individually...");
          try {
            const { decryptHealthData } =
              await import("@/utils/secureHealthEncryption");

            if (!address) {
              throw new Error("Wallet address not available");
            }

            // Re-create profile without weight to attempt partial decryption
            if (!healthProfile.nonce) {
              throw new Error("Nonce not available");
            }

            const profileWithoutWeight = {
              encryptedBirthDate: healthProfile.encryptedBirthDate,
              encryptedSex: healthProfile.encryptedSex,
              encryptedHeight: healthProfile.encryptedHeight,
              encryptedWeight: "", // Skip weight - might have different nonce
              encryptedEmail: healthProfile.encryptedEmail,
              dataHash: healthProfile.dataHash,
              timestamp: healthProfile.timestamp,
              version: healthProfile.version,
              nonce: healthProfile.nonce,
            };

            const partialData = await decryptHealthData(
              profileWithoutWeight,
              address,
              undefined,
            );

            if (partialData) {
              setProfileData({
                birthDate: partialData.birthDate || "",
                sex: partialData.sex || "",
                height: partialData.height || 0,
                weight: 0, // Weight couldn't be decrypted - will be re-encrypted on next update
                email: partialData.email || "",
              });
              setSuccessMessage(
                "⚠️ Profile loaded, but weight could not be decrypted (likely encrypted with different nonce). It will be re-encrypted on next profile update.",
              );
              return; // Success with partial data
            }
          } catch (partialError) {
            console.warn("⚠️ Partial decryption also failed:", partialError);
          }

          // Check if it's a nonce mismatch error
          if (
            errorMsg.includes("Invalid nonce length") ||
            errorMsg.includes("nonce")
          ) {
            console.warn(
              "⚠️ Profile has nonce mismatch - it was created with buggy code",
            );
            console.warn("⚠️ The profile needs to be updated to fix the nonce");
          }

          // Show encrypted indicator instead of sample data
          setProfileData({
            birthDate: "[Cannot decrypt - nonce mismatch]",
            sex: "[Cannot decrypt - nonce mismatch]",
            height: 0,
            weight: 0,
            email: "[Cannot decrypt - nonce mismatch]",
          });
        }
      }
    };

    loadDecryptedData();
  }, [healthProfile, isConnected, address]);

  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Handle profile creation/update
  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    if (!isConnected) {
      setSuccessMessage("Please connect your wallet first");
      return;
    }

    try {
      if (healthProfile) {
        // Update existing profile
        setIsUpdating(true);
        setSuccessMessage(null);

        const result = await updateHealthProfile({
          birthDate: profileData.birthDate,
          sex: profileData.sex,
          height: profileData.height,
          weight: profileData.weight,
          email: profileData.email,
          isActive: true,
          version: 1,
          timestamp: Date.now(),
        });

        if (result.success) {
          setSuccessMessage("Profile updated successfully!");

          // Reload profile from blockchain to update UI
          const loadResult = await loadProfileFromBlockchain();
          if (loadResult.success) {
            console.log("✅ Profile reloaded after update");
          }
        } else {
          setSuccessMessage(`Update failed: ${result.error}`);
        }
      } else {
        // Create new profile
        setIsCreating(true);
        setSuccessMessage(null);

        const result = await updateHealthProfile({
          birthDate: profileData.birthDate,
          sex: profileData.sex,
          height: profileData.height,
          weight: profileData.weight,
          email: profileData.email,
          isActive: true,
          version: 1,
          timestamp: Date.now(),
        });

        if (result.success) {
          setSuccessMessage("Profile created successfully!");

          // Reload profile from blockchain to update UI
          const loadResult = await loadProfileFromBlockchain();
          if (loadResult.success) {
            console.log("✅ Profile reloaded after creation");
          }
        } else {
          setSuccessMessage(`Creation failed: ${result.error}`);
        }
      }
    } catch (err) {
      setSuccessMessage(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setIsCreating(false);
      setIsUpdating(false);
    }
  };

  // Load profile from blockchain
  const handleLoadProfile = async (): Promise<void> => {
    if (!isConnected) {
      setSuccessMessage("Please connect your wallet first");
      return;
    }

    setIsLoading(true);
    setSuccessMessage(null);

    try {
      // Show initial loading message
      setSuccessMessage(
        "🔄 Loading profile... This may take 10-30 seconds due to encryption key derivation. Please wait...",
      );

      // Use setTimeout to allow UI to update before the potentially long-running operation
      await new Promise((resolve) => setTimeout(resolve, 300));

      const result = await loadProfileFromBlockchain();

      if (result.success) {
        setSuccessMessage(
          "✅ Profile loaded successfully! The profile will update automatically.",
        );
        // Don't reload - the profile is already in state and will update the UI
        // Reloading could interrupt signature requests
        // Instead, just refresh the profile data
        await refreshProfile();
      } else {
        setSuccessMessage(`❌ Error loading profile: ${result.error}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("❌ Error loading profile:", err);
      setSuccessMessage(
        `❌ Error loading profile: ${errorMessage}. Please try again or check the console for details.`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Clear success message after 5 seconds
  useEffect((): (() => void) | void => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return (): void => {
        clearTimeout(timer);
      };
    }
  }, [successMessage]);

  const isSuccessMsg = (msg: string): boolean =>
    msg.includes("successfully") || msg.includes("✅");

  if (!isConnected) {
    return (
      <div className="rounded-xl border bg-white dark:bg-[#0B140F] border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)] p-[22px]">
        <div className="flex items-center gap-2 mb-[18px]">
          <Shield className="h-4 w-4 text-[#006B4F] flex-shrink-0" />
          <h3 className="font-semibold text-[#0A1A0F] dark:text-[#F0F7F3] text-base">
            Health Profile Manager
          </h3>
        </div>
        <div className="text-center py-8">
          <AlertCircle className="h-12 w-12 text-[#6B8C7A] mx-auto mb-4" />
          <p className="text-[#6B8C7A]">
            Please connect your ZKsync SSO wallet to manage your health profile
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white dark:bg-[#0B140F] border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)] p-[22px]">
      {/* Card header */}
      <div className="flex items-center justify-between mb-[18px]">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#006B4F] flex-shrink-0" />
          <h3 className="font-semibold text-[#0A1A0F] dark:text-[#F0F7F3] text-base">
            Health Profile Manager
          </h3>
        </div>
        {healthProfile && (
          <span className="inline-flex items-center gap-1 bg-[rgba(0,107,79,0.10)] dark:bg-[rgba(0,107,79,0.15)] text-[#006B4F] dark:text-[#4ade80] text-[11px] font-semibold px-[10px] py-[3px] rounded-full">
            <CheckCircle className="h-[10px] w-[10px]" />
            On-Chain
          </span>
        )}
      </div>

      <div>
        {healthProfile ? (
          <div>
            {/* Profile meta header */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-[14px] font-semibold text-[#0A1A0F] dark:text-[#F0F7F3] mb-1">
                  Encrypted Health Data
                </div>
                <div className="text-xs text-[#6B8C7A]">
                  Version {healthProfile.version} · Last updated{" "}
                  {new Date(
                    healthProfile.timestamp * 1000,
                  ).toLocaleDateString()}{" "}
                  · Stored on-chain
                </div>
              </div>
              <div className="flex-shrink-0 flex items-center gap-2">
                <span
                  className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    healthProfile.isActive
                      ? "bg-[rgba(0,107,79,0.10)] dark:bg-[rgba(0,107,79,0.15)] text-[#006B4F] dark:text-[#4ade80]"
                      : "bg-[rgba(0,107,79,0.06)] text-[#6B8C7A] border border-[rgba(0,107,79,0.15)]"
                  }`}
                >
                  {healthProfile.isActive ? "Active" : "Inactive"}
                </span>
                <span className="text-[11px] text-[#6B8C7A]">
                  v{healthProfile.version}
                </span>
              </div>
            </div>

            {/* Data grid */}
            <div className="grid grid-cols-2 gap-[14px] mb-[18px]">
              <div>
                <div className="text-[11px] font-medium text-[#6B8C7A] mb-[3px]">
                  Birth Date
                </div>
                <div className="text-[13px] font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                  {formatDateForDisplay(profileData.birthDate)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#6B8C7A] mb-[3px]">
                  Sex
                </div>
                <div className="text-[13px] font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                  {profileData.sex}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#6B8C7A] mb-[3px]">
                  Height
                </div>
                <div className="text-[13px] font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                  {profileData.height} inches (
                  {Math.floor(profileData.height / 12)}&apos;{" "}
                  {profileData.height % 12}&quot;)
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#6B8C7A] mb-[3px]">
                  Weight
                </div>
                <div className="text-[13px] font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                  {profileData.weight} lbs
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-[11px] font-medium text-[#6B8C7A] mb-[3px]">
                  Email
                </div>
                <div className="text-[13px] font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                  {profileData.email}
                </div>
              </div>
            </div>

            {/* Update form */}
            <div className="pt-4 border-t border-[rgba(0,107,79,0.08)]">
              <div className="text-[11px] font-semibold text-[#6B8C7A] uppercase tracking-[0.08em] mb-[12px]">
                Update Profile
              </div>
              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-2 gap-[14px] mb-4">
                  <div>
                    <label htmlFor="birthDate" className={labelClass}>
                      Birth Date
                    </label>
                    <input
                      id="birthDate"
                      type="date"
                      value={profileData.birthDate}
                      onChange={(e) =>
                        setProfileData((prev) => ({
                          ...prev,
                          birthDate: e.target.value,
                        }))
                      }
                      required
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="sex" className={labelClass}>
                      Sex
                    </label>
                    <select
                      id="sex"
                      value={profileData.sex}
                      onChange={(e) =>
                        setProfileData((prev) => ({
                          ...prev,
                          sex: e.target.value,
                        }))
                      }
                      required
                      className={selectClass}
                    >
                      <option value="">Select...</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="height" className={labelClass}>
                      Height (inches)
                    </label>
                    <input
                      id="height"
                      type="number"
                      value={profileData.height || ""}
                      onChange={(e) =>
                        setProfileData((prev) => ({
                          ...prev,
                          height: parseInt(e.target.value) || 0,
                        }))
                      }
                      placeholder="e.g., 72 (6 feet)"
                      required
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="weight" className={labelClass}>
                      Weight (pounds)
                    </label>
                    <input
                      id="weight"
                      type="number"
                      value={profileData.weight || ""}
                      onChange={(e) =>
                        setProfileData((prev) => ({
                          ...prev,
                          weight: parseInt(e.target.value) || 0,
                        }))
                      }
                      placeholder="e.g., 180"
                      required
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="email" className={labelClass}>
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={profileData.email}
                      onChange={(e) =>
                        setProfileData((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                      placeholder="your@email.com"
                      required
                      className={inputClass}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isUpdating || isProfileLoading}
                  className={submitBtnClass}
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Updating Profile...
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4" />
                      Update Profile
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : (
          // No profile loaded - show load/create options
          <div className="space-y-4">
            <div className="text-center py-4">
              <User className="h-12 w-12 text-[#6B8C7A] mx-auto mb-4" />
              <h3 className="text-[14px] font-semibold mb-2 text-[#0A1A0F] dark:text-[#F0F7F3]">
                Health Profile
              </h3>
              <p className="text-[#6B8C7A] text-sm mb-4">
                Load your existing profile or create a new one
              </p>

              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleLoadProfile}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[rgba(0,107,79,0.35)] text-[#006B4F] dark:text-[#4ade80] hover:bg-[rgba(0,107,79,0.06)] font-medium text-[13px] transition-colors disabled:opacity-60"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Load Existing Profile
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="border-t border-[rgba(0,107,79,0.08)] pt-4">
              <div className="text-[14px] font-semibold mb-1 text-[#0A1A0F] dark:text-[#F0F7F3]">
                Create New Profile
              </div>
              <p className="text-[#6B8C7A] text-xs mb-4">
                Your health data will be encrypted and stored securely on the
                blockchain
              </p>

              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-2 gap-[14px] mb-4">
                  <div>
                    <label htmlFor="birthDate" className={labelClass}>
                      Birth Date
                    </label>
                    <input
                      id="birthDate"
                      type="date"
                      value={profileData.birthDate}
                      onChange={(e) =>
                        setProfileData((prev) => ({
                          ...prev,
                          birthDate: e.target.value,
                        }))
                      }
                      required
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="sex" className={labelClass}>
                      Sex
                    </label>
                    <select
                      id="sex"
                      value={profileData.sex}
                      onChange={(e) =>
                        setProfileData((prev) => ({
                          ...prev,
                          sex: e.target.value,
                        }))
                      }
                      required
                      className={selectClass}
                    >
                      <option value="">Select...</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="height" className={labelClass}>
                      Height (inches)
                    </label>
                    <input
                      id="height"
                      type="number"
                      value={profileData.height || ""}
                      onChange={(e) =>
                        setProfileData((prev) => ({
                          ...prev,
                          height: parseInt(e.target.value) || 0,
                        }))
                      }
                      placeholder="e.g., 72 (6 feet)"
                      required
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="weight" className={labelClass}>
                      Weight (pounds)
                    </label>
                    <input
                      id="weight"
                      type="number"
                      value={profileData.weight || ""}
                      onChange={(e) =>
                        setProfileData((prev) => ({
                          ...prev,
                          weight: parseInt(e.target.value) || 0,
                        }))
                      }
                      placeholder="e.g., 180"
                      required
                      className={inputClass}
                    />
                  </div>

                  <div className="col-span-2">
                    <label htmlFor="email" className={labelClass}>
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={profileData.email}
                      onChange={(e) =>
                        setProfileData((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                      placeholder="your@email.com"
                      required
                      className={inputClass}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isCreating || isProfileLoading}
                  className={submitBtnClass}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating Profile...
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4" />
                      Create Health Profile
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Success/Error Messages */}
        {successMessage && (
          <div
            className={`mt-4 p-3 rounded-lg text-sm ${
              isSuccessMsg(successMessage)
                ? "bg-[#ECFDF5] dark:bg-[rgba(0,107,79,0.12)] text-[#065F46] dark:text-[#4ade80] border border-[#A7F3D0] dark:border-[rgba(0,107,79,0.3)]"
                : "bg-[#FEF2F2] dark:bg-[rgba(248,113,113,0.08)] text-[#DC2626] dark:text-[#F87171] border border-[#FECACA] dark:border-[rgba(248,113,113,0.3)]"
            }`}
          >
            <div className="flex items-center gap-2">
              {isSuccessMsg(successMessage) ? (
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              )}
              {successMessage}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-lg text-sm bg-[#FEF2F2] dark:bg-[rgba(248,113,113,0.08)] text-[#DC2626] dark:text-[#F87171] border border-[#FECACA] dark:border-[rgba(248,113,113,0.3)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
              <button
                onClick={clearError}
                className="text-[#DC2626] dark:text-[#F87171] hover:opacity-70 ml-2"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
