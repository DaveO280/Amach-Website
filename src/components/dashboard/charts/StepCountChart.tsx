"use client";

import React, { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HealthData } from "../../../types/healthData";
import { processDailyNumericData } from "../../../utils/chartDataProcessor";

// Design system tokens
const DS = {
  emerald: "#006B4F",
  emeraldSubtle: "rgba(0,107,79,0.65)",
  amber: "#F59E0B",
  grid: "rgba(0,107,79,0.1)",
  axisText: "#6B8C7A",
  tooltipBorder: "rgba(0,107,79,0.15)",
  textPrimary: "#064E3B",
  textMuted: "#6B8C7A",
};

interface StepCountChartProps {
  data: HealthData[];
  height?: number;
}

const StepCountChart: React.FC<StepCountChartProps> = ({
  data,
  height = 300,
}) => {
  const chartData = useMemo(() => {
    const dailyData = processDailyNumericData(data);

    return dailyData.map((item, index, array) => {
      const startIndex = Math.max(0, index - 29);
      const trailingData = array.slice(startIndex, index + 1);
      const trailingAvg =
        trailingData.length > 0
          ? Math.round(
              trailingData.reduce((sum, day) => sum + day.value, 0) /
                trailingData.length,
            )
          : 0;

      return {
        ...item,
        steps: item.value,
        trailingAvg,
      };
    });
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
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
          itemStyle={{ color: DS.textMuted }}
          formatter={(value) => {
            const v = typeof value === "number" ? value : Number(value ?? 0);
            return [`${v} steps`, "Step Count"];
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
        <Bar
          dataKey="steps"
          fill={DS.emeraldSubtle}
          name="Daily Steps"
          radius={[2, 2, 0, 0]}
        />
        <Line
          type="monotone"
          dataKey="trailingAvg"
          stroke={DS.amber}
          strokeWidth={2}
          dot={false}
          name="30-Day Average"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default StepCountChart;
