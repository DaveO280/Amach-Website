"use client";

import React, { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  TooltipProps,
  XAxis,
  YAxis,
} from "recharts";
import { HealthDataPoint } from "../../../types/healthData";
import {
  DailyProcessedSleepData,
  processSleepData,
} from "../../../utils/sleepDataProcessor";

interface SleepAnalysisChartProps {
  data: HealthDataPoint[];
  processedData?: DailyProcessedSleepData[];
  height?: number;
}

export const SleepAnalysisChart = ({
  data,
  processedData: processedOverride,
  height = 300,
}: SleepAnalysisChartProps): React.ReactElement => {
  const processedData =
    processedOverride && processedOverride.length > 0
      ? processedOverride
      : processSleepData(data);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Helper function to format minutes as hours
  const formatMinutesToHours = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  // Calculate average statistics
  const calcAverageStats = (
    processedData: DailyProcessedSleepData[],
  ): {
    avgTimeInBed: number;
    avgSleepTime: number;
    avgStages: {
      core: number;
      deep: number;
      rem: number;
      awake: number;
    };
    stagePercentages: {
      core: number;
      deep: number;
      rem: number;
      awake: number;
    };
  } | null => {
    if (processedData.length === 0) return null;

    let totalTimeInBed = 0;
    let totalSleepTime = 0;
    let totalCore = 0;
    let totalDeep = 0;
    let totalRem = 0;
    let totalAwake = 0;

    processedData.forEach((day) => {
      totalTimeInBed += day.totalDuration;
      totalCore += day.stageData.core;
      totalDeep += day.stageData.deep;
      totalRem += day.stageData.rem;
      totalAwake += day.stageData.awake;
    });

    totalSleepTime = totalCore + totalDeep + totalRem;

    return {
      avgTimeInBed: totalTimeInBed / processedData.length,
      avgSleepTime: totalSleepTime / processedData.length,
      avgStages: {
        core: totalCore / processedData.length,
        deep: totalDeep / processedData.length,
        rem: totalRem / processedData.length,
        awake: totalAwake / processedData.length,
      },
      stagePercentages: {
        core: (totalCore / totalSleepTime) * 100,
        deep: (totalDeep / totalSleepTime) * 100,
        rem: (totalRem / totalSleepTime) * 100,
        awake: (totalAwake / totalSleepTime) * 100,
      },
    };
  };

  const averageStats = calcAverageStats(processedData);

  // Prepare data for chart
  const chartData = processedData.map((day) => ({
    date: day.date,
    timeInBed: day.totalDuration,
    totalSleep: day.stageData.core + day.stageData.deep + day.stageData.rem,
    stages: {
      core: day.stageData.core,
      deep: day.stageData.deep,
      rem: day.stageData.rem,
      awake: day.stageData.awake,
    },
  }));

  // Get details for selected date
  const selectedDayData = selectedDate
    ? processedData.find((day) => day.date === selectedDate)
    : null;

  // Calculate sleep efficiency (total sleep / time in bed)
  const calcSleepEfficiency = (day: (typeof chartData)[0]): number => {
    return day.timeInBed > 0 ? (day.totalSleep / day.timeInBed) * 100 : 0;
  };

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
          onClick={(data) => {
            if (data && data.activePayload && data.activePayload[0]) {
              const clickedDate = data.activePayload[0].payload.date;
              setSelectedDate(
                clickedDate === selectedDate ? null : clickedDate,
              );
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={(date) => {
              const d = new Date(date);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
          />
          <YAxis
            label={{
              value: "Minutes",
              angle: -90,
              position: "insideLeft",
            }}
          />
          <Tooltip
            content={({
              active,
              payload,
              label,
            }: TooltipProps<number, string>) => {
              if (active && payload && payload.length) {
                const dayData = chartData.find((d) => d.date === label);
                if (!dayData) return null;
                return (
                  <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
                    <p className="font-semibold mb-2">
                      {new Date(label as string).toLocaleDateString()}
                    </p>
                    <p>
                      Time in Bed: {formatMinutesToHours(dayData.timeInBed)}
                    </p>
                    <p>
                      Total Sleep: {formatMinutesToHours(dayData.totalSleep)}
                    </p>
                    <p>
                      Core Sleep: {formatMinutesToHours(dayData.stages.core)}
                    </p>
                    <p>
                      Deep Sleep: {formatMinutesToHours(dayData.stages.deep)}
                    </p>
                    <p>REM Sleep: {formatMinutesToHours(dayData.stages.rem)}</p>
                    <p>Awake: {formatMinutesToHours(dayData.stages.awake)}</p>
                    <p className="mt-2">
                      Sleep Efficiency:{" "}
                      {calcSleepEfficiency(dayData).toFixed(1)}%
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend />
          {/* Stacked bars for sleep stages */}
          <Bar
            dataKey="stages.core"
            name="Core Sleep"
            stackId="sleep"
            fill="#4CAF50"
          />
          <Bar
            dataKey="stages.deep"
            name="Deep Sleep"
            stackId="sleep"
            fill="#2196F3"
          />
          <Bar
            dataKey="stages.rem"
            name="REM Sleep"
            stackId="sleep"
            fill="#9C27B0"
          />
          <Bar
            dataKey="stages.awake"
            name="Awake"
            stackId="sleep"
            fill="#FF9800"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Sleep session details for selected date */}
      {selectedDayData && (
        <div className="bg-gray-50 p-4 rounded-lg mt-4">
          <h3 className="text-lg font-semibold mb-2">
            Sleep Details for{" "}
            {new Date(selectedDayData.date).toLocaleDateString()}
          </h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="font-medium">
                Time in Bed:{" "}
                {formatMinutesToHours(selectedDayData.totalDuration)}
              </p>
              <p className="font-medium">
                Total Sleep:{" "}
                {formatMinutesToHours(
                  selectedDayData.stageData.core +
                    selectedDayData.stageData.deep +
                    selectedDayData.stageData.rem,
                )}
              </p>
            </div>
            <div>
              <p className="font-medium">
                Sleep Efficiency:{" "}
                {(
                  ((selectedDayData.stageData.core +
                    selectedDayData.stageData.deep +
                    selectedDayData.stageData.rem) /
                    selectedDayData.totalDuration) *
                  100
                ).toFixed(1)}
                %
              </p>
              <p className="font-medium">
                Sessions: {selectedDayData.sessions.length}
              </p>
            </div>
          </div>

          {selectedDayData.sessions.length > 1 && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Individual Sleep Sessions:</h4>
              {selectedDayData.sessions.map((session, i) => (
                <div key={i} className="bg-white p-3 rounded border mb-2">
                  <p className="text-sm">
                    {new Date(session.startTime).toLocaleTimeString()} to{" "}
                    {new Date(session.endTime).toLocaleTimeString()}
                  </p>
                  <p className="text-sm">
                    Duration: {formatMinutesToHours(session.timeInBed)}
                  </p>
                  {session.timeToFallAsleep > 0 && (
                    <p className="text-sm">
                      Time to fall asleep:{" "}
                      {formatMinutesToHours(session.timeToFallAsleep)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sleep Stage Percentages */}
      {averageStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="bg-emerald-50 p-4 rounded-lg">
            <h3 className="text-emerald-800 font-semibold">Core Sleep</h3>
            <p className="text-2xl font-bold text-emerald-600">
              {averageStats.stagePercentages.core.toFixed(1)}%
            </p>
            <p className="text-sm text-emerald-700">
              Average: {formatMinutesToHours(averageStats.avgStages.core)}
            </p>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="text-blue-800 font-semibold">Deep Sleep</h3>
            <p className="text-2xl font-bold text-blue-600">
              {averageStats.stagePercentages.deep.toFixed(1)}%
            </p>
            <p className="text-sm text-blue-700">
              Average: {formatMinutesToHours(averageStats.avgStages.deep)}
            </p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <h3 className="text-purple-800 font-semibold">REM Sleep</h3>
            <p className="text-2xl font-bold text-purple-600">
              {averageStats.stagePercentages.rem.toFixed(1)}%
            </p>
            <p className="text-sm text-purple-700">
              Average: {formatMinutesToHours(averageStats.avgStages.rem)}
            </p>
          </div>
          <div className="bg-amber-50 p-4 rounded-lg">
            <h3 className="text-amber-800 font-semibold">Awake</h3>
            <p className="text-2xl font-bold text-amber-600">
              {averageStats.stagePercentages.awake.toFixed(1)}%
            </p>
            <p className="text-sm text-amber-700">
              Average: {formatMinutesToHours(averageStats.avgStages.awake)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SleepAnalysisChart;
