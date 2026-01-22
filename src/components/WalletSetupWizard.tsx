"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWalletService } from "@/hooks/useWalletService";
import {
  AlertCircle,
  CheckCircle,
  Coins,
  ExternalLink,
  Gift,
  Loader2,
  Mail,
  Shield,
  User,
  Wallet,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";

interface WizardStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "active" | "loading" | "complete" | "error";
  icon: React.ReactNode;
  helpText?: string;
}

interface HealthProfileData {
  birthDate: string;
  sex: string;
  height: number;
  weight: number;
  email: string;
}

interface WalletSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export const WalletSetupWizard: React.FC<WalletSetupWizardProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [deployerFundingTx, setDeployerFundingTx] = useState<string | null>(
    null,
  );
  const [allocationInfo, setAllocationInfo] = useState<{
    hasAllocation: boolean;
    hasClaimed: boolean;
    amount: string;
  } | null>(null);

  // Email and profile data
  const [email, setEmail] = useState("");
  const [profileData, setProfileData] = useState<HealthProfileData>({
    birthDate: "",
    sex: "",
    height: 0,
    weight: 0,
    email: "",
  });
  // Imperial unit inputs (feet/inches for height, lbs for weight)
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const walletService = useWalletService();
  const {
    isConnected,
    connect,
    updateHealthProfile,
    loadProfileFromBlockchain,
  } = walletService;

  // Get address - Privy service has getAddress() method
  const address = walletService.getAddress();

  // Get methods that may not exist in both services
  const verifyProfileZKsync =
    "verifyProfileZKsync" in walletService
      ? walletService.verifyProfileZKsync
      : async (
          email: string,
        ): Promise<{ success: boolean; txHash?: string; error?: string }> => {
          void email; // Suppress unused parameter warning
          return {
            success: false,
            error: "verifyProfileZKsync not available",
          };
        };
  const claimAllocation =
    "claimAllocation" in walletService
      ? walletService.claimAllocation
      : async (): Promise<{
          success: boolean;
          txHash?: string;
          error?: string;
        }> => ({
          success: false,
          error: "claimAllocation not available",
        });

  const [steps, setSteps] = useState<WizardStep[]>([
    {
      id: "email-verification",
      title: "Verify Your Email",
      description: "Check if your email is whitelisted",
      status: "active",
      icon: <Mail className="h-5 w-5" />,
      helpText: "Your email must be whitelisted to participate in the beta.",
    },
    {
      id: "create-wallet",
      title: "Create Your Health Wallet",
      description: "Sign in with Google, Apple, or Email",
      status: "pending",
      icon: <Wallet className="h-5 w-5" />,
      helpText: "No crypto experience needed. Just use your existing account.",
    },
    {
      id: "deployer-funding",
      title: "Deploying Wallet & Adding Funds",
      description:
        "Deploying your wallet to blockchain and adding starter funds",
      status: "pending",
      icon: <Coins className="h-5 w-5" />,
      helpText:
        "This is free! We're deploying your wallet to the blockchain and adding starter funds (~10 seconds).",
    },
    {
      id: "create-profile",
      title: "Create Your Health Profile",
      description: "Enter your health information",
      status: "pending",
      icon: <User className="h-5 w-5" />,
      helpText:
        "This information is encrypted and stored securely on the blockchain.",
    },
    {
      id: "verify-profile",
      title: "Verify Your Profile",
      description: "Confirm your profile on the blockchain",
      status: "pending",
      icon: <Shield className="h-5 w-5" />,
      helpText: "Creates cryptographic proof that you own this profile.",
    },
    {
      id: "claim-tokens",
      title: "Claim Your Beta Testing Tokens",
      description:
        "Receive 1,000 testnet AHP tokens to explore the platform (testing purposes only)",
      status: "pending",
      icon: <Gift className="h-5 w-5" />,
      helpText:
        "These test tokens let you explore all platform features during the beta phase.",
    },
  ]);

  // Update step status helper
  const updateStepStatus = useCallback(
    (stepId: string, status: WizardStep["status"]): void => {
      setSteps((prev) =>
        prev.map((step) => (step.id === stepId ? { ...step, status } : step)),
      );
    },
    [],
  );

  // Move to next step
  const moveToNextStep = useCallback((): void => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
      updateStepStatus(steps[currentStepIndex + 1].id, "active");
    }
  }, [currentStepIndex, steps, updateStepStatus]);

  // Track if we've already checked for existing profile to prevent infinite loops
  const hasCheckedProfileRef = React.useRef(false);

  // Reset the check flag when modal closes
  useEffect(() => {
    if (!isOpen) {
      hasCheckedProfileRef.current = false;
    }
  }, [isOpen]);

  // Check if profile already exists and skip to verification step
  // Also check allocation eligibility (only once on mount)
  // IMPORTANT: Only run this check ONCE when the modal opens with a connected wallet
  useEffect(() => {
    let isMounted = true;

    const checkExistingProfile = async (): Promise<void> => {
      // Only run ONCE when modal is open AND we have a connection
      // Don't run during wallet creation flow (when currentStepIndex is 0 or 1)
      // Don't run if we've already checked
      if (
        !isConnected ||
        !address ||
        !isMounted ||
        !isOpen ||
        currentStepIndex <= 1 ||
        hasCheckedProfileRef.current
      ) {
        return;
      }

      // Mark that we've checked (before async operations to prevent race conditions)
      hasCheckedProfileRef.current = true;

      try {
        const result = await loadProfileFromBlockchain();
        if (result.success && isMounted) {
          console.log(
            "✅ Profile already exists - checking verification status",
          );

          // Mark profile-related steps as complete
          updateStepStatus("email-verification", "complete");
          updateStepStatus("create-wallet", "complete");
          updateStepStatus("deployer-funding", "complete");
          updateStepStatus("create-profile", "complete");

          // Check allocation eligibility to see if verified
          await checkAllocationEligibility();

          // Wait a bit for allocation info to be set
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Check if user is already verified via allocation info
          const response = await fetch(
            `/api/verification/allocation-info?wallet=${address}`,
          );
          if (response.ok) {
            const data = await response.json();
            if (data.userAllocation && data.userAllocation.isVerified) {
              console.log("✅ User already verified - skipping to token claim");
              updateStepStatus("verify-profile", "complete");
              // Check if tokens were already claimed
              if (data.userAllocation.hasClaimed) {
                console.log(
                  "✅ Tokens already claimed - marking step as complete",
                );
                updateStepStatus("claim-tokens", "complete");
              }
              // Jump to claim tokens step
              const claimStepIndex = steps.findIndex(
                (s) => s.id === "claim-tokens",
              );
              if (claimStepIndex >= 0) {
                setCurrentStepIndex(claimStepIndex);
              }
              return;
            }
          }

          // Not verified yet, go to verification step
          console.log(
            "ℹ️ Profile exists but not verified - go to verification",
          );
          updateStepStatus("verify-profile", "active");
          const verifyStepIndex = steps.findIndex(
            (s) => s.id === "verify-profile",
          );
          if (verifyStepIndex >= 0) {
            setCurrentStepIndex(verifyStepIndex);
          }
        }
      } catch (error) {
        console.log("ℹ️ No existing profile found - starting fresh");
      }

      // Check allocation eligibility once more for good measure
      if (isMounted) {
        await checkAllocationEligibility();
      }
    };

    void checkExistingProfile();

    return (): void => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // Only run when modal opens - removed isConnected and address from dependencies

  // Smart session detection - skip wallet creation if already connected
  useEffect(() => {
    if (!isOpen) return;

    // If user is already connected when wizard opens, skip wallet creation step
    if (isConnected && address && currentStepIndex === 1) {
      console.log("🎯 Privy session detected - skipping wallet creation step");
      updateStepStatus("create-wallet", "complete");
      setWalletAddress(address);
      // Don't auto-advance here, let the background checker handle it
    }
  }, [isOpen, isConnected, address, currentStepIndex, updateStepStatus]);

  // Background step checker - automatically advances when steps are completed
  useEffect(() => {
    if (!isOpen) return;

    const checkStepCompletion = async (): Promise<void> => {
      const currentStep = steps[currentStepIndex];

      // Don't check if step is loading or already complete
      if (
        currentStep.status === "loading" ||
        currentStep.status === "complete"
      ) {
        return;
      }

      try {
        switch (currentStep.id) {
          case "create-wallet":
            // Check if wallet is connected
            if (isConnected && address) {
              console.log("✅ Wallet connected - auto-advancing to funding");
              updateStepStatus("create-wallet", "complete");
              setWalletAddress(address);
              moveToNextStep();
            }
            break;

          case "deployer-funding":
            // Check if wallet has been funded
            if (isConnected && address) {
              // If step just became active, trigger funding
              if (currentStep.status === "active") {
                console.log(
                  "🚀 Funding step is active - triggering funding process",
                );
                void handleDeployerFunding();
                // Don't check balance yet, let the handler update the status
                break;
              }

              const balanceResult = await walletService.getBalance();
              if (balanceResult.success && balanceResult.balance) {
                const balance = parseFloat(balanceResult.balance);
                if (balance > 0) {
                  console.log(
                    "✅ Wallet funded - auto-advancing to profile creation",
                  );
                  updateStepStatus("deployer-funding", "complete");
                  moveToNextStep();
                }
              }
            }
            break;

          case "create-profile":
            // DON'T check blockchain here - only check if step status changed to complete
            // The profile creation handler will update the status when successful
            // Checking blockchain repeatedly causes error spam when profile doesn't exist
            break;

          case "verify-profile":
            // Check verification status via allocation
            if (isConnected && address && allocationInfo?.hasAllocation) {
              console.log(
                "✅ Profile verified - auto-advancing to claim tokens",
              );
              updateStepStatus("verify-profile", "complete");
              moveToNextStep();
            }
            break;

          case "claim-tokens":
            // Check if tokens have been claimed by refreshing allocation info
            if (isConnected && address) {
              try {
                // Refresh allocation info to get latest status
                await checkAllocationEligibility();
                // Also check directly from API for immediate verification
                const response = await fetch(
                  `/api/verification/allocation-info?wallet=${address}`,
                );
                if (response.ok) {
                  const data = await response.json();
                  if (data.userAllocation?.hasClaimed) {
                    console.log("✅ Tokens claimed - setup complete!");
                    updateStepStatus("claim-tokens", "complete");
                  }
                }
              } catch (error) {
                // Silently fail - will retry on next interval
                console.log("Background allocation check:", error);
              }
            }
            break;
        }
      } catch (error) {
        // Don't show errors for background checks, just log them
        console.log("Background check:", error);
      }
    };

    // Run check immediately and then every 3 seconds
    const intervalId = setInterval(() => {
      void checkStepCompletion();
    }, 3000);

    // Initial check
    void checkStepCompletion();

    return (): void => {
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    currentStepIndex,
    steps,
    isConnected,
    address,
    walletAddress,
    allocationInfo,
    updateStepStatus,
    moveToNextStep,
    walletService,
    loadProfileFromBlockchain,
    // handleDeployerFunding omitted to avoid circular dependency (it's stable via useCallback)
  ]);

  // Navigate to a specific step (only if it's complete or current)
  const navigateToStep = useCallback(
    (stepIndex: number): void => {
      const targetStep = steps[stepIndex];

      // Don't navigate if step is loading or if it's a future step that hasn't been reached
      if (targetStep.status === "loading") {
        return;
      }

      // Allow navigation to completed steps, current step, or steps with errors
      if (
        targetStep.status === "complete" ||
        targetStep.status === "active" ||
        targetStep.status === "error"
      ) {
        setCurrentStepIndex(stepIndex);
        // If navigating to a step with error or complete, set it to active so user can retry/review
        if (targetStep.status === "complete" || targetStep.status === "error") {
          updateStepStatus(targetStep.id, "active");
        }
        setError(null); // Clear any errors when navigating
      }
    },
    [steps, updateStepStatus],
  );

  // Email verification functions - checks blockchain directly
  const checkEmailWhitelist = async (email: string): Promise<boolean> => {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `🔍 Checking email whitelist on blockchain... (attempt ${attempt}/${maxRetries})`,
        );

        // Use the wallet service's isEmailWhitelisted method (works with Privy)
        const result = await walletService.isEmailWhitelisted(email);

        if (result.success && result.isWhitelisted !== undefined) {
          console.log(
            `✅ Email ${email} whitelist status:`,
            result.isWhitelisted,
          );
          return result.isWhitelisted;
        }

        // If we got a result but it failed, check if it's a timeout
        if (result.error) {
          const isTimeout =
            result.error.toLowerCase().includes("timeout") ||
            result.error.toLowerCase().includes("took too long");

          if (isTimeout && attempt < maxRetries) {
            console.warn(
              `⏳ Timeout on attempt ${attempt}, retrying in ${retryDelay}ms...`,
            );
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            continue;
          }

          // If it's not a timeout or we've exhausted retries, throw the error
          throw new Error(result.error);
        }

        // Fallback: try the sharedDatabase method
        const { isEmailWhitelisted } = await import("@/lib/sharedDatabase");
        const isWhitelisted = await isEmailWhitelisted(email);
        console.log(`✅ Email ${email} whitelist status:`, isWhitelisted);
        return isWhitelisted;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const isTimeout =
          errorMessage.toLowerCase().includes("timeout") ||
          errorMessage.toLowerCase().includes("took too long");

        if (isTimeout && attempt < maxRetries) {
          console.warn(
            `⏳ Timeout on attempt ${attempt}, retrying in ${retryDelay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }

        // If it's the last attempt or not a timeout, log and throw
        console.error(
          `❌ Failed to check email whitelist (attempt ${attempt}/${maxRetries}):`,
          errorMessage,
        );

        if (attempt === maxRetries) {
          // On final attempt, throw a more user-friendly error
          throw new Error(
            isTimeout
              ? "Network timeout while checking whitelist. Please check your connection and try again."
              : `Failed to verify email: ${errorMessage}`,
          );
        }
      }
    }

    // Should never reach here, but just in case
    return false;
  };

  // Step 1: Email Verification
  const handleEmailVerification = async (): Promise<void> => {
    try {
      updateStepStatus("email-verification", "loading");
      setError(null);

      if (!email) {
        throw new Error("Please enter your email address");
      }

      const canProceed = await checkEmailWhitelist(email);

      if (!canProceed) {
        throw new Error(
          "Email is not whitelisted. Please contact an administrator.",
        );
      }

      // Set email in profile data
      setProfileData((prev) => ({ ...prev, email }));
      updateStepStatus("email-verification", "complete");

      // Move to wallet creation
      setTimeout(() => {
        moveToNextStep();
      }, 1000);
    } catch (err) {
      console.error("Email verification error:", err);
      setError(
        err instanceof Error ? err.message : "Email verification failed",
      );
      updateStepStatus("email-verification", "error");
    }
  };

  // Step 2: Create Wallet
  const handleCreateWallet = async (): Promise<void> => {
    try {
      updateStepStatus("create-wallet", "loading");
      setError(null);

      // If already connected, skip connection
      if (isConnected && address) {
        setWalletAddress(address);
        updateStepStatus("create-wallet", "complete");

        // Move to funding step
        setTimeout(() => {
          moveToNextStep();
          void handleDeployerFunding();
        }, 1000);
        return;
      }

      console.log("🔐 Starting Privy wallet connection...");
      const result = await connect();

      if (!result.success) {
        throw new Error(result.error || "Wallet connection failed");
      }

      console.log("✅ Privy login initiated, waiting for connection state...");

      // Wait longer for Privy to complete authentication and update state
      // Privy authentication can take a few seconds
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Poll for address with timeout
      let walletAddr: string | null = null;
      const maxAttempts = 10;
      const pollInterval = 500;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        walletAddr =
          address ||
          ("getAddress" in walletService ? walletService.getAddress() : null);

        if (walletAddr) {
          console.log(`✅ Wallet address obtained: ${walletAddr}`);
          break;
        }

        console.log(
          `⏳ Waiting for wallet address... (${attempt + 1}/${maxAttempts})`,
        );
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      if (!walletAddr) {
        throw new Error(
          "Wallet connection succeeded but address not available. Please close and reopen the wizard.",
        );
      }

      setWalletAddress(walletAddr);
      updateStepStatus("create-wallet", "complete");

      console.log("✅ Wallet creation complete, moving to funding step");

      // Automatically move to deployer funding
      setTimeout(() => {
        moveToNextStep();
        void handleDeployerFunding();
      }, 1000);
    } catch (err) {
      console.error("Wallet creation error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create wallet. Please try again.",
      );
      updateStepStatus("create-wallet", "error");
    }
  };

  // Step 3: Deployer Funding (Automatic)
  const handleDeployerFunding = useCallback(async (): Promise<void> => {
    try {
      updateStepStatus("deployer-funding", "loading");
      setError(null);

      // Show notification while wallet address is being set up
      console.log(
        "⏳ Setting up wallet... (Privy embedded wallets deploy automatically on first transaction)",
      );

      // Wait a moment for the wallet address to be fully available
      // Note: Privy embedded wallets are smart contract wallets that deploy on first transaction
      // The address exists immediately, but the contract deploys when the wallet makes its first transaction
      await new Promise((resolve) => setTimeout(resolve, 2000));

      console.log("✅ Wallet address ready - proceeding with funding");
      console.log("📬 Funding address:", walletAddress || address);

      // Call your deployer funding function
      const fundingStartTime = Date.now();
      const fundingAddress = walletAddress || address;
      console.log(`⏱️ Starting funding request at ${new Date().toISOString()}`);
      console.log(`📬 Funding address: ${fundingAddress}`);
      console.log(`🔗 API endpoint: /api/fund-new-wallet`);

      const response = await fetch("/api/fund-new-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: fundingAddress }),
      });

      console.log(
        `📡 Fetch completed after ${Date.now() - fundingStartTime}ms`,
        {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries()),
        },
      );

      const fetchDuration = Date.now() - fundingStartTime;
      console.log(`⏱️ Funding API response received after ${fetchDuration}ms`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = {
            error: `HTTP ${response.status}: ${response.statusText}`,
          };
        }
        // Log full error details for debugging
        console.error("⚠️ Funding API error:", {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error,
          details: errorData.details,
        });
        throw new Error(
          errorData.error ||
            errorData.details ||
            "Funding service temporarily unavailable. Your wallet is ready!",
        );
      }

      const data = await response.json();

      // Handle case where wallet is already funded (manual funding or previous attempt)
      if (data.alreadyFunded) {
        console.log("✅ Wallet already funded - skipping funding step");
        console.log(`💰 Current balance: ${data.balance} ETH`);
        // Don't set transaction hash since no transaction was sent
        updateStepStatus("deployer-funding", "complete");

        // Move to profile creation step
        setTimeout(() => {
          moveToNextStep();
        }, 1500);
        return;
      }

      // Normal funding flow - transaction was sent
      setDeployerFundingTx(data.transactionHash);
      updateStepStatus("deployer-funding", "complete");

      // Move to profile creation step (user will input data)
      setTimeout(() => {
        moveToNextStep();
      }, 1500);
    } catch (err) {
      console.error("Deployer funding error:", err);

      let errorMessage = "Automatic funding failed. Contact support.";

      if (err instanceof Error) {
        if (err.message.includes("PRIVATE_KEY")) {
          errorMessage =
            "Funding service not configured. Please set up the PRIVATE_KEY environment variable.";
        } else if (err.message.includes("insufficient")) {
          errorMessage =
            "Deployer wallet has insufficient funds. Please add testnet ETH to the deployer wallet.";
        } else {
          errorMessage = err.message;
        }
      }

      setError(errorMessage);
      updateStepStatus("deployer-funding", "error");
    }
  }, [walletAddress, address, moveToNextStep, updateStepStatus]);

  // Step 4: Create Profile
  const handleCreateProfile = async (): Promise<void> => {
    try {
      updateStepStatus("create-profile", "loading");
      setError(null);

      // Validate profile data
      if (
        !profileData.birthDate ||
        !profileData.sex ||
        !heightFeet ||
        !heightInches ||
        !weightLbs
      ) {
        throw new Error("Please fill in all profile fields");
      }

      // Convert imperial to total inches for height
      const feet = parseInt(heightFeet);
      const inches = parseInt(heightInches);
      const totalInches = feet * 12 + inches;

      // Convert lbs to integer
      const weightInLbs = parseInt(weightLbs);

      const healthData = {
        birthDate: profileData.birthDate,
        sex: profileData.sex,
        height: totalInches, // Store height in total inches
        weight: weightInLbs, // Store weight in pounds
        email: profileData.email,
        isActive: true,
        version: 1,
        timestamp: Date.now(),
      };

      const result = await updateHealthProfile(healthData);
      if (!result.success) {
        throw new Error(result.error || "Failed to create profile");
      }

      console.log("✅ Profile created! Transaction:", result.txHash);
      console.log("⏳ Waiting for blockchain confirmation (5 seconds)...");

      updateStepStatus("create-profile", "complete");

      // Wait for blockchain transaction to be confirmed (5 seconds)
      // This ensures the profile exists on-chain before verification
      setTimeout(async () => {
        console.log(
          "✅ Blockchain confirmation complete - reloading profile...",
        );

        // Reload profile from blockchain to update UI
        const loadResult = await loadProfileFromBlockchain();
        if (loadResult.success) {
          console.log("✅ Profile reloaded - UI should update now");
        } else {
          console.warn("⚠️ Profile reload failed:", loadResult.error);
        }

        // Check if user is already verified before auto-calling verification
        const allocationResponse = await fetch(
          `/api/verification/allocation-info?wallet=${address}`,
        );
        if (allocationResponse.ok) {
          const allocationData = await allocationResponse.json();
          if (
            allocationData.userAllocation &&
            allocationData.userAllocation.isVerified
          ) {
            console.log(
              "✅ User already verified - skipping auto-verification",
            );
            updateStepStatus("verify-profile", "complete");
            // Check if tokens were already claimed
            if (allocationData.userAllocation.hasClaimed) {
              console.log(
                "✅ Tokens already claimed - marking step as complete",
              );
              updateStepStatus("claim-tokens", "complete");
            }
            // Jump to claim tokens
            const claimStepIndex = steps.findIndex(
              (s) => s.id === "claim-tokens",
            );
            if (claimStepIndex >= 0) {
              setCurrentStepIndex(claimStepIndex);
            }
            return;
          }
        }

        // Not verified yet, proceed to verification step
        moveToNextStep();
        void handleVerifyProfile();
      }, 5000); // Increased from 1000ms to 5000ms
    } catch (err) {
      console.error("Profile creation error:", err);

      // Check if it's a wallet timeout error (Privy modal didn't show)
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isWalletTimeout =
        errorMessage.includes("Wallet timeout") ||
        errorMessage.includes("timeout");

      if (isWalletTimeout) {
        setError(
          "⚠️ Transaction approval modal didn't appear. Please check:\n" +
            "1. Allow popups for this site in your browser\n" +
            "2. Make sure you're logged in to Privy\n" +
            "3. Try clicking the button again\n\n" +
            "If the issue persists, check the debug panel at the bottom-right of the page.",
        );
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to create profile. Please try again.",
        );
      }

      updateStepStatus("create-profile", "error");
    }
  };

  // Step 5: Verify Profile
  const handleVerifyProfile = async (): Promise<void> => {
    try {
      updateStepStatus("verify-profile", "loading");
      setError(null);

      // Use the unified wallet service method
      const verifyResult = await verifyProfileZKsync(email);

      if (!verifyResult.success) {
        throw new Error(verifyResult.error || "Failed to verify profile");
      }

      console.log("✅ Profile verification successful:", verifyResult.txHash);
      console.log("⏳ Waiting for blockchain confirmation (5 seconds)...");

      // Wait for transaction to be confirmed on blockchain
      await new Promise((resolve) => setTimeout(resolve, 5000));

      console.log("✅ Verification confirmed - moving to token claim");
      updateStepStatus("verify-profile", "complete");

      setTimeout(() => {
        moveToNextStep();
        void handleClaimTokens();
      }, 1000);
    } catch (err) {
      console.error("Profile verification error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to verify profile. Please try again.",
      );
      updateStepStatus("verify-profile", "error");
    }
  };

  // Check allocation eligibility
  const checkAllocationEligibility = useCallback(async (): Promise<void> => {
    if (!address) return;

    try {
      console.log("🔍 Checking allocation eligibility for:", address);
      const response = await fetch(
        `/api/verification/allocation-info?wallet=${address}`,
      );

      // Handle non-OK responses gracefully
      if (!response.ok) {
        console.log(
          "ℹ️ Allocation API returned non-OK status (expected for new wallets)",
        );
        setAllocationInfo({
          hasAllocation: false,
          hasClaimed: false,
          amount: "0",
        });
        return;
      }

      const data = await response.json();

      if (data.userAllocation) {
        setAllocationInfo({
          hasAllocation: data.userAllocation.allocationAmount !== "0.0",
          hasClaimed: data.userAllocation.hasClaimed,
          amount: data.userAllocation.allocationAmount,
        });
        console.log("✅ Allocation check:", data.userAllocation);
      } else {
        setAllocationInfo({
          hasAllocation: false,
          hasClaimed: false,
          amount: "0",
        });
        console.log(
          "ℹ️ No allocation found for wallet (expected for new wallets)",
        );
      }
    } catch (error) {
      console.log(
        "ℹ️ Could not check allocation (expected for new wallets):",
        error instanceof Error ? error.message : error,
      );
      setAllocationInfo({
        hasAllocation: false,
        hasClaimed: false,
        amount: "0",
      });
    }
  }, [address]);

  // Step 6: Claim Tokens
  const handleClaimTokens = async (): Promise<void> => {
    try {
      updateStepStatus("claim-tokens", "loading");
      setError(null);

      // Check allocation before claiming
      await checkAllocationEligibility();

      if (!allocationInfo?.hasAllocation) {
        throw new Error("No token allocation available for this wallet");
      }

      if (allocationInfo?.hasClaimed) {
        throw new Error("Tokens have already been claimed");
      }

      // Use the unified wallet service claim allocation method
      const result = await claimAllocation();

      if (!result.success) {
        throw new Error(result.error || "Token claim failed");
      }

      console.log("✅ Tokens claim transaction submitted:", result.txHash);
      console.log("⏳ Waiting for blockchain confirmation...");

      // Wait for transaction to be confirmed on blockchain
      await new Promise((resolve) => setTimeout(resolve, 5000));

      console.log("✅ Token claim confirmed - allocation complete!");
      updateStepStatus("claim-tokens", "complete");

      // Show celebration and complete onboarding
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (err) {
      console.error("Token claim error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to claim tokens. Please try again.",
      );
      updateStepStatus("claim-tokens", "error");
    }
  };

  // Get current step
  const currentStep = steps[currentStepIndex];

  // Render step action button
  const renderStepAction = (): JSX.Element => {
    const step = currentStep;

    if (step.status === "complete") {
      return (
        <div className="flex items-center justify-center text-emerald-600 py-4">
          <CheckCircle className="h-6 w-6 mr-2" />
          <span className="font-semibold">Complete!</span>
        </div>
      );
    }

    if (step.status === "loading") {
      return (
        <Button disabled className="w-full py-6 bg-emerald-600">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          Processing...
        </Button>
      );
    }

    if (step.status === "error") {
      return (
        <Button
          onClick={() => {
            setError(null);
            // Re-trigger the current step
            switch (step.id) {
              case "email-verification":
                void handleEmailVerification();
                break;
              case "create-wallet":
                void handleCreateWallet();
                break;
              case "deployer-funding":
                void handleDeployerFunding();
                break;
              case "create-profile":
                void handleCreateProfile();
                break;
              case "verify-profile":
                void handleVerifyProfile();
                break;
              case "claim-tokens":
                void handleClaimTokens();
                break;
            }
          }}
          className="w-full py-6 bg-amber-600 hover:bg-amber-700 text-white"
        >
          Try Again
        </Button>
      );
    }

    // Active step - show appropriate action button
    switch (step.id) {
      case "email-verification":
        return (
          <div className="space-y-4">
            <div>
              <Label
                htmlFor="email"
                className="text-sm font-semibold text-emerald-900"
              >
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your whitelisted email"
                className="mt-2"
              />
            </div>
            <Button
              onClick={() => void handleEmailVerification()}
              disabled={!email}
              className="w-full py-6 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg disabled:opacity-50"
            >
              <Mail className="h-5 w-5 mr-2" />
              Verify Email
            </Button>
          </div>
        );

      case "create-wallet":
        return (
          <Button
            onClick={() => void handleCreateWallet()}
            className="w-full py-6 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
          >
            <Wallet className="h-5 w-5 mr-2" />
            Create Wallet
          </Button>
        );

      case "create-profile":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label
                  htmlFor="birthDate"
                  className="text-sm font-semibold text-emerald-900"
                >
                  Birth Date
                </Label>
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
                  className="mt-2"
                />
              </div>
              <div>
                <Label
                  htmlFor="sex"
                  className="text-sm font-semibold text-emerald-900"
                >
                  Sex
                </Label>
                <select
                  id="sex"
                  value={profileData.sex}
                  onChange={(e) =>
                    setProfileData((prev) => ({ ...prev, sex: e.target.value }))
                  }
                  className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-sm font-semibold text-emerald-900 mb-2 block">
                Height
              </Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Input
                    id="height-feet"
                    type="number"
                    min="4"
                    max="8"
                    value={heightFeet}
                    onChange={(e) => setHeightFeet(e.target.value)}
                    placeholder="Feet"
                  />
                </div>
                <div>
                  <Input
                    id="height-inches"
                    type="number"
                    min="0"
                    max="11"
                    value={heightInches}
                    onChange={(e) => setHeightInches(e.target.value)}
                    placeholder="Inches"
                  />
                </div>
              </div>
            </div>
            <div>
              <Label
                htmlFor="weight"
                className="text-sm font-semibold text-emerald-900"
              >
                Weight (lbs)
              </Label>
              <Input
                id="weight"
                type="number"
                min="50"
                max="500"
                value={weightLbs}
                onChange={(e) => setWeightLbs(e.target.value)}
                placeholder="e.g., 180"
                className="mt-2"
              />
            </div>
            <Button
              onClick={() => void handleCreateProfile()}
              disabled={
                !profileData.birthDate ||
                !profileData.sex ||
                !heightFeet ||
                !heightInches ||
                !weightLbs
              }
              className="w-full py-6 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg disabled:opacity-50"
            >
              <User className="h-5 w-5 mr-2" />
              Create Health Profile
            </Button>
          </div>
        );

      case "verify-profile":
        // Check if already verified
        if (allocationInfo?.hasAllocation) {
          return (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <p className="text-emerald-800 font-medium">
                  ✅ Your profile is already verified!
                </p>
                <p className="text-emerald-700 text-sm mt-2">
                  You can proceed to claim your tokens.
                </p>
              </div>
              <Button
                onClick={() => {
                  updateStepStatus("verify-profile", "complete");
                  const claimStepIndex = steps.findIndex(
                    (s) => s.id === "claim-tokens",
                  );
                  if (claimStepIndex >= 0) {
                    setCurrentStepIndex(claimStepIndex);
                  }
                }}
                className="w-full py-6 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
              >
                Continue to Token Claim
              </Button>
            </div>
          );
        }

        // Not verified yet - show verification button
        return (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-blue-800">
                Verify your profile on the blockchain to claim your tokens.
              </p>
            </div>
            <Button
              onClick={() => void handleVerifyProfile()}
              className="w-full py-6 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
            >
              <Shield className="h-5 w-5 mr-2" />
              Verify Profile
            </Button>
          </div>
        );

      case "claim-tokens":
        // Check if user has already claimed
        if (allocationInfo?.hasClaimed) {
          return (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <p className="text-emerald-800 font-medium">
                  ✅ You have already claimed your {allocationInfo.amount}{" "}
                  testnet AHP tokens!
                </p>
              </div>
              <Button
                onClick={() => onComplete()}
                className="w-full py-6 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
              >
                Complete Setup
              </Button>
            </div>
          );
        }

        // Check if user has allocation
        if (allocationInfo && !allocationInfo.hasAllocation) {
          return (
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-amber-800">
                ⚠️ No token allocation available for this wallet. You may be
                outside the first 5,000 users.
              </p>
              <Button
                onClick={() => onComplete()}
                className="w-full mt-4 py-4 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Continue Without Tokens
              </Button>
            </div>
          );
        }

        return (
          <div className="space-y-4">
            {allocationInfo && (
              <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <p className="text-emerald-800">
                  🎉 You are eligible for{" "}
                  <strong>{allocationInfo.amount} testnet AHP tokens</strong>!
                </p>
              </div>
            )}
            <Button
              onClick={() => void handleClaimTokens()}
              disabled={!allocationInfo}
              className="w-full py-6 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg disabled:opacity-50"
            >
              <Gift className="h-5 w-5 mr-2" />
              Claim {allocationInfo?.amount || "1,000"} Testnet AHP Tokens
            </Button>
          </div>
        );

      default:
        return (
          <div className="text-center text-amber-800/60 py-4">
            Waiting for previous steps to complete...
          </div>
        );
    }
  };

  const handleOpenChange = useCallback(
    (open: boolean): void => {
      // Only call onClose if dialog is being closed
      // Don't check isOpen here to avoid dependency loop
      if (!open) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        preventOutsideClose
        className="max-w-6xl max-h-[90vh] overflow-y-auto p-0 bg-gradient-to-br from-amber-50 via-white to-emerald-50"
      >
        <div className="p-6 sm:p-8">
          <DialogHeader className="mb-8">
            <DialogTitle className="text-3xl font-bold text-center text-emerald-900">
              Setting Up Your Health Wallet
            </DialogTitle>
            <p className="text-center text-amber-800/80 mt-2 text-lg">
              Follow these steps to complete your setup. We&apos;ll guide you
              through everything.
            </p>
          </DialogHeader>

          <div className="flex flex-col-reverse lg:grid lg:grid-cols-3 gap-6">
            {/* Left: Progress Steps */}
            <div className="lg:col-span-1 space-y-3">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-emerald-900 uppercase tracking-wide">
                  Your Progress
                </h3>
                <p className="text-xs text-amber-800/60 mt-1">
                  Click on completed steps to review or edit
                </p>
              </div>
              {steps.map((step, index) => {
                // Determine if step is clickable
                const isClickable =
                  step.status === "complete" ||
                  step.status === "active" ||
                  step.status === "error";

                return (
                  <div
                    key={step.id}
                    onClick={() => isClickable && navigateToStep(index)}
                    className={`flex items-start space-x-3 p-4 rounded-xl transition-all ${
                      step.status === "complete"
                        ? "bg-emerald-50 border-2 border-emerald-200 cursor-pointer hover:bg-emerald-100 hover:border-emerald-300"
                        : step.status === "active"
                          ? "bg-white border-2 border-emerald-400 shadow-md cursor-pointer"
                          : step.status === "loading"
                            ? "bg-amber-50 border-2 border-amber-200 cursor-not-allowed"
                            : step.status === "error"
                              ? "bg-red-50 border-2 border-red-200 cursor-pointer hover:bg-red-100 hover:border-red-300"
                              : "bg-white/50 border-2 border-gray-200 cursor-not-allowed opacity-60"
                    }`}
                  >
                    <div
                      className={`flex-shrink-0 mt-1 p-2 rounded-lg ${
                        step.status === "complete"
                          ? "bg-emerald-100"
                          : step.status === "active"
                            ? "bg-emerald-100"
                            : step.status === "loading"
                              ? "bg-amber-100"
                              : step.status === "error"
                                ? "bg-red-100"
                                : "bg-gray-100"
                      }`}
                    >
                      {step.status === "complete" ? (
                        <CheckCircle className="h-5 w-5 text-emerald-600" />
                      ) : step.status === "loading" ? (
                        <Loader2 className="h-5 w-5 text-amber-600 animate-spin" />
                      ) : step.status === "error" ? (
                        <AlertCircle className="h-5 w-5 text-red-600" />
                      ) : step.status === "active" ? (
                        <div className="text-emerald-600">{step.icon}</div>
                      ) : (
                        <div className="text-gray-400">{step.icon}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-semibold ${
                          step.status === "active"
                            ? "text-emerald-900"
                            : step.status === "complete"
                              ? "text-emerald-800"
                              : step.status === "error"
                                ? "text-red-900"
                                : "text-gray-600"
                        }`}
                      >
                        {index + 1}. {step.title.replace(/^\d+\.\s*/, "")}
                      </p>
                      <p className="text-xs text-amber-800/70 mt-1">
                        {step.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: Current Step Details */}
            <div className="lg:col-span-2">
              <Card className="border-2 border-emerald-200 shadow-xl bg-white/90 backdrop-blur-sm">
                <CardHeader className="bg-gradient-to-br from-emerald-50 to-amber-50/30 border-b-2 border-emerald-100">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="p-3 bg-emerald-100 rounded-lg">
                      {currentStep.status === "loading" ? (
                        <Loader2 className="h-6 w-6 text-emerald-600 animate-spin" />
                      ) : currentStep.status === "complete" ? (
                        <CheckCircle className="h-6 w-6 text-emerald-600" />
                      ) : (
                        <div className="text-emerald-600">
                          {currentStep.icon}
                        </div>
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-2xl text-emerald-900">
                        Step {currentStepIndex + 1} of {steps.length}
                      </CardTitle>
                      <p className="text-sm text-amber-800/80 mt-1">
                        {currentStep.title.replace(/^\d+\.\s*/, "")}
                      </p>
                    </div>
                  </div>
                  <p className="text-amber-800/90 mt-3">
                    {currentStep.description}
                  </p>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {/* Help Text */}
                  {currentStep.helpText && (
                    <Alert className="bg-emerald-50 border-emerald-200">
                      <AlertCircle className="h-4 w-4 text-emerald-600" />
                      <AlertDescription className="text-sm text-emerald-900">
                        <span className="font-semibold">💡 Tip:</span>{" "}
                        {currentStep.helpText}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Error Message */}
                  {error && (
                    <Alert className="bg-red-50 border-red-200">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-sm text-red-900">
                        <span className="font-semibold">⚠️ Error:</span> {error}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Wallet Address Display */}
                  {(walletAddress || address) && (
                    <div className="bg-emerald-50 border-2 border-emerald-200 p-4 rounded-xl">
                      <p className="text-xs font-semibold text-emerald-900 mb-2 uppercase tracking-wide">
                        Your Wallet Address
                      </p>
                      <code className="text-sm font-mono text-emerald-700 break-all">
                        {(walletAddress || address || "").slice(0, 20)}...
                        {(walletAddress || address || "").slice(-10)}
                      </code>
                    </div>
                  )}

                  {currentStep.id === "deployer-funding" &&
                    deployerFundingTx && (
                      <div className="bg-emerald-50 border-2 border-emerald-200 p-4 rounded-xl">
                        <p className="text-xs font-semibold text-emerald-900 mb-2 uppercase tracking-wide">
                          ✓ Funding Transaction
                        </p>
                        <a
                          href={`https://sepolia.explorer.zksync.io/tx/${deployerFundingTx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-emerald-600 hover:text-emerald-700 flex items-center"
                        >
                          View on Explorer
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      </div>
                    )}

                  {currentStep.id === "claim-tokens" &&
                    currentStep.status === "complete" && (
                      <div className="text-center space-y-4 py-6">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-full shadow-lg">
                          <Gift className="h-10 w-10 text-emerald-600" />
                        </div>
                        <h3 className="text-2xl font-bold text-emerald-900">
                          Congratulations! 🎉
                        </h3>
                        <p className="text-amber-800/90 text-lg">
                          You&apos;ve claimed your 1,000 testnet AHP tokens!
                        </p>
                        <div className="bg-gradient-to-br from-emerald-50 to-amber-50 border-2 border-emerald-200 p-6 rounded-xl">
                          <p className="text-sm text-emerald-900 leading-relaxed">
                            <span className="font-bold">
                              You&apos;re all set!
                            </span>{" "}
                            Your health wallet is ready, your profile is
                            encrypted and stored, and you&apos;re now a beta
                            tester for Amach Health. You&apos;ll be recognized
                            as a founding member when we launch on mainnet!
                          </p>
                        </div>
                      </div>
                    )}

                  {/* Action Button */}
                  <div className="pt-4">{renderStepAction()}</div>

                  {/* Progress Bar */}
                  <div className="pt-6">
                    <div className="flex items-center justify-between text-xs text-amber-800/80 mb-2 font-semibold">
                      <span>Overall Progress</span>
                      <span>
                        {Math.round(
                          (steps.filter((s) => s.status === "complete").length /
                            steps.length) *
                            100,
                        )}
                        %
                      </span>
                    </div>
                    <div className="w-full bg-emerald-100 rounded-full h-3 overflow-hidden border-2 border-emerald-200">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-full rounded-full transition-all duration-500 shadow-inner"
                        style={{
                          width: `${(steps.filter((s) => s.status === "complete").length / steps.length) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
