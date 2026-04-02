"use client";

import React, { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  TooltipProps,
  XAxis,
  YAxis,
} from "recharts";
import { HealthData } from "../../../types/healthData";

// Design system tokens
const DS = {
  emerald: "#006B4F",
  grid: "rgba(0,107,79,0.1)",
  axisText: "#6B8C7A",
  tooltipBorder: "rgba(0,107,79,0.15)",
  textPrimary: "#064E3B",
  textMuted: "#6B8C7A",
  surface: "#FFFFFF",
};

// HR zone palette — intensity gradient anchored to design system
// Zone 1→5: light activity → max effort
const ZONE_COLORS = {
  zone1: {
    color: "#4ade80",
    bg: "rgba(74,222,128,0.1)",
    border: "rgba(74,222,128,0.25)",
  }, // emerald light — rest
  zone2: {
    color: "#059669",
    bg: "rgba(5,150,105,0.1)",
    border: "rgba(5,150,105,0.25)",
  }, // optimal — aerobic
  zone3: {
    color: "#D97706",
    bg: "rgba(217,119,6,0.1)",
    border: "rgba(217,119,6,0.25)",
  }, // borderline — threshold
  zone4: {
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.25)",
  }, // amber — hard
  zone5: {
    color: "#EF4444",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.25)",
  }, // error red — max
};

interface HRDistributionChartProps {
  data: HealthData[];
  age?: number;
  maxHeartRate?: number;
  height?: number;
}

const calculateHRZones = (
  maxHR: number,
): {
  zone1: { min: number; max: number };
  zone2: { min: number; max: number };
  zone3: { min: number; max: number };
  zone4: { min: number; max: number };
  zone5: { min: number; max: number };
} => ({
  zone1: { min: Math.round(maxHR * 0.5), max: Math.round(maxHR * 0.6) },
  zone2: { min: Math.round(maxHR * 0.6), max: Math.round(maxHR * 0.7) },
  zone3: { min: Math.round(maxHR * 0.7), max: Math.round(maxHR * 0.8) },
  zone4: { min: Math.round(maxHR * 0.8), max: Math.round(maxHR * 0.9) },
  zone5: { min: Math.round(maxHR * 0.9), max: maxHR },
});

const zoneDescriptions = {
  zone1: { name: "Very Light", description: "Warm up, recovery" },
  zone2: { name: "Light", description: "Basic endurance" },
  zone3: { name: "Moderate", description: "Aerobic endurance" },
  zone4: { name: "Hard", description: "Anaerobic threshold" },
  zone5: { name: "Maximum", description: "Sprint, peak effort" },
};

const HRDistributionChart: React.FC<HRDistributionChartProps> = ({
  data,
  age = 30,
  maxHeartRate,
  height = 300,
}) => {
  const calculatedMaxHR = useMemo(() => {
    if (maxHeartRate) return maxHeartRate;
    return 220 - age;
  }, [age, maxHeartRate]);

  const zones = useMemo(
    () => calculateHRZones(calculatedMaxHR),
    [calculatedMaxHR],
  );

  const zoneData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const zoneCounts = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 };

    data.forEach((point) => {
      try {
        const hr = parseFloat(point.value);
        if (isNaN(hr)) return;

        if (hr >= zones.zone5.min) zoneCounts.zone5++;
        else if (hr >= zones.zone4.min) zoneCounts.zone4++;
        else if (hr >= zones.zone3.min) zoneCounts.zone3++;
        else if (hr >= zones.zone2.min) zoneCounts.zone2++;
        else if (hr >= zones.zone1.min) zoneCounts.zone1++;
      } catch (e) {
        console.error("Error processing heart rate zone data point:", e);
      }
    });

    const totalCount = Object.values(zoneCounts).reduce(
      (sum, count) => sum + count,
      0,
    );

    return Object.entries(zoneCounts)
      .map(([zone, count]) => {
        const percentage =
          totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
        return {
          zone,
          count,
          percentage,
          name: zoneDescriptions[zone as keyof typeof zoneDescriptions].name,
          color: ZONE_COLORS[zone as keyof typeof ZONE_COLORS].color,
          description:
            zoneDescriptions[zone as keyof typeof zoneDescriptions].description,
          range: `${zones[zone as keyof typeof zones].min}–${zones[zone as keyof typeof zones].max} bpm`,
        };
      })
      .filter((zone) => zone.count > 0);
  }, [data, zones]);

  const hrDistribution = useMemo(() => {
    if (!data || data.length === 0) return [];

    const buckets: Record<string, number> = {};
    const minHR = Math.floor(zones.zone1.min / 10) * 10;
    const maxHR = Math.ceil(calculatedMaxHR / 10) * 10;

    for (let i = minHR; i <= maxHR; i += 10) {
      buckets[`${i}`] = 0;
    }

    data.forEach((point) => {
      try {
        const hr = parseFloat(point.value);
        if (isNaN(hr)) return;

        const bucketKey = `${Math.floor(hr / 10) * 10}`;
        if (buckets[bucketKey] !== undefined) {
          buckets[bucketKey]++;
        }
      } catch (e) {
        console.error(
          "Error processing heart rate distribution data point:",
          e,
        );
      }
    });

    return Object.entries(buckets)
      .map(([bucket, count]) => ({
        bucket: `${bucket}–${parseInt(bucket) + 9}`,
        count,
        zone:
          Object.entries(zones).find(
            ([, range]) =>
              parseInt(bucket) >= range.min && parseInt(bucket) <= range.max,
          )?.[0] || "none",
      }))
      .filter((item) => item.count > 0);
  }, [data, zones, calculatedMaxHR]);

  const CustomTooltip = ({
    active,
    payload,
  }: TooltipProps<number, string>): JSX.Element | null => {
    if (active && payload && payload.length) {
      const d = payload[0].payload as {
        name: string;
        description: string;
        range: string;
        percentage: number;
        count: number;
      };
      return (
        <div
          style={{
            background: DS.surface,
            border: `1px solid ${DS.tooltipBorder}`,
            borderRadius: 10,
            padding: "10px 14px",
            boxShadow: "0 4px 16px rgba(0,107,79,0.08)",
            fontSize: 12,
          }}
        >
          <p
            style={{ fontWeight: 600, color: DS.textPrimary, marginBottom: 4 }}
          >
            {d.name}
          </p>
          <p style={{ color: DS.textMuted }}>{d.description}</p>
          <p style={{ color: DS.textMuted }}>{d.range}</p>
          <p style={{ fontWeight: 600, color: DS.textPrimary, marginTop: 4 }}>
            {d.percentage}% ({d.count} readings)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: DS.textPrimary,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Zone Distribution
          </h4>
          <div style={{ width: "100%", height }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={zoneData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  dataKey="percentage"
                  label={({ name, percentage }) => `${name} ${percentage}%`}
                >
                  {zoneData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={CustomTooltip} />
                <Legend wrapperStyle={{ fontSize: 12, color: DS.textMuted }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <h4
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: DS.textPrimary,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            HR Distribution
          </h4>
          <div style={{ width: "100%", height }}>
            <ResponsiveContainer>
              <BarChart
                data={hrDistribution}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={DS.grid} />
                <XAxis
                  dataKey="bucket"
                  tick={{ fill: DS.axisText, fontSize: 10 }}
                  axisLine={{ stroke: DS.grid }}
                  tickLine={false}
                  label={{
                    value: "BPM Range",
                    position: "insideBottom",
                    offset: -5,
                    fill: DS.axisText,
                    fontSize: 11,
                  }}
                />
                <YAxis
                  tick={{ fill: DS.axisText, fontSize: 11 }}
                  axisLine={{ stroke: DS.grid }}
                  tickLine={false}
                  label={{
                    value: "Count",
                    angle: -90,
                    position: "insideLeft",
                    fill: DS.axisText,
                    fontSize: 11,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    background: DS.surface,
                    border: `1px solid ${DS.tooltipBorder}`,
                    borderRadius: 10,
                    boxShadow: "0 4px 16px rgba(0,107,79,0.08)",
                    fontSize: 12,
                  }}
                  labelStyle={{ color: DS.textPrimary, fontWeight: 600 }}
                  formatter={(value: number) => [`${value} readings`, "Count"]}
                />
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                  {hrDistribution.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.zone !== "none"
                          ? ZONE_COLORS[entry.zone as keyof typeof ZONE_COLORS]
                              .color
                          : "rgba(0,107,79,0.2)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Zone reference cards */}
      <div style={{ marginTop: 20 }}>
        <h4
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: DS.textPrimary,
            marginBottom: 10,
          }}
        >
          Heart Rate Zones
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          {Object.entries(zoneDescriptions).map(([zone, info]) => {
            const colors = ZONE_COLORS[zone as keyof typeof ZONE_COLORS];
            return (
              <div
                key={zone}
                style={{
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: colors.color,
                  }}
                >
                  {info.name}
                </div>
                <div
                  style={{ fontSize: 11, color: DS.textMuted, marginTop: 2 }}
                >
                  {info.description}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    marginTop: 4,
                    color: DS.textPrimary,
                    fontWeight: 500,
                  }}
                >
                  {zones[zone as keyof typeof zones].min}–
                  {zones[zone as keyof typeof zones].max} bpm
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default HRDistributionChart;
