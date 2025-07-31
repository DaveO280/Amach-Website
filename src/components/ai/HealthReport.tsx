"use client";

import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { Button } from "@/components/ui/button";
import { useVeniceAI } from "@/data/hooks/useVeniceAI";
import type { HealthScore } from "@/types/HealthContext";
import { buildHealthAnalysisPrompt } from "@/utils/aiPromptBuilders";
import React, { useState } from "react";
import { HealthScoreCards } from "./HealthScoreCards";
import { ProfileInputModal } from "./ProfileInputModal";

// Explicit return type for isProfileComplete
const isProfileComplete = (
  profile: unknown,
): profile is {
  age: number;
  sex: "male" | "female";
  height: number;
  weight: number;
} => {
  if (
    typeof profile === "object" &&
    profile !== null &&
    "age" in profile &&
    "sex" in profile &&
    "height" in profile &&
    "weight" in profile
  ) {
    const obj = profile as { [key: string]: unknown };
    return (
      typeof obj.age === "number" &&
      typeof obj.sex === "string" &&
      typeof obj.height === "number" &&
      typeof obj.weight === "number"
    );
  }
  return false;
};

const HealthReport: React.FC = () => {
  const { metrics, healthScores, userProfile } = useHealthDataContext();
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Use health scores from context
  const healthScoresObj = healthScores?.reduce(
    (acc: Record<string, number>, s: HealthScore) => {
      acc[s.type] = s.value;
      return acc;
    },
    {} as Record<string, number>,
  );

  const hasHealthData = !!metrics;
  const hasProfile = isProfileComplete(userProfile);

  // Set up a useVeniceAI instance for each section (explicitly, not in a loop)
  const overallAI = useVeniceAI();
  const activityAI = useVeniceAI();
  const sleepAI = useVeniceAI();
  const heartAI = useVeniceAI();
  const energyAI = useVeniceAI();

  const sectionQueries = [
    { section: "overall", ...overallAI },
    { section: "activity", ...activityAI },
    { section: "sleep", ...sleepAI },
    { section: "heart", ...heartAI },
    { section: "energy", ...energyAI },
  ] as const;

  // Handler to trigger all queries
  const handleGenerateAnalysis = (): void => {
    if (!metrics || !healthScoresObj || !hasProfile) return;
    sectionQueries.forEach(({ section, mutate }) => {
      const prompt = buildHealthAnalysisPrompt(
        section,
        metrics,
        healthScoresObj,
        userProfile as {
          age: number;
          sex: string;
          height: number;
          weight: number;
        },
      );
      mutate({ prompt });
    });
  };

  return (
    <div className="space-y-4">
      {!hasHealthData && (
        <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-amber-800">
            No health data available yet. Process your data in the Health
            Dashboard for personalized insights.
          </p>
        </div>
      )}

      {hasHealthData && (
        <div className="mb-4">
          <HealthScoreCards />
          <Button
            onClick={handleGenerateAnalysis}
            className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white w-fit"
          >
            Generate Health Analysis
          </Button>
          <div className="mt-4 p-4 bg-white rounded-lg border border-emerald-100">
            {sectionQueries.map((query) => {
              const { section, data, isPending, error } = query;
              return (
                <div key={section} className="mb-6">
                  <p className="text-emerald-900 text-lg">
                    {section.charAt(0).toUpperCase() + section.slice(1)}{" "}
                    Analysis
                  </p>
                  {isPending && <p className="text-gray-500">Generating...</p>}
                  {error && (
                    <p className="text-red-500">Error generating analysis.</p>
                  )}
                  {data && (
                    <div className="mt-2">
                      <p className="text-gray-700">{data.content}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasHealthData && !userProfile && (
        <div className="flex flex-col space-y-4">
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-amber-800">
              Please enter your profile information to generate a personalized
              health report.
            </p>
          </div>
          <Button
            onClick={() => setShowProfileModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white w-fit"
          >
            Generate Health Report
          </Button>
        </div>
      )}

      <ProfileInputModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onSubmit={() => setShowProfileModal(false)}
      />
    </div>
  );
};

export default HealthReport;
