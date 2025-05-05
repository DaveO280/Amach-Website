"use client";

import React, { useMemo, useState } from "react";
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
import { extractDatePart } from "../../../utils/dataDeduplicator";

interface ExerciseTimeChartProps {
  data: HealthData[];
  height?: number;
}

const ExerciseTimeChart: React.FC<ExerciseTimeChartProps> = ({
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
      { values: number[]; total: number; unit: string }
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
              total: 0,
              unit: point.unit || "",
            };
          }

          dailyData[dayKey].values.push(value);
          dailyData[dayKey].total += value;
          if (point.unit) {
            dailyData[dayKey].unit = point.unit;
          }
        }
      } catch (e) {
        console.error("Error processing exercise time data point:", e);
      }
    });

    // Format for chart
    const result = Object.entries(dailyData)
      .map(([day, data]) => {
        // Convert to minutes if the unit is seconds
        const isSeconds = data.unit.toLowerCase().includes("sec");
        const totalTime = isSeconds ? data.total / 60 : data.total;

        return {
          day,
          date: new Date(day + "T12:00:00"), // Use noon time to avoid date shifting
          time: Math.round(totalTime * 10) / 10,
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
      const minValue = Math.min(...rangeData.map((item) => item.time));
      const maxValue = Math.max(...rangeData.map((item) => item.time));

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

  const handleMouseDown = (e: unknown): void => {
    if (
      typeof e === "object" &&
      e !== null &&
      "activeLabel" in e &&
      (e as { activeLabel?: string }).activeLabel
    ) {
      setRefAreaLeft((e as { activeLabel: string }).activeLabel);
    }
  };

  const handleMouseMove = (e: unknown): void => {
    if (
      typeof e === "object" &&
      e !== null &&
      "activeLabel" in e &&
      (e as { activeLabel?: string }).activeLabel &&
      refAreaLeft
    ) {
      setRefAreaRight((e as { activeLabel: string }).activeLabel);
    }
  };

  const handleMouseUp = (): void => {
    if (refAreaLeft && refAreaRight) {
      handleZoomIn();
    }
    setRefAreaLeft("");
  };

  // Get the unit from the data
  const unit =
    data.length > 0 && data[0].unit
      ? data[0].unit.toLowerCase().includes("sec")
        ? "min"
        : data[0].unit
      : "min";

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
              No exercise time data available for the selected time period.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart
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
                domain={[bottom || 0, top || "auto"]}
                label={{ value: unit, angle: -90, position: "insideLeft" }}
              />
              <Tooltip
                formatter={(value: number) => [
                  `${value} ${unit}`,
                  "Exercise Time",
                ]}
                labelFormatter={(label) => {
                  // Format as MM/DD/YYYY without timezone issues
                  const parts = label.split("-");
                  if (parts.length === 3) {
                    return `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0]}`;
                  }
                  return label;
                }}
              />
              <Legend />
              <Bar
                dataKey="time"
                fill="#4CAF50"
                name={`Daily Exercise Time (${unit})`}
              />

              {refAreaLeft && refAreaRight && (
                <ReferenceArea
                  x1={refAreaLeft}
                  x2={refAreaRight}
                  strokeOpacity={0.3}
                  fill="#4CAF50"
                  fillOpacity={0.3}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default ExerciseTimeChart;
