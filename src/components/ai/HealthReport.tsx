"use client";

import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { Button } from "@/components/ui/button";
import { useVeniceAI } from "@/data/hooks/useVeniceAI";
import type { HealthScore } from "@/types/HealthContext";
import { buildHealthAnalysisPrompt } from "@/utils/aiPromptBuilders";
import { calculateAgeFromBirthDate } from "@/utils/userProfileUtils";
import React, { useState } from "react";
import { HealthScoreCards } from "./HealthScoreCards";
import { ProfileInputModal } from "./ProfileInputModal";

// Explicit return type for isProfileComplete
const buildPromptProfile = (
  profile:
    | {
        age?: number;
        birthDate?: string;
        sex?: string;
        heightCm?: number;
        heightIn?: number;
        weightKg?: number;
        weightLbs?: number;
      }
    | undefined,
): {
  age: number;
  sex: string;
  height: number;
  weight: number;
} | null => {
  if (!profile) {
    return null;
  }

  const derivedAge =
    typeof profile.age === "number"
      ? profile.age
      : calculateAgeFromBirthDate(profile.birthDate);
  const normalizedSex =
    typeof profile.sex === "string" && profile.sex.trim().length > 0
      ? profile.sex.trim()
      : undefined;

  const heightFeet =
    typeof profile.heightIn === "number" && profile.heightIn > 0
      ? profile.heightIn / 12
      : typeof profile.heightCm === "number" && profile.heightCm > 0
        ? profile.heightCm / 30.48
        : undefined;

  const weightLbs =
    typeof profile.weightLbs === "number" && profile.weightLbs > 0
      ? profile.weightLbs
      : typeof profile.weightKg === "number" && profile.weightKg > 0
        ? profile.weightKg * 2.20462
        : undefined;

  if (
    typeof derivedAge === "number" &&
    normalizedSex &&
    typeof heightFeet === "number" &&
    typeof weightLbs === "number"
  ) {
    return {
      age: derivedAge,
      sex: normalizedSex,
      height: heightFeet,
      weight: weightLbs,
    };
  }

  return null;
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
  const promptProfile = buildPromptProfile(userProfile);
  const canGenerateAnalysis = Boolean(hasHealthData && healthScoresObj);

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

  // Log section status changes for debugging
  React.useEffect(() => {
    const queries = [
      { section: "overall", ...overallAI },
      { section: "activity", ...activityAI },
      { section: "sleep", ...sleepAI },
      { section: "heart", ...heartAI },
      { section: "energy", ...energyAI },
    ];

    queries.forEach(({ section, data, error, isPending }) => {
      if (error) {
        console.error(`[HealthReport] ${section} section error:`, error);
      } else if (data) {
        const isEmpty = !data.content || data.content.trim().length === 0;
        console.log(`[HealthReport] ${section} section status:`, {
          hasContent: Boolean(data.content),
          contentLength: data.content?.length || 0,
          isEmpty,
        });
        if (isEmpty) {
          console.warn(
            `[HealthReport] ⚠️ ${section} section returned empty content`,
          );
        }
      } else if (!isPending) {
        console.warn(
          `[HealthReport] ${section} section: no data, no error, not pending`,
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    overallAI.data,
    activityAI.data,
    sleepAI.data,
    heartAI.data,
    energyAI.data,
    overallAI.error,
    activityAI.error,
    sleepAI.error,
    heartAI.error,
    energyAI.error,
    overallAI.isPending,
    activityAI.isPending,
    sleepAI.isPending,
    heartAI.isPending,
    energyAI.isPending,
  ]);

  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const isAnyPending = sectionQueries.some((q) => q.isPending);

  // Handler to trigger all queries (small concurrency limit to reduce 503s without being painfully slow)
  const handleGenerateAnalysis = async (): Promise<void> => {
    if (!metrics || !healthScoresObj) {
      return;
    }

    console.log("[HealthReport] Generating analysis for all sections", {
      sections: sectionQueries.map((s) => s.section),
      hasMetrics: Boolean(metrics),
      hasHealthScores: Boolean(healthScoresObj),
      hasProfile: Boolean(promptProfile),
    });

    setIsGeneratingAll(true);
    try {
      const CONCURRENCY = 2;
      // Stagger starts to avoid bursty traffic that often triggers 503s.
      // This keeps the UI faster than fully sequential, but avoids 5-at-once.
      const START_STAGGER_MS = 1000;
      const sleep = (ms: number): Promise<void> =>
        new Promise((r) => setTimeout(r, ms));
      const tasks = sectionQueries.map(
        ({ section, mutateAsync }): (() => Promise<void>) =>
          async (): Promise<void> => {
            const prompt = buildHealthAnalysisPrompt(
              section,
              metrics,
              healthScoresObj,
              promptProfile,
            );
            console.log(`[HealthReport] Triggering ${section} analysis`, {
              promptLength: prompt.length,
              promptPreview: prompt.substring(0, 200),
            });
            await (
              mutateAsync as (vars: { prompt: string }) => Promise<unknown>
            )({
              prompt,
            });
          },
      );

      let nextIndex = 0;
      const baseStart = Date.now();
      const worker = async (): Promise<void> => {
        while (nextIndex < tasks.length) {
          const current = nextIndex;
          nextIndex += 1;
          // Start each query ~1s apart (global schedule), regardless of worker.
          const scheduledAt = baseStart + current * START_STAGGER_MS;
          const delay = scheduledAt - Date.now();
          if (delay > 0) await sleep(delay);
          await tasks[current]!();
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker),
      );
    } finally {
      setIsGeneratingAll(false);
    }
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
            onClick={() => void handleGenerateAnalysis()}
            className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white w-fit disabled:cursor-not-allowed disabled:bg-emerald-300"
            disabled={!canGenerateAnalysis || isAnyPending || isGeneratingAll}
          >
            {isGeneratingAll ? "Generating..." : "Generate Health Analysis"}
          </Button>
          <div className="mt-4 p-6 bg-gradient-to-br from-amber-50 via-white to-emerald-50 rounded-lg border border-amber-200/50 shadow-sm">
            {sectionQueries.map((query) => {
              const { section, data, isPending, error } = query;
              const hasEmptyContent =
                data && (!data.content || data.content.trim().length === 0);

              return (
                <div key={section} className="mb-6 last:mb-0">
                  <p className="text-emerald-900 text-lg font-semibold mb-2">
                    {section.charAt(0).toUpperCase() + section.slice(1)}{" "}
                    Analysis
                  </p>
                  {isPending && (
                    <p className="text-amber-600/70">Generating...</p>
                  )}
                  {error && (
                    <div className="text-red-500">
                      <p className="font-semibold">
                        Error generating analysis.
                      </p>
                      <p className="text-sm mt-1">
                        {error.message || String(error)}
                      </p>
                    </div>
                  )}
                  {hasEmptyContent && (
                    <div className="text-amber-600">
                      <p className="font-semibold">
                        ⚠️ Analysis returned empty response.
                      </p>
                      <p className="text-sm mt-1">
                        The AI service returned no content. Please try again.
                      </p>
                    </div>
                  )}
                  {data && !hasEmptyContent && (
                    <div className="mt-2">
                      <p className="text-amber-900/90 leading-relaxed">
                        {data.content}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
