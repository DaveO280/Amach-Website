"use client";

import React, { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  TooltipProps,
  XAxis,
  YAxis,
} from "recharts";
import { HealthData } from "../../../types/healthData";
import { processDailyHeartRateData } from "../../../utils/chartDataProcessor";
import { ChartContainer } from "./ChartContainer";
import { useChartZoom } from "./useChartZoom";

interface HeartRateChartProps {
  data: HealthData[];
  height?: number;
}

const HeartRateChart: React.FC<HeartRateChartProps> = ({
  data,
  height = 300,
}) => {
  const chartData = useMemo(() => {
    const daily = processDailyHeartRateData(data);
    return daily.map((d) => ({
      day: d.day,
      date: d.date,
      avg: d.avg,
      min: d.min,
      max: d.max,
      range: [d.min, d.max] as [number, number],
      count: d.count,
    }));
  }, [data]);

  // Use shared zoom logic
  const zoom = useChartZoom(chartData, "avg");

  // Custom tooltip
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: TooltipProps<number, string>): JSX.Element | null => {
    if (active && payload && payload.length) {
      const d = (payload[0] && payload[0].payload) as {
        avg: number;
        min: number;
        max: number;
        count: number;
      };
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200 min-w-[160px]">
          <div className="font-semibold mb-1">{label}</div>
          <div className="text-xs">
            <div>
              <span className="font-medium text-indigo-700">Average: </span>
              <span className="font-semibold text-indigo-700">{d.avg} BPM</span>
            </div>
            <div>
              <span className="text-green-700">Min: </span>
              <span className="font-semibold text-green-700">{d.min} BPM</span>
            </div>
            <div>
              <span className="text-red-700">Max: </span>
              <span className="font-semibold text-red-700">{d.max} BPM</span>
            </div>
            <div>
              <span className="text-gray-500">Readings: </span>
              <span className="font-semibold text-gray-700">{d.count}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom shape for the min-max bar: bar starts at min, height is max-min
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BarRangeShape = (props: any): JSX.Element => {
    const { x, y, width, height } = props;
    return (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="#A7F3D0"
        opacity={0.7}
        rx={2}
      />
    );
  };

  return (
    <ChartContainer
      chartData={chartData}
      onZoomOut={zoom.handleZoomOut}
      canZoomOut={zoom.zoomHistory.length > 0 || !!zoom.left}
      fallbackMessage="No heart rate data available for the selected time period."
    >
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
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
            domain={[0, zoom.top || "auto"]}
            label={{ value: "BPM", angle: -90, position: "insideLeft" }}
          />
          <Tooltip content={CustomTooltip} />
          <Legend />
          {/* Bar for min-max range */}
          <Bar
            dataKey="range"
            fill="#A7F3D0"
            name="Heart Rate Range"
            isAnimationActive={false}
            shape={BarRangeShape}
          />
          {/* Line for average */}
          <Line
            type="monotone"
            dataKey="avg"
            stroke="#6366F1"
            strokeWidth={2}
            dot={{ r: 2, fill: "#6366F1" }}
            name="Average Heart Rate"
            isAnimationActive={false}
          />
          {zoom.refAreaLeft && zoom.refAreaRight && (
            <ReferenceArea
              x1={zoom.refAreaLeft}
              x2={zoom.refAreaRight}
              strokeOpacity={0.3}
              fill="#6366F1"
              fillOpacity={0.1}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
};

export default HeartRateChart;
