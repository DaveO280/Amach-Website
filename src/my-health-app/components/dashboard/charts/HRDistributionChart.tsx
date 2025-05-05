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
  XAxis,
  YAxis,
} from "recharts";
import { HealthData } from "../../../types/healthData";

interface HRDistributionChartProps {
  data: HealthData[];
  age?: number;
  maxHeartRate?: number;
  height?: number;
}

// Heart rate zone calculation
const calculateHRZones = (
  maxHR: number,
): {
  zone1: { min: number; max: number };
  zone2: { min: number; max: number };
  zone3: { min: number; max: number };
  zone4: { min: number; max: number };
  zone5: { min: number; max: number };
} => {
  return {
    zone1: { min: Math.round(maxHR * 0.5), max: Math.round(maxHR * 0.6) },
    zone2: { min: Math.round(maxHR * 0.6), max: Math.round(maxHR * 0.7) },
    zone3: { min: Math.round(maxHR * 0.7), max: Math.round(maxHR * 0.8) },
    zone4: { min: Math.round(maxHR * 0.8), max: Math.round(maxHR * 0.9) },
    zone5: { min: Math.round(maxHR * 0.9), max: maxHR },
  };
};

// Zone descriptions
const zoneDescriptions = {
  zone1: {
    name: "Very Light",
    color: "#22c55e",
    description: "Very light activity, warm up",
  },
  zone2: {
    name: "Light",
    color: "#84cc16",
    description: "Basic endurance training",
  },
  zone3: {
    name: "Moderate",
    color: "#eab308",
    description: "Aerobic endurance training",
  },
  zone4: {
    name: "Hard",
    color: "#f97316",
    description: "Anaerobic threshold training",
  },
  zone5: {
    name: "Maximum",
    color: "#ef4444",
    description: "Maximum performance, sprint",
  },
};

// Add explicit type for CustomTooltip props
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: {
      name: string;
      description: string;
      range: string;
      percentage: number;
      count: number;
    };
  }>;
}

const HRDistributionChart: React.FC<HRDistributionChartProps> = ({
  data,
  age = 30,
  maxHeartRate,
  height = 300,
}) => {
  // Calculate max heart rate if not provided
  const calculatedMaxHR = useMemo(() => {
    if (maxHeartRate) return maxHeartRate;

    // Estimate max HR based on age using the formula: 220 - age
    return 220 - age;
  }, [age, maxHeartRate]);

  // Calculate heart rate zones
  const zones = useMemo(
    () => calculateHRZones(calculatedMaxHR),
    [calculatedMaxHR],
  );

  // Process heart rate data into zones
  const zoneData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Initialize counters for each zone
    const zoneCounts = {
      zone1: 0,
      zone2: 0,
      zone3: 0,
      zone4: 0,
      zone5: 0,
    };

    // Count data points in each zone
    data.forEach((point) => {
      try {
        const hr = parseFloat(point.value);
        if (isNaN(hr)) return;

        if (hr >= zones.zone5.min) {
          zoneCounts.zone5++;
        } else if (hr >= zones.zone4.min) {
          zoneCounts.zone4++;
        } else if (hr >= zones.zone3.min) {
          zoneCounts.zone3++;
        } else if (hr >= zones.zone2.min) {
          zoneCounts.zone2++;
        } else if (hr >= zones.zone1.min) {
          zoneCounts.zone1++;
        }
      } catch (e) {
        console.error("Error processing heart rate zone data point:", e);
      }
    });

    // Calculate total count
    const totalCount = Object.values(zoneCounts).reduce(
      (sum, count) => sum + count,
      0,
    );

    // Convert to percentage and format for chart
    return Object.entries(zoneCounts)
      .map(([zone, count]) => {
        const percentage =
          totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
        return {
          zone,
          count,
          percentage,
          name: zoneDescriptions[zone as keyof typeof zoneDescriptions].name,
          color: zoneDescriptions[zone as keyof typeof zoneDescriptions].color,
          description:
            zoneDescriptions[zone as keyof typeof zoneDescriptions].description,
          range: `${zones[zone as keyof typeof zones].min}-${zones[zone as keyof typeof zones].max} bpm`,
        };
      })
      .filter((zone) => zone.count > 0);
  }, [data, zones]);

  // Calculate heart rate distribution
  const hrDistribution = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Group heart rates into 10 bpm buckets
    const buckets: Record<string, number> = {};
    const minHR = Math.floor(zones.zone1.min / 10) * 10;
    const maxHR = Math.ceil(calculatedMaxHR / 10) * 10;

    // Initialize buckets
    for (let i = minHR; i <= maxHR; i += 10) {
      buckets[`${i}`] = 0;
    }

    // Count data points in each bucket
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

    // Format for chart
    return Object.entries(buckets)
      .map(([bucket, count]) => ({
        bucket: `${bucket}-${parseInt(bucket) + 9}`,
        count,
        zone:
          Object.entries(zones).find(
            ([, range]) =>
              parseInt(bucket) >= range.min && parseInt(bucket) <= range.max,
          )?.[0] || "none",
      }))
      .filter((item) => item.count > 0);
  }, [data, zones, calculatedMaxHR]);

  // Custom tooltip for pie chart
  const CustomTooltip = ({
    active,
    payload,
  }: CustomTooltipProps): JSX.Element | null => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-2 border border-gray-200 rounded shadow-sm">
          <p className="font-medium">{data.name}</p>
          <p>{data.description}</p>
          <p>{data.range}</p>
          <p className="font-medium">
            {data.percentage}% ({data.count} readings)
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
          <h4 className="text-lg font-medium mb-2 text-center">
            Heart Rate Zone Distribution
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
                  fill="#8884d8"
                  dataKey="percentage"
                  label={({ name, percentage }) => `${name} ${percentage}%`}
                >
                  {zoneData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <h4 className="text-lg font-medium mb-2 text-center">
            Heart Rate Distribution
          </h4>
          <div style={{ width: "100%", height }}>
            <ResponsiveContainer>
              <BarChart
                data={hrDistribution}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="bucket"
                  label={{
                    value: "BPM Range",
                    position: "insideBottom",
                    offset: -5,
                  }}
                />
                <YAxis
                  label={{ value: "Count", angle: -90, position: "insideLeft" }}
                />
                <Tooltip
                  formatter={(value: number) => [`${value} readings`, "Count"]}
                />
                <Bar dataKey="count">
                  {hrDistribution.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.zone !== "none"
                          ? zoneDescriptions[
                              entry.zone as keyof typeof zoneDescriptions
                            ].color
                          : "#94a3b8"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h4 className="text-lg font-medium mb-2">Heart Rate Zones</h4>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          {Object.entries(zoneDescriptions).map(([zone, info]) => (
            <div
              key={zone}
              className="p-3 rounded-lg"
              style={{ backgroundColor: `${info.color}20` }}
            >
              <div
                className="text-sm font-medium"
                style={{ color: info.color }}
              >
                {info.name}
              </div>
              <div className="text-xs text-gray-500">{info.description}</div>
              <div className="text-sm mt-1">
                {zones[zone as keyof typeof zones].min}-
                {zones[zone as keyof typeof zones].max} bpm
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HRDistributionChart;
