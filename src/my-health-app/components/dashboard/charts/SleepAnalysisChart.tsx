"use client";

import React, { useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, Cell 
} from 'recharts';
import { HealthData } from '../../../types/healthData';
import { 
  processSleepData,
  SleepSession, 
  SleepStage, 
  formatSleepDuration 
} from '../../../utils/sleepDataProcessor';

interface SleepAnalysisChartProps {
  data: HealthData[];
  height?: number;
}

const SleepAnalysisChart: React.FC<SleepAnalysisChartProps> = ({ 
  data, 
  height = 300 
}) => {
  // Process data using our enhanced processor with extra validation
  const processedSessions = useMemo(() => {
    // Add some debugging logs
    console.log(`SleepAnalysisChart processing ${data.length} sleep data records`);
    
    const sessions = processSleepData(data);
    
    console.log(`Processed into ${sessions.length} sleep sessions`);
    if (sessions.length > 0) {
      console.log('Sample session:', sessions[0]);
    }
    
    return sessions;
  }, [data]);

  // Log any potential data issues
  useEffect(() => {
    if (processedSessions.length === 0) {
      console.warn("No sleep sessions were processed from the data");
      return;
    }

    // Check for sessions with unusual values
    const longSessions = processedSessions.filter(s => s.totalDuration > 720); // > 12 hours
    if (longSessions.length > 0) {
      console.warn(`Found ${longSessions.length} unusually long sleep sessions (>12 hours)`);
    }

    const lowEfficiency = processedSessions.filter(s => s.metrics.sleepEfficiency < 30);
    if (lowEfficiency.length > 0) {
      console.warn(`Found ${lowEfficiency.length} sessions with very low efficiency (<30%)`);
    }
  }, [processedSessions]);

  // Convert the processed sessions to the format expected by recharts
  const chartData = useMemo(() => {
    // Group sessions by date
    const dailyData: Record<string, {
      inBedHours: number;
      asleepHours: number;
      deepSleepHours: number;
      remSleepHours: number;
      lightSleepHours: number;
      sleepEfficiency: number;
    }> = {};

    processedSessions.forEach(session => {
      const date = session.date;
      
      // Initialize the day's data if it doesn't exist
      if (!dailyData[date]) {
        dailyData[date] = {
          inBedHours: 0,
          asleepHours: 0,
          deepSleepHours: 0,
          remSleepHours: 0,
          lightSleepHours: 0,
          sleepEfficiency: 0
        };
      }
      
      // Ensure we have positive numbers before adding to prevent errors
      const totalDuration = Math.max(0, session.totalDuration);
      const sleepDuration = Math.max(0, session.sleepDuration);
      const deepSleep = Math.max(0, session.stageData.deep);
      const remSleep = Math.max(0, session.stageData.rem);
      const lightSleep = Math.max(0, session.stageData.core);
      
      // Convert all durations from minutes to hours
      dailyData[date].inBedHours += totalDuration / 60;
      dailyData[date].asleepHours += sleepDuration / 60;
      dailyData[date].deepSleepHours += deepSleep / 60;
      dailyData[date].remSleepHours += remSleep / 60;
      dailyData[date].lightSleepHours += lightSleep / 60;
      
      // Use the weighted average for efficiency if multiple sessions per day
      const currentTotal = dailyData[date].asleepHours * 60 - sleepDuration;
      let newAvgEfficiency = session.metrics.sleepEfficiency;
      
      if (currentTotal > 0) {
        newAvgEfficiency = ((dailyData[date].sleepEfficiency * currentTotal) + 
          (session.metrics.sleepEfficiency * sleepDuration)) / 
          (currentTotal + sleepDuration);
      }
      
      dailyData[date].sleepEfficiency = newAvgEfficiency;
    });

    // Add validation to catch anomalies
    Object.entries(dailyData).forEach(([date, data]) => {
      // Check for unreasonable values
      if (data.inBedHours > 24) {
        console.warn(`Unreasonable inBed time for ${date}: ${data.inBedHours}h, capping at 24h`);
        data.inBedHours = 24;
      }
      if (data.asleepHours > 24) {
        console.warn(`Unreasonable sleep time for ${date}: ${data.asleepHours}h, capping at 24h`);
        data.asleepHours = 24;
      }
      // Ensure sleep time doesn't exceed in-bed time
      if (data.asleepHours > data.inBedHours) {
        console.warn(`Sleep time exceeds in-bed time for ${date}, adjusting`);
        data.asleepHours = data.inBedHours;
      }
      
      // Validate sleep stage totals
      const totalStageHours = data.deepSleepHours + data.remSleepHours + data.lightSleepHours;
      if (totalStageHours > data.asleepHours * 1.1) { // Allow 10% margin for rounding errors
        console.warn(`Sleep stages (${totalStageHours}h) exceed total sleep time (${data.asleepHours}h) for ${date}, normalizing`);
        // Normalize stages proportionally
        const factor = data.asleepHours / totalStageHours;
        data.deepSleepHours *= factor;
        data.remSleepHours *= factor;
        data.lightSleepHours *= factor;
      }
      
      // Ensure efficiency is within valid range
      if (data.sleepEfficiency > 100) {
        console.warn(`Sleep efficiency exceeds 100% for ${date}, capping`);
        data.sleepEfficiency = 100;
      } else if (data.sleepEfficiency < 0) {
        console.warn(`Negative sleep efficiency for ${date}, setting to 0`);
        data.sleepEfficiency = 0;
      }
    });

    // Format for chart
    const formattedData = Object.entries(dailyData)
      .map(([day, data]) => {
        return {
          day,
          date: new Date(day),
          inBedHours: Math.round(data.inBedHours * 10) / 10,
          asleepHours: Math.round(data.asleepHours * 10) / 10,
          deepSleepHours: Math.round(data.deepSleepHours * 10) / 10,
          remSleepHours: Math.round(data.remSleepHours * 10) / 10,
          lightSleepHours: Math.round(data.lightSleepHours * 10) / 10,
          sleepEfficiency: Math.round(data.sleepEfficiency)
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  
    console.log(`Generated ${formattedData.length} data points for sleep chart`);
    
    return formattedData;
  }, [processedSessions]);

  // Calculate overall stats
  const stats = useMemo(() => {
    if (chartData.length === 0) {
      return { 
        avgInBed: 0, 
        avgAsleep: 0, 
        avgEfficiency: 0,
        avgDeep: 0,
        avgRem: 0,
        avgLight: 0
      };
    }
    
    const totalInBed = chartData.reduce((sum, day) => sum + day.inBedHours, 0);
    const totalAsleep = chartData.reduce((sum, day) => sum + day.asleepHours, 0);
    const totalDeep = chartData.reduce((sum, day) => sum + day.deepSleepHours, 0);
    const totalRem = chartData.reduce((sum, day) => sum + day.remSleepHours, 0);
    const totalLight = chartData.reduce((sum, day) => sum + day.lightSleepHours, 0);
    const totalEfficiency = chartData.reduce((sum, day) => sum + day.sleepEfficiency, 0);
    
    return {
      avgInBed: Math.round((totalInBed / chartData.length) * 10) / 10,
      avgAsleep: Math.round((totalAsleep / chartData.length) * 10) / 10,
      avgDeep: Math.round((totalDeep / chartData.length) * 10) / 10,
      avgRem: Math.round((totalRem / chartData.length) * 10) / 10,
      avgLight: Math.round((totalLight / chartData.length) * 10) / 10,
      avgEfficiency: Math.round(totalEfficiency / chartData.length)
    };
  }, [chartData]);

  // Sleep stage distribution
  const sleepStages = useMemo(() => {
    if (stats.avgAsleep === 0) return [];
    
    const deepPercent = Math.round((stats.avgDeep / stats.avgAsleep) * 100);
    const remPercent = Math.round((stats.avgRem / stats.avgAsleep) * 100);
    const lightPercent = Math.round((stats.avgLight / stats.avgAsleep) * 100);
    
    return [
      { name: 'Deep Sleep', value: deepPercent, color: '#2e7d32' },
      { name: 'REM Sleep', value: remPercent, color: '#90caf9' },
      { name: 'Light Sleep', value: lightPercent, color: '#a5d6a7' }
    ].filter(stage => stage.value > 0);
  }, [stats]);

  // Summary of processed data
  const summary = useMemo(() => {
    if (processedSessions.length === 0) {
      return { totalSessions: 0, overnightSessions: 0 };
    }
    
    const overnightSessions = processedSessions.filter(s => s.isOvernight).length;
    
    return {
      totalSessions: processedSessions.length,
      overnightSessions,
      daysWithData: chartData.length
    };
  }, [processedSessions, chartData]);

  if (chartData.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-gray-500">No sleep data available for the selected time period.</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="p-3 bg-blue-50 rounded-lg">
          <div className="text-sm text-gray-500">Avg. Sleep Duration</div>
          <div className="text-xl font-bold">{stats.avgAsleep} hours</div>
        </div>
        <div className="p-3 bg-green-50 rounded-lg">
          <div className="text-sm text-gray-500">Avg. Time in Bed</div>
          <div className="text-xl font-bold">{stats.avgInBed} hours</div>
        </div>
        <div className="p-3 bg-purple-50 rounded-lg">
          <div className="text-sm text-gray-500">Avg. Sleep Efficiency</div>
          <div className="text-xl font-bold">{stats.avgEfficiency}%</div>
        </div>
      </div>
      
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="day" 
              type="category"
              tickFormatter={(value) => {
                const date = new Date(value);
                return `${date.getMonth() + 1}/${date.getDate()}`;
              }}
            />
            <YAxis 
              label={{ value: 'Hours', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              formatter={(value: number, name: string) => {
                if (name === 'sleepEfficiency') return [`${value}%`, 'Sleep Efficiency'];
                return [`${value} hours`, name.replace('Hours', '')];
              }}
              labelFormatter={(label) => {
                const date = new Date(label);
                return date.toLocaleDateString();
              }}
            />
            <Legend />
            <Bar 
              dataKey="inBedHours" 
              fill="#94a3b8" 
              name="Time in Bed" 
              stackId="a"
            />
            <Bar 
              dataKey="asleepHours" 
              fill="#3b82f6" 
              name="Sleep Duration" 
              stackId="b"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      {sleepStages.length > 0 && (
        <div className="mt-6">
          <h4 className="text-lg font-medium mb-2">Sleep Stage Distribution</h4>
          <div className="grid grid-cols-3 gap-4">
            {sleepStages.map(stage => (
              <div key={stage.name} className="p-3 rounded-lg" style={{ backgroundColor: `${stage.color}20` }}>
                <div className="text-sm text-gray-500">{stage.name}</div>
                <div className="text-xl font-bold">{stage.value}%</div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                  <div 
                    className="h-2.5 rounded-full" 
                    style={{ 
                      width: `${stage.value}%`,
                      backgroundColor: stage.color
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="mt-6">
        <h4 className="text-lg font-medium mb-2">Sleep Efficiency</h4>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="day" 
                type="category"
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis 
                domain={[0, 100]}
                label={{ value: '%', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                formatter={(value: number) => [`${value}%`, 'Sleep Efficiency']}
                labelFormatter={(label) => {
                  const date = new Date(label);
                  return date.toLocaleDateString();
                }}
              />
              <Legend />
              <Bar dataKey="sleepEfficiency" name="Sleep Efficiency">
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.sleepEfficiency >= 85 ? '#22c55e' : 
                          entry.sleepEfficiency >= 70 ? '#eab308' : 
                          '#ef4444'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Sleep Stages Stacked Bar Chart */}
      <div className="mt-6">
        <h4 className="text-lg font-medium mb-2">Sleep Stages by Day</h4>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="day" 
                type="category"
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis 
                label={{ value: 'Hours', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                formatter={(value: number, name: string) => {
                  return [`${value} hours`, name.replace('SleepHours', ' Sleep')];
                }}
                labelFormatter={(label) => {
                  const date = new Date(label);
                  return date.toLocaleDateString();
                }}
              />
              <Legend />
              <Bar dataKey="deepSleepHours" stackId="a" name="Deep Sleep" fill="#2e7d32" />
              <Bar dataKey="remSleepHours" stackId="a" name="REM Sleep" fill="#90caf9" />
              <Bar dataKey="lightSleepHours" stackId="a" name="Light Sleep" fill="#a5d6a7" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Data summary */}
      <div className="text-sm text-gray-500 mt-4">
        Analysis based on {summary.totalSessions} sleep sessions ({summary.overnightSessions} overnight) across {summary.daysWithData} days.
      </div>
    </div>
  );
};

export default SleepAnalysisChart;