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
import { Card, CardContent } from "../ui/card";

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
              <Card key={key} className="overflow-hidden">
                <CardContent className="p-4">
                  <h3 className="text-lg font-medium mb-2">
                    {getMetricLabel(key)}
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Average:</span>
                      <span className="font-medium">
                        {formatMetricValue("sleep", sleepMetric.average)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">High:</span>
                      <span className="font-medium">
                        {formatMetricValue("sleep", sleepMetric.high)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Low:</span>
                      <span className="font-medium">
                        {formatMetricValue("sleep", sleepMetric.low)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Efficiency:</span>
                      <span className="font-medium">
                        {sleepMetric.efficiency}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          } else {
            const metric = m as HealthMetricWithRange;
            return (
              <Card key={key} className="overflow-hidden">
                <CardContent className="p-4">
                  <h3 className="text-lg font-medium mb-2">
                    {getMetricLabel(key)}
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Average:</span>
                      <span className="font-medium">
                        {metric.average} {getMetricUnit(key)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">High:</span>
                      <span className="font-medium">
                        {metric.high} {getMetricUnit(key)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Low:</span>
                      <span className="font-medium">
                        {metric.low} {getMetricUnit(key)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }
        })}
      </div>
    );
  },
);

MetricSummary.displayName = "MetricSummary";

export default MetricSummary;
