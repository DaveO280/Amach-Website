"use client";

import React, { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HealthData } from "../../../types/healthData";
import { extractDatePart } from "../../../utils/dataDeduplicator";

interface HeartRateChartProps {
  data: HealthData[];
  height?: number;
}

const HeartRateChart: React.FC<HeartRateChartProps> = ({
  data,
  height = 300,
}) => {
  const [left, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);
  const [refAreaLeft, setRefAreaLeft] = useState<string>("");
  const [refAreaRight, setRefAreaRight] = useState<string>("");
  const [top, setTop] = useState<number | "auto">("auto");
  const [bottom, setBottom] = useState<number | "auto">("auto");
  const [zoomHistory, setZoomHistory] = useState<
    Array<{
      left: string | null;
      right: string | null;
      top: number | "auto";
      bottom: number | "auto";
    }>
  >([]);

  // Convert the data to the format expected by recharts
  const chartData = useMemo(() => {
    // Group data by day using extractDatePart to avoid timezone issues
    const dailyData: Record<
      string,
      { values: number[]; min: number; max: number }
    > = {};

    data.forEach((point) => {
      try {
        // Use extractDatePart to get consistent date string regardless of timezone
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
        console.error("Error processing heart rate data point:", e);
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
          avg: Math.round(avg),
          min: Math.round(data.min),
          max: Math.round(data.max),
          // Add a range value for the bar chart
          range: [Math.round(data.min), Math.round(data.max)],
          count: data.values.length,
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return result;
  }, [data]);

  const handleZoomIn = (): void => {
    if (refAreaLeft === refAreaRight || refAreaRight === "") {
      setRefAreaLeft("");
      setRefAreaRight("");
      return;
    }

    // Save current view to history
    setZoomHistory([...zoomHistory, { left, right, top, bottom }]);

    // Ensure left is always less than right
    let leftDay = refAreaLeft;
    let rightDay = refAreaRight;

    if (leftDay > rightDay) {
      [leftDay, rightDay] = [rightDay, leftDay];
    }

    // Find min and max values in the selected range
    const rangeData = chartData.filter(
      (item) => item.day >= leftDay && item.day <= rightDay,
    );

    if (rangeData.length > 0) {
      const minValue = Math.min(...rangeData.map((item) => item.min));
      const maxValue = Math.max(...rangeData.map((item) => item.max));

      // Add some padding to the min/max
      const padding = (maxValue - minValue) * 0.1;

      setRefAreaLeft("");
      setRefAreaRight("");
      setLeft(leftDay);
      setRight(rightDay);
      setBottom(Math.max(0, Math.floor(minValue - padding)));
      setTop(Math.ceil(maxValue + padding));
    }
  };

  const handleZoomOut = (): void => {
    if (zoomHistory.length === 0) {
      // If no history, reset to full view
      setLeft(null);
      setRight(null);
      setTop("auto");
      setBottom("auto");
      return;
    }

    // Pop the last view from history
    const lastView = zoomHistory[zoomHistory.length - 1];
    setZoomHistory(zoomHistory.slice(0, -1));

    setLeft(lastView.left);
    setRight(lastView.right);
    setTop(lastView.top);
    setBottom(lastView.bottom);
  };

  function handleMouseDown(e: unknown): void {
    if (
      typeof e === "object" &&
      e !== null &&
      "activeLabel" in e &&
      (e as { activeLabel?: string }).activeLabel
    ) {
      setRefAreaLeft((e as { activeLabel: string }).activeLabel);
    }
  }

  function handleMouseMove(e: unknown): void {
    if (
      typeof e === "object" &&
      e !== null &&
      "activeLabel" in e &&
      (e as { activeLabel?: string }).activeLabel &&
      refAreaLeft
    ) {
      setRefAreaRight((e as { activeLabel: string }).activeLabel);
    }
  }

  const handleMouseUp = (): void => {
    if (refAreaLeft && refAreaRight) {
      handleZoomIn();
    }
    setRefAreaLeft("");
  };

  // Custom tooltip to show min, max, and avg values
  interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{
      value: number;
      payload: { min: number; max: number; count: number };
    }>;
    label?: string;
  }
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: CustomTooltipProps): JSX.Element | null => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded shadow-sm">
          <p className="font-medium">{formatDateLabel(label ?? "")}</p>
          <p className="text-[#8884d8]">Average: {payload[1]?.value} BPM</p>
          <p className="text-[#82ca9d]">Min: {payload[0]?.payload.min} BPM</p>
          <p className="text-[#ff7300]">Max: {payload[0]?.payload.max} BPM</p>
          <p className="text-gray-500 text-sm mt-1">
            Readings: {payload[0]?.payload.count}
          </p>
        </div>
      );
    }
    return null;
  };

  // Helper function to format date labels consistently
  const formatDateLabel = (label: string): string => {
    const parts = label.split("-");
    if (parts.length === 3) {
      return `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0]}`;
    }
    return label;
  };

  return (
    <div className="w-full">
      <div className="flex justify-end space-x-2 mb-2">
        <button
          onClick={handleZoomOut}
          disabled={zoomHistory.length === 0 && !left}
          className="p-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
        >
          Zoom Out
        </button>
      </div>

      <div style={{ width: "100%", height }}>
        {/* Add a fallback message if no data */}
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">
              No heart rate data available for the selected time period.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <ComposedChart
              data={chartData}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="day"
                domain={[left || "dataMin", right || "dataMax"]}
                type="category"
                tickFormatter={(value) => {
                  // Parse MM/DD directly from the YYYY-MM-DD format
                  const parts = value.split("-");
                  if (parts.length === 3) {
                    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
                  }
                  return value;
                }}
              />
              <YAxis
                domain={[0, top || "auto"]}
                label={{ value: "BPM", angle: -90, position: "insideLeft" }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />

              {/* Bar for min-max range */}
              <Bar
                dataKey="range"
                fill="#82ca9d"
                name="Heart Rate Range"
                barSize={20}
                opacity={0.6}
              />

              {/* Line for average */}
              <Line
                type="monotone"
                dataKey="avg"
                stroke="#8884d8"
                name="Average Heart Rate"
                dot={true}
                strokeWidth={2}
              />

              {refAreaLeft && refAreaRight && (
                <ReferenceArea
                  x1={refAreaLeft}
                  x2={refAreaRight}
                  strokeOpacity={0.3}
                  fill="#8884d8"
                  fillOpacity={0.3}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default HeartRateChart;
