"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import { extractDatePart } from "../../../utils/dataDeduplicator";

interface StepCountChartProps {
  data: HealthData[];
  height?: number;
}

const StepCountChart: React.FC<StepCountChartProps> = ({
  data,
  height = 400,
}) => {
  // Add responsive state for chart configuration
  const [chartHeight, setChartHeight] = useState(height);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screens and adjust chart parameters
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      // Adjust chart height for mobile
      if (mobile) {
        setChartHeight(300); // Smaller height on mobile
      } else {
        setChartHeight(height);
      }
    };

    // Set initial size
    handleResize();

    // Add event listener
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => window.removeEventListener("resize", handleResize);
  }, [height]);

  // Convert the data to the format expected by recharts
  const chartData = useMemo(() => {
    // Group data by day using the consistent extractDatePart function
    const dailyData: Record<string, { total: number; count: number }> = {};

    data.forEach((point) => {
      // Use the same date extraction method as in the deduplicator
      const dayKey = extractDatePart(point.startDate);
      const value = parseFloat(point.value);

      if (!isNaN(value)) {
        if (!dailyData[dayKey]) {
          dailyData[dayKey] = { total: 0, count: 0 };
        }

        dailyData[dayKey].total += value;
        dailyData[dayKey].count += 1;
      }
    });

    // Format for chart and sort by date
    const formattedData = Object.entries(dailyData)
      .map(([day, data]) => {
        return {
          day,
          date: new Date(day),
          steps: Math.round(data.total),
          count: data.count,
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate trailing 30-day average
    const dataWithAverage = formattedData.map((item, index, array) => {
      // Get up to 30 previous days including current day
      const startIndex = Math.max(0, index - 29);
      const trailingData = array.slice(startIndex, index + 1);

      // Calculate average
      const trailingSum = trailingData.reduce((sum, day) => sum + day.steps, 0);
      const trailingAvg =
        trailingData.length > 0
          ? Math.round(trailingSum / trailingData.length)
          : 0;

      return {
        ...item,
        trailingAvg,
      };
    });

    return dataWithAverage;
  }, [data]);

  // Calculate overall stats
  const stats = useMemo(() => {
    if (chartData.length === 0)
      return { average: 0, max: 0, total: 0, maxDay: "", trailing30: 0 };

    const total = chartData.reduce((sum, day) => sum + day.steps, 0);
    const maxStepDay = chartData.reduce(
      (max, day) => (day.steps > max.steps ? day : max),
      chartData[0],
    );
    const average = Math.round(total / chartData.length);

    // Get the most recent trailing 30-day average
    const trailing30 =
      chartData.length > 0 ? chartData[chartData.length - 1].trailingAvg : 0;

    return {
      average,
      max: maxStepDay.steps,
      maxDay: maxStepDay.day,
      total,
      trailing30,
    };
  }, [chartData]);

  // Configure chart data for visible window
  const visibleChartData = useMemo(() => {
    // For mobile, we might want to limit the number of data points
    if (isMobile && chartData.length > 30) {
      // Show only the most recent 30 days on mobile
      return chartData.slice(-30);
    }
    return chartData;
  }, [chartData, isMobile]);

  return (
    <div className="w-full">
      {/* Responsive grid: 2 columns on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="p-3 bg-blue-50 rounded-lg">
          <div className="text-sm text-gray-500">Daily Average</div>
          <div className="text-xl font-bold">
            {stats.average.toLocaleString()} steps
          </div>
        </div>
        <div className="p-3 bg-green-50 rounded-lg">
          <div className="text-sm text-gray-500">Maximum Steps</div>
          <div className="text-xl font-bold">
            {stats.max.toLocaleString()} steps
          </div>
          <div className="text-xs text-gray-500">{stats.maxDay}</div>
        </div>
        <div className="p-3 bg-purple-50 rounded-lg">
          <div className="text-sm text-gray-500">Total Steps</div>
          <div className="text-xl font-bold">
            {stats.total.toLocaleString()} steps
          </div>
        </div>
        <div className="p-3 bg-amber-50 rounded-lg">
          <div className="text-sm text-gray-500">30-Day Average</div>
          <div className="text-xl font-bold">
            {stats.trailing30.toLocaleString()} steps
          </div>
        </div>
      </div>

      <div style={{ width: "100%", height: chartHeight }}>
        <ResponsiveContainer>
          <ComposedChart
            data={visibleChartData}
            margin={{
              top: 10,
              right: 30,
              left: isMobile ? 10 : 20, // Less left margin on mobile
              bottom: isMobile ? 60 : 70, // Adjust bottom margin for mobile
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="day"
              type="category"
              angle={isMobile ? -45 : -45}
              textAnchor="end"
              height={isMobile ? 60 : 70}
              tick={{ fontSize: isMobile ? 10 : 12 }} // Smaller font on mobile
              tickFormatter={(value) => {
                // Simpler date format for mobile
                try {
                  const parts = value.split("-");
                  if (parts.length === 3) {
                    return `${parseInt(parts[1])}/${parseInt(parts[2])}`; // MM/DD format
                  }
                  return value;
                } catch (e) {
                  return value;
                }
              }}
              // Limit tick count on mobile
              interval={isMobile ? Math.ceil(visibleChartData.length / 7) : 0}
            />
            <YAxis
              label={{
                value: "Steps",
                angle: -90,
                position: "insideLeft",
                style: { textAnchor: "middle", fontSize: isMobile ? 10 : 12 },
              }}
              tick={{ fontSize: isMobile ? 10 : 12 }} // Smaller font on mobile
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === "steps")
                  return [`${value.toLocaleString()} steps`, "Daily Steps"];
                if (name === "trailingAvg")
                  return [`${value.toLocaleString()} steps`, "30-Day Average"];
                return [value, name];
              }}
              labelFormatter={(label) => {
                // Format the tooltip label as MM/DD/YYYY
                try {
                  const parts = label.split("-");
                  if (parts.length === 3) {
                    return `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0]}`;
                  }
                  return label;
                } catch (e) {
                  return label;
                }
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: isMobile ? 10 : 12 }} // Smaller legend on mobile
            />
            <Bar
              dataKey="steps"
              fill="#8884d8"
              name="Daily Steps"
              barSize={visibleChartData.length > 60 ? 2 : isMobile ? 6 : 8} // Thinner bars on mobile
            />
            <Line
              type="monotone"
              dataKey="trailingAvg"
              stroke="#ff7300"
              strokeWidth={isMobile ? 1.5 : 2} // Thinner line on mobile
              dot={false}
              name="30-Day Average"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {chartData.length > 0 && (
        <div className="mt-2 text-center text-xs text-gray-500">
          {isMobile && visibleChartData.length < chartData.length
            ? // Show different message when data is limited on mobile
              `Showing recent ${visibleChartData.length} days of ${chartData.length} total days`
            : `Showing data from ${chartData[0].day} to ${chartData[chartData.length - 1].day} (${chartData.length} days)`}
        </div>
      )}
    </div>
  );
};

export default StepCountChart;
