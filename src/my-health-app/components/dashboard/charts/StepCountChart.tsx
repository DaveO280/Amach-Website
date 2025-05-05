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

interface StepCountChartProps {
  data: HealthData[];
  height?: number;
}

const StepCountChart: React.FC<StepCountChartProps> = ({
  data,
  height = 300,
}) => {
  // Process data using centralized utility
  const chartData = useMemo(() => {
    const dailyData = processDailyNumericData(data);

    // Calculate trailing 30-day average
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
          formatter={(value: number) => [`${value} steps`, "Step Count"]}
          labelFormatter={(label) => {
            const parts = label.split("-");
            if (parts.length === 3) {
              return `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0]}`;
            }
            return label;
          }}
        />
        <Legend />
        <Bar dataKey="steps" fill="#4CAF50" name="Daily Steps" />
        <Line
          type="monotone"
          dataKey="trailingAvg"
          stroke="#FF9800"
          name="30-Day Average"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default StepCountChart;
