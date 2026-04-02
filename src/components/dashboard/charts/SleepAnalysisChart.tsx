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

// Design system tokens
const DS = {
  emerald: "#006B4F",
  optimal: "#059669",
  emeraldLight: "#4ade80",
  amber: "#F59E0B",
  errorRed: "rgba(239,68,68,0.7)",
  errorRedSolid: "#EF4444",
  grid: "rgba(0,107,79,0.1)",
  axisText: "#6B8C7A",
  tooltipBorder: "rgba(0,107,79,0.15)",
  textPrimary: "#064E3B",
  textMuted: "#6B8C7A",
  surface: "#FFFFFF",
  surfaceElev: "#FEF3C7",
  border: "rgba(0,107,79,0.1)",
};

// Sleep stage palette — all within design system
const SLEEP_COLORS = {
  core: DS.optimal, // #059669 — success green
  deep: DS.emerald, // #006B4F — emerald primary (darkest = deepest)
  rem: DS.amber, // #F59E0B — amber (distinct, warm)
  awake: DS.errorRed, // red, muted — wakeful disruption
};

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

  const formatMinutesToHours = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const calcAverageStats = (
    processedData: DailyProcessedSleepData[],
  ): {
    avgTimeInBed: number;
    avgSleepTime: number;
    avgStages: { core: number; deep: number; rem: number; awake: number };
    stagePercentages: {
      core: number;
      deep: number;
      rem: number;
      awake: number;
    };
  } | null => {
    if (processedData.length === 0) return null;

    let totalTimeInBed = 0;
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

    const totalSleepTime = totalCore + totalDeep + totalRem;

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

  const selectedDayData = selectedDate
    ? processedData.find((day) => day.date === selectedDate)
    : null;

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
          <CartesianGrid strokeDasharray="3 3" stroke={DS.grid} />
          <XAxis
            dataKey="date"
            tick={{ fill: DS.axisText, fontSize: 11 }}
            axisLine={{ stroke: DS.grid }}
            tickLine={false}
            tickFormatter={(date) => {
              const d = new Date(date);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
          />
          <YAxis
            tick={{ fill: DS.axisText, fontSize: 11 }}
            axisLine={{ stroke: DS.grid }}
            tickLine={false}
            label={{
              value: "Minutes",
              angle: -90,
              position: "insideLeft",
              fill: DS.axisText,
              fontSize: 11,
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
                  <div
                    style={{
                      background: DS.surface,
                      border: `1px solid ${DS.tooltipBorder}`,
                      borderRadius: 10,
                      padding: "12px 16px",
                      boxShadow: "0 4px 16px rgba(0,107,79,0.08)",
                      fontSize: 12,
                      color: DS.textMuted,
                    }}
                  >
                    <p
                      style={{
                        fontWeight: 600,
                        marginBottom: 8,
                        color: DS.textPrimary,
                      }}
                    >
                      {new Date(label as string).toLocaleDateString()}
                    </p>
                    <p>
                      Time in Bed: {formatMinutesToHours(dayData.timeInBed)}
                    </p>
                    <p>
                      Total Sleep: {formatMinutesToHours(dayData.totalSleep)}
                    </p>
                    <p style={{ color: SLEEP_COLORS.core }}>
                      Core: {formatMinutesToHours(dayData.stages.core)}
                    </p>
                    <p style={{ color: SLEEP_COLORS.deep }}>
                      Deep: {formatMinutesToHours(dayData.stages.deep)}
                    </p>
                    <p style={{ color: DS.amber }}>
                      REM: {formatMinutesToHours(dayData.stages.rem)}
                    </p>
                    <p style={{ color: DS.errorRedSolid }}>
                      Awake: {formatMinutesToHours(dayData.stages.awake)}
                    </p>
                    <p
                      style={{
                        marginTop: 8,
                        fontWeight: 600,
                        color: DS.textPrimary,
                      }}
                    >
                      Efficiency: {calcSleepEfficiency(dayData).toFixed(1)}%
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: DS.textMuted }} />
          <Bar
            dataKey="stages.core"
            name="Core Sleep"
            stackId="sleep"
            fill={SLEEP_COLORS.core}
          />
          <Bar
            dataKey="stages.deep"
            name="Deep Sleep"
            stackId="sleep"
            fill={SLEEP_COLORS.deep}
          />
          <Bar
            dataKey="stages.rem"
            name="REM Sleep"
            stackId="sleep"
            fill={SLEEP_COLORS.rem}
          />
          <Bar
            dataKey="stages.awake"
            name="Awake"
            stackId="sleep"
            fill={SLEEP_COLORS.awake}
            radius={[2, 2, 0, 0]}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Sleep session details for selected date */}
      {selectedDayData && (
        <div
          style={{
            background: DS.surfaceElev,
            border: `1px solid ${DS.border}`,
            borderRadius: 12,
            padding: 16,
            marginTop: 8,
          }}
        >
          <h3
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: DS.textPrimary,
              marginBottom: 12,
            }}
          >
            Sleep Details —{" "}
            {new Date(selectedDayData.date).toLocaleDateString()}
          </h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div style={{ color: DS.textMuted, fontSize: 13 }}>
              <p>
                Time in Bed:{" "}
                <span style={{ color: DS.textPrimary, fontWeight: 600 }}>
                  {formatMinutesToHours(selectedDayData.totalDuration)}
                </span>
              </p>
              <p>
                Total Sleep:{" "}
                <span style={{ color: DS.textPrimary, fontWeight: 600 }}>
                  {formatMinutesToHours(
                    selectedDayData.stageData.core +
                      selectedDayData.stageData.deep +
                      selectedDayData.stageData.rem,
                  )}
                </span>
              </p>
            </div>
            <div style={{ color: DS.textMuted, fontSize: 13 }}>
              <p>
                Efficiency:{" "}
                <span style={{ color: DS.optimal, fontWeight: 600 }}>
                  {(
                    ((selectedDayData.stageData.core +
                      selectedDayData.stageData.deep +
                      selectedDayData.stageData.rem) /
                      selectedDayData.totalDuration) *
                    100
                  ).toFixed(1)}
                  %
                </span>
              </p>
              <p>
                Sessions:{" "}
                <span style={{ color: DS.textPrimary, fontWeight: 600 }}>
                  {selectedDayData.sessions.length}
                </span>
              </p>
            </div>
          </div>

          {selectedDayData.sessions.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <h4
                style={{
                  fontWeight: 600,
                  fontSize: 13,
                  color: DS.textPrimary,
                  marginBottom: 8,
                }}
              >
                Individual Sessions
              </h4>
              {selectedDayData.sessions.map((session, i) => (
                <div
                  key={i}
                  style={{
                    background: DS.surface,
                    border: `1px solid ${DS.border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                    marginBottom: 6,
                    fontSize: 12,
                    color: DS.textMuted,
                  }}
                >
                  <p>
                    {new Date(session.startTime).toLocaleTimeString()} →{" "}
                    {new Date(session.endTime).toLocaleTimeString()}
                  </p>
                  <p>Duration: {formatMinutesToHours(session.timeInBed)}</p>
                  {session.timeToFallAsleep > 0 && (
                    <p>
                      Sleep onset:{" "}
                      {formatMinutesToHours(session.timeToFallAsleep)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sleep Stage Averages */}
      {averageStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
          {/* Core Sleep */}
          <div
            style={{
              background: "rgba(5,150,105,0.08)",
              border: `1px solid rgba(5,150,105,0.2)`,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h3 style={{ color: DS.optimal, fontWeight: 600, fontSize: 13 }}>
              Core Sleep
            </h3>
            <p
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: DS.optimal,
                margin: "4px 0",
              }}
            >
              {averageStats.stagePercentages.core.toFixed(1)}%
            </p>
            <p style={{ fontSize: 12, color: DS.textMuted }}>
              Avg: {formatMinutesToHours(averageStats.avgStages.core)}
            </p>
          </div>

          {/* Deep Sleep */}
          <div
            style={{
              background: "rgba(0,107,79,0.08)",
              border: `1px solid rgba(0,107,79,0.2)`,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h3 style={{ color: DS.emerald, fontWeight: 600, fontSize: 13 }}>
              Deep Sleep
            </h3>
            <p
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: DS.emerald,
                margin: "4px 0",
              }}
            >
              {averageStats.stagePercentages.deep.toFixed(1)}%
            </p>
            <p style={{ fontSize: 12, color: DS.textMuted }}>
              Avg: {formatMinutesToHours(averageStats.avgStages.deep)}
            </p>
          </div>

          {/* REM Sleep */}
          <div
            style={{
              background: "rgba(245,158,11,0.08)",
              border: `1px solid rgba(245,158,11,0.2)`,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h3 style={{ color: DS.amber, fontWeight: 600, fontSize: 13 }}>
              REM Sleep
            </h3>
            <p
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: DS.amber,
                margin: "4px 0",
              }}
            >
              {averageStats.stagePercentages.rem.toFixed(1)}%
            </p>
            <p style={{ fontSize: 12, color: DS.textMuted }}>
              Avg: {formatMinutesToHours(averageStats.avgStages.rem)}
            </p>
          </div>

          {/* Awake */}
          <div
            style={{
              background: "rgba(239,68,68,0.06)",
              border: `1px solid rgba(239,68,68,0.15)`,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h3
              style={{ color: DS.errorRedSolid, fontWeight: 600, fontSize: 13 }}
            >
              Awake
            </h3>
            <p
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: DS.errorRedSolid,
                margin: "4px 0",
              }}
            >
              {averageStats.stagePercentages.awake.toFixed(1)}%
            </p>
            <p style={{ fontSize: 12, color: DS.textMuted }}>
              Avg: {formatMinutesToHours(averageStats.avgStages.awake)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SleepAnalysisChart;
