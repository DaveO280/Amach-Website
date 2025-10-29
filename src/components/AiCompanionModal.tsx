"use client";

import HealthStatCards from "@/components/ai/HealthStatCards";
import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { Button } from "@/components/ui/button";
import { useZkSyncSsoWallet } from "@/hooks/useZkSyncSsoWallet";
import AiProvider from "@/store/aiStore";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import CosaintChatUI from "./ai/CosaintChatUI";
import GoalsTab from "./ai/GoalsTab";
import HealthReport from "./ai/HealthReport";
import ProfileInputModal from "./ai/ProfileInputModal";

interface ProfileData {
  age: number;
  sex: "male" | "female";
  height: number;
  weight: number;
}

interface AiCompanionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AiCompanionModal: React.FC<AiCompanionModalProps> = (props) => {
  const [isMobile, setIsMobile] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "goals">("chat");

  // Access the health data provider to check for available data
  const { metricData, userProfile, setUserProfile } = useHealthDataContext();

  // Get wallet data
  const { isConnected, getDecryptedProfile, loadProfileFromBlockchain } =
    useZkSyncSsoWallet();

  // Check if health data is available
  const hasHealthData = Object.keys(metricData).length > 0;

  // Auto-populate profile from wallet when modal opens
  useEffect(() => {
    const populateProfileFromWallet = async (): Promise<void> => {
      if (!props.isOpen || !isConnected || isProfileComplete(userProfile))
        return;

      try {
        // Load fresh data from blockchain
        await loadProfileFromBlockchain();

        // Get decrypted profile data
        const walletProfile = await getDecryptedProfile();

        if (
          walletProfile &&
          walletProfile.birthDate &&
          walletProfile.height &&
          walletProfile.weight &&
          walletProfile.sex
        ) {
          // Calculate age from birth date
          const birthDate = new Date(walletProfile.birthDate);
          const today = new Date();
          const ageYears = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          const age =
            monthDiff < 0 ||
            (monthDiff === 0 && today.getDate() < birthDate.getDate())
              ? ageYears - 1
              : ageYears;

          // Convert height from inches to feet (for the profile format)
          const totalInches = walletProfile.height;
          const heightInFeet = totalInches / 12;

          // Map sex values
          const sexMapping: Record<string, "male" | "female"> = {
            M: "male",
            F: "female",
            Male: "male",
            Female: "female",
            male: "male",
            female: "female",
          };

          // Create profile data in the expected format
          // Note: The AI prompt expects height in feet and weight in pounds
          const profileData: ProfileData = {
            age,
            sex: sexMapping[walletProfile.sex] || "male",
            height: heightInFeet, // Already in feet (66 inches = 5.5 feet)
            weight: walletProfile.weight, // Already in pounds
          };

          // Set the profile in the health context
          setUserProfile(profileData);

          console.log(
            "✅ Auto-populated AI companion profile from wallet:",
            profileData,
          );
        }
      } catch (error) {
        console.error("❌ Failed to populate profile from wallet:", error);
      }
    };

    populateProfileFromWallet();
  }, [
    props.isOpen,
    isConnected,
    userProfile,
    getDecryptedProfile,
    loadProfileFromBlockchain,
    setUserProfile,
  ]);

  // Check viewport size to adjust UI accordingly
  useEffect(() => {
    const handleResize = (): void => {
      setIsMobile(window.innerWidth < 768);
    };

    // Initial check
    handleResize();

    // Listen for resize events
    window.addEventListener("resize", handleResize);

    // Clean up listener
    return (): void => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Prevent clicks on the modal from closing it
  const handleModalClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
  };

  // Helper to check if userProfile is complete
  function isProfileComplete(profile: unknown): profile is ProfileData {
    if (
      typeof profile === "object" &&
      profile !== null &&
      "age" in profile &&
      "sex" in profile &&
      "height" in profile &&
      "weight" in profile
    ) {
      const obj = profile as { [key: string]: unknown };
      return (
        typeof obj.age === "number" &&
        typeof obj.sex === "string" &&
        typeof obj.height === "number" &&
        typeof obj.weight === "number"
      );
    }
    return false;
  }

  // Lock background scroll and ensure viewport starts at top when open
  useEffect(() => {
    if (props.isOpen) {
      try {
        document.body.style.overflow = "hidden";
      } catch {}
      try {
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      } catch {
        window.scrollTo(0, 0);
      }
      // Best-effort: close any open dropdowns by simulating outside click
      try {
        const evt = new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
        });
        document.body.dispatchEvent(evt);
      } catch {}
    } else {
      try {
        document.body.style.overflow = "";
      } catch {}
    }
    return (): void => {
      try {
        document.body.style.overflow = "";
      } catch {}
    };
  }, [props.isOpen]);

  if (!props.isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm flex justify-center items-center p-2">
      <div
        ref={modalRef}
        className={`relative w-full rounded-lg shadow-xl overflow-hidden animate-in fade-in duration-300 ${
          isMobile
            ? "max-w-full max-h-[95vh]" // Full width on mobile with slight padding
            : "max-w-[95vw] max-h-[90vh]" // 95% width on desktop
        }`}
        style={{
          background:
            "linear-gradient(to bottom right, #FFE3B4, #ffffff, #CAF2DD)",
        }}
        onClick={handleModalClick}
      >
        {/* Adaptive header structure for both mobile and desktop */}
        <header className="sticky top-0 z-10 w-full bg-white/90 border-b border-amber-100 backdrop-blur-sm">
          {/* Title row */}
          <div className="px-3 py-2 flex items-center justify-between">
            <h2 className="text-base sm:text-xl font-black text-emerald-900">
              Amach Health
            </h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={props.onClose}
                className="rounded-full p-2 text-amber-900 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                aria-label="Close dashboard"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <div
          className="p-2 sm:p-4 md:p-6 overflow-auto"
          style={{ maxHeight: "calc(90vh - 60px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* File Folder Tab Navigation */}
          <div className="flex mb-4 gap-0 w-full border-b border-emerald-200 relative z-10">
            <button
              className={`flex-1 px-6 py-2 text-base font-semibold transition-colors focus:outline-none
                ${
                  activeTab === "chat"
                    ? "bg-white border-x border-t border-emerald-300 rounded-t-lg shadow-sm text-emerald-800 z-20"
                    : "bg-emerald-50 text-emerald-500 border-b border-emerald-200 z-0"
                }
              `}
              style={{ marginRight: "-2px" }}
              onClick={() => setActiveTab("chat")}
            >
              Chat
            </button>
            <button
              className={`flex-1 px-6 py-2 text-base font-semibold transition-colors focus:outline-none
                ${
                  activeTab === "goals"
                    ? "bg-white border-x border-t border-emerald-300 rounded-t-lg shadow-sm text-emerald-800 z-20"
                    : "bg-emerald-50 text-emerald-500 border-b border-emerald-200 z-0"
                }
              `}
              style={{ marginLeft: "-2px" }}
              onClick={() => setActiveTab("goals")}
            >
              Goals
            </button>
          </div>
          {/* Tab Content */}
          <div className="flex-1 min-h-0 flex flex-col">
            {activeTab === "chat" ? (
              <>
                {/* Health Stats Section with Toggle */}
                {hasHealthData && (
                  <div className="mb-4">
                    <div
                      className="flex items-center justify-between cursor-pointer bg-white/60 p-3 rounded-lg shadow-sm mb-2"
                      onClick={() => setShowStats(!showStats)}
                    >
                      <h3 className="font-semibold text-emerald-800">
                        Your Health Overview
                      </h3>
                      <button className="text-emerald-600 hover:text-emerald-700">
                        {showStats ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </button>
                    </div>

                    {showStats && (
                      <div className="mb-4">
                        <HealthStatCards />
                      </div>
                    )}
                  </div>
                )}

                {/* Health Report Section */}
                {hasHealthData ? (
                  isProfileComplete(userProfile) ? (
                    <div className="space-y-4">
                      {isConnected && (
                        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                          <p className="text-green-800 text-sm">
                            ✅ Using profile data from your wallet
                          </p>
                        </div>
                      )}
                      <HealthReport />
                    </div>
                  ) : (
                    <div className="flex flex-col space-y-4">
                      <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                        <p className="text-amber-800">
                          {isConnected
                            ? "Loading your profile from blockchain..."
                            : "Please enter your profile information to generate a personalized health report."}
                        </p>
                      </div>
                      <Button
                        onClick={() => setShowProfileModal(true)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white w-fit"
                        disabled={isConnected}
                      >
                        {isConnected
                          ? "Loading Profile..."
                          : "Generate Health Report"}
                      </Button>
                    </div>
                  )
                ) : (
                  <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-amber-800">
                      No health data available yet. Process your data in the
                      Health Dashboard for personalized insights.
                    </p>
                  </div>
                )}
                <AiProvider>
                  <div className="flex-1 min-h-0 flex flex-col">
                    <CosaintChatUI />
                  </div>
                </AiProvider>
              </>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col">
                <GoalsTab />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Profile Input Modal */}
      <ProfileInputModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onSubmit={(data) => {
          // Convert imperial to metric for storage/calculation
          const heightCm = Math.round(data.height * 30.48 * 100) / 100; // feet to cm
          const weightKg = Math.round(data.weight * 0.453592 * 100) / 100; // lbs to kg
          setUserProfile({
            ...(userProfile || {}),
            age: data.age,
            sex: data.sex,
            height: heightCm,
            weight: weightKg,
          } as typeof userProfile);
          setShowProfileModal(false);
        }}
      />
    </div>
  );
};

export default AiCompanionModal;
