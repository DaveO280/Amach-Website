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

// Design system tokens
const DS = {
  emerald: "#006B4F",
  emeraldSubtle: "rgba(0,107,79,0.65)",
  grid: "rgba(0,107,79,0.1)",
  axisText: "#6B8C7A",
  tooltipBorder: "rgba(0,107,79,0.15)",
  textPrimary: "#064E3B",
  textMuted: "#6B8C7A",
};

interface DistanceChartProps {
  data: HealthData[];
  height?: number;
}

const DistanceChart: React.FC<DistanceChartProps> = ({
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

  const chartData = useMemo(() => {
    const sortedData = [...data].sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );

    const dailyData: Record<string, { values: number[]; total: number }> = {};

    sortedData.forEach((point) => {
      try {
        const date = new Date(point.startDate);
        const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        const value = parseFloat(point.value);

        if (!isNaN(value)) {
          if (!dailyData[dayKey]) {
            dailyData[dayKey] = { values: [], total: 0 };
          }
          dailyData[dayKey].values.push(value);
          dailyData[dayKey].total += value;
        }
      } catch (e) {
        console.error("Error processing distance data point:", e);
      }
    });

    return Object.entries(dailyData)
      .map(([day, data]) => {
        const unit =
          (data.values.length > 0 && sortedData.find((d) => d.unit)?.unit) ||
          "";
        const isMeters =
          unit.toLowerCase().includes("m") &&
          !unit.toLowerCase().includes("km");
        const totalDistance = isMeters ? data.total / 1000 : data.total;

        return {
          day,
          date: new Date(day),
          distance: Math.round(totalDistance * 100) / 100,
          count: data.values.length,
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [data]);

  const handleZoomIn = (): void => {
    if (refAreaLeft === refAreaRight || refAreaRight === "") {
      setRefAreaLeft("");
      setRefAreaRight("");
      return;
    }

    setZoomHistory([...zoomHistory, { left, right, top, bottom }]);

    let leftDay = refAreaLeft;
    let rightDay = refAreaRight;

    if (leftDay > rightDay) {
      [leftDay, rightDay] = [rightDay, leftDay];
    }

    const rangeData = chartData.filter(
      (item) => item.day >= leftDay && item.day <= rightDay,
    );

    if (rangeData.length > 0) {
      const minValue = Math.min(...rangeData.map((item) => item.distance));
      const maxValue = Math.max(...rangeData.map((item) => item.distance));
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
      setLeft(null);
      setRight(null);
      setTop("auto");
      setBottom("auto");
      return;
    }

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

  const unit =
    data.length > 0 && data[0].unit
      ? data[0].unit.toLowerCase().includes("m") &&
        !data[0].unit.toLowerCase().includes("km")
        ? "km"
        : data[0].unit
      : "km";

  return (
    <div className="w-full">
      <div className="flex justify-end space-x-2 mb-2">
        <button
          onClick={handleZoomOut}
          disabled={zoomHistory.length === 0 && !left}
          className="px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
          style={{
            background: "transparent",
            border: "1px solid rgba(0,107,79,0.25)",
            color: DS.emerald,
          }}
          onMouseEnter={(e) => {
            if (zoomHistory.length > 0 || left)
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(0,107,79,0.07)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
          }}
        >
          Zoom Out
        </button>
      </div>

      <div style={{ width: "100%", height }}>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full py-12">
            <p style={{ color: DS.textMuted, fontSize: 13 }}>
              No distance data available for the selected time period.
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
              <CartesianGrid strokeDasharray="3 3" stroke={DS.grid} />
              <XAxis
                dataKey="day"
                tick={{ fill: DS.axisText, fontSize: 11 }}
                axisLine={{ stroke: DS.grid }}
                tickLine={false}
                domain={[left || "dataMin", right || "dataMax"]}
                type="category"
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis
                domain={[bottom || 0, top || "auto"]}
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
                  "Distance",
                ]}
                labelFormatter={(label: string): string => {
                  const date = new Date(label);
                  return date.toLocaleDateString();
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: DS.textMuted }} />
              <Bar
                dataKey="distance"
                fill={DS.emeraldSubtle}
                name={`Daily Distance (${unit})`}
                radius={[2, 2, 0, 0]}
              />
              {refAreaLeft && refAreaRight && (
                <ReferenceArea
                  x1={refAreaLeft}
                  x2={refAreaRight}
                  strokeOpacity={0.3}
                  fill={DS.emerald}
                  fillOpacity={0.12}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default DistanceChart;
