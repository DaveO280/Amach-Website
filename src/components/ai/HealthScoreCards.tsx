"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHealthScoreCalculator } from "@/utils/healthScoreCalculator";
import { Activity, Heart, Moon, Scale, Star, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ProfileData {
  sex: "male" | "female";
  age: number;
  height: number;
  weight: number;
}

interface HealthScores {
  overall: number;
  activity: number;
  sleep: number;
  heart: number;
  energy: number;
}

interface HealthScoreCardsProps {
  profileData: ProfileData;
}

export function HealthScoreCards({
  profileData,
}: HealthScoreCardsProps): JSX.Element {
  const healthScores = useHealthScoreCalculator(profileData);
  const [selectedMetric, setSelectedMetric] = useState<
    keyof HealthScores | null
  >(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const hoverTimeout = useRef<NodeJS.Timeout>();
  const tooltipRef = useRef<HTMLDivElement>(null);

  const getScoreIcon = (scoreType: keyof HealthScores): JSX.Element => {
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

  const getMetricFormula = (metric: keyof HealthScores): string => {
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

  const handleMetricHover = (metric: keyof HealthScores): void => {
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

  if (!healthScores) {
    return <span />;
  }

  const { overall, ...componentScores } = healthScores;

  return (
    <div className="flex gap-4">
      {/* Overall Score Card */}
      <div className="relative flex-1">
        <Card
          className="hover:shadow-lg transition-shadow"
          onMouseEnter={() => handleMetricHover("overall")}
          onMouseLeave={handleMetricLeave}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium text-emerald-800">
              Overall Health Score
            </CardTitle>
            <Scale className="h-6 w-6 text-emerald-800" />
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center h-full">
            <div className="text-7xl font-bold text-emerald-800">{overall}</div>
            <p className="text-sm text-muted-foreground mt-2">
              {getScoreLabel(overall)}
            </p>
          </CardContent>
        </Card>
        {showTooltip && selectedMetric === "overall" && (
          <div
            ref={tooltipRef}
            className="absolute top-0 left-0 w-full h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200"
            onMouseEnter={() => handleMetricHover("overall")}
            onMouseLeave={handleMetricLeave}
          >
            <div className="bg-white p-4 rounded-lg shadow-lg max-w-md transform transition-all duration-200 ease-in-out">
              <h3 className="text-lg font-medium text-emerald-800 capitalize mb-2">
                {selectedMetric} Score Formula
              </h3>
              <p className="text-sm whitespace-pre-line">
                {getMetricFormula(selectedMetric)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Component Scores Grid */}
      <div className="grid grid-cols-2 gap-4 w-1/2">
        {Object.entries(componentScores).map(([key, value]) => (
          <div key={key} className="relative">
            <Card
              className="hover:shadow-lg transition-shadow"
              onMouseEnter={() => handleMetricHover(key as keyof HealthScores)}
              onMouseLeave={handleMetricLeave}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium capitalize text-emerald-800">
                  {key}
                </CardTitle>
                {getScoreIcon(key as keyof HealthScores)}
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-center text-emerald-800">
                  {value}
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  {getScoreLabel(value as number)}
                </p>
              </CardContent>
            </Card>
            {showTooltip && selectedMetric === key && (
              <div
                ref={tooltipRef}
                className="absolute top-0 left-0 w-full h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200"
                onMouseEnter={() =>
                  handleMetricHover(key as keyof HealthScores)
                }
                onMouseLeave={handleMetricLeave}
              >
                <div className="bg-white p-4 rounded-lg shadow-lg max-w-md transform transition-all duration-200 ease-in-out">
                  <h3 className="text-lg font-medium text-emerald-800 capitalize mb-2">
                    {selectedMetric} Score Formula
                  </h3>
                  <p className="text-sm whitespace-pre-line">
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
