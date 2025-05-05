"use client";

import React, { useMemo } from "react";
import { getMetricById } from "../../core/metricDefinitions";
import { HealthDataByType, HealthDataPoint } from "../../types/healthData";
import { Card, CardContent } from "../ui/card";

// Update the interface to accept Record<string, unknown[]> as well
interface MetricSummaryProps {
  metricData: HealthDataByType | Record<string, unknown[]>;
}

export const MetricSummary: React.FC<MetricSummaryProps> = ({ metricData }) => {
  const summaries = useMemo(() => {
    console.log("Processing metric data for summary", Object.keys(metricData));

    try {
      return Object.entries(metricData)
        .filter(([, data]) => data && Array.isArray(data) && data.length > 0)
        .map(([metricId, data]) => {
          try {
            // Properly type the data as HealthDataPoint[]
            const typedData = data as HealthDataPoint[];

            // Get metric info
            const metric = getMetricById(metricId);
            const metricName = metric?.name || metricId;

            // Calculate summary statistics
            const count = typedData.length;

            // Calculate average if the data is numeric
            let avgValue: number | null = null;
            try {
              const numericValues = typedData
                .filter((d) => d && d.value && typeof d.value === "string")
                .map((d) => {
                  const value = parseFloat(d.value);
                  // Convert respiratory rate from count/min to breaths/min
                  if (metricId === "HKQuantityTypeIdentifierRespiratoryRate") {
                    return value / 60; // Convert from count/min to breaths/min
                  }
                  return value;
                })
                .filter((v) => !isNaN(v));

              if (numericValues.length > 0) {
                const sum = numericValues.reduce((a, b) => a + b, 0);
                avgValue = Math.round((sum / numericValues.length) * 100) / 100;
              }
            } catch (e) {
              console.error("Error calculating average for", metricId, e);
              // Not numeric data
            }

            // Find date range with safety checks
            let firstDate = new Date();
            let lastDate = new Date();

            try {
              // Filter out invalid dates first
              const validDates = typedData
                .filter(
                  (d) => d && d.startDate && typeof d.startDate === "string",
                )
                .map((d) => {
                  try {
                    return new Date(d.startDate);
                  } catch (e) {
                    return null;
                  }
                })
                .filter((d): d is Date => d !== null && !isNaN(d.getTime()));

              if (validDates.length > 0) {
                // Use a safer approach to find min/max dates
                firstDate = validDates.reduce(
                  (min, date) => (date < min ? date : min),
                  validDates[0],
                );

                lastDate = validDates.reduce(
                  (max, date) => (date > max ? date : max),
                  validDates[0],
                );
              }
            } catch (e) {
              console.error("Error processing dates for", metricId, e);
              // Use current date as fallback
            }

            // Get unit if available
            const unit = typedData[0]?.unit || "";

            return {
              id: metricId,
              name: metricName,
              count,
              avgValue,
              unit,
              firstDate,
              lastDate,
            };
          } catch (e) {
            console.error("Error processing metric", metricId, e);
            // Return a default summary for this metric
            return {
              id: metricId,
              name: metricId,
              count: (data as unknown[]).length,
              avgValue: null,
              unit: "",
              firstDate: new Date(),
              lastDate: new Date(),
            };
          }
        });
    } catch (e) {
      console.error("Error processing metrics summary", e);
      return [];
    }
  }, [metricData]);

  if (summaries.length === 0) {
    return <div className="text-center p-4">No metrics data available</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {summaries.map((summary) => (
        <Card key={summary.id} className="overflow-hidden">
          <CardContent className="p-4">
            <h3 className="text-lg font-medium mb-2">{summary.name}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Data Points:</span>
                <span className="font-medium">
                  {summary.count.toLocaleString()}
                </span>
              </div>

              {summary.avgValue !== null && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Average Value:</span>
                  <span className="font-medium">
                    {summary.avgValue.toLocaleString()} {summary.unit}
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-gray-500">First Record:</span>
                <span className="font-medium">
                  {summary.firstDate.toLocaleDateString()}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-500">Last Record:</span>
                <span className="font-medium">
                  {summary.lastDate.toLocaleDateString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

// Add default export to support both import styles
export default MetricSummary;
