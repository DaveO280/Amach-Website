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
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="day"
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
            label={{ value: unit, angle: -90, position: "insideLeft" }}
          />
          <Tooltip
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
          <Legend />
          <Bar
            dataKey="energy"
            fill="#FF5733"
            name={`Daily Active Energy (${unit})`}
          />
          {zoom.refAreaLeft && zoom.refAreaRight && (
            <ReferenceArea
              x1={zoom.refAreaLeft}
              x2={zoom.refAreaRight}
              strokeOpacity={0.3}
              fill="#FF5733"
              fillOpacity={0.3}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
};

export default ActiveEnergyChart;
