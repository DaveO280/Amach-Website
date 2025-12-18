"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Brain,
  Lock,
  Sparkles,
  Wallet,
  ArrowRight,
  Shield,
  Database,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";

const WalletBenefitsPage: React.FC = (): JSX.Element => {
  const router = useRouter();

  const benefits = [
    {
      icon: Brain,
      title: "Context-Powered AI",
      description:
        "Your AI companion becomes exponentially more powerful with access to your complete health history. Store lab results, symptoms, medications, and lifestyle data - all encrypted and under your control.",
      color: "emerald",
    },
    {
      icon: Lock,
      title: "100% Private & Encrypted",
      description:
        "Your wallet generates encryption keys that only you control. Not even Amach Health can read your data. True data sovereignty means true privacy.",
      color: "blue",
    },
    {
      icon: Database,
      title: "Permanent Storage",
      description:
        "Health data stored on decentralized infrastructure (Storj) with blockchain verification. Your data persists independently of any single company or service.",
      color: "purple",
    },
    {
      icon: Shield,
      title: "Blockchain-Verified",
      description:
        "Every piece of health data is cryptographically verified on zkSync Era blockchain. Tamper-proof audit trails ensure data integrity.",
      color: "amber",
    },
    {
      icon: Sparkles,
      title: "Advanced Features",
      description:
        "Create health timelines, set personalized goals, track progress over time, and generate comprehensive health reports based on your complete context.",
      color: "pink",
    },
    {
      icon: Zap,
      title: "Seamless Experience",
      description:
        "One-time wallet setup unlocks all features. Your data syncs across devices, always encrypted, always under your control.",
      color: "green",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50">
      {/* Header */}
      <header className="border-b border-amber-100">
        <div className="container mx-auto py-4 px-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-black text-emerald-900">
              Amach Health
            </h1>
            <Button
              variant="outline"
              onClick={() => router.push("/")}
              className="text-amber-900 hover:text-emerald-600 border-amber-300 hover:border-emerald-600"
            >
              Back to Home
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 rounded-full text-emerald-800 font-semibold text-sm">
            <Wallet className="h-4 w-4" />
            Wallet Benefits
          </div>
          <h2 className="text-4xl md:text-5xl font-light text-amber-900 leading-tight">
            Unlock the Full Power of Context-Driven Healthcare
          </h2>
          <p className="text-xl text-amber-800/80 leading-relaxed">
            Creating a wallet isn&apos;t just about storage—it&apos;s about
            transforming your AI from a general assistant into a personalized
            health intelligence system that knows your complete history.
          </p>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <Card
                key={index}
                className="bg-white/90 border-none shadow-lg backdrop-blur-sm hover:shadow-xl transition-all duration-300"
              >
                <CardContent className="p-6">
                  <div
                    className={`inline-flex p-3 rounded-lg bg-${benefit.color}-100 mb-4`}
                  >
                    <Icon className={`h-6 w-6 text-${benefit.color}-600`} />
                  </div>
                  <h3 className="text-xl font-semibold text-amber-900 mb-3">
                    {benefit.title}
                  </h3>
                  <p className="text-amber-800/80 leading-relaxed">
                    {benefit.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-3xl font-light text-amber-900 text-center mb-12">
            How Wallet-Powered Context Works
          </h3>
          <div className="space-y-8">
            <div className="flex gap-6 items-start">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xl">
                1
              </div>
              <div>
                <h4 className="text-xl font-semibold text-emerald-800 mb-2">
                  Create Your Wallet
                </h4>
                <p className="text-amber-800/80">
                  Quick, one-time setup generates your encryption keys. Think of
                  it as creating a personal vault that only you can access.
                </p>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xl">
                2
              </div>
              <div>
                <h4 className="text-xl font-semibold text-emerald-800 mb-2">
                  Add Your Health Context
                </h4>
                <p className="text-amber-800/80">
                  Upload lab results, track symptoms, log medications, record
                  health events. Everything is encrypted before leaving your
                  device.
                </p>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xl">
                3
              </div>
              <div>
                <h4 className="text-xl font-semibold text-emerald-800 mb-2">
                  Experience Context-Powered AI
                </h4>
                <p className="text-amber-800/80">
                  Ask questions like &quot;Based on my last 3 months of blood
                  work, what patterns do you see?&quot; Your AI can now provide
                  deeply personalized insights because it has the full picture.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy Guarantee */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-gradient-to-r from-emerald-50 to-amber-50 border-emerald-200 shadow-xl">
            <CardContent className="p-8">
              <div className="flex items-start gap-4">
                <Shield className="h-8 w-8 text-emerald-600 flex-shrink-0" />
                <div>
                  <h3 className="text-2xl font-semibold text-emerald-900 mb-3">
                    Our Privacy Guarantee
                  </h3>
                  <p className="text-emerald-800 leading-relaxed mb-4">
                    Your health data is encrypted with keys derived from your
                    wallet signature. This means:
                  </p>
                  <ul className="space-y-2 text-emerald-800">
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Amach Health cannot read your data</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Storage providers cannot read your data</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>
                        Even if servers are compromised, your data remains
                        encrypted
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>
                        Only you, with your wallet, can decrypt and access your
                        health information
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center space-y-8">
          <h3 className="text-3xl font-light text-amber-900">
            Ready to Transform Your Health AI?
          </h3>
          <p className="text-lg text-amber-800/80">
            Creating a wallet takes less than 2 minutes and unlocks a new level
            of personalized health intelligence.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              className="px-8 py-6 text-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all duration-300 hover:scale-105"
              onClick={() => router.push("/")}
            >
              Get Started
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              className="px-8 py-6 text-lg text-emerald-600 hover:bg-emerald-50 border-emerald-600 transition-all duration-300"
              onClick={() => router.push("/how-it-works")}
            >
              Learn More
            </Button>
          </div>
          <p className="text-sm text-amber-800/60">
            No credit card required. No personal information collected. Just
            your encrypted health data, under your control.
          </p>
        </div>
      </section>

      {/* Footer */}
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

export default WalletBenefitsPage;
