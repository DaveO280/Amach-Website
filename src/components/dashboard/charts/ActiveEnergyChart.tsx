"use client";

import { processDailyActiveEnergyData } from "@/utils/chartDataProcessor";
import React, { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HealthData } from "../../../types/healthData";
import { ChartContainer } from "./ChartContainer";
import { useChartZoom } from "./useChartZoom";

// Design system tokens
const DS = {
  amber: "#F59E0B",
  amberSubtle: "rgba(245,158,11,0.7)",
  grid: "rgba(0,107,79,0.1)",
  axisText: "#6B8C7A",
  tooltipBorder: "rgba(0,107,79,0.15)",
  textPrimary: "#064E3B",
  textMuted: "#6B8C7A",
};

interface ActiveEnergyChartProps {
  data: HealthData[];
  height?: number;
}

const ActiveEnergyChart: React.FC<ActiveEnergyChartProps> = ({
  data,
  height = 300,
}) => {
  const chartData = useMemo(() => processDailyActiveEnergyData(data), [data]);
  const unit = data.length > 0 && data[0].unit ? data[0].unit : "kcal";
  const zoom = useChartZoom(chartData, "energy");

  return (
    <ChartContainer
      chartData={chartData}
      onZoomOut={zoom.handleZoomOut}
      canZoomOut={zoom.zoomHistory.length > 0 || !!zoom.left}
      fallbackMessage="No active energy data available for the selected time period."
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={chartData}
          onMouseDown={zoom.handleMouseDown}
          onMouseMove={zoom.handleMouseMove}
          onMouseUp={zoom.handleMouseUp}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={DS.grid} />
          <XAxis
            dataKey="day"
            tick={{ fill: DS.axisText, fontSize: 11 }}
            axisLine={{ stroke: DS.grid }}
            tickLine={false}
            domain={[zoom.left || "dataMin", zoom.right || "dataMax"]}
            type="category"
            tickFormatter={(value) => {
              const parts = value.split("-");
              if (parts.length === 3) {
                return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
              }
              return value;
            }}
          />
          <YAxis
            domain={[zoom.bottom || 0, zoom.top || "auto"]}
            tick={{ fill: DS.axisText, fontSize: 11 }}
            axisLine={{ stroke: DS.grid }}
            tickLine={false}
            label={{
              value: unit,
              angle: -90,
              position: "insideLeft",
              fill: DS.axisText,
              fontSize: 11,
            }}
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
            formatter={(value: number): [string, string] => [
              `${value} ${unit}`,
              "Active Energy",
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
          <Bar
            dataKey="energy"
            fill={DS.amberSubtle}
            name={`Daily Active Energy (${unit})`}
            radius={[2, 2, 0, 0]}
          />
          {zoom.refAreaLeft && zoom.refAreaRight && (
            <ReferenceArea
              x1={zoom.refAreaLeft}
              x2={zoom.refAreaRight}
              strokeOpacity={0.3}
              fill={DS.amber}
              fillOpacity={0.15}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
};

export default ActiveEnergyChart;
