"use client";

import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import {
  formatMetricValue,
  getMetricIcon,
  getMetricLabel,
  getMetricUnit,
} from "@/components/metricDisplayUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isCumulativeMetric } from "@/storage/appleHealth/metricAggregationStrategies";
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

  // Cumulative metrics (aggregationType:"sum" in metricAggregationStrategies) must be
  // summed per calendar day before averaging. Apple Health may store them as many small
  // intraday records; averaging raw records directly gives heavily deflated results for
  // older data. This mirrors processCumulativeData() in HealthDataContextWrapper.
  //
  // Date key: substring(0,10) handles both ISO "YYYY-MM-DDT..." format (Storj/modern)
  // and Apple Health XML space-separated "YYYY-MM-DD ..." format (legacy IndexedDB
  // records). split("T")[0] silently breaks for space-separated dates, producing a
  // unique key per record and inflating totals.length to the record count rather than
  // the day count — causing longer-window averages to collapse by a large factor.
  if (isCumulativeMetric(hkKey)) {
    const dailyTotals: Record<string, number> = {};
    for (const p of inWindow) {
      const dayKey = p.startDate.substring(0, 10);
      const v = parseFloat(p.value);
      // Exclude zero/missing-wear days from both the sum and the day count so
      // they don't pull the average down when the window extends past the coverage
      // of the Storj archive.
      if (!isNaN(v) && v > 0) {
        dailyTotals[dayKey] = (dailyTotals[dayKey] ?? 0) + v;
      }
    }
    const totals = Object.values(dailyTotals);
    if (totals.length === 0) return 0;
    return Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
  }

  // Non-cumulative metrics: average over days with actual readings only.
  // Group by calendar day (same substring fix), collect values per day, then
  // average the per-day means. Days with no record — or only zero-value
  // placeholder records — are excluded from the denominator.
  const dailyValues: Record<string, number[]> = {};
  for (const p of inWindow) {
    const dayKey = p.startDate.substring(0, 10);
    const v = parseFloat(p.value);
    if (!isNaN(v) && v > 0) {
      if (!dailyValues[dayKey]) dailyValues[dayKey] = [];
      dailyValues[dayKey].push(v);
    }
  }
  const dayMeans = Object.values(dailyValues).map(
    (vs) => vs.reduce((a, b) => a + b, 0) / vs.length,
  );
  if (dayMeans.length === 0) return 0;
  return Math.round(dayMeans.reduce((a, b) => a + b, 0) / dayMeans.length);
}

interface WindowedAverages {
  last7: number;
  last30: number;
  last90: number;
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

  const hasAnyWindow =
    windows.last7 > 0 || windows.last30 > 0 || windows.last90 > 0;

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
            {/* Main value: all-time average — never changes with window values */}
            <div className="text-2xl font-bold text-emerald-900 font-mono">
              {unit}
            </div>
            {efficiency !== undefined && (
              <p className="text-xs text-emerald-600">
                Efficiency: {efficiency.toFixed(1)}%
              </p>
            )}
            {/* All-time high/low — never changes with window values */}
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
            {/* Main value: all-time average — never changes with window values */}
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
            {/* All-time high/low — never changes with window values */}
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
        {/* Static 3-column window averages — all visible simultaneously */}
        {hasAnyWindow && (
          <div className="mt-2 pt-2 border-t border-emerald-100">
            <div className="grid grid-cols-3 gap-1 text-center">
              {(
                [
                  { label: "7d", value: windows.last7 },
                  { label: "30d", value: windows.last30 },
                  { label: "90d", value: windows.last90 },
                ] as const
              ).map(({ label, value }) => (
                <div key={label}>
                  <div className="text-[10px] text-emerald-500">{label}</div>
                  <div className="text-xs font-medium text-emerald-800">
                    {value > 0 ? fmtWindow(value) : "—"}
                  </div>
                </div>
              ))}
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
