"use client";

import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import {
  formatMetricValue,
  getMetricIcon,
  getMetricLabel,
  getMetricUnit,
} from "@/components/metricDisplayUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import React from "react";

interface StatCardProps {
  keyName: import("@/components/metricDisplayUtils").MetricKey;
  title: string;
  icon: React.ReactNode;
  average: number;
  total?: number;
  unit: string;
  efficiency?: number;
  high?: number | string;
  low?: number | string;
}

const StatCard: React.FC<StatCardProps> = ({
  keyName,
  title,
  icon,
  average,
  total,
  unit,
  efficiency,
  high,
  low,
}): JSX.Element => {
  return (
    <Card className="bg-white/60 backdrop-blur-sm border-amber-100">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-emerald-800">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {title === getMetricLabel("sleep") ? (
          <>
            <div className="text-2xl font-bold text-emerald-900">{unit}</div>
            {efficiency !== undefined && (
              <p className="text-xs text-emerald-600">
                Efficiency: {efficiency.toFixed(1)}%
              </p>
            )}
            {(high !== undefined || low !== undefined) && (
              <div className="flex justify-between text-xs text-emerald-600 mt-1">
                {low !== undefined && (
                  <span>
                    Low: {typeof low === "number" ? low.toFixed(0) : low}
                  </span>
                )}
                {high !== undefined && (
                  <span>
                    High: {typeof high === "number" ? high.toFixed(0) : high}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-2xl font-bold text-emerald-900">
              {formatMetricValue(keyName, average)}
              <span className="text-sm text-emerald-600 ml-1">{unit}</span>
            </div>
            {total !== undefined && (
              <p className="text-xs text-emerald-600">
                Total: {total.toFixed(0)} {unit}
              </p>
            )}
            {(high !== undefined || low !== undefined) && (
              <div className="flex justify-between text-xs text-emerald-600 mt-1">
                {low !== undefined && (
                  <span>
                    Low: {typeof low === "number" ? low.toFixed(0) : low} {unit}
                  </span>
                )}
                {high !== undefined && (
                  <span>
                    High: {typeof high === "number" ? high.toFixed(0) : high}{" "}
                    {unit}
                  </span>
                )}
              </div>
            )}
            {efficiency !== undefined && (
              <p className="text-xs text-emerald-600">
                Efficiency: {efficiency.toFixed(1)}%
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

const HealthStatCards: React.FC = React.memo((): React.ReactNode => {
  const { metrics } = useHealthDataContext();
  if (!metrics) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {(
        [
          "steps",
          "exercise",
          "heartRate",
          "hrv",
          "restingHR",
          "respiratory",
          "activeEnergy",
          "sleep",
        ] as const
      ).map((key) => {
        const metric = metrics[key];
        // Only SleepMetricsSummary has efficiency
        const efficiency =
          "efficiency" in metric ? metric.efficiency : undefined;
        // Only some metrics have total
        const total = "total" in metric ? metric.total : undefined;
        return (
          <StatCard
            keyName={key}
            key={key}
            title={getMetricLabel(key)}
            icon={getMetricIcon(key)}
            average={metric.average || 0}
            unit={
              key === "sleep"
                ? formatMetricValue("sleep", metrics.sleep.average || 0)
                : getMetricUnit(key)
            }
            high={
              key === "sleep"
                ? formatMetricValue("sleep", metrics.sleep.high || 0)
                : metric.high
            }
            low={
              key === "sleep"
                ? formatMetricValue("sleep", metrics.sleep.low || 0)
                : metric.low
            }
            efficiency={efficiency as number | undefined}
            total={total as number | undefined}
          />
        );
      })}
    </div>
  );
});

HealthStatCards.displayName = "HealthStatCards";

export default HealthStatCards;
