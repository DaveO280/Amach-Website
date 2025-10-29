"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowRight,
  Bot,
  CheckCircle,
  Shield,
  Upload,
  Wallet,
} from "lucide-react";
import React, { useEffect, useState } from "react";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  details?: string[];
  actionLabel?: string;
  whyItMatters?: string; // New: emotional hook explaining the impact
}

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectWallet: () => void;
  onUploadData: () => void;
  onOpenAI: () => void;
  initialStep?: number; // Optional: Start at a specific step
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onConnectWallet,
  onUploadData,
  onOpenAI,
  initialStep = 0,
}) => {
  const steps: OnboardingStep[] = [
    {
      id: "welcome",
      title: "Join Us in Building the Future of Health",
      description:
        "Insurance companies own your data. Tech giants sell it. Hospitals lock it away. Help us build a better way with Amach Health.",
      icon: <Shield className="h-12 w-12 sm:h-16 sm:w-16 text-emerald-600" />,
      details: [
        "🛡️ True data sovereignty - your keys, your data, your rules",
        "🧠 AI that works for you, not advertisers",
        "🎁 Beta testers will be recognized as founding members when we launch on mainnet",
      ],
      whyItMatters:
        "You're not just a user—you're a builder. Help us prove that health data belongs to patients, not corporations.",
      actionLabel: "Start Building",
    },
    {
      id: "wallet",
      title: "Create Your Health Wallet in 30 Seconds",
      description:
        "No complicated setup. No seed phrases to write down. Just one click with ZKsync SSO.",
      icon: <Wallet className="h-12 w-12 sm:h-16 sm:w-16 text-emerald-600" />,
      details: [
        "⚡ Instant creation with Google/Apple/Email",
        "🎁 We fund your wallet to get started (free!)",
        "🔐 Military-grade encryption protects everything",
      ],
      whyItMatters:
        "Your wallet is your identity. We make it dead simple—no crypto experience needed.",
      actionLabel: "Create Health Wallet",
    },
    {
      id: "data",
      title: "Import Your Health Story",
      description:
        "Your heart rate, sleep patterns, lab results—they tell a story. Let's make sure you're the author.",
      icon: <Upload className="h-12 w-12 sm:h-16 sm:w-16 text-emerald-600" />,
      details: [
        "📊 Apple Health, wearables, lab PDFs - all supported",
        "🔒 Encrypted before it ever leaves your device",
        "📈 Watch patterns emerge that doctors often miss",
      ],
      whyItMatters:
        "Your body has been collecting data for years. Time to put it to work for YOU.",
      actionLabel: "Import Data Later",
    },
    {
      id: "ai-rewards",
      title: "Get Your AI Coach + Founding Member Rewards",
      description:
        "Once your profile is created, you'll unlock your personal AI health companion and claim 1,000 AHP tokens as a founding member.",
      icon: <Bot className="h-12 w-12 sm:h-16 sm:w-16 text-emerald-600" />,
      details: [
        "🤖 Personal AI that learns YOUR patterns",
        "🎁 1,000 AHP tokens for early adopters",
        "🚀 Founding member benefits as we grow",
      ],
      whyItMatters:
        "You're not just using Amach—you're helping build it. Your tokens prove you were here first.",
      actionLabel: "Let's Go!",
    },
  ];

  const [activeStep, setActiveStep] = useState(initialStep);

  // Update active step when initialStep changes
  useEffect(() => {
    setActiveStep(initialStep);
  }, [initialStep]);

  const handleNext = (): void => {
    // Execute action based on step
    if (activeStep === 1) {
      onConnectWallet();
    } else if (activeStep === 2) {
      onUploadData();
    } else if (activeStep === 3) {
      onOpenAI();
    }

    // Move to next step or close
    if (activeStep < steps.length - 1) {
      setActiveStep(activeStep + 1);
    } else {
      onClose();
    }
  };

  const handleSkip = (): void => {
    onClose();
  };

  const handleBack = (): void => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <div className="p-4 sm:p-8">
          <DialogHeader className="mb-6 sm:mb-8">
            <DialogTitle className="text-2xl sm:text-3xl text-center font-bold text-amber-900">
              {steps[activeStep].title}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center space-y-6 sm:space-y-8">
            {/* Icon with animated pulse effect */}
            <div className="flex items-center justify-center animate-pulse-slow">
              {steps[activeStep].icon}
            </div>

            {/* Main Description - Larger, more prominent */}
            <p className="text-center text-lg sm:text-xl text-gray-700 max-w-2xl px-2 leading-relaxed font-medium">
              {steps[activeStep].description}
            </p>

            {/* Details List - More visual emphasis */}
            {steps[activeStep].details && (
              <div className="w-full max-w-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-6 space-y-3 border border-emerald-200 shadow-sm">
                {steps[activeStep].details.map((detail, index) => (
                  <div
                    key={index}
                    className="flex items-start space-x-3 bg-white/80 rounded-lg p-3 hover:bg-white transition-colors"
                  >
                    <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm sm:text-base text-gray-800 font-medium">
                      {detail}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Why It Matters - Emotional Hook */}
            {steps[activeStep].whyItMatters && (
              <div className="w-full max-w-xl bg-amber-50 rounded-xl p-6 border-l-4 border-amber-500">
                <p className="text-sm sm:text-base text-amber-900 italic leading-relaxed">
                  <span className="font-bold not-italic">
                    Why this matters:
                  </span>{" "}
                  {steps[activeStep].whyItMatters}
                </p>
              </div>
            )}

            {/* Progress indicator - More prominent */}
            <div className="flex space-x-3 py-4">
              {steps.map((step, index) => (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(index)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    index === activeStep
                      ? "bg-emerald-600 w-12 sm:w-16"
                      : index < activeStep
                        ? "bg-emerald-400 w-8 sm:w-10 hover:bg-emerald-500"
                        : "bg-gray-300 w-8 sm:w-10 hover:bg-gray-400"
                  }`}
                  aria-label={`Go to step ${index + 1}`}
                />
              ))}
            </div>

            {/* Step counter - More visible */}
            <div className="text-sm font-semibold text-emerald-600">
              Step {activeStep + 1} of {steps.length}
            </div>

            {/* Action buttons - More prominent CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4 w-full sm:w-auto">
              {activeStep > 0 && (
                <Button
                  variant="outline"
                  onClick={handleBack}
                  className="px-6 py-6 sm:py-7 text-base sm:text-lg border-2 order-2 sm:order-1"
                >
                  ← Back
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={handleSkip}
                className="px-6 py-6 sm:py-7 text-base sm:text-lg text-gray-600 hover:text-gray-800 order-3 sm:order-2"
              >
                {activeStep === 0 ? "Maybe Later" : "Skip Tour"}
              </Button>
              <Button
                onClick={handleNext}
                className="px-10 py-6 sm:py-7 text-base sm:text-lg font-bold bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-lg hover:shadow-xl transition-all order-1 sm:order-3 transform hover:scale-105"
              >
                {steps[activeStep].actionLabel || "Next"}
                <ArrowRight className="ml-2 h-5 w-5 sm:h-6 sm:w-6" />
              </Button>
            </div>

            {/* Social proof / trust signal */}
            {activeStep === 0 && (
              <div className="text-center pt-4">
                <p className="text-xs sm:text-sm text-gray-500">
                  🔐 Trusted by health-conscious early adopters worldwide
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
