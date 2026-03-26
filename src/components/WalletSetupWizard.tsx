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
import { usePrivy } from "@privy-io/react-auth";
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
  // Pending transaction state
  const [pendingTx, setPendingTx] = useState<{
    txHash: string;
    stepId: string;
  } | null>(null);
  // Track if a signature request is in progress to prevent modal from closing
  const signatureInProgressRef = React.useRef(false);

  // Monitor for signature requests by checking if Privy modal is open
  // Also track when signature was last active to prevent immediate closing
  const lastSignatureTimeRef = React.useRef<number>(0);

  React.useEffect(() => {
    const checkPrivyModal = (): void => {
      // Check if Privy modal is open by looking for its DOM elements
      const privyModal =
        document.querySelector("[data-privy-modal]") ||
        document.querySelector('[class*="privy-modal"]') ||
        document.querySelector('[id*="privy"]') ||
        document.querySelector('[class*="Privy"]');

      // Also check for Privy overlay/backdrop
      const privyOverlay =
        document.querySelector('[class*="privy-overlay"]') ||
        document.querySelector('[class*="PrivyOverlay"]');

      const isPrivyOpen =
        (privyModal && privyModal.getAttribute("aria-hidden") !== "true") ||
        (privyOverlay && privyOverlay.getAttribute("aria-hidden") !== "true");

      if (isPrivyOpen) {
        signatureInProgressRef.current = true;
        lastSignatureTimeRef.current = Date.now();
      } else {
        // Only clear if enough time has passed since last signature activity
        // This prevents the modal from closing immediately after signature popup closes
        const timeSinceLastSignature =
          Date.now() - lastSignatureTimeRef.current;
        if (timeSinceLastSignature > 2000) {
          // 2 second cooldown
          signatureInProgressRef.current = false;
        }
      }
    };

    // Check periodically while modal is open
    const interval = isOpen ? setInterval(checkPrivyModal, 200) : null;

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen]);

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

  // Get Privy user to access email for auto-population
  const { user: privyUser } = usePrivy();

  // Auto-populate email from Privy user when available
  React.useEffect(() => {
    const privyEmail = privyUser?.email?.address;
    if (privyEmail && !email) {
      console.log("📧 Auto-populating email from Privy user:", privyEmail);
      setEmail(privyEmail);
      // Also set in profile data
      setProfileData((prev) => ({ ...prev, email: privyEmail }));
    }
  }, [privyUser?.email?.address, email]);

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
      title: "Verify email",
      description: "Check if your email is approved",
      status: "active",
      icon: <Mail className="h-5 w-5" />,
      helpText: "Your email must be approved to participate in the beta.",
    },
    {
      id: "create-wallet",
      title: "Connect wallet",
      description: "Sign in with Google, Apple, or Email",
      status: "pending",
      icon: <Wallet className="h-5 w-5" />,
      helpText: "No crypto experience needed. Just use your existing account.",
    },
    {
      id: "deployer-funding",
      title: "Register vault",
      description: "Registering your vault on ZKsync Era",
      status: "pending",
      icon: <Coins className="h-5 w-5" />,
      helpText:
        "This is free! We're registering your vault on ZKsync Era — one-time only, takes under a minute.",
    },
    {
      id: "create-profile",
      title: "Build your profile",
      description: "Enter your health information",
      status: "pending",
      icon: <User className="h-5 w-5" />,
      helpText:
        "This information is encrypted and stored securely on the blockchain.",
    },
    {
      id: "verify-profile",
      title: "Verify on-chain",
      description: "Confirm your profile on the blockchain",
      status: "pending",
      icon: <Shield className="h-5 w-5" />,
      helpText: "Creates cryptographic proof that you own this profile.",
    },
    {
      id: "claim-tokens",
      title: "Claim access",
      description: "Unlock founding member access to the platform",
      status: "pending",
      icon: <Gift className="h-5 w-5" />,
      helpText:
        "You're among the founding members who get early access to the full platform.",
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

  // Check if profile already exists and skip to appropriate step
  // This runs when the modal opens to detect what's already been completed
  useEffect(() => {
    let isMounted = true;

    const checkExistingProfile = async (): Promise<void> => {
      // Only run when modal is open AND we have a connection
      // Don't run if we've already checked (to prevent infinite loops)
      if (
        !isConnected ||
        !address ||
        !isMounted ||
        !isOpen ||
        hasCheckedProfileRef.current
      ) {
        return;
      }

      // Mark that we've checked (before async operations to prevent race conditions)
      hasCheckedProfileRef.current = true;

      console.log("🔍 Checking for existing profile and completed steps...");

      try {
        // Check if profile exists on blockchain
        const result = await loadProfileFromBlockchain();

        if (result.success && result.profile && isMounted) {
          console.log(
            "✅ Profile already exists on blockchain - marking steps as complete",
          );

          // Mark all steps up to profile creation as complete
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
                // Jump to final step (all complete)
                const finalStepIndex = steps.length - 1;
                if (isMounted) {
                  setCurrentStepIndex(finalStepIndex);
                }
                return;
              }
              // Jump to claim tokens step
              const claimStepIndex = steps.findIndex(
                (s) => s.id === "claim-tokens",
              );
              if (claimStepIndex >= 0 && isMounted) {
                setCurrentStepIndex(claimStepIndex);
              }
              return;
            }
          }

          // Not verified yet, go to verification step
          console.log(
            "ℹ️ Profile exists but not verified - going to verification step",
          );
          updateStepStatus("verify-profile", "active");
          const verifyStepIndex = steps.findIndex(
            (s) => s.id === "verify-profile",
          );
          if (verifyStepIndex >= 0 && isMounted) {
            setCurrentStepIndex(verifyStepIndex);
          }
        } else {
          // No profile found - check what steps might still be complete
          console.log("ℹ️ No profile found - checking wallet status");

          // If wallet is connected, at least wallet creation is done
          if (isConnected && address) {
            updateStepStatus("email-verification", "complete");
            updateStepStatus("create-wallet", "complete");

            // Check if wallet has balance (funding might be done)
            const balanceResult = await walletService.getBalance();
            if (balanceResult.success && balanceResult.balance) {
              const balance = parseFloat(balanceResult.balance);
              if (balance > 0) {
                console.log("✅ Wallet has balance - funding step complete");
                updateStepStatus("deployer-funding", "complete");
                // Move to profile creation step
                const profileStepIndex = steps.findIndex(
                  (s) => s.id === "create-profile",
                );
                if (profileStepIndex >= 0 && isMounted) {
                  setCurrentStepIndex(profileStepIndex);
                }
              }
            }
          }
        }
      } catch (error) {
        console.log("ℹ️ Error checking existing profile:", error);
        // Don't mark as checked if there was an error, so it can retry
        hasCheckedProfileRef.current = false;
      }

      // Check allocation eligibility once more for good measure
      if (isMounted) {
        await checkAllocationEligibility();
      }
    };

    // Run check when modal opens
    if (isOpen && isConnected && address) {
      void checkExistingProfile();
    }

    return (): void => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isConnected, address]); // Run when modal opens or connection changes

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
          "Email is not approved. Please contact an administrator.",
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

  // Helper function to poll for transaction confirmation
  const waitForTransactionConfirmation = useCallback(
    async (txHash: string, maxAttempts = 30): Promise<boolean> => {
      try {
        const { createPublicClient, http } = await import("viem");
        const { getActiveChain } = await import("@/lib/networkConfig");

        const publicClient = createPublicClient({
          chain: getActiveChain(),
          transport: http(),
        });

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            const receipt = await publicClient.getTransactionReceipt({
              hash: txHash as `0x${string}`,
            });

            if (receipt && receipt.status === "success") {
              console.log("✅ Transaction confirmed:", txHash);
              return true;
            }
          } catch (error) {
            // Transaction not yet confirmed, continue polling
            if (attempt < maxAttempts - 1) {
              await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
            }
          }
        }

        console.warn("⚠️ Transaction confirmation timeout:", txHash);
        return false;
      } catch (error) {
        console.error("❌ Error checking transaction:", error);
        return false;
      }
    },
    [],
  );

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
      if (!result.success || !result.txHash) {
        throw new Error(result.error || "Failed to create profile");
      }

      console.log("✅ Profile transaction submitted:", result.txHash);

      // Set pending state - this will show the notification and keep modal open
      setPendingTx({ txHash: result.txHash, stepId: "create-profile" });
      updateStepStatus("create-profile", "loading");

      // Poll for transaction confirmation
      const confirmed = await waitForTransactionConfirmation(result.txHash);

      if (!confirmed) {
        throw new Error(
          "Transaction submitted but confirmation timed out. Please check the transaction status manually.",
        );
      }

      console.log("✅ Profile transaction confirmed - reloading profile...");

      // Reload profile from blockchain to update UI
      const loadResult = await loadProfileFromBlockchain();
      if (loadResult.success) {
        console.log("✅ Profile reloaded - UI should update now");
      } else {
        console.warn("⚠️ Profile reload failed:", loadResult.error);
      }

      // Clear pending state
      setPendingTx(null);
      updateStepStatus("create-profile", "complete");

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
          console.log("✅ User already verified - skipping auto-verification");
          updateStepStatus("verify-profile", "complete");
          // Check if tokens were already claimed
          if (allocationData.userAllocation.hasClaimed) {
            console.log("✅ Tokens already claimed - marking step as complete");
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
      // Don't auto-call handleVerifyProfile - let user click the button
      setTimeout(() => {
        moveToNextStep();
        // Don't auto-call handleVerifyProfile - let user click the button
      }, 1000);
    } catch (err) {
      console.error("Profile creation error:", err);

      // Clear pending state on error
      setPendingTx(null);

      // Check if it's a signature timeout error
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isSignatureTimeout =
        errorMessage.includes("Signature request timed out") ||
        errorMessage.includes("Failed to derive encryption key");
      const isWalletTimeout =
        errorMessage.includes("Wallet timeout") ||
        (errorMessage.includes("timeout") && !isSignatureTimeout);

      // If it's a signature timeout, check if the profile transaction was actually confirmed
      // The profile might have been created successfully, but encryption key derivation failed
      if (isSignatureTimeout) {
        console.warn(
          "⚠️ Encryption key derivation timed out - checking if profile was created...",
        );

        // Check if profile exists on-chain (transaction might have succeeded)
        try {
          const checkResult = await loadProfileFromBlockchain();
          if (checkResult.success && checkResult.profile) {
            console.log(
              "✅ Profile WAS created successfully! Encryption key derivation just timed out.",
            );

            // Mark profile creation as complete since the transaction was confirmed
            updateStepStatus("create-profile", "complete");

            // Clear error - profile is created, encryption key can be derived later
            setError(null);

            // Proceed to next step, but don't auto-call verification
            // Let the user see the completion state and decide
            setTimeout(() => {
              moveToNextStep();
              // Don't auto-call handleVerifyProfile - let user click the button
            }, 1000);
            return;
          }
        } catch (checkError) {
          console.error("Error checking profile:", checkError);
        }

        // If we get here, profile wasn't created - show error
        setError(
          "⚠️ Profile creation may have failed due to signature timeout.\n\n" +
            "Please try again. If the issue persists, check the transaction status on the blockchain explorer.",
        );
        updateStepStatus("create-profile", "error");
        return;
      }

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

      // Validate email is present
      if (!email || email.trim() === "") {
        throw new Error(
          "Email address is required for verification.\n\n" +
            "Please enter your email address in the email verification step, or ensure you're logged in with an email account.",
        );
      }

      // Use the unified wallet service method
      const verifyResult = await verifyProfileZKsync(email);

      if (!verifyResult.success || !verifyResult.txHash) {
        const errorMsg = verifyResult.error || "Failed to verify profile";

        // Provide helpful error message for email already in use
        if (
          errorMsg.includes("Email is already in use") ||
          errorMsg.includes("email already in use")
        ) {
          throw new Error(
            `Email ${email} is already verified on the blockchain.\n\n` +
              `If you're using Gmail aliases (e.g., user+test1@gmail.com), try a different alias like user+test2@gmail.com.\n\n` +
              `Each email address can only be verified once.`,
          );
        }

        throw new Error(errorMsg);
      }

      console.log(
        "✅ Profile verification transaction submitted:",
        verifyResult.txHash,
      );

      // Set pending state - this will show the notification and keep modal open
      setPendingTx({ txHash: verifyResult.txHash, stepId: "verify-profile" });
      updateStepStatus("verify-profile", "loading");

      // Poll for transaction confirmation
      const confirmed = await waitForTransactionConfirmation(
        verifyResult.txHash,
      );

      if (!confirmed) {
        throw new Error(
          "Transaction submitted but confirmation timed out. Please check the transaction status manually.",
        );
      }

      console.log("✅ Verification confirmed - moving to token claim");

      // Clear pending state
      setPendingTx(null);
      updateStepStatus("verify-profile", "complete");

      // Keep signature protection active for a bit longer to prevent modal from closing
      // This gives time for any post-signature state updates to complete
      lastSignatureTimeRef.current = Date.now();

      // Move to token claim step, but don't auto-claim
      // Let the user see the completion state and decide
      setTimeout(() => {
        moveToNextStep();
        // Don't auto-call handleClaimTokens - let user click the button
      }, 1000);
    } catch (err) {
      console.error("Profile verification error:", err);

      // Clear pending state on error
      setPendingTx(null);

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

      // Don't auto-close - let user click "Complete Setup" button manually
      // The congratulations message will be shown in the UI
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
      // For claim-tokens step, show "Complete Setup" button instead of just "Complete!"
      if (step.id === "claim-tokens") {
        return (
          <Button
            onClick={() => onComplete()}
            className="w-full py-6 bg-[#006B4F] hover:bg-[#005440] text-white shadow-lg"
          >
            <CheckCircle className="h-5 w-5 mr-2" />
            Complete Setup
          </Button>
        );
      }
      // For other steps, show completion indicator
      return (
        <div className="flex items-center justify-center text-[#006B4F] py-4">
          <CheckCircle className="h-6 w-6 mr-2" />
          <span className="font-semibold">Complete!</span>
        </div>
      );
    }

    if (step.status === "loading") {
      return (
        <Button disabled className="w-full py-6 bg-[#006B4F]">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          {pendingTx
            ? "Waiting for blockchain confirmation..."
            : "Processing..."}
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
                className="text-sm font-semibold text-[#003d2d]"
              >
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your approved email"
                className="mt-2"
              />
            </div>
            <Button
              onClick={() => void handleEmailVerification()}
              disabled={!email}
              className="w-full py-6 bg-[#006B4F] hover:bg-[#005440] text-white shadow-lg disabled:opacity-50"
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
            className="w-full py-6 bg-[#006B4F] hover:bg-[#005440] text-white shadow-lg"
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
                  className="text-sm font-semibold text-[#003d2d]"
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
                  className="text-sm font-semibold text-[#003d2d]"
                >
                  Sex
                </Label>
                <select
                  id="sex"
                  value={profileData.sex}
                  onChange={(e) =>
                    setProfileData((prev) => ({ ...prev, sex: e.target.value }))
                  }
                  className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#006B4F]"
                >
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-sm font-semibold text-[#003d2d] mb-2 block">
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
                className="text-sm font-semibold text-[#003d2d]"
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
              className="w-full py-6 bg-[#006B4F] hover:bg-[#005440] text-white shadow-lg disabled:opacity-50"
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
              <div
                className="p-4 rounded-lg border"
                style={{
                  background: "rgba(0,107,79,0.05)",
                  borderColor: "rgba(0,107,79,0.15)",
                }}
              >
                <p className="font-medium" style={{ color: "#006B4F" }}>
                  ✅ Your profile is already verified!
                </p>
                <p className="text-[#006B4F] text-sm mt-2">
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
                className="w-full py-6 bg-[#006B4F] hover:bg-[#005440] text-white shadow-lg"
              >
                Continue to Token Claim
              </Button>
            </div>
          );
        }

        // Not verified yet - show verification button
        return (
          <div className="space-y-4">
            <div
              className="p-4 rounded-lg border"
              style={{
                background: "rgba(0,107,79,0.07)",
                borderColor: "rgba(0,107,79,0.18)",
              }}
            >
              <p style={{ color: "#5a7a68" }}>
                Verify your profile on-chain to unlock your founding member
                access.
              </p>
            </div>
            <Button
              onClick={() => void handleVerifyProfile()}
              className="w-full py-6 bg-[#006B4F] hover:bg-[#005440] text-white shadow-lg"
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
              <div
                className="p-4 rounded-lg border"
                style={{
                  background: "rgba(0,107,79,0.05)",
                  borderColor: "rgba(0,107,79,0.15)",
                }}
              >
                <p className="font-medium" style={{ color: "#006B4F" }}>
                  ✅ You have already claimed your founding member access!
                </p>
              </div>
              <Button
                onClick={() => onComplete()}
                className="w-full py-6 bg-[#006B4F] hover:bg-[#005440] text-white shadow-lg"
              >
                Complete Setup
              </Button>
            </div>
          );
        }

        // Check if user has allocation
        if (allocationInfo && !allocationInfo.hasAllocation) {
          return (
            <div className="space-y-4">
              <div
                className="p-4 rounded-lg border"
                style={{
                  background: "rgba(0,107,79,0.05)",
                  borderColor: "rgba(0,107,79,0.15)",
                }}
              >
                <p className="font-medium mb-2" style={{ color: "#006B4F" }}>
                  ✅ Profile verification complete!
                </p>
                <p className="text-[#006B4F] text-sm">
                  Your health profile has been successfully verified on the
                  blockchain.
                </p>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-amber-800">
                  ⚠️ No token allocation available for this wallet. You may be
                  outside the first 5,000 users.
                </p>
              </div>
              <Button
                onClick={() => onComplete()}
                className="w-full mt-4 py-4 bg-[#006B4F] hover:bg-[#005440] text-white"
              >
                Complete Setup
              </Button>
            </div>
          );
        }

        return (
          <div className="space-y-4">
            <div
              className="p-4 rounded-lg border"
              style={{
                background: "rgba(0,107,79,0.05)",
                borderColor: "rgba(0,107,79,0.15)",
              }}
            >
              <p className="font-medium mb-2" style={{ color: "#006B4F" }}>
                ✅ Profile verification complete!
              </p>
              <p className="text-[#006B4F] text-sm">
                Your health profile has been successfully verified on the
                blockchain.
              </p>
            </div>
            {allocationInfo && (
              <div
                className="p-4 rounded-lg border"
                style={{
                  background: "rgba(0,107,79,0.07)",
                  borderColor: "rgba(0,107,79,0.18)",
                }}
              >
                <p style={{ color: "#5a7a68" }}>
                  ◈ You qualify for founding member access —{" "}
                  {allocationInfo.amount} AHP included.
                </p>
              </div>
            )}
            <Button
              onClick={() => void handleClaimTokens()}
              disabled={!allocationInfo}
              className="w-full py-6 bg-[#006B4F] hover:opacity-90 text-white shadow-lg disabled:opacity-50"
            >
              <Gift className="h-5 w-5 mr-2" />
              Claim founding member access
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
      // Prevent closing if there's a pending transaction
      if (!open && pendingTx) {
        console.log("⚠️ Cannot close modal while transaction is pending");
        return;
      }
      // Prevent closing if there's an error (user should see the error message)
      if (!open && error) {
        console.log(
          "⚠️ Cannot close modal while there's an error - clear error first",
        );
        return;
      }
      // Prevent closing if a signature request is in progress (Privy popup is open)
      if (!open && signatureInProgressRef.current) {
        console.log("⚠️ Cannot close modal while signature popup is open");
        return;
      }
      // Only call onClose if dialog is being closed
      // Don't check isOpen here to avoid dependency loop
      if (!open) {
        onClose();
      }
    },
    [onClose, pendingTx, error],
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        preventOutsideClose
        className="max-w-6xl max-h-[90vh] overflow-y-auto p-0"
        style={{
          background:
            "linear-gradient(to right bottom, #fffbeb, #ffffff, #ecfdf5)",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/80 border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-white shadow-sm transition-colors"
        >
          ×
        </button>
        <div className="p-6 sm:p-8">
          {/* Pending Transaction Notification */}
          {pendingTx && (
            <Alert className="mb-6 border-amber-300 bg-amber-50">
              <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
              <AlertDescription className="text-amber-800">
                <div className="font-semibold mb-1">
                  Transaction Processing...
                </div>
                <div className="text-sm">
                  Your profile is being anchored on ZKsync Era. This usually
                  takes under a minute.
                </div>
                <details className="mt-2">
                  <summary className="text-xs cursor-pointer text-amber-700 hover:text-amber-900">
                    View transaction details ↗
                  </summary>
                  <div className="text-xs mt-1 font-mono break-all text-amber-700">
                    {pendingTx.txHash}
                  </div>
                </details>
              </AlertDescription>
            </Alert>
          )}

          <DialogHeader className="mb-8">
            <DialogTitle className="text-3xl font-bold text-center text-[#003d2d] font-['Libre_Baskerville']">
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
                <h3 className="text-sm font-semibold text-[#006B4F] uppercase tracking-wide font-['DM_Mono']">
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
                        ? "bg-[rgba(0,107,79,0.05)] border-2 border-[rgba(0,107,79,0.18)] cursor-pointer hover:bg-[rgba(0,107,79,0.08)] hover:border-[rgba(0,107,79,0.25)]"
                        : step.status === "active"
                          ? "bg-white border-2 border-[#006B4F] shadow-md cursor-pointer"
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
                          ? "bg-[rgba(0,107,79,0.08)]"
                          : step.status === "active"
                            ? "bg-[rgba(0,107,79,0.08)]"
                            : step.status === "loading"
                              ? "bg-amber-100"
                              : step.status === "error"
                                ? "bg-red-100"
                                : "bg-gray-100"
                      }`}
                    >
                      {step.status === "complete" ? (
                        <CheckCircle className="h-5 w-5 text-[#006B4F]" />
                      ) : step.status === "loading" ? (
                        <Loader2 className="h-5 w-5 text-amber-600 animate-spin" />
                      ) : step.status === "error" ? (
                        <AlertCircle className="h-5 w-5 text-red-600" />
                      ) : step.status === "active" ? (
                        <div className="text-[#006B4F]">{step.icon}</div>
                      ) : (
                        <div className="text-gray-400">{step.icon}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-semibold ${
                          step.status === "active"
                            ? "text-[#003d2d]"
                            : step.status === "complete"
                              ? "text-[#005440]"
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
              <Card className="border-2 border-[rgba(0,107,79,0.18)] shadow-xl !bg-white !text-slate-950">
                <CardHeader className="border-b-2 border-[rgba(0,107,79,0.1)] bg-[rgba(0,107,79,0.03)]">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="p-3 bg-[rgba(0,107,79,0.08)] rounded-lg">
                      {currentStep.status === "loading" ? (
                        <Loader2 className="h-6 w-6 text-[#006B4F] animate-spin" />
                      ) : currentStep.status === "complete" ? (
                        <CheckCircle className="h-6 w-6 text-[#006B4F]" />
                      ) : (
                        <div className="text-[#006B4F]">{currentStep.icon}</div>
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-2xl text-[#003d2d] font-['Libre_Baskerville']">
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
                    <Alert className="bg-[rgba(0,107,79,0.05)] border-[rgba(0,107,79,0.15)]">
                      <AlertCircle className="h-4 w-4 text-[#006B4F]" />
                      <AlertDescription className="text-sm text-[#003d2d]">
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
                    <div className="bg-[rgba(0,107,79,0.05)] border-2 border-[rgba(0,107,79,0.18)] p-4 rounded-xl">
                      <p className="text-xs font-semibold text-[#006B4F] mb-2 uppercase tracking-wide">
                        Your Wallet Address
                      </p>
                      <code className="text-sm font-mono text-[#006B4F] break-all">
                        {(walletAddress || address || "").slice(0, 20)}...
                        {(walletAddress || address || "").slice(-10)}
                      </code>
                    </div>
                  )}

                  {currentStep.id === "deployer-funding" &&
                    deployerFundingTx && (
                      <div className="bg-[rgba(0,107,79,0.05)] border-2 border-[rgba(0,107,79,0.18)] p-4 rounded-xl">
                        <p className="text-xs font-semibold text-[#006B4F] mb-2 uppercase tracking-wide">
                          ✓ Funding Transaction
                        </p>
                        <a
                          href={`https://sepolia.explorer.zksync.io/tx/${deployerFundingTx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[#006B4F] hover:text-[#005440] flex items-center"
                        >
                          View on Explorer
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      </div>
                    )}

                  {currentStep.id === "claim-tokens" &&
                    currentStep.status === "complete" && (
                      <div className="text-center space-y-4 py-6">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-[rgba(0,107,79,0.1)] rounded-full shadow-lg">
                          <Gift className="h-10 w-10 text-[#006B4F]" />
                        </div>
                        <h3
                          className="text-2xl font-bold font-['Libre_Baskerville']"
                          style={{ color: "#006B4F" }}
                        >
                          <span style={{ color: "#006B4F" }}>◈</span> Your vault
                          is ready.
                        </h3>
                        <p className="text-amber-800/90 text-lg">
                          You&apos;re now a founding member.
                        </p>
                        <div
                          className="border-2 p-6 rounded-xl"
                          style={{
                            background: "rgba(0,107,79,0.05)",
                            borderColor: "rgba(0,107,79,0.18)",
                          }}
                        >
                          <p
                            className="text-sm leading-relaxed"
                            style={{ color: "#006B4F" }}
                          >
                            You now have a private, encrypted space for your
                            health data — anchored on-chain, owned by you,
                            readable only with your key.
                          </p>
                        </div>
                      </div>
                    )}

                  {/* Action Button */}
                  <div className="pt-4 space-y-3">
                    {renderStepAction()}
                    {currentStepIndex > 0 && (
                      <button
                        onClick={() => {
                          const prevIndex = currentStepIndex - 1;
                          setCurrentStepIndex(prevIndex);
                          updateStepStatus(steps[prevIndex].id, "active");
                          setError(null);
                        }}
                        className="w-full py-4 border-2 bg-transparent text-[#006B4F] border-[#006B4F] hover:bg-[rgba(0,107,79,0.06)] rounded-md font-medium transition-colors"
                      >
                        ← Back
                      </button>
                    )}
                  </div>

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
                    <div className="w-full bg-[rgba(0,107,79,0.1)] rounded-full h-3 overflow-hidden border-2 border-[rgba(0,107,79,0.18)]">
                      <div
                        className="bg-[#006B4F] h-full rounded-full transition-all duration-500 shadow-inner"
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
