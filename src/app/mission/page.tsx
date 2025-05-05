"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, Brain, Lock, Network, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import React from "react";
import { ErrorBoundary } from "react-error-boundary";

function ErrorFallback({ error }: { error: Error }): JSX.Element {
  return (
    <div className="text-red-600 p-4">
      <p>Something went wrong:</p>
      <pre>{error.message}</pre>
    </div>
  );
}

const Mission: React.FC = () => {
  const router = useRouter();

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
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
              Transforming Healthcare Through Data Liberation
            </h1>

            <div className="space-y-8 text-amber-800/80">
              {/* Problem Statement */}
              <p className="text-xl leading-relaxed">
                The modern healthcare landscape is suffocating under layers of
                middlemen, each taking their cut while adding minimal value to
                patient outcomes. This system thrives on keeping your health
                information scattered and inaccessible – creating artificial
                barriers that drive up costs and stifle innovation.
              </p>

              {/* Vision */}
              <section className="space-y-4">
                <div className="flex items-start">
                  <Network className="h-6 w-6 text-emerald-600 mt-1 mr-3 flex-shrink-0" />
                  <p className="leading-relaxed">
                    Amach Health is spearheading a fundamental shift in this
                    power dynamic. We&apos;re building a future where
                    individuals own and control their complete health narrative.
                    Through cutting-edge cryptographic technology and
                    distributed systems, we&apos;ve created a platform that
                    doesn&apos;t just store your health data – it amplifies its
                    value while keeping it secure.
                  </p>
                </div>
              </section>

              {/* Security */}
              <section className="space-y-4">
                <div className="flex items-start">
                  <Lock className="h-6 w-6 text-emerald-600 mt-1 mr-3 flex-shrink-0" />
                  <p className="leading-relaxed">
                    Our architecture redefines data security paradigms.
                    Traditional centralized databases are replaced with a
                    distributed system where each individual&apos;s information
                    remains encrypted and compartmentalized. This approach
                    doesn&apos;t just make data breaches less likely – it makes
                    them computationally infeasible.
                  </p>
                </div>
              </section>

              {/* AI & Analytics */}
              <section className="space-y-4">
                <div className="flex items-start">
                  <Brain className="h-6 w-6 text-emerald-600 mt-1 mr-3 flex-shrink-0" />
                  <p className="leading-relaxed">
                    The real revolution comes from our AI-powered analytics
                    engine. By breaking down the artificial walls between
                    different types of health data, we uncover correlations and
                    patterns that have remained hidden in fragmented systems.
                    These insights create value not just for individuals, but
                    for the entire healthcare ecosystem.
                  </p>
                </div>
              </section>

              {/* Value Creation */}
              <p className="leading-relaxed">
                We&apos;re not just changing how health data is stored –
                we&apos;re transforming how it creates value. Our model ensures
                that the economic benefits flow back to the data creators, not
                middlemen. This realignment of incentives fosters a
                collaborative ecosystem where advancing medical knowledge
                directly rewards those who make it possible.
              </p>

              {/* Mission Statement */}
              <section className="space-y-4">
                <div className="flex items-start">
                  <Users className="h-6 w-6 text-emerald-600 mt-1 mr-3 flex-shrink-0" />
                  <p className="leading-relaxed">
                    At Amach Health, we&apos;re proving that democratizing
                    health data access doesn&apos;t mean compromising privacy or
                    security. Instead, it creates a more efficient, equitable,
                    and innovative healthcare system that serves its true
                    stakeholders – the individuals and communities who power it.
                  </p>
                </div>
              </section>

              {/* Call to Action */}
              <div className="mt-12 pt-6 border-t border-emerald-100">
                <p className="text-xl font-semibold text-emerald-800 text-center">
                  The future of healthcare isn&apos;t in corporate silos –
                  it&apos;s in sovereign, community-driven data networks. Join
                  us in building it.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default Mission;
