"use client";

import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { useStorjHealthScores } from "@/data/hooks/useStorjHealthScores";
import { useWalletService } from "@/hooks/useWalletService";
import {
  calculateDailyHealthScoresFromByType,
  calculateScoreTrends,
} from "@/utils/dailyHealthScoreCalculator";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo } from "react";

interface HealthScoreTrendsProps {
  className?: string;
}

const cardClass =
  "rounded-xl border bg-white dark:bg-[#0B140F] border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)]";

export function HealthScoreTrends({
  className = "",
}: HealthScoreTrendsProps): JSX.Element {
  const { isConnected, address } = useWalletService();
  const { scoreTrends, isLoading: loadingTrends } = useStorjHealthScores(
    isConnected ? (address ?? undefined) : undefined,
  );
  const { metricData } = useHealthDataContext();

  const clientSideTrends = useMemo(() => {
    if (scoreTrends || loadingTrends || Object.keys(metricData).length === 0) {
      return null;
    }
    const dailyScores = calculateDailyHealthScoresFromByType(metricData);
    return dailyScores.length > 0 ? calculateScoreTrends(dailyScores) : null;
  }, [scoreTrends, loadingTrends, metricData]);

  const effectiveTrends = scoreTrends ?? clientSideTrends;

  const getTrendIcon = (current: number, trend: number): JSX.Element => {
    if (trend === 0) return <Minus className="h-3 w-3 text-[#6B8C7A]" />;
    if (current > trend)
      return <TrendingUp className="h-3 w-3 text-green-500" />;
    if (current < trend)
      return <TrendingDown className="h-3 w-3 text-red-500" />;
    return <Minus className="h-3 w-3 text-[#6B8C7A]" />;
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    return "Needs Improvement";
  };

  if (loadingTrends) {
    return (
      <div className={`${cardClass} ${className} p-5`}>
        <h3 className="text-lg font-medium text-emerald-800 dark:text-[#4ade80] mb-4">
          Health Score Trends
        </h3>
        <div className="text-center text-[#6B8C7A]">Loading trends...</div>
      </div>
    );
  }

  if (!effectiveTrends) {
    return (
      <div className={`${cardClass} ${className} p-5`}>
        <h3 className="text-lg font-medium text-emerald-800 dark:text-[#4ade80] mb-4">
          Health Score Trends
        </h3>
        <div className="text-center text-[#6B8C7A]">
          No trend data available
        </div>
      </div>
    );
  }

  const scoreTypes = [
    {
      key: "overall",
      label: "Overall",
      color: "text-emerald-800 dark:text-[#4ade80]",
    },
    {
      key: "activity",
      label: "Activity",
      color: "text-emerald-600 dark:text-emerald-400",
    },
    { key: "sleep", label: "Sleep", color: "text-amber-500" },
    { key: "heart", label: "Heart", color: "text-red-500" },
    { key: "energy", label: "Energy", color: "text-yellow-500" },
  ] as const;

  return (
    <div className={`${cardClass} ${className} p-5`}>
      <h3 className="text-lg font-medium text-emerald-800 dark:text-[#4ade80] mb-4">
        Health Score Trends
      </h3>
      <div className="space-y-4">
        {scoreTypes.map(({ key, label, color }) => {
          const trends = effectiveTrends[key];
          if (!trends) return null;

          return (
            <div
              key={key}
              className="border-b border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)] pb-3 last:border-b-0"
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className={`font-medium ${color}`}>{label}</h4>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[#6B8C7A]">7 days:</span>
                  <div className="flex items-center gap-1">
                    {getTrendIcon(trends.last7Days, trends.last30Days)}
                    <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                      {trends.last7Days}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B8C7A]">30 days:</span>
                  <div className="flex items-center gap-1">
                    {getTrendIcon(trends.last30Days, trends.last3Months)}
                    <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                      {trends.last30Days}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B8C7A]">3 months:</span>
                  <div className="flex items-center gap-1">
                    <Minus className="h-3 w-3 text-[#6B8C7A]" />
                    <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                      {trends.last3Months}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-xs text-[#6B8C7A] mt-1">
                {getScoreLabel(trends.last7Days)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
