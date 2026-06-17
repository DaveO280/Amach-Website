"use client";

import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import {
  formatMetricValue,
  getMetricIcon,
  getMetricLabel,
  getMetricUnit,
} from "@/components/metricDisplayUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HealthDataByType } from "@/types/healthData";
import React, { useMemo } from "react";

type MetricKey =
  | "steps"
  | "exercise"
  | "heartRate"
  | "hrv"
  | "restingHR"
  | "respiratory"
  | "activeEnergy"
  | "sleep";

const HK_KEY: Record<MetricKey, string> = {
  steps: "HKQuantityTypeIdentifierStepCount",
  exercise: "HKQuantityTypeIdentifierAppleExerciseTime",
  heartRate: "HKQuantityTypeIdentifierHeartRate",
  hrv: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  restingHR: "HKQuantityTypeIdentifierRestingHeartRate",
  respiratory: "HKQuantityTypeIdentifierRespiratoryRate",
  activeEnergy: "HKQuantityTypeIdentifierActiveEnergyBurned",
  sleep: "HKCategoryTypeIdentifierSleepAnalysis",
};

// Metrics stored as many intraday records that must be summed per day before averaging.
// Averaging raw records directly produces severely deflated results when older data
// contains many small increments (e.g. 100-step chunks) vs. newer daily-total records.
const CUMULATIVE_METRICS: Set<MetricKey> = new Set([
  "steps",
  "exercise",
  "activeEnergy",
]);

function windowedAvg(
  metricData: HealthDataByType,
  key: MetricKey,
  days: number,
): number {
  const hkKey = HK_KEY[key];
  const points = metricData[hkKey] ?? [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const inWindow = points.filter((p) => {
    const t = new Date(p.startDate).getTime();
    return !isNaN(t) && t >= cutoff;
  });

  if (CUMULATIVE_METRICS.has(key)) {
    // Sum all intraday records into daily totals, then average those totals.
    // Zero-value records are skipped — a 0 in cumulative data means no activity
    // (device not worn), not a genuine rest day.
    const dailyTotals: Record<string, number> = {};
    for (const p of inWindow) {
      const dayKey = p.startDate.split("T")[0];
      const v = parseFloat(p.value);
      if (!isNaN(v) && v > 0) {
        dailyTotals[dayKey] = (dailyTotals[dayKey] ?? 0) + v;
      }
    }
    const totals = Object.values(dailyTotals);
    if (totals.length === 0) return 0;
    return Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
  }

  const values = inWindow
    .map((p) => parseFloat(p.value))
    .filter((v) => !isNaN(v));
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

interface WindowedAverages {
  last7: number;
  last30: number;
  last90: number;
  last180: number;
}

function useMetricWindows(
  metricData: HealthDataByType,
): Record<MetricKey, WindowedAverages> {
  return useMemo(() => {
    const keys: MetricKey[] = [
      "steps",
      "exercise",
      "heartRate",
      "hrv",
      "restingHR",
      "respiratory",
      "activeEnergy",
      "sleep",
    ];
    return Object.fromEntries(
      keys.map((k) => [
        k,
        {
          last7: windowedAvg(metricData, k, 7),
          last30: windowedAvg(metricData, k, 30),
          last90: windowedAvg(metricData, k, 90),
          last180: windowedAvg(metricData, k, 180),
        },
      ]),
    ) as Record<MetricKey, WindowedAverages>;
  }, [metricData]);
}

interface StatCardProps {
  keyName: MetricKey;
  title: string;
  icon: React.ReactNode;
  average: number;
  total?: number;
  unit: string;
  efficiency?: number;
  high?: number | string;
  low?: number | string;
  windows: WindowedAverages;
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
  windows,
}): JSX.Element => {
  const isSleep = title === getMetricLabel("sleep");

  const fmtWindow = (v: number): string => {
    if (isSleep) return formatMetricValue("sleep", v);
    return formatMetricValue(
      keyName as import("@/components/metricDisplayUtils").MetricKey,
      v,
    );
  };

  return (
    <Card className="bg-white/60 backdrop-blur-sm border-amber-100">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-emerald-800">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {isSleep ? (
          <>
            <div className="text-2xl font-bold text-emerald-900 font-mono">
              {unit}
            </div>
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
            <div className="text-2xl font-bold text-emerald-900 font-mono">
              {formatMetricValue(
                keyName as import("@/components/metricDisplayUtils").MetricKey,
                average,
              )}
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
        {/* Windowed averages from full Storj dataset */}
        {(windows.last7 > 0 ||
          windows.last30 > 0 ||
          windows.last90 > 0 ||
          windows.last180 > 0) && (
          <div className="mt-2 pt-2 border-t border-emerald-100">
            <div className="grid grid-cols-4 gap-1 text-xs text-emerald-600">
              {windows.last7 > 0 && (
                <div className="text-center">
                  <div className="font-medium text-emerald-800">
                    {fmtWindow(windows.last7)}
                  </div>
                  <div className="text-[10px]">7d</div>
                </div>
              )}
              {windows.last30 > 0 && (
                <div className="text-center">
                  <div className="font-medium text-emerald-800">
                    {fmtWindow(windows.last30)}
                  </div>
                  <div className="text-[10px]">30d</div>
                </div>
              )}
              {windows.last90 > 0 && (
                <div className="text-center">
                  <div className="font-medium text-emerald-800">
                    {fmtWindow(windows.last90)}
                  </div>
                  <div className="text-[10px]">90d</div>
                </div>
              )}
              {windows.last180 > 0 && (
                <div className="text-center">
                  <div className="font-medium text-emerald-800">
                    {fmtWindow(windows.last180)}
                  </div>
                  <div className="text-[10px]">180d</div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const HealthStatCards: React.FC = React.memo((): React.ReactNode => {
  const { metrics, metricData } = useHealthDataContext();
  const windows = useMetricWindows(metricData);

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
        const efficiency =
          "efficiency" in metric ? metric.efficiency : undefined;
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
            windows={windows[key]}
          />
        );
      })}
    </div>
  );
});

HealthStatCards.displayName = "HealthStatCards";

export default HealthStatCards;
