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

interface VO2MaxChartProps {
  data: HealthData[];
  height?: number;
}

const VO2MaxChart: React.FC<VO2MaxChartProps> = ({ data, height = 300 }) => {
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
        console.error("Error processing VO2 Max data point:", e);
      }
    });

    const result = Object.entries(dailyData)
      .map(([day, data]) => {
        const avg =
          data.values.reduce((sum, val) => sum + val, 0) / data.values.length;

        return {
          day,
          date: new Date(day + "T12:00:00"),
          value: Math.round(avg * 10) / 10,
          min: Math.round(data.min * 10) / 10,
          max: Math.round(data.max * 10) / 10,
          count: data.values.length,
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    console.log("VO2MaxChart - processed VO2 Max chart data:", result.length);
    if (result.length > 0) {
      console.log("VO2MaxChart - first VO2 Max chart data point:", result[0]);
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
          formatter={(value) => {
            const v = typeof value === "number" ? value : Number(value ?? 0);
            return [
              `${Number.isFinite(v) ? v.toFixed(1) : v} ml/(kg·min)`,
              "VO2 Max",
            ];
          }}
          labelFormatter={(label) => {
            const s = String(label ?? "");
            const parts = s.split("-");
            if (parts.length === 3) {
              return `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0]}`;
            }
            return s;
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: DS.textMuted }} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={DS.amber}
          strokeWidth={2}
          dot={false}
          name="VO2 Max"
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default VO2MaxChart;
