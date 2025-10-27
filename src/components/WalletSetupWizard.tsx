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
import { useZkSyncSsoWallet } from "@/hooks/useZkSyncSsoWallet";
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
import React, { useCallback, useState } from "react";

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

  // Email and profile data
  const [email, setEmail] = useState("");
  const [profileData, setProfileData] = useState<HealthProfileData>({
    birthDate: "",
    sex: "",
    height: 0,
    weight: 0,
    email: "",
  });
  const { isConnected, address, connect, updateHealthProfile } =
    useZkSyncSsoWallet();

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
      title: "Initial Wallet Funding",
      description: "We add starter funds to your wallet",
      status: "pending",
      icon: <Coins className="h-5 w-5" />,
      helpText:
        "This is free! We fund your wallet so you can get started immediately.",
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

  // Email verification functions
  const checkEmailWhitelist = async (email: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/verification/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      return data.canProceed || false;
    } catch (error) {
      console.error("Failed to check email whitelist:", error);
      return false;
    }
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

      const result = await connect();

      if (!result.success) {
        throw new Error(result.error || "Wallet connection failed");
      }

      // Wait a moment for the connection state to sync
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Get address from service if state hasn't updated yet
      const { zkSyncSsoWalletService } = await import(
        "@/services/ZkSyncSsoWalletService"
      );
      const walletAddr = address || zkSyncSsoWalletService.getAddress();

      if (!walletAddr) {
        throw new Error("Wallet connection failed - no address available");
      }

      setWalletAddress(walletAddr);
      updateStepStatus("create-wallet", "complete");

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

      // Call your deployer funding function
      const response = await fetch("/api/fund-new-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress || address }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Funding failed");
      }

      const data = await response.json();
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
        !profileData.height ||
        !profileData.weight
      ) {
        throw new Error("Please fill in all profile fields");
      }

      const healthData = {
        birthDate: profileData.birthDate,
        sex: profileData.sex,
        height: profileData.height,
        weight: profileData.weight,
        email: profileData.email,
        isActive: true,
        version: 1,
        timestamp: Date.now(),
      };

      const result = await updateHealthProfile(healthData);
      if (!result.success) {
        throw new Error(result.error || "Failed to create profile");
      }

      updateStepStatus("create-profile", "complete");
      setTimeout(() => {
        moveToNextStep();
        void handleVerifyProfile();
      }, 1000);
    } catch (err) {
      console.error("Profile creation error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create profile. Please try again.",
      );
      updateStepStatus("create-profile", "error");
    }
  };

  // Step 5: Verify Profile
  const handleVerifyProfile = async (): Promise<void> => {
    try {
      updateStepStatus("verify-profile", "loading");
      setError(null);

      // Import the service and use its method
      const { zkSyncSsoWalletService } = await import(
        "@/services/ZkSyncSsoWalletService"
      );
      const verifyResult =
        await zkSyncSsoWalletService.verifyProfileZKsync(email);

      if (!verifyResult.success) {
        throw new Error(verifyResult.error || "Failed to verify profile");
      }

      console.log("✅ Profile verification successful:", verifyResult.txHash);

      // Wait for transaction to be processed
      await new Promise((resolve) => setTimeout(resolve, 3000));

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

  // Step 6: Claim Tokens
  const handleClaimTokens = async (): Promise<void> => {
    try {
      updateStepStatus("claim-tokens", "loading");
      setError(null);

      // Use the existing wallet service claim allocation method
      const { zkSyncSsoWalletService } = await import(
        "@/services/ZkSyncSsoWalletService"
      );
      const result = await zkSyncSsoWalletService.claimAllocation();

      if (!result.success) {
        throw new Error(result.error || "Token claim failed");
      }

      console.log(
        "✅ Tokens claimed successfully! Transaction:",
        result.txHash,
      );

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
            Create Wallet with ZKsync SSO
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label
                  htmlFor="height"
                  className="text-sm font-semibold text-emerald-900"
                >
                  Height (cm)
                </Label>
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
                  placeholder="170"
                  className="mt-2"
                />
              </div>
              <div>
                <Label
                  htmlFor="weight"
                  className="text-sm font-semibold text-emerald-900"
                >
                  Weight (kg)
                </Label>
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
                  placeholder="70"
                  className="mt-2"
                />
              </div>
            </div>
            <Button
              onClick={() => void handleCreateProfile()}
              disabled={
                !profileData.birthDate ||
                !profileData.sex ||
                !profileData.height ||
                !profileData.weight
              }
              className="w-full py-6 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg disabled:opacity-50"
            >
              <User className="h-5 w-5 mr-2" />
              Create Health Profile
            </Button>
          </div>
        );

      case "claim-tokens":
        return (
          <Button
            onClick={() => void handleClaimTokens()}
            className="w-full py-6 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg"
          >
            <Gift className="h-5 w-5 mr-2" />
            Claim 1,000 Testnet AHP Tokens
          </Button>
        );

      default:
        return (
          <div className="text-center text-amber-800/60 py-4">
            Waiting for previous steps to complete...
          </div>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0 bg-gradient-to-br from-amber-50 via-white to-emerald-50">
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

          <div className="grid lg:grid-cols-3 gap-6">
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
