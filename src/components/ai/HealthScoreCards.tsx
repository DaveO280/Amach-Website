"use client";

import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import type { HealthScore } from "@/types/HealthContext";
import {
  getScoreTrends,
  type ScoreTrends,
} from "@/utils/dailyHealthScoreCalculator";
import {
  Activity,
  Heart,
  Minus,
  Moon,
  Scale,
  Star,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const cardClass =
  "rounded-xl border bg-white dark:bg-[#0B140F] border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)]";

export function HealthScoreCards(): JSX.Element {
  const { healthScores } = useHealthDataContext();
  const [scoreTrends, setScoreTrends] = useState<ScoreTrends | null>(null);
  const [loadingTrends, setLoadingTrends] = useState(false);

  const healthScoresObj = healthScores?.reduce(
    (acc: Record<string, number>, s: HealthScore) => {
      acc[s.type] = s.value;
      return acc;
    },
    {} as Record<string, number>,
  );
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const hoverTimeout = useRef<NodeJS.Timeout>();
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Fetch trend data when component mounts
  useEffect(() => {
    const fetchTrends = async (): Promise<void> => {
      setLoadingTrends(true);
      try {
        const trends = await getScoreTrends();
        setScoreTrends(trends);
      } catch (error) {
        console.error("Failed to fetch score trends:", error);
      } finally {
        setLoadingTrends(false);
      }
    };

    fetchTrends();
  }, []);

  const getScoreIcon = (scoreType: string): JSX.Element => {
    switch (scoreType) {
      case "activity":
        return <Activity className="h-5 w-5 text-emerald-600" />;
      case "sleep":
        return <Moon className="h-5 w-5 text-amber-500" />;
      case "heart":
        return <Heart className="h-5 w-5 text-red-500" />;
      case "energy":
        return <Zap className="h-5 w-5 text-yellow-500" />;
      case "overall":
        return <Star className="h-5 w-5 text-emerald-900" />;
      default:
        return <span />;
    }
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    return "Needs Improvement";
  };

  const getMetricFormula = (metric: string): string => {
    switch (metric) {
      case "overall":
        return "Weighted average of all component scores:\n(Activity × 0.3) + (Sleep × 0.3) + (Heart × 0.2) + (Energy × 0.2)";
      case "activity":
        return "Based on daily step count and exercise duration:\n(Steps ÷ 10,000 × 0.6) + (Exercise minutes ÷ 30 × 0.4) × 100";
      case "sleep":
        return "Based on sleep duration and quality:\n(Duration ÷ 8 × 0.5) + (Quality × 0.5) × 100";
      case "heart":
        return "Based on resting heart rate and heart rate variability:\n(HRV ÷ 50 × 0.6) + ((100 - RHR) ÷ 40 × 0.4) × 100";
      case "energy":
        return "Based on daily activity and sleep quality:\n(Activity score × 0.4) + (Sleep score × 0.6)";
      default:
        return "";
    }
  };

  const handleMetricHover = (metric: string): void => {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current);
    }
    setSelectedMetric(metric);
    setShowTooltip(true);
  };

  const handleMetricLeave = (): void => {
    hoverTimeout.current = setTimeout(() => {
      setShowTooltip(false);
    }, 100);
  };

  useEffect(() => {
    return (): void => {
      if (hoverTimeout.current) {
        clearTimeout(hoverTimeout.current);
      }
    };
  }, []);

  if (!healthScoresObj) {
    return <span />;
  }

  const { overall, ...componentScores } = healthScoresObj;

  // Trend display component with better styling
  const TrendDisplay = ({
    scoreType,
  }: {
    scoreType: string;
  }): JSX.Element | null => {
    if (!scoreTrends || loadingTrends) {
      return (
        <div className="text-xs text-[#6B8C7A] mt-2">
          {loadingTrends ? "Loading trends..." : "No trend data"}
        </div>
      );
    }

    const trends = scoreTrends[scoreType as keyof ScoreTrends];
    if (!trends) return null;

    const getTrendIcon = (trend: number): JSX.Element => {
      const overallScore = healthScoresObj.overall;
      // Handle missing or invalid values
      if (
        typeof trend !== "number" ||
        typeof overallScore !== "number" ||
        isNaN(trend) ||
        isNaN(overallScore)
      ) {
        return <Minus className="h-3 w-3 text-[#6B8C7A]" />;
      }
      const roundedTrend = Math.round(trend);
      const roundedOverall = Math.round(overallScore);
      if (roundedTrend > roundedOverall) {
        return <TrendingUp className="h-3 w-3 text-green-500" />;
      }
      if (roundedTrend < roundedOverall) {
        return <TrendingDown className="h-3 w-3 text-red-500" />;
      }
      return <Minus className="h-3 w-3 text-[#6B8C7A]" />;
    };

    return (
      <div className="mt-2 sm:mt-3 space-y-1">
        <div className="text-xs text-[#6B8C7A] font-medium mb-1">Trends:</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 text-xs">
          <div className="flex items-center justify-between bg-[rgba(0,107,79,0.05)] dark:bg-[rgba(0,107,79,0.08)] px-1.5 sm:px-2 py-1.5 sm:py-1 rounded">
            <span className="text-[#6B8C7A] text-[10px] sm:text-xs">7d</span>
            <div className="flex items-center gap-0.5 sm:gap-1">
              {getTrendIcon(trends.last7Days)}
              <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3] text-[10px] sm:text-xs">
                {trends.last7Days}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between bg-[rgba(0,107,79,0.05)] dark:bg-[rgba(0,107,79,0.08)] px-1.5 sm:px-2 py-1.5 sm:py-1 rounded">
            <span className="text-[#6B8C7A] text-[10px] sm:text-xs">30d</span>
            <div className="flex items-center gap-0.5 sm:gap-1">
              {getTrendIcon(trends.last30Days)}
              <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3] text-[10px] sm:text-xs">
                {trends.last30Days}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between bg-[rgba(0,107,79,0.05)] dark:bg-[rgba(0,107,79,0.08)] px-1.5 sm:px-2 py-1.5 sm:py-1 rounded">
            <span className="text-[#6B8C7A] text-[10px] sm:text-xs">3m</span>
            <div className="flex items-center gap-0.5 sm:gap-1">
              {getTrendIcon(trends.last3Months)}
              <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3] text-[10px] sm:text-xs">
                {trends.last3Months}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between bg-[rgba(0,107,79,0.05)] dark:bg-[rgba(0,107,79,0.08)] px-1.5 sm:px-2 py-1.5 sm:py-1 rounded">
            <span className="text-[#6B8C7A] text-[10px] sm:text-xs">6m</span>
            <div className="flex items-center gap-0.5 sm:gap-1">
              {getTrendIcon(trends.last6Months)}
              <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3] text-[10px] sm:text-xs">
                {trends.last6Months}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* Overall Score Card */}
      <div className="relative flex-1 min-w-0">
        <div
          className={`${cardClass} hover:shadow-lg transition-shadow p-5`}
          onMouseEnter={() => handleMetricHover("overall")}
          onMouseLeave={handleMetricLeave}
        >
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-base sm:text-lg font-medium text-emerald-800 dark:text-[#4ade80]">
              Overall Health Score
            </h3>
            <Scale className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-800 dark:text-[#4ade80]" />
          </div>
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-5xl sm:text-6xl md:text-7xl font-bold text-emerald-800 dark:text-[#4ade80]">
              {overall}
            </div>
            <p className="text-xs sm:text-sm text-[#6B8C7A] mt-2">
              {getScoreLabel(overall)}
            </p>
            <TrendDisplay scoreType="overall" />
          </div>
        </div>
        {showTooltip && selectedMetric === "overall" && (
          <div
            ref={tooltipRef}
            className="absolute top-0 left-0 w-full h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200"
            onMouseEnter={() => handleMetricHover("overall")}
            onMouseLeave={handleMetricLeave}
          >
            <div className="bg-white dark:bg-[#0B140F] p-4 rounded-lg shadow-lg max-w-md transform transition-all duration-200 ease-in-out border border-[rgba(0,107,79,0.15)]">
              <h3 className="text-lg font-medium text-emerald-800 dark:text-[#4ade80] capitalize mb-2">
                {selectedMetric} Score Formula
              </h3>
              <p className="text-sm text-[#0A1A0F] dark:text-[#F0F7F3] whitespace-pre-line">
                {getMetricFormula(selectedMetric)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Component Scores Grid */}
      <div className="grid grid-cols-2 gap-4 w-full md:w-1/2">
        {Object.entries(componentScores).map(([key, value]) => (
          <div key={key} className="relative">
            <div
              className={`${cardClass} hover:shadow-lg transition-shadow p-5`}
              onMouseEnter={() => handleMetricHover(key)}
              onMouseLeave={handleMetricLeave}
            >
              <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                <h3 className="text-xs sm:text-sm font-medium capitalize text-emerald-800 dark:text-[#4ade80]">
                  {key}
                </h3>
                {getScoreIcon(key)}
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-bold text-center text-emerald-800 dark:text-[#4ade80]">
                  {typeof value === "number" ? value : 0}
                </div>
                <p className="text-xs text-[#6B8C7A] text-center mt-1 sm:mt-2">
                  {getScoreLabel(Number(value))}
                </p>
                <TrendDisplay scoreType={key} />
              </div>
            </div>
            {showTooltip && selectedMetric === key && (
              <div
                ref={tooltipRef}
                className="absolute top-0 left-0 w-full h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200"
                onMouseEnter={() => handleMetricHover(key)}
                onMouseLeave={handleMetricLeave}
              >
                <div className="bg-white dark:bg-[#0B140F] p-4 rounded-lg shadow-lg max-w-md transform transition-all duration-200 ease-in-out border border-[rgba(0,107,79,0.15)]">
                  <h3 className="text-lg font-medium text-emerald-800 dark:text-[#4ade80] capitalize mb-2">
                    {selectedMetric} Score Formula
                  </h3>
                  <p className="text-sm text-[#0A1A0F] dark:text-[#F0F7F3] whitespace-pre-line">
                    {getMetricFormula(selectedMetric)}
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
