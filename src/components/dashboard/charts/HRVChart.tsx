"use client";

import React, { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HealthData } from "../../../types/healthData";
import { extractDatePart } from "../../../utils/dataDeduplicator";

interface HRVChartProps {
  data: HealthData[];
  height?: number;
}

const HRVChart: React.FC<HRVChartProps> = ({ data, height = 300 }) => {
  const chartData = useMemo(() => {
    // Group data by day using extractDatePart to avoid timezone issues
    const dailyData: Record<
      string,
      { values: number[]; min: number; max: number }
    > = {};

    data.forEach((point) => {
      try {
        const dayKey = extractDatePart(point.startDate);
        const value = parseFloat(point.value as string);

        if (!isNaN(value)) {
          if (!dailyData[dayKey]) {
            dailyData[dayKey] = {
              values: [],
              min: Number.MAX_SAFE_INTEGER,
              max: Number.MIN_SAFE_INTEGER,
            };
          }

          dailyData[dayKey].values.push(value);
          dailyData[dayKey].min = Math.min(dailyData[dayKey].min, value);
          dailyData[dayKey].max = Math.max(dailyData[dayKey].max, value);
        }
      } catch (e) {
        console.error("Error processing HRV data point:", e);
      }
    });

    // Calculate averages and format for chart
    const result = Object.entries(dailyData)
      .map(([day, data]) => {
        const avg =
          data.values.reduce((sum, val) => sum + val, 0) / data.values.length;

        return {
          day,
          date: new Date(day + "T12:00:00"), // Use noon time to avoid date shifting
          value: Math.round(avg),
          min: Math.round(data.min),
          max: Math.round(data.max),
          count: data.values.length,
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // Add debugging for chart data
    console.log("HRVChart - processed chart data:", result.length);
    if (result.length > 0) {
      console.log("HRVChart - first chart data point:", result[0]);
    }

    return result;
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={chartData}
        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="day"
          tickFormatter={(value) => {
            const parts = value.split("-");
            if (parts.length === 3) {
              return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
            }
            return value;
          }}
        />
        <YAxis />
        <Tooltip
          formatter={(value: number): [string, string] => [
            `${value} ms`,
            "HRV",
          ]}
          labelFormatter={(label: string): string => {
            const parts = label.split("-");
            if (parts.length === 3) {
              return `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0]}`;
            }
            return label;
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#9C27B0"
          name="HRV"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default HRVChart;
