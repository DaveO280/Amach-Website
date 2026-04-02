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

// Design system tokens
const DS = {
  amber: "#F59E0B",
  amberDark: "#D97706",
  grid: "rgba(0,107,79,0.1)",
  axisText: "#6B8C7A",
  tooltipBorder: "rgba(0,107,79,0.15)",
  textPrimary: "#064E3B",
  textMuted: "#6B8C7A",
};

interface HRVChartProps {
  data: HealthData[];
  height?: number;
}

const HRVChart: React.FC<HRVChartProps> = ({ data, height = 300 }) => {
  const chartData = useMemo(() => {
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

    const result = Object.entries(dailyData)
      .map(([day, data]) => {
        const avg =
          data.values.reduce((sum, val) => sum + val, 0) / data.values.length;

        return {
          day,
          date: new Date(day + "T12:00:00"),
          value: Math.round(avg),
          min: Math.round(data.min),
          max: Math.round(data.max),
          count: data.values.length,
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());

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
        <CartesianGrid strokeDasharray="3 3" stroke={DS.grid} />
        <XAxis
          dataKey="day"
          tick={{ fill: DS.axisText, fontSize: 11 }}
          axisLine={{ stroke: DS.grid }}
          tickLine={false}
          tickFormatter={(value) => {
            const parts = value.split("-");
            if (parts.length === 3) {
              return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
            }
            return value;
          }}
        />
        <YAxis
          tick={{ fill: DS.axisText, fontSize: 11 }}
          axisLine={{ stroke: DS.grid }}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "#FFFFFF",
            border: `1px solid ${DS.tooltipBorder}`,
            borderRadius: 10,
            boxShadow: "0 4px 16px rgba(0,107,79,0.08)",
            fontSize: 12,
          }}
          labelStyle={{ color: DS.textPrimary, fontWeight: 600 }}
          itemStyle={{ color: DS.amberDark }}
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
        <Legend wrapperStyle={{ fontSize: 12, color: DS.textMuted }} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={DS.amber}
          strokeWidth={2}
          dot={false}
          name="HRV"
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default HRVChart;
