"use client";

import HealthStatCards from "@/components/ai/HealthStatCards";
import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { useWalletService } from "@/hooks/useWalletService";
import AiProvider from "@/store/aiStore";
import {
  normalizeUserProfile,
  type NormalizedUserProfile,
  type RawUserProfileInput,
} from "@/utils/userProfileUtils";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import CosaintChatUI from "./ai/CosaintChatUI";
import GoalsTab from "./ai/GoalsTab";
import HealthReport from "./ai/HealthReport";
import HealthTimelineTab from "./ai/HealthTimelineTab";
import ProfileInputModal from "./ai/ProfileInputModal";
import { GuidePopup } from "./ui/GuidePopup";

interface AiCompanionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AiCompanionModal: React.FC<AiCompanionModalProps> = (props) => {
  const [isMobile, setIsMobile] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "goals" | "timeline">(
    "chat",
  );
  const [showWalletBanner, setShowWalletBanner] = useState(true);

  // Popup state management
  const [showHealthDashboardPopup, setShowHealthDashboardPopup] =
    useState(false);
  const [showUploadFilePopup, setShowUploadFilePopup] = useState(false);
  const healthDashboardRef = useRef<HTMLButtonElement>(null);
  const uploadFileRef = useRef<HTMLButtonElement>(null);

  // Track if we've already populated profile to prevent infinite loops
  const hasPopulatedProfileRef = useRef(false);

  // Access the health data provider to check for available data
  const {
    metricData,
    userProfile,
    setUserProfile,
    setProfile,
    setIsDashboardOpen,
  } = useHealthDataContext();

  // Get wallet data
  const { isConnected, getDecryptedProfile, loadProfileFromBlockchain } =
    useWalletService();

  // Check if health data is available
  const hasHealthData = Object.keys(metricData).length > 0;

  // Reset the populated flag when modal closes
  useEffect(() => {
    if (!props.isOpen) {
      hasPopulatedProfileRef.current = false;
    }
  }, [props.isOpen]);

  // Load banner dismissal state from localStorage
  useEffect(() => {
    const dismissed = localStorage.getItem("amach-wallet-banner-dismissed");
    if (dismissed === "true") {
      setShowWalletBanner(false);
    }
  }, []);

  // Check if popups should be shown when modal opens
  useEffect(() => {
    if (!props.isOpen) {
      setShowHealthDashboardPopup(false);
      setShowUploadFilePopup(false);
      return;
    }

    // Check if popups have been dismissed
    const healthDashboardDismissed = localStorage.getItem(
      "amach-health-dashboard-popup-dismissed",
    );
    const uploadFileDismissed = localStorage.getItem(
      "amach-upload-file-popup-dismissed",
    );

    // Show first popup if not dismissed, after a delay to ensure DOM is ready
    // Only show if Health Dashboard link is visible (no health data)
    if (!healthDashboardDismissed && !hasHealthData) {
      // Retry mechanism to wait for element to appear
      let timeoutId: NodeJS.Timeout;
      const checkAndShow = (attempts = 0): void => {
        // Check if element exists and is visible
        if (
          healthDashboardRef.current &&
          healthDashboardRef.current.offsetParent !== null
        ) {
          // Scroll element into view if needed
          healthDashboardRef.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center",
          });

          // Wait for scroll to complete before showing popup
          timeoutId = setTimeout(() => {
            setShowHealthDashboardPopup(true);
          }, 600);
          return;
        }
        if (attempts < 20) {
          timeoutId = setTimeout(() => checkAndShow(attempts + 1), 150);
        } else {
          console.warn("Health Dashboard element not found after retries");
        }
      };
      const timer = setTimeout(() => checkAndShow(), 500);
      return () => {
        clearTimeout(timer);
        if (timeoutId) clearTimeout(timeoutId);
      };
    } else if (!uploadFileDismissed) {
      // If first popup was dismissed/not applicable, show second popup
      // Retry mechanism to wait for element to appear
      let timeoutId: NodeJS.Timeout;
      const checkAndShow = (attempts = 0): void => {
        // Check if element exists and is visible
        if (
          uploadFileRef.current &&
          uploadFileRef.current.offsetParent !== null
        ) {
          // Scroll element into view if needed
          uploadFileRef.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center",
          });

          // Wait for scroll to complete before showing popup
          timeoutId = setTimeout(() => {
            setShowUploadFilePopup(true);
          }, 600);
          return;
        }
        if (attempts < 20) {
          timeoutId = setTimeout(() => checkAndShow(attempts + 1), 150);
        } else {
          console.warn("Upload File element not found after retries");
        }
      };
      const timer = setTimeout(
        () => checkAndShow(),
        healthDashboardDismissed || hasHealthData ? 500 : 1000,
      );
      return () => {
        clearTimeout(timer);
        if (timeoutId) clearTimeout(timeoutId);
      };
    }
  }, [props.isOpen, hasHealthData]);

  // Handle Health Dashboard popup close - show Upload File popup next
  const handleHealthDashboardPopupClose = (): void => {
    setShowHealthDashboardPopup(false);
    const uploadFileDismissed = localStorage.getItem(
      "amach-upload-file-popup-dismissed",
    );
    if (!uploadFileDismissed) {
      setTimeout(() => {
        setShowUploadFilePopup(true);
      }, 300);
    }
  };

  // Handle "Don't show again" for Health Dashboard popup
  const handleHealthDashboardDontShowAgain = (): void => {
    localStorage.setItem("amach-health-dashboard-popup-dismissed", "true");
    setShowHealthDashboardPopup(false);
    const uploadFileDismissed = localStorage.getItem(
      "amach-upload-file-popup-dismissed",
    );
    if (!uploadFileDismissed) {
      setTimeout(() => {
        setShowUploadFilePopup(true);
      }, 300);
    }
  };

  // Handle "Don't show again" for Upload File popup
  const handleUploadFileDontShowAgain = (): void => {
    localStorage.setItem("amach-upload-file-popup-dismissed", "true");
    setShowUploadFilePopup(false);
  };

  // Handle banner dismissal
  const handleDismissBanner = (): void => {
    setShowWalletBanner(false);
    localStorage.setItem("amach-wallet-banner-dismissed", "true");
  };

  // Auto-populate profile from wallet when modal opens
  useEffect(() => {
    const populateProfileFromWallet = async (): Promise<void> => {
      if (
        !props.isOpen ||
        !isConnected ||
        isProfileComplete(userProfile) ||
        hasPopulatedProfileRef.current
      ) {
        return;
      }

      // Mark as populated before async operations
      hasPopulatedProfileRef.current = true;

      try {
        // Load fresh data from blockchain
        const loadResult = await loadProfileFromBlockchain();

        if (!loadResult.success) {
          console.warn(
            "⚠️ Failed to load profile from blockchain:",
            loadResult.error,
          );
          return;
        }

        // Use the profile data directly from the load result to avoid React state timing issues
        // This is especially important in production where state updates may be batched differently
        console.log("🔍 Load result profile data:", {
          hasProfile: !!loadResult.profile,
          hasNonce: !!loadResult.profile?.nonce,
          profileKeys: loadResult.profile
            ? Object.keys(loadResult.profile)
            : [],
        });

        const walletProfile = await getDecryptedProfile(loadResult.profile);

        console.log("🔍 Decrypted profile result:", {
          hasWalletProfile: !!walletProfile,
          walletProfileKeys: walletProfile ? Object.keys(walletProfile) : [],
        });

        if (walletProfile) {
          const rawProfile: RawUserProfileInput = {
            birthDate: walletProfile.birthDate,
            sex: walletProfile.sex,
            height: walletProfile.height,
            heightIn: (walletProfile as { heightIn?: number }).heightIn,
            heightCm: (walletProfile as { heightCm?: number }).heightCm,
            weight: walletProfile.weight,
            weightKg: (walletProfile as { weightKg?: number }).weightKg,
            weightLbs: (walletProfile as { weightLbs?: number }).weightLbs,
            age: (walletProfile as { age?: number }).age,
            name: (walletProfile as { name?: string }).name,
          };

          const normalized = normalizeUserProfile(rawProfile);

          setUserProfile(normalized);
          setProfile(normalized);

          console.log(
            "✅ Auto-populated AI companion profile from wallet:",
            normalized,
          );
        }
      } catch (error) {
        console.error("❌ Failed to populate profile from wallet:", error);
      }
    };

    populateProfileFromWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen, isConnected]); // Removed userProfile and setter functions from dependencies

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
  function isProfileComplete(
    profile: unknown,
  ): profile is NormalizedUserProfile {
    if (typeof profile !== "object" || profile === null) {
      return false;
    }
    const obj = profile as NormalizedUserProfile;
    const hasHeight =
      (typeof obj.heightIn === "number" && obj.heightIn > 0) ||
      (typeof obj.heightCm === "number" && obj.heightCm > 0);
    const hasWeight =
      (typeof obj.weightLbs === "number" && obj.weightLbs > 0) ||
      (typeof obj.weightKg === "number" && obj.weightKg > 0);
    return (
      hasHeight &&
      hasWeight &&
      typeof obj.sex === "string" &&
      obj.sex.length > 0 &&
      (typeof obj.birthDate === "string" ||
        (typeof obj.age === "number" && obj.age > 0))
    );
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

  // ── Tab definitions ────────────────────────────────────────
  const tabs: Array<{ id: "chat" | "goals" | "timeline"; label: string }> = [
    { id: "chat", label: "Chat" },
    { id: "goals", label: "Goals" },
    { id: "timeline", label: "Timeline" },
  ];

  return (
    <div
      className="fixed inset-0 z-[200] overflow-hidden flex"
      style={{
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(6px)",
        // On desktop: center the modal. On mobile: fill the screen.
        ...(isMobile
          ? { alignItems: "flex-end" }
          : { alignItems: "center", justifyContent: "center", padding: 8 }),
      }}
    >
      <div
        ref={modalRef}
        className="relative w-full overflow-hidden animate-in fade-in duration-300"
        style={{
          background: "var(--color-bg-surface)",
          // Mobile: slide-up sheet, no rounding on bottom, full width
          // Desktop: centred floating modal
          ...(isMobile
            ? {
                maxWidth: "100%",
                height: "96dvh",
                maxHeight: "96dvh",
                borderRadius: "16px 16px 0 0",
                border: "1px solid var(--color-border)",
                borderBottom: "none",
              }
            : {
                maxWidth: "95vw",
                maxHeight: "90vh",
                borderRadius: 20,
                boxShadow: "0 24px 80px rgba(0,0,0,0.18)",
                border: "1px solid var(--color-border)",
              }),
        }}
        onClick={handleModalClick}
      >

        {/* ── Header ──────────────────────────────────────── */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "var(--color-bg-nav)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid var(--color-border)",
            padding: isMobile ? "0 14px" : "0 20px",
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Wordmark */}
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span
              className="amach-wordmark-line"
              style={{
                fontFamily: "var(--font-serif, 'Libre Baskerville', Georgia, serif)",
                fontWeight: 700,
                fontSize: "0.95rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              Luma
            </span>
            <span
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
              }}
            >
              by Amach Health
            </span>
          </div>

          {/* Close */}
          <button
            onClick={props.onClose}
            aria-label="Close"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              transition: "color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--color-emerald-muted)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-emerald)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)";
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </header>

        {/* ── Body ────────────────────────────────────────── */}
        <div
          className="overflow-auto relative"
          style={{
            maxHeight: isMobile ? "calc(96dvh - 56px)" : "calc(90vh - 56px)",
            padding: isMobile ? "12px 10px" : "24px",
          }}
          onClick={(e) => e.stopPropagation()}
        >

          {/* ── Tab Navigation ──────────────────────────── */}
          <div
            style={{
              display: "flex",
              gap: 0,
              borderBottom: "1px solid var(--color-border)",
              marginBottom: isMobile ? 14 : 24,
            }}
          >
            {tabs.map(({ id, label }) => {
              const isActive = activeTab === id;
              const isLocked = !isConnected && id !== "chat";
              return (
                <div key={id} className="relative group" style={{ flex: 1 }}>
                  <button
                    onClick={() => !isLocked && setActiveTab(id)}
                    disabled={isLocked}
                    style={{
                      width: "100%",
                      padding: isMobile ? "10px 4px" : "12px 8px",
                      fontSize: isMobile ? "0.82rem" : "0.9rem",
                      fontWeight: isActive ? 700 : 500,
                      color: isActive
                        ? "var(--color-emerald)"
                        : "var(--color-text-muted)",
                      background: "none",
                      border: "none",
                      borderBottom: isActive
                        ? "2px solid var(--color-emerald)"
                        : "2px solid transparent",
                      marginBottom: -1,
                      cursor: isLocked ? "not-allowed" : "pointer",
                      opacity: isLocked ? 0.45 : 1,
                      transition: "color 0.15s, border-color 0.15s",
                    }}
                  >
                    {label}
                  </button>
                  {isLocked && (
                    <div
                      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 invisible group-hover:visible pointer-events-none"
                      style={{
                        background: "var(--color-text-primary)",
                        color: "#fff",
                        fontSize: "0.75rem",
                        padding: "6px 12px",
                        borderRadius: 8,
                        whiteSpace: "nowrap",
                        zIndex: 50,
                      }}
                    >
                      Connect a wallet to unlock {label}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Tab Content ─────────────────────────────── */}
          <div className="flex-1 min-h-0 flex flex-col">
            {activeTab === "chat" ? (
              <>
                {/* Wallet banner */}
                {!isConnected && showWalletBanner && (
                  <div
                    style={{
                      marginBottom: isMobile ? 12 : 20,
                      padding: isMobile ? "10px 14px" : "16px 20px",
                      background: "var(--color-emerald-muted)",
                      border: "1px solid var(--color-border-strong)",
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <p
                        style={{
                          fontWeight: 700,
                          color: "var(--color-emerald)",
                          fontSize: isMobile ? "0.82rem" : "0.9rem",
                          marginBottom: isMobile ? 2 : 6,
                        }}
                      >
                        Unlock your permanent health vault
                      </p>
                      {!isMobile && (
                        <p
                          style={{
                            fontSize: "0.85rem",
                            lineHeight: 1.6,
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          Connect a wallet to encrypt and store your data on
                          Storj, anchor your profile on ZKsync, and access
                          everything from any device.
                        </p>
                      )}
                      {isMobile && (
                        <p
                          style={{
                            fontSize: "0.78rem",
                            lineHeight: 1.5,
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          Storj storage + ZKsync identity + cross-device access.
                        </p>
                      )}
                    </div>
                    <button
                      onClick={handleDismissBanner}
                      aria-label="Dismiss"
                      style={{
                        flexShrink: 0,
                        background: "none",
                        border: "none",
                        color: "var(--color-text-muted)",
                        cursor: "pointer",
                        padding: 2,
                      }}
                    >
                      <X style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                )}

                {/* Health stats */}
                {hasHealthData && (
                  <div style={{ marginBottom: isMobile ? 10 : 16 }}>
                    <button
                      onClick={() => setShowStats(!showStats)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: isMobile ? "8px 12px" : "10px 14px",
                        background: "var(--color-companion-btn-hover)",
                        border: "1px solid var(--color-companion-surface-border)",
                        borderRadius: 10,
                        marginBottom: showStats ? (isMobile ? 8 : 12) : 0,
                        cursor: "pointer",
                        color: "var(--color-companion-mode-text)",
                        fontWeight: 600,
                        fontSize: isMobile ? "0.8rem" : "0.88rem",
                      }}
                    >
                      <span>Your Health Overview</span>
                      {showStats ? (
                        <ChevronUp style={{ width: 16, height: 16 }} />
                      ) : (
                        <ChevronDown style={{ width: 16, height: 16 }} />
                      )}
                    </button>

                    {showStats && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <HealthStatCards />
                        <HealthReport />
                      </div>
                    )}
                  </div>
                )}

                {/* No health data nudge */}
                {!hasHealthData && (
                  <div
                    className="companion-notification"
                    style={{
                      marginBottom: isMobile ? 10 : 16,
                      padding: isMobile ? "10px 12px" : "14px 16px",
                      borderRadius: 10,
                    }}
                  >
                    <p
                      className="companion-notification-text"
                      style={{
                        fontSize: isMobile ? "0.82rem" : "0.88rem",
                        lineHeight: 1.6,
                      }}
                    >
                      No health data yet. Open the{" "}
                      <button
                        ref={healthDashboardRef}
                        onClick={() => {
                          props.onClose();
                          setTimeout(() => {
                            setIsDashboardOpen(true);
                          }, 100);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: "var(--color-emerald)",
                          fontWeight: 600,
                          fontSize: "inherit",
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                      >
                        Health Dashboard
                      </button>{" "}
                      to import your Apple Health export or upload lab results.
                    </p>
                  </div>
                )}

                <AiProvider>
                  <div className="flex-1 min-h-0 flex flex-col">
                    <CosaintChatUI uploadFileButtonRef={uploadFileRef} />
                  </div>
                </AiProvider>
              </>
            ) : activeTab === "goals" ? (
              <div className="flex-1 min-h-0 flex flex-col">
                <GoalsTab />
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col">
                <HealthTimelineTab />
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
          const totalInches = data.heightFeet * 12 + data.heightInches;
          const rawProfile: RawUserProfileInput = {
            age: data.age,
            birthDate: data.birthDate,
            sex: data.sex,
            heightIn: totalInches,
            weightLbs: data.weight,
          };
          const normalized = normalizeUserProfile(rawProfile);
          const mergedProfile: NormalizedUserProfile = {
            ...(userProfile ?? {}),
            ...normalized,
          };
          setUserProfile(mergedProfile);
          setProfile(mergedProfile);
          setShowProfileModal(false);
        }}
        initialProfile={userProfile as NormalizedUserProfile | null}
      />

      {/* Health Dashboard Guide Popup */}
      <GuidePopup
        isVisible={showHealthDashboardPopup && !!healthDashboardRef.current}
        onClose={handleHealthDashboardPopupClose}
        onDontShowAgain={handleHealthDashboardDontShowAgain}
        targetElementRef={healthDashboardRef}
        title="Import your health data"
        position="bottom"
        content={
          <div>
            <p style={{ marginBottom: 8, lineHeight: 1.6 }}>
              Export your Apple Health archive and upload it in the{" "}
              <strong>Health Dashboard</strong> to get personalised insights
              from Luma.
            </p>
            <p style={{ lineHeight: 1.6 }}>
              Your data is encrypted before it leaves your device and stored
              permanently on Storj. Only your wallet can decrypt it.
            </p>
          </div>
        }
      />

      {/* Upload File Guide Popup */}
      <GuidePopup
        isVisible={showUploadFilePopup && !!uploadFileRef.current}
        onClose={() => setShowUploadFilePopup(false)}
        onDontShowAgain={handleUploadFileDontShowAgain}
        targetElementRef={uploadFileRef}
        title="Add documents for context"
        position="bottom"
        content={
          <div>
            <p style={{ lineHeight: 1.6 }}>
              Upload PDFs such as lab results, DEXA scans, or doctor notes.
              Luma reads them alongside your Apple Health data to give you a
              complete picture.
            </p>
          </div>
        }
      />
    </div>
  );
};

export default AiCompanionModal;
