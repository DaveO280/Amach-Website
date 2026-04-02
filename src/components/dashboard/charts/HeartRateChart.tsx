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

// Design system tokens
const DS = {
  emerald: "#006B4F",
  emeraldLight: "#4ade80",
  emeraldSubtle: "rgba(0,107,79,0.18)",
  grid: "rgba(0,107,79,0.1)",
  axisText: "#6B8C7A",
  tooltipBg: "#FFFFFF",
  tooltipBgDark: "#111F1A",
  tooltipBorder: "rgba(0,107,79,0.15)",
  textPrimary: "#064E3B",
  textMuted: "#6B8C7A",
  errorRed: "#EF4444",
  successGreen: "#059669",
};

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

  const zoom = useChartZoom(chartData, "avg");

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
        <div
          style={{
            background: DS.tooltipBg,
            border: `1px solid ${DS.tooltipBorder}`,
            borderRadius: 10,
            padding: "10px 14px",
            minWidth: 160,
            boxShadow: "0 4px 16px rgba(0,107,79,0.08)",
          }}
        >
          <div
            style={{
              color: DS.textPrimary,
              fontWeight: 600,
              fontSize: 12,
              marginBottom: 6,
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: 12, color: DS.textMuted }}>
            <div>
              <span style={{ color: DS.emerald, fontWeight: 600 }}>Avg: </span>
              <span style={{ color: DS.emerald, fontWeight: 700 }}>
                {d.avg} BPM
              </span>
            </div>
            <div>
              <span style={{ color: DS.successGreen }}>Min: </span>
              <span style={{ color: DS.successGreen, fontWeight: 600 }}>
                {d.min} BPM
              </span>
            </div>
            <div>
              <span style={{ color: DS.errorRed }}>Max: </span>
              <span style={{ color: DS.errorRed, fontWeight: 600 }}>
                {d.max} BPM
              </span>
            </div>
            <div style={{ marginTop: 4 }}>
              <span>Readings: </span>
              <span style={{ fontWeight: 600, color: DS.textPrimary }}>
                {d.count}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BarRangeShape = (props: any): JSX.Element => {
    const { x, y, width, height } = props;
    return (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={DS.emeraldLight}
        opacity={0.35}
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
            domain={[0, zoom.top || "auto"]}
            tick={{ fill: DS.axisText, fontSize: 11 }}
            axisLine={{ stroke: DS.grid }}
            tickLine={false}
            label={{
              value: "BPM",
              angle: -90,
              position: "insideLeft",
              fill: DS.axisText,
              fontSize: 11,
            }}
          />
          <Tooltip content={CustomTooltip} />
          <Legend wrapperStyle={{ fontSize: 12, color: DS.textMuted }} />
          <Bar
            dataKey="range"
            fill={DS.emeraldLight}
            name="Heart Rate Range"
            isAnimationActive={false}
            shape={BarRangeShape}
          />
          <Line
            type="monotone"
            dataKey="avg"
            stroke={DS.emerald}
            strokeWidth={2}
            dot={{ r: 2, fill: DS.emerald }}
            name="Average Heart Rate"
            isAnimationActive={false}
          />
          {zoom.refAreaLeft && zoom.refAreaRight && (
            <ReferenceArea
              x1={zoom.refAreaLeft}
              x2={zoom.refAreaRight}
              strokeOpacity={0.3}
              fill={DS.emerald}
              fillOpacity={0.1}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
};

export default HeartRateChart;
