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
  titleItalic?: string; // For Libre Baskerville italic portion
  description: string;
  icon: React.ReactNode;
  details?: string[];
  actionLabel?: string;
  whyItMatters?: string;
  infoBox?: string; // Info box content
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
      title: "Your health data belongs to you.",
      description:
        "Your health data tells a complete story. Today, that story is scattered — across clinics, apps, devices, and systems that don't talk to each other. Amach gives it one home. One vault. One key. Yours.",
      icon: (
        <Shield
          className="h-12 w-12 sm:h-14 sm:w-14"
          style={{ color: "#006B4F" }}
        />
      ),
      details: [
        "True data sovereignty — your keys, your data, your rules",
        "AI that works for you, not advertisers",
        "Beta testers will be recognized as founding members at mainnet launch",
      ],
      actionLabel: "Begin →",
    },
    {
      id: "how-it-works",
      title: "Built around your sovereignty.",
      description:
        "Amach is designed from the ground up so that your health data is yours — encrypted, private, and only readable with your key.",
      icon: (
        <Wallet
          className="h-12 w-12 sm:h-16 sm:w-16"
          style={{ color: "#006B4F" }}
        />
      ),
      details: [
        "Encrypted vault on Storj — nobody else can read it",
        "Blockchain-anchored identity on ZKsync Era",
        "Luma, your health intelligence — reads only what you share",
      ],
      actionLabel: "Next →",
    },
    {
      id: "upload",
      title: "One vault for all of it.",
      description:
        "Your heart rate, sleep patterns, lab results — they tell a story. Let's make sure you're the author.",
      icon: (
        <Upload
          className="h-12 w-12 sm:h-16 sm:w-16"
          style={{ color: "#006B4F" }}
        />
      ),
      details: [
        "Apple Health, wearables, lab PDFs — all supported",
        "Encrypted before it ever leaves your device",
        "Watch patterns emerge that doctors often miss",
      ],
      actionLabel: "Next →",
    },
    {
      id: "ai-rewards",
      title: "Meet",
      titleItalic: "Luma.",
      description:
        "Luma reads your health data — bloodwork, sleep, activity, cardiovascular — and connects the dots. She doesn't diagnose. She gives you the full picture, in plain language, so you can have better conversations with the people who matter.",
      icon: (
        <Bot
          className="h-12 w-12 sm:h-16 sm:w-16"
          style={{ color: "#006B4F" }}
        />
      ),
      details: [
        "Your health intelligence",
        "Private — reads only what you've uploaded",
        "Explains findings in plain language",
      ],
      infoBox:
        "Only data you've uploaded. She works within your encrypted vault — nothing leaves, nothing is shared without you.",
      actionLabel: "Set up your vault →",
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

  const currentStep = steps[activeStep];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto p-0"
        style={{
          background:
            "linear-gradient(to right bottom, #fffbeb, #ffffff, #ecfdf5)",
        }}
      >
        <div className="p-4 sm:p-8">
          <DialogHeader className="mb-5 sm:mb-6">
            <DialogTitle className="text-2xl sm:text-3xl text-center font-bold text-amber-900 font-['Libre_Baskerville']">
              {currentStep.titleItalic ? (
                <>
                  {currentStep.title} <em>{currentStep.titleItalic}</em>
                </>
              ) : (
                currentStep.title
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center space-y-5 sm:space-y-6">
            {/* Icon */}
            <div className="flex items-center justify-center">
              {currentStep.icon}
            </div>

            {/* Luma card (step 4 only) */}
            {currentStep.id === "ai-rewards" && (
              <div className="w-full max-w-xl border border-[rgba(0,107,79,0.18)] rounded-xl p-5 bg-[rgba(0,107,79,0.04)] flex items-center gap-4">
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold"
                  style={{ backgroundColor: "#006B4F" }}
                >
                  L
                </div>
                <div>
                  <p className="font-semibold text-gray-900 font-['Libre_Baskerville']">
                    Luma
                  </p>
                  <p className="text-sm text-[#5a7a68]">
                    Your health intelligence
                  </p>
                </div>
              </div>
            )}

            {/* Main Description */}
            <p className="text-center text-lg sm:text-xl text-gray-700 max-w-2xl px-2 leading-relaxed">
              {currentStep.description}
            </p>

            {/* Details List */}
            {currentStep.details && (
              <div
                className="w-full max-w-xl rounded-xl p-5 space-y-3 border"
                style={{
                  background: "rgba(0,107,79,0.05)",
                  borderColor: "rgba(0,107,79,0.15)",
                }}
              >
                {currentStep.details.map((detail, index) => (
                  <div
                    key={index}
                    className="flex items-start space-x-3 bg-white/80 rounded-lg p-3"
                  >
                    <CheckCircle
                      className="h-5 w-5 flex-shrink-0 mt-0.5"
                      style={{ color: "#006B4F" }}
                    />
                    <span className="text-sm sm:text-base text-gray-800 font-medium">
                      {detail}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Info box (step 4 only) */}
            {currentStep.infoBox && (
              <div
                className="w-full max-w-xl rounded-xl p-5 border"
                style={{
                  background: "rgba(0,107,79,0.07)",
                  borderColor: "rgba(0,107,79,0.18)",
                }}
              >
                <p className="text-sm text-[#5a7a68] leading-relaxed">
                  {currentStep.infoBox}
                </p>
              </div>
            )}

            {/* Progress dots */}
            <div className="flex space-x-3 py-2">
              {steps.map((step, index) => (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(index)}
                  className="h-2.5 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor:
                      index === activeStep
                        ? "#006B4F"
                        : index < activeStep
                          ? "rgba(0,107,79,0.4)"
                          : "rgba(0,107,79,0.18)",
                    width: index === activeStep ? "3rem" : "2rem",
                  }}
                  aria-label={`Go to step ${index + 1}`}
                />
              ))}
            </div>

            {/* Step counter */}
            <div className="text-sm font-semibold" style={{ color: "#006B4F" }}>
              Step {activeStep + 1} of {steps.length}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-3 w-full sm:w-auto">
              {activeStep > 0 && (
                <button
                  onClick={handleBack}
                  className="px-4 py-2 border-2 bg-transparent text-[#006B4F] border-[#006B4F] hover:bg-[rgba(0,107,79,0.06)] rounded-md font-medium transition-colors text-sm order-2 sm:order-1"
                >
                  ← Back
                </button>
              )}
              <Button
                variant="ghost"
                onClick={handleSkip}
                className="px-6 py-3 sm:py-4 text-base sm:text-lg text-gray-600 hover:text-gray-800 order-3 sm:order-2"
              >
                {activeStep === 0 ? "Maybe Later" : "Skip Tour"}
              </Button>
              <Button
                onClick={handleNext}
                className="px-10 py-3 sm:py-4 text-base sm:text-lg font-bold text-white shadow-lg hover:opacity-90 transition-opacity order-1 sm:order-3"
                style={{ backgroundColor: "#006B4F" }}
              >
                {currentStep.actionLabel || "Next"}
                <ArrowRight className="ml-2 h-5 w-5 sm:h-6 sm:w-6" />
              </Button>
            </div>

            {/* Learn how link on step 1 */}
            {activeStep === 0 && (
              <div className="text-center pt-2">
                <button
                  onClick={() => setActiveStep(1)}
                  className="text-sm underline underline-offset-2"
                  style={{ color: "#006B4F" }}
                >
                  Learn how it works first
                </button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
