"use client";

import AiCompanionModal from "@/components/AiCompanionModal";
import BetaNotification from "@/components/BetaNotification"; // Import the new component
import HealthDashboardModal from "@/components/HealthDashboardModal";
import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Activity,
  Bot,
  Brain,
  ChevronDown,
  Leaf,
  Lock,
  Menu,
  Wallet,
  X,
} from "lucide-react";
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
    { label: "Mission", href: "/mission" },
    { label: "Whitepaper", href: "/whitepaper" },
  ];

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

  const dropdownItems = [
    {
      label: "Dashboard",
      // Updated to show notification instead of directly opening dashboard
      action: handleDashboardClick,
      icon: Activity,
      href: "#",
    },
    {
      label: "AI Agent",
      action: (): void => setIsAiCompanionOpen(true),
      href: "#",
      icon: Bot,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50">
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
            <div className="flex items-center">
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-black text-emerald-900">
                  Amach Health
                </h1>
                <span className="text-2xl font-normal italic text-emerald-900 hidden sm:inline-block">
                  - &quot;Driven by Data, Guided by Nature&quot;
                </span>
              </div>
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

                {/* Using simple CSS dropdown instead of Radix UI for testing */}
                <div className="relative group">
                  <Button
                    variant="outline"
                    className="text-amber-900 hover:text-emerald-600"
                  >
                    <Wallet className="h-4 w-4 mr-2" />
                    Connect Wallet
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    {dropdownItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.label}
                          onClick={() => {
                            if (item.action) {
                              item.action();
                            } else if (item.href && item.href !== "#") {
                              window.location.href = item.href;
                            }
                          }}
                          className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
                        >
                          <Icon className="h-4 w-4 mr-2" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
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

            {/* Mobile Connect Wallet button - no dropdown */}
            <div className="space-y-2">
              <div className="text-lg text-amber-900 py-2">Connect Wallet</div>

              {/* Direct links instead of dropdown for mobile */}
              {dropdownItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={() => {
                      // Close mobile menu first
                      setIsMobileMenuOpen(false);

                      // Then perform the action
                      if (item.action) {
                        setTimeout(() => {
                          item.action();
                        }, 300); // Short delay to allow menu close animation
                      } else if (item.href && item.href !== "#") {
                        window.location.href = item.href;
                      }
                    }}
                    className="flex items-center text-sm py-2 pl-4 w-full text-left text-amber-800 hover:text-emerald-600"
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </button>
                );
              })}
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
                By capturing insights from medical diagnostics, wearable
                technologies, and traditional wellness metrics, we&apos;re
                building a future where health decisions are backed by both
                clinical evidence and generational wisdom.
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
                    Join Protocol
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
