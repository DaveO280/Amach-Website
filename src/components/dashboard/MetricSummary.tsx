"use client";

import {
  formatMetricValue,
  getMetricLabel,
  getMetricUnit,
} from "@/components/metricDisplayUtils";
import {
  HealthContextMetrics,
  HealthMetricWithRange,
  SleepMetricWithRange,
} from "@/types/HealthContext";
import React from "react";

const cardClass =
  "rounded-xl border bg-white dark:bg-[#0B140F] border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)] overflow-hidden";

// Update the interface to accept HealthContextMetrics
interface MetricSummaryProps {
  metricData: HealthContextMetrics | undefined;
}

export const MetricSummary: React.FC<MetricSummaryProps> = React.memo(
  ({ metricData }) => {
    if (!metricData) {
      return <div className="text-center p-4">No metrics data available</div>;
    }
    // Compose summaries from metrics
    const metricKeys = [
      "steps",
      "exercise",
      "heartRate",
      "hrv",
      "restingHR",
      "respiratory",
      "activeEnergy",
      "sleep",
    ] as const;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metricKeys.map((key) => {
          const m = metricData[key];
          if (!m) return null;
          if (key === "sleep") {
            const sleepMetric = m as SleepMetricWithRange;
            return (
              <div key={key} className={cardClass}>
                <div className="p-4">
                  <h3 className="text-lg font-medium mb-2 text-[#0A1A0F] dark:text-[#F0F7F3]">
                    {getMetricLabel(key)}
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#6B8C7A]">Average:</span>
                      <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                        {formatMetricValue("sleep", sleepMetric.average)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6B8C7A]">High:</span>
                      <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                        {formatMetricValue("sleep", sleepMetric.high)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6B8C7A]">Low:</span>
                      <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                        {formatMetricValue("sleep", sleepMetric.low)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6B8C7A]">Efficiency:</span>
                      <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                        {sleepMetric.efficiency}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          } else {
            const metric = m as HealthMetricWithRange;
            return (
              <div key={key} className={cardClass}>
                <div className="p-4">
                  <h3 className="text-lg font-medium mb-2 text-[#0A1A0F] dark:text-[#F0F7F3]">
                    {getMetricLabel(key)}
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#6B8C7A]">Average:</span>
                      <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                        {metric.average} {getMetricUnit(key)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6B8C7A]">High:</span>
                      <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                        {metric.high} {getMetricUnit(key)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6B8C7A]">Low:</span>
                      <span className="font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                        {metric.low} {getMetricUnit(key)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          }
        })}
      </div>
    );
  },
);

MetricSummary.displayName = "MetricSummary";

export default MetricSummary;
