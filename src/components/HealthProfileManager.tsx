"use client";

import { AlertCircle, CheckCircle, Loader2, Shield, User } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useZkSyncSsoWallet } from "../hooks/useZkSyncSsoWallet";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

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

export const HealthProfileManager: React.FC = () => {
  const {
    isConnected,
    healthProfile,
    updateHealthProfile,
    isProfileLoading,
    loadProfileFromBlockchain,
    getDecryptedProfile,
    error,
    clearError,
  } = useZkSyncSsoWallet();

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
  useEffect(() => {
    const loadDecryptedData = async (): Promise<void> => {
      if (healthProfile && isConnected) {
        // Try to get decrypted data from local storage first
        const decryptedData = await getDecryptedProfile();

        if (decryptedData) {
          // Use actual decrypted data from local storage
          setProfileData({
            birthDate: decryptedData.birthDate || "",
            sex: decryptedData.sex || "",
            height: decryptedData.height || 0,
            weight: decryptedData.weight || 0,
            email: decryptedData.email || "",
          });
        } else {
          // Fallback to sample data if no decrypted data available
          setProfileData({
            birthDate: "01/01/1990", // Sample data
            sex: "Not specified",
            height: 72, // 6 feet in inches
            weight: 150,
            email: "user@example.com",
          });
        }
      }
    };

    loadDecryptedData();
  }, [healthProfile, isConnected, getDecryptedProfile]);

  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Simple encryption function (in production, use proper encryption)
  // const encryptData = (data: string): string => {
  //   return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(data));
  // };

  // Generate data hash for verification (currently unused but kept for future use)
  // const generateDataHash = (data: HealthProfileData): string => {
  //   const encryptedBirthDate = encryptData(data.birthDate);
  //   const encryptedSex = encryptData(data.sex);
  //   const encryptedHeight = encryptData(data.height.toString());
  //   const encryptedWeight = encryptData(data.weight.toString());
  //   const encryptedEmail = encryptData(data.email);

  //   return ethers.utils.keccak256(
  //     ethers.utils.solidityPack(
  //       ["bytes32", "bytes32", "bytes32", "bytes32", "bytes32"],
  //       [encryptedBirthDate, encryptedSex, encryptedHeight, encryptedWeight, encryptedEmail]
  //     )
  //   );
  // };

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
      const result = await loadProfileFromBlockchain();

      if (result.success) {
        setSuccessMessage(
          "✅ Profile loaded successfully! Check the console for details.",
        );
      } else {
        setSuccessMessage(`❌ Error loading profile: ${result.error}`);
      }
    } catch (err) {
      setSuccessMessage(
        `❌ Error loading profile: ${err instanceof Error ? err.message : "Unknown error"}`,
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

  if (!isConnected) {
    return (
      <Card className="bg-white border-emerald-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <Shield className="h-5 w-5 text-emerald-600" />
            Health Profile Manager
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 text-[#9CA3AF] mx-auto mb-4" />
            <p className="text-[#6B7280]">
              Please connect your ZKsync SSO wallet to manage your health
              profile
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border-emerald-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-900">
          <Shield className="h-5 w-5 text-emerald-600" />
          Health Profile Manager
          {healthProfile && (
            <Badge
              variant="default"
              className="bg-emerald-100 text-emerald-700"
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              On-Chain
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {healthProfile ? (
          // Display existing profile with populated data
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#6B7280]">
                  Profile Status
                </Label>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={healthProfile.isActive ? "default" : "secondary"}
                  >
                    {healthProfile.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <span className="text-sm text-[#6B7280]">
                    Version {healthProfile.version}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#6B7280]">
                  Last Updated
                </Label>
                <p className="text-sm">
                  {new Date(healthProfile.timestamp * 1000).toLocaleString()}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#6B7280]">
                  Birth Date
                </Label>
                <p className="text-sm">
                  {formatDateForDisplay(profileData.birthDate)}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#6B7280]">
                  Sex
                </Label>
                <p className="text-sm">{profileData.sex}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#6B7280]">
                  Height
                </Label>
                <p className="text-sm">
                  {profileData.height} inches (
                  {Math.floor(profileData.height / 12)}&apos;{" "}
                  {profileData.height % 12}&quot;)
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#6B7280]">
                  Weight
                </Label>
                <p className="text-sm">{profileData.weight} lbs</p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-sm font-medium text-[#6B7280]">
                  Email
                </Label>
                <p className="text-sm">{profileData.email}</p>
              </div>
            </div>

            <div className="pt-4 border-t">
              <h4 className="font-medium mb-3">Update Profile</h4>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="birthDate">Birth Date</Label>
                    <Input
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
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sex">Sex</Label>
                    <select
                      id="sex"
                      value={profileData.sex}
                      onChange={(e) =>
                        setProfileData((prev) => ({
                          ...prev,
                          sex: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      required
                    >
                      <option value="">Select...</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="height">Height (inches)</Label>
                    <Input
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
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="weight">Weight (pounds)</Label>
                    <Input
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
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
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
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isUpdating || isProfileLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Updating Profile...
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4 mr-2" />
                      Update Profile
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>
        ) : (
          // No profile loaded - show load/create options
          <div className="space-y-4">
            <div className="text-center py-4">
              <User className="h-12 w-12 text-[#9CA3AF] mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Health Profile</h3>
              <p className="text-[#6B7280] text-sm mb-4">
                Load your existing profile or create a new one
              </p>

              <div className="flex gap-3 justify-center">
                <Button
                  onClick={handleLoadProfile}
                  disabled={isLoading}
                  variant="outline"
                  className="flex items-center gap-2 border-[#4F46E5] text-[#4F46E5] hover:bg-[#EEF2FF]"
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
                </Button>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-lg font-medium mb-2">Create New Profile</h4>
              <p className="text-[#6B7280] text-sm mb-4">
                Your health data will be encrypted and stored securely on the
                blockchain
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="birthDate">Birth Date</Label>
                    <Input
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
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sex">Sex</Label>
                    <select
                      id="sex"
                      value={profileData.sex}
                      onChange={(e) =>
                        setProfileData((prev) => ({
                          ...prev,
                          sex: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      required
                    >
                      <option value="">Select...</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="height">Height (inches)</Label>
                    <Input
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
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="weight">Weight (pounds)</Label>
                    <Input
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
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
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
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isCreating || isProfileLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating Profile...
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4 mr-2" />
                      Create Health Profile
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>
        )}

        {/* Success/Error Messages */}
        {successMessage && (
          <div
            className={`mt-4 p-3 rounded-md ${
              successMessage.includes("successfully")
                ? "bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {successMessage.includes("successfully") ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {successMessage}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-800 border border-red-200 rounded-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
              <button
                onClick={clearError}
                className="text-red-600 hover:text-red-800"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
