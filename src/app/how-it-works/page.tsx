"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Lock,
  Shield,
  Upload,
} from "lucide-react";
import Link from "next/link";

const HowItWorksPage: React.FC = (): JSX.Element => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50">
      {/* Header */}
      <header className="border-b border-amber-100">
        <div className="container mx-auto py-4 px-4">
          <div className="flex justify-between items-center max-w-7xl mx-auto">
            <Link href="/" className="text-2xl font-black text-emerald-900">
              Amach Health
            </Link>
            <nav className="flex items-center space-x-8">
              <Link
                href="/how-it-works"
                className="text-emerald-600 font-semibold"
              >
                How it Works
              </Link>
              <Link
                href="/mission"
                className="text-amber-900 hover:text-emerald-600"
              >
                Mission
              </Link>
              <Link
                href="/whitepaper"
                className="text-amber-900 hover:text-emerald-600"
              >
                Whitepaper
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Title */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-emerald-900 mb-4">
            How Amach Works
          </h1>
          <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-900 px-4 py-2 rounded-full border border-amber-200">
            <AlertCircle className="w-4 h-4" />
            <span className="font-semibold">Private Beta</span>
            <span className="text-amber-800">
              - We&apos;re building this in public. Your feedback shapes the
              product.
            </span>
          </div>
        </div>

        {/* What Works Today */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
            <h2 className="text-3xl font-bold text-emerald-900">
              What Works Today
            </h2>
          </div>

          <div className="space-y-6">
            {/* Card 1 */}
            <Card className="border-emerald-200 bg-white/80 backdrop-blur">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="bg-emerald-100 p-3 rounded-lg">
                    <Upload className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      1. Upload Your Apple Health Data
                    </h3>
                    <p className="text-gray-700 mb-3">
                      Export your Apple Health data and upload it to Amach. We
                      parse and organize it entirely in your browser.
                    </p>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-sm text-amber-900">
                        <span className="font-semibold">Current state:</span>{" "}
                        Your Apple Health data is stored locally in your
                        browser. It&apos;s private (never leaves your device)
                        but not permanent. If you clear your browser data,
                        you&apos;ll need to re-upload.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 2 */}
            <Card className="border-emerald-200 bg-white/80 backdrop-blur">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="bg-emerald-100 p-3 rounded-lg">
                    <span className="text-2xl">📄</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      2. Add More Context
                    </h3>
                    <p className="text-gray-700">
                      Upload PDFs - lab results, doctor notes, prescriptions.
                      These supplement your Apple Health data to give AI the
                      full picture.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 3 */}
            <Card className="border-emerald-200 bg-white/80 backdrop-blur">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="bg-emerald-100 p-3 rounded-lg">
                    <span className="text-2xl">💬</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      3. Chat With AI About Your Health
                    </h3>
                    <p className="text-gray-700">
                      Ask questions across all your data. The AI analyzes your
                      complete health story - Apple Health metrics + uploaded
                      documents - and gives you insights.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 4 */}
            <Card className="border-emerald-200 bg-white/80 backdrop-blur">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="bg-emerald-100 p-3 rounded-lg">
                    <Lock className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      4. Create Your Profile on ZKsync
                    </h3>
                    <p className="text-gray-700 mb-3">
                      Your basic profile (birth date, sex, height, weight) is
                      encrypted and stored permanently on ZKsync. This is tied
                      to your wallet address and serves as your permanent health
                      identity.
                    </p>
                    <p className="text-gray-600 text-sm">
                      You can update this profile as your weight changes or
                      other details shift.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* What Doesn't Work Yet */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <AlertCircle className="w-8 h-8 text-amber-600" />
            <h2 className="text-3xl font-bold text-amber-900">
              What Doesn&apos;t Work Yet
            </h2>
          </div>

          <div className="space-y-6">
            {/* Item 1 */}
            <Card className="border-amber-200 bg-amber-50/50 backdrop-blur">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Permanent Data Storage
                </h3>
                <p className="text-gray-700 mb-2">
                  Your Apple Health data and PDFs are not permanently stored
                  yet.
                </p>
                <p className="text-gray-700">
                  We&apos;re building a permanent, encrypted vault where your
                  data will live forever, tied to your wallet address and
                  controlled by keys only you hold.
                </p>
                <p className="text-amber-800 text-sm mt-2 font-semibold">
                  This is actively in development but not ready for beta testers
                  yet.
                </p>
              </CardContent>
            </Card>

            {/* Item 2 */}
            <Card className="border-amber-200 bg-amber-50/50 backdrop-blur">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Zero-Knowledge Proofs
                </h3>
                <p className="text-gray-700">
                  The ability to share health insights without revealing raw
                  data (like proving you have a diagnosis without sharing
                  medical records) is planned but not built.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Data Flow Diagram */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-emerald-900 mb-6">
            How Your Data Flows{" "}
            <span className="text-gray-600 text-xl">(Technical View)</span>
          </h2>

          <div className="space-y-6">
            {/* Browser Box */}
            <Card className="border-2 border-emerald-300 bg-emerald-50/50">
              <CardContent className="p-6">
                <h3 className="text-xl font-bold text-emerald-900 mb-4 flex items-center gap-2">
                  <span className="text-2xl">💻</span>
                  YOUR BROWSER (Client-Side)
                </h3>
                <div className="space-y-2 text-gray-700">
                  <p className="flex items-start gap-2">
                    <span className="font-semibold">1.</span>
                    <span>Apple Health export uploaded</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="font-semibold">2.</span>
                    <span>Parsed and organized locally</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="font-semibold">3.</span>
                    <span>Stored in browser (unencrypted)</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="font-semibold">4.</span>
                    <span>PDFs added for context</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="font-semibold">5.</span>
                    <span>AI analyzes everything</span>
                  </p>
                  <div className="bg-emerald-100 border-l-4 border-emerald-600 p-3 mt-4">
                    <p className="font-semibold text-emerald-900">
                      Nothing leaves your device yet
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="flex flex-col items-center">
                <ArrowRight className="w-8 h-8 text-emerald-600 rotate-90" />
                <span className="text-sm text-gray-600 mt-1">
                  (only profile data)
                </span>
              </div>
            </div>

            {/* ZKsync Box */}
            <Card className="border-2 border-purple-300 bg-purple-50/50">
              <CardContent className="p-6">
                <h3 className="text-xl font-bold text-purple-900 mb-4 flex items-center gap-2">
                  <span className="text-2xl">⛓️</span>
                  ZKSYNC (On-Chain)
                </h3>
                <div className="space-y-3">
                  <p className="font-semibold text-gray-900">
                    Encrypted Profile Contains:
                  </p>
                  <ul className="space-y-1 text-gray-700 ml-6 list-disc">
                    <li>Birth date</li>
                    <li>Sex</li>
                    <li>Height</li>
                    <li>Weight (updateable)</li>
                  </ul>
                  <div className="bg-purple-100 border-l-4 border-purple-600 p-3 mt-4">
                    <p className="font-bold text-purple-900">
                      Permanent. Immutable. Yours.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Why Beta */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-emerald-900 mb-6">
            Why Beta?
          </h2>

          <div className="space-y-6">
            <Card className="border-emerald-200">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  We&apos;re Building the Foundation
                </h3>
                <p className="text-gray-700">
                  The AI insights work great today. The permanent storage layer
                  is coming. Zero-knowledge proofs are next.
                </p>
                <p className="text-gray-700 mt-2">
                  We&apos;re not hiding what&apos;s missing. We&apos;re building
                  it step by step, and you get to see (and influence) how it
                  evolves.
                </p>
              </CardContent>
            </Card>

            <Card className="border-emerald-200">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Your Feedback Matters
                </h3>
                <p className="text-gray-700">
                  Every question you ask helps us prioritize features. Every bug
                  you find makes the product better. Every suggestion shapes the
                  roadmap.
                </p>
                <p className="text-emerald-700 font-semibold mt-2">
                  Beta testers aren&apos;t just users - you&apos;re co-builders.
                </p>
              </CardContent>
            </Card>

            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  Early Adopter Benefits
                </h3>
                <ul className="space-y-2 text-gray-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span>
                      Help shape a protocol that could change healthcare data
                      forever
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span>Influence features before they&apos;re built</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span>
                      Get recognized as founding members when we launch on
                      mainnet
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span>
                      Direct access to the founder (amachhealth@gmail.com)
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Privacy & Security */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-8 h-8 text-emerald-600" />
            <h2 className="text-3xl font-bold text-emerald-900">
              Privacy &amp; Security
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-emerald-900 mb-3">
                  ✅ What We Can See
                </h3>
                <ul className="space-y-2 text-gray-700 text-sm">
                  <li>• That you created a wallet and connected</li>
                  <li>
                    • Your encrypted profile on ZKsync (we can&apos;t decrypt
                    it)
                  </li>
                  <li>
                    • That you&apos;re using the AI chat (not the content)
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-red-200 bg-red-50/50">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-red-900 mb-3">
                  ❌ What We Can&apos;t See
                </h3>
                <ul className="space-y-2 text-gray-700 text-sm">
                  <li>• Your Apple Health data (stays in your browser)</li>
                  <li>• Your uploaded PDFs (stays in your browser)</li>
                  <li>
                    • Your AI conversations (processed by Venice.AI - a
                    privacy-native AI)
                  </li>
                  <li>• The contents of your encrypted profile</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-amber-900 mb-2">
                The Honest Reality
              </h3>
              <p className="text-gray-700">
                Right now, your data is most vulnerable to{" "}
                <span className="font-semibold">YOU</span> accidentally clearing
                browser storage. Not to us, not to hackers - just to browser
                data deletion.
              </p>
              <p className="text-amber-800 font-semibold mt-2">
                That&apos;s why permanent encrypted storage is our top priority.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* What's Being Built */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-emerald-900 mb-6">
            What&apos;s Being Built{" "}
            <span className="text-gray-600 text-xl">(Priority Order)</span>
          </h2>

          <div className="space-y-6">
            <Card className="border-2 border-emerald-300 bg-emerald-50/50">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <div className="bg-emerald-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                    NEXT UP
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      Permanent Encrypted Vault
                    </h3>
                    <p className="text-gray-700 mb-2">
                      Your Apple Health data and PDFs will live in encrypted
                      storage tied to your wallet address. You hold the keys.
                      Access from any device.
                    </p>
                    <p className="text-emerald-700 font-semibold text-sm">
                      Timeline: Actively developing. No firm date yet.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <div className="bg-amber-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                    AFTER THAT
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      Zero-Knowledge Proofs
                    </h3>
                    <p className="text-gray-700 mb-2">
                      Prove health claims without revealing data. &quot;I have
                      diabetes&quot; without sharing medical records. &quot;My
                      A1C is under 7&quot; without showing the exact number.
                    </p>
                    <p className="text-amber-700 font-semibold text-sm">
                      Timeline: After permanent storage is stable.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-emerald-900 mb-6">
            Frequently Asked Questions
          </h2>

          <div className="space-y-4">
            <Card className="border-gray-200">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Why use this now if data isn&apos;t permanent?
                </h3>
                <p className="text-gray-700">
                  The AI health insights work today and can help you understand
                  your health data better right now. Your feedback on what
                  matters most helps prioritize what gets built next.
                </p>
                <p className="text-gray-600 mt-2 text-sm">
                  Think of it as getting early access to something being built -
                  you get value today while helping shape what it becomes
                  tomorrow.
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Is my data safe in browser storage?
                </h3>
                <p className="text-gray-700">
                  Your data stays on your device and isn&apos;t sent anywhere,
                  so it&apos;s private. The tradeoff is that it&apos;s not
                  permanent - clearing browser data means you&apos;ll need to
                  re-upload.
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  What happens if I clear my browser?
                </h3>
                <p className="text-gray-700">
                  You&apos;ll need to re-upload your Apple Health export and
                  PDFs. Your ZKsync profile will still be there (it&apos;s
                  permanent on-chain), but your health data cache will be gone.
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Why not just finish it before launching?
                </h3>
                <p className="text-gray-700">
                  Because we want to build WITH users, not FOR users. Your
                  feedback now shapes what features matter most. That&apos;s
                  more valuable than guessing what you need.
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Can I trust you with my health data?
                </h3>
                <p className="text-gray-700">
                  Your health data stays in your browser right now and never
                  leaves your device. When permanent storage launches,
                  you&apos;ll hold the encryption keys - we won&apos;t be able
                  to decrypt your data.
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  How do I give feedback?
                </h3>
                <p className="text-gray-700">
                  Email me directly:{" "}
                  <a
                    href="mailto:amachhealth@gmail.com"
                    className="text-emerald-600 hover:text-emerald-700 font-semibold"
                  >
                    amachhealth@gmail.com
                  </a>
                </p>
                <p className="text-gray-600 mt-1 text-sm">
                  I read every message and respond personally. Your feedback
                  directly shapes what gets built next.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Ready to Try */}
        <section className="mb-16">
          <Card className="border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-amber-50">
            <CardContent className="p-8 text-center">
              <h2 className="text-3xl font-bold text-emerald-900 mb-6">
                Ready to Try?
              </h2>

              <div className="mb-6">
                <p className="text-lg text-gray-900 font-semibold mb-3">
                  What you&apos;re signing up for:
                </p>
                <div className="flex flex-col items-center space-y-2">
                  <div className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <span>Working AI health insights</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <span>Privacy-first architecture</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    <span>Temporary data storage (for now)</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <span className="text-amber-600">🛠️</span>
                    <span>Active development, things will change</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <span className="text-emerald-600">🤝</span>
                    <span>Chance to help build the future of health data</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/">
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-6 text-lg">
                    Get Started
                  </Button>
                </Link>
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
                <Link
                  href="/mission"
                  className="text-emerald-600 hover:text-emerald-700"
                >
                  Read Our Mission
                </Link>
                <span className="text-gray-400">|</span>
                <Link
                  href="/whitepaper"
                  className="text-emerald-600 hover:text-emerald-700"
                >
                  View Whitepaper
                </Link>
                <span className="text-gray-400">|</span>
                <a
                  href="https://github.com/DaveO280/Amach-Website"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 hover:text-emerald-700"
                >
                  See the Code
                </a>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Technical Stack */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-emerald-900 mb-6">
            Technical Stack{" "}
            <span className="text-gray-600 text-xl">(For Developers)</span>
          </h2>

          <Card className="border-gray-200 bg-gray-50/50">
            <CardContent className="p-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Frontend:
                  </h3>
                  <p className="text-gray-700">Next.js, React, TypeScript</p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Storage (Current):
                  </h3>
                  <p className="text-gray-700">
                    Browser localStorage (temporary)
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Storage (Coming):
                  </h3>
                  <p className="text-gray-700">
                    Storj (permanent, encrypted, user-owned)
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    On-Chain:
                  </h3>
                  <p className="text-gray-700">
                    ZKsync Sepolia testnet (profiles)
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">AI:</h3>
                  <p className="text-gray-700">
                    Venice.AI via DIEM compute grants
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Wallet:</h3>
                  <p className="text-gray-700">ZKsync SSO</p>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-gray-200">
                <a
                  href="https://github.com/DaveO280/Amach-Website"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 hover:text-emerald-700 font-semibold"
                >
                  Open Source: View on GitHub →
                </a>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Footer Links */}
        <div className="text-center text-sm text-gray-600 border-t border-gray-200 pt-8">
          <p className="mb-2">
            Questions? Email:{" "}
            <a
              href="mailto:amachhealth@gmail.com"
              className="text-emerald-600 hover:text-emerald-700"
            >
              amachhealth@gmail.com
            </a>
          </p>
          <p className="text-gray-500">Last updated: October 2025</p>
        </div>
      </main>
    </div>
  );
};

export default HowItWorksPage;
