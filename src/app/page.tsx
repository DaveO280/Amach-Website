"use client";

import AiCompanionModal from "@/components/AiCompanionModal";
import BetaNotification from "@/components/BetaNotification"; // Import the new component
import HealthDashboardModal from "@/components/HealthDashboardModal";
import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { OnboardingModal } from "@/components/OnboardingModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WalletSetupWizard } from "@/components/WalletSetupWizard";
import { ZkSyncSsoWalletButton } from "@/components/ZkSyncSsoWalletButton";
import { Brain, Leaf, Lock, Menu, Sparkles, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

const MainPage: React.FC = (): JSX.Element => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeCard, setActiveCard] = useState(0);

  // Use the shared context instead of local state
  const {
    isDashboardOpen,
    setIsDashboardOpen,
    isAiCompanionOpen,
    setIsAiCompanionOpen,
  } = useHealthDataContext();

  // Keep the beta notification state local
  const [showBetaNotification, setShowBetaNotification] = useState(false);

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingInitialStep, setOnboardingInitialStep] = useState(0);

  // Wallet wizard state
  const [showWalletWizard, setShowWalletWizard] = useState(false);

  // Check if user has seen onboarding
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem("amach-onboarding-complete");
    if (!hasSeenOnboarding) {
      // Show onboarding after a brief delay for better UX
      const timer = setTimeout(() => {
        setShowOnboarding(true);
      }, 500);
      return (): void => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const handleResize = (): void => {
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return (): void => {
      return window.removeEventListener("resize", handleResize);
    };
  }, []);

  const cards = [
    {
      icon: Brain,
      title: "AI Integration",
      description:
        "Leveraging advanced AI to analyze health patterns and provide personalized insights",
    },
    {
      icon: Leaf,
      title: "Holistic Health",
      description:
        "Bridging traditional wisdom with modern health data analytics",
    },
    {
      icon: Lock,
      title: "Data Sovereignty",
      description:
        "Encrypted storage on IPFS with zkSync verification for complete data control",
    },
  ];

  useEffect(() => {
    const timer = setInterval((): void => {
      setActiveCard((current: number): number => (current + 1) % cards.length);
    }, 4000);
    return (): void => clearInterval(timer);
  }, [cards.length]);

  const navItems = [
    { label: "How it Works", href: "/how-it-works" },
    { label: "Mission", href: "/mission" },
    { label: "Whitepaper", href: "/whitepaper" },
  ];

  // Allow users to restart the tour
  const restartOnboarding = (): void => {
    setShowOnboarding(true);
  };

  // Handler to show notification instead of directly opening dashboard
  const handleDashboardClick = (): void => {
    setShowBetaNotification(true);
    setIsMobileMenuOpen(false);
    const clickEvent = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    document.body.dispatchEvent(clickEvent);
  };

  // Only open dashboard after notification is dismissed with "Got it" button
  const openDashboard = (): void => {
    setIsDashboardOpen(true);
  };

  // Handle onboarding close
  const handleOnboardingClose = (): void => {
    setShowOnboarding(false);
    localStorage.setItem("amach-onboarding-complete", "true");
  };

  // Onboarding action handlers
  const handleOnboardingConnectWallet = (): void => {
    // Close onboarding and open the wallet setup wizard
    handleOnboardingClose();
    setShowWalletWizard(true);
  };

  const handleOnboardingUploadData = (): void => {
    handleOnboardingClose();
    handleDashboardClick();
  };

  const handleOnboardingOpenAI = (): void => {
    handleOnboardingClose();
    setIsAiCompanionOpen(true);
  };

  // Wizard completion handler
  const handleWizardComplete = (): void => {
    setShowWalletWizard(false);
    // After completing wizard, show onboarding modal at step 3 (Upload Health Data)
    setShowOnboarding(true);
    setOnboardingInitialStep(2); // Step 3 is index 2
    // Store completion in localStorage
    localStorage.setItem("amach-wallet-setup-complete", "true");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50">
      {/* Onboarding modal for first-time users */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={handleOnboardingClose}
        onConnectWallet={handleOnboardingConnectWallet}
        initialStep={onboardingInitialStep}
        onUploadData={handleOnboardingUploadData}
        onOpenAI={handleOnboardingOpenAI}
      />

      {/* Wallet Setup Wizard */}
      <WalletSetupWizard
        isOpen={showWalletWizard}
        onClose={() => setShowWalletWizard(false)}
        onComplete={handleWizardComplete}
      />

      {/* Health dashboard modal */}
      <HealthDashboardModal
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
      />

      {/* AI Companion modal */}
      <AiCompanionModal
        isOpen={isAiCompanionOpen}
        onClose={() => setIsAiCompanionOpen(false)}
      />

      {/* Beta notification component */}
      <BetaNotification
        isOpen={showBetaNotification}
        onClose={() => setShowBetaNotification(false)}
        onConfirm={openDashboard} // Open dashboard after notification is dismissed
      />

      <header className="border-b border-amber-100 relative">
        <div className="container mx-auto py-4">
          <div className="flex justify-between items-center max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <div className="flex items-center space-x-3">
                  <h1 className="text-2xl font-black text-emerald-900 whitespace-nowrap">
                    Amach Health
                  </h1>
                  <span className="text-base md:text-lg lg:text-xl font-normal italic text-emerald-900 hidden sm:inline-block">
                    - &quot;Driven by Data, Guided by Nature&quot;
                  </span>
                </div>
                {/* Powered by Venice */}
                <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-800/60">
                  <span>Powered by</span>
                  <a
                    href="https://venice.ai/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Visit Venice AI website"
                    className="inline-flex cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault();
                      try {
                        window.open(
                          "https://venice.ai/",
                          "_blank",
                          "noopener,noreferrer",
                        );
                      } catch {
                        window.location.href = "https://venice.ai/";
                      }
                    }}
                  >
                    <Image
                      src="/venice-logo/Venice Lockup SVG/venice-logo-lockup-black.svg"
                      alt="Venice AI"
                      width={60}
                      height={15}
                      className="opacity-60 hover:opacity-100 transition-opacity"
                    />
                  </a>
                </div>
              </div>
              {/* Removed wallet status indicator on main page */}
            </div>

            <nav className="hidden md:flex items-center justify-end w-1/2">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center space-x-16 ml-auto mr-16">
                  {navItems.map((item) => (
                    <a
                      key={item.label}
                      href={item.href}
                      className="text-amber-900 hover:text-emerald-600"
                    >
                      {item.label}
                    </a>
                  ))}
                </div>

                {/* ZKsync SSO Wallet Connection Component */}
                <ZkSyncSsoWalletButton
                  onDashboardClick={handleDashboardClick}
                  onAiCompanionClick={() => setIsAiCompanionOpen(true)}
                />
              </div>
            </nav>

            <Button
              variant="outline"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        <div
          className={`absolute left-0 right-0 bg-white shadow-lg transition-all duration-300 ease-in-out z-50 border-b border-amber-100 ${
            isMobileMenuOpen
              ? "opacity-100 translate-y-0"
              : "opacity-0 -translate-y-2 pointer-events-none"
          } md:hidden`}
        >
          <div className="container mx-auto py-4 px-4 space-y-4">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="block text-lg text-amber-900 hover:text-emerald-600 py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}

            {/* Mobile ZKsync SSO Wallet Connection */}
            <div className="space-y-2">
              <div className="text-lg text-amber-900 py-2">
                Connect ZKsync SSO Wallet
              </div>
              <ZkSyncSsoWalletButton
                onDashboardClick={handleDashboardClick}
                onAiCompanionClick={() => setIsAiCompanionOpen(true)}
              />
            </div>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="container mx-auto px-4 py-12">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="text-sm font-semibold text-emerald-600 tracking-wide">
                YOUR HEALTH, YOUR CHOICE
              </div>
              <h2 className="text-4xl font-light text-amber-900 leading-relaxed">
                Amach — from the Gaelic word for &quot;outsider&quot; or
                &quot;rebellion&quot; — embodies our vision for healthcare
                transformation.
              </h2>
              <p className="text-xl text-amber-800/80 leading-relaxed">
                Your health data is scattered across a dizzying number of
                systems. Amach Health brings it together, encrypts it with keys
                only you control, and lets AI reveal insights that clinical
                evidence alone misses.
              </p>
              <div className="flex flex-col items-center mt-8 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button
                    variant="outline"
                    className="px-8 py-6 text-lg text-emerald-600 hover:bg-emerald-50 border-emerald-600 transition-all duration-300"
                    onClick={() => (window.location.href = "/learn")}
                  >
                    Learn More
                  </Button>
                  <Button
                    className="px-8 py-6 text-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all duration-300 hover:scale-105"
                    onClick={() =>
                      (window.location.href =
                        "mailto:amachhealth@gmail.com?subject=Early Protocol Access")
                    }
                  >
                    Join Whitelist
                  </Button>
                </div>

                {/* New User Button */}
                <div className="pt-4 border-t border-amber-100/50 w-full max-w-md">
                  <Button
                    variant="outline"
                    className="w-full px-6 py-4 text-base bg-gradient-to-r from-amber-50 to-emerald-50 hover:from-amber-100 hover:to-emerald-100 border-2 border-emerald-300 text-emerald-700 hover:text-emerald-800 transition-all duration-300 hover:shadow-md group"
                    onClick={restartOnboarding}
                  >
                    <Sparkles className="h-5 w-5 mr-2 group-hover:rotate-12 transition-transform" />
                    New User? Start Your Journey Here
                  </Button>
                </div>

                <p className="text-sm text-amber-800/80 max-w-md text-center">
                  Join our early access list to be among the first to experience
                  the future of health data sovereignty.
                </p>
              </div>
            </div>

            <div className="relative h-[400px] w-full">
              {cards.map((card, index) => {
                const Icon = card.icon;
                return (
                  <div
                    key={index}
                    className={`absolute inset-0 transition-all duration-2000 ${
                      index === activeCard
                        ? "integrate z-10"
                        : "disintegrate z-0"
                    }`}
                  >
                    <Card className="h-full bg-white/90 border-none shadow-lg backdrop-blur-sm">
                      <CardContent className="p-8 flex flex-col items-center justify-center h-full">
                        <Icon className="h-16 w-16 text-emerald-600 mb-6" />
                        <h3 className="text-2xl font-semibold text-amber-900 mb-4">
                          {card.title}
                        </h3>
                        <p className="text-lg text-amber-800/80 text-center leading-relaxed">
                          {card.description}
                        </p>
                        <div className="mt-6 flex gap-2">
                          {cards.map((_, i) => (
                            <div
                              key={i}
                              className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${
                                i === activeCard
                                  ? "bg-emerald-600 w-4"
                                  : "bg-emerald-200"
                              }`}
                            />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-24 py-8 border-t border-emerald-100">
        <div className="text-center text-amber-800/60">
          <p className="text-sm">
            © 2025 Amach Health - Transforming Healthcare Through Data
            Liberation
          </p>
        </div>
      </div>
    </div>
  );
};

export default MainPage;
