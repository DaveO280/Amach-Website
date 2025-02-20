"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield, Brain, Coins } from "lucide-react";
import { useRouter } from "next/navigation";

const LearnMore = () => {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50">
      <div className="container mx-auto py-8 px-4">
        <Button
          variant="ghost"
          className="mb-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="max-w-4xl mx-auto space-y-12">
          <h1 className="text-4xl font-black text-emerald-900 mb-6">
            Your Health Data, Your Control, Your Benefit
          </h1>

          {/* The Problem Section */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-amber-900">The Problem:</h2>
            <ul className="space-y-2 text-amber-800/80">
              <li className="flex items-start">
                <span className="block ml-2">
                  We generate more health data than ever before, but it&apos;s
                  trapped in disconnected silos
                </span>
              </li>
              <li className="flex items-start">
                <span className="block ml-2">
                  Current systems make your data vulnerable while limiting its
                  potential value
                </span>
              </li>
              <li className="flex items-start">
                <span className="block ml-2">
                  You create the data, but others profit from it
                </span>
              </li>
            </ul>
          </section>

          {/* The Solution Section */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-amber-900">
              The Amach Solution:
            </h2>
            <ul className="space-y-4 text-amber-800/80">
              <li className="flex items-start">
                <Shield className="h-6 w-6 text-emerald-600 mt-1 mr-2 flex-shrink-0" />
                <span>
                  One secure home for all your health data, powered by
                  zero-knowledge technology
                </span>
              </li>
              <li className="flex items-start">
                <Brain className="h-6 w-6 text-emerald-600 mt-1 mr-2 flex-shrink-0" />
                <span>
                  AI-driven cross-data insights reveal patterns traditional
                  analysis misses
                </span>
              </li>
              <li className="flex items-start">
                <Coins className="h-6 w-6 text-emerald-600 mt-1 mr-2 flex-shrink-0" />
                <span>
                  You control and profit from your data&apos;s use in research
                  and development
                </span>
              </li>
              <li className="flex items-start">
                <Shield className="h-6 w-6 text-emerald-600 mt-1 mr-2 flex-shrink-0" />
                <span>
                  Military-grade security through decentralized storage - no
                  more data breach emails
                </span>
              </li>
              <li className="flex items-start">
                <Shield className="h-6 w-6 text-emerald-600 mt-1 mr-2 flex-shrink-0" />
                <span>
                  Individual datasets remain anonymous and segregated, making
                  bulk data theft impossible
                </span>
              </li>
            </ul>
          </section>

          {/* Get Started Section */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-amber-900">Get Started:</h2>
            <ol className="space-y-2 text-amber-800/80 ml-2">
              <li className="flex items-start">
                <span className="text-emerald-600 mr-2">1.</span>
                <span>Download the Amach wallet</span>
              </li>
              <li className="flex items-start">
                <span className="text-emerald-600 mr-2">2.</span>
                <span>Upload your health data</span>
              </li>
              <li className="flex items-start">
                <span className="text-emerald-600 mr-2">3.</span>
                <span>Receive tokens for verified data uploads</span>
              </li>
              <li className="flex items-start">
                <span className="text-emerald-600 mr-2">4.</span>
                <span>
                  Stake tokens for premium AI insights (free during beta)
                </span>
              </li>
            </ol>
            <div className="mt-8 pt-4 border-t border-emerald-100 ml-2">
              <p className="text-lg font-semibold text-emerald-800">
                Join the health data revolution - where your data works for you.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default LearnMore;
