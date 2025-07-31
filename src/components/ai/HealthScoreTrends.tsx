"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getScoreTrends,
  type ScoreTrends,
} from "@/utils/dailyHealthScoreCalculator";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

interface HealthScoreTrendsProps {
  className?: string;
}

export function HealthScoreTrends({
  className = "",
}: HealthScoreTrendsProps): JSX.Element {
  const [scoreTrends, setScoreTrends] = useState<ScoreTrends | null>(null);
  const [loadingTrends, setLoadingTrends] = useState(false);

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

  const getTrendIcon = (current: number, trend: number): JSX.Element => {
    if (trend === 0) return <Minus className="h-3 w-3 text-gray-400" />;
    if (current > trend)
      return <TrendingUp className="h-3 w-3 text-green-500" />;
    if (current < trend)
      return <TrendingDown className="h-3 w-3 text-red-500" />;
    return <Minus className="h-3 w-3 text-gray-400" />;
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    return "Needs Improvement";
  };

  if (loadingTrends) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg font-medium text-emerald-800">
            Health Score Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-gray-500">Loading trends...</div>
        </CardContent>
      </Card>
    );
  }

  if (!scoreTrends) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg font-medium text-emerald-800">
            Health Score Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-gray-500">
            No trend data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const scoreTypes = [
    { key: "overall", label: "Overall", color: "text-emerald-800" },
    { key: "activity", label: "Activity", color: "text-emerald-600" },
    { key: "sleep", label: "Sleep", color: "text-amber-500" },
    { key: "heart", label: "Heart", color: "text-red-500" },
    { key: "energy", label: "Energy", color: "text-yellow-500" },
  ] as const;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-medium text-emerald-800">
          Health Score Trends
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {scoreTypes.map(({ key, label, color }) => {
            const trends = scoreTrends[key];
            if (!trends) return null;

            return (
              <div
                key={key}
                className="border-b border-gray-100 pb-3 last:border-b-0"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className={`font-medium ${color}`}>{label}</h4>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">7 days:</span>
                    <div className="flex items-center gap-1">
                      {getTrendIcon(trends.last7Days, trends.last30Days)}
                      <span className="font-medium">{trends.last7Days}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">30 days:</span>
                    <div className="flex items-center gap-1">
                      {getTrendIcon(trends.last30Days, trends.last3Months)}
                      <span className="font-medium">{trends.last30Days}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">3 months:</span>
                    <div className="flex items-center gap-1">
                      <Minus className="h-3 w-3 text-gray-400" />
                      <span className="font-medium">{trends.last3Months}</span>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {getScoreLabel(trends.last7Days)}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
