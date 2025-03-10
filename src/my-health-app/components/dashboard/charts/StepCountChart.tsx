"use client";

import React, { useMemo } from 'react';
import { 
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { HealthData } from '../../../types/healthData';
import { extractDatePart } from '../../../utils/dataDeduplicator';

interface StepCountChartProps {
  data: HealthData[];
  height?: number;
}

const StepCountChart: React.FC<StepCountChartProps> = ({ 
  data, 
  height = 400 
}) => {
  // Convert the data to the format expected by recharts
  const chartData = useMemo(() => {
    // Group data by day using the consistent extractDatePart function
    const dailyData: Record<string, { total: number, count: number }> = {};
    
    data.forEach(point => {
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
    const formattedData = Object.entries(dailyData).map(([day, data]) => {
      return {
        day,
        date: new Date(day),
        steps: Math.round(data.total),
        count: data.count
      };
    }).sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Calculate trailing 30-day average
    const dataWithAverage = formattedData.map((item, index, array) => {
      // Get up to 30 previous days including current day
      const startIndex = Math.max(0, index - 29);
      const trailingData = array.slice(startIndex, index + 1);
      
      // Calculate average
      const trailingSum = trailingData.reduce((sum, day) => sum + day.steps, 0);
      const trailingAvg = trailingData.length > 0 ? Math.round(trailingSum / trailingData.length) : 0;
      
      return {
        ...item,
        trailingAvg
      };
    });
    
    return dataWithAverage;
  }, [data]);

  // Calculate overall stats
  const stats = useMemo(() => {
    if (chartData.length === 0) return { average: 0, max: 0, total: 0, maxDay: '', trailing30: 0 };
    
    const total = chartData.reduce((sum, day) => sum + day.steps, 0);
    const maxStepDay = chartData.reduce((max, day) => day.steps > max.steps ? day : max, chartData[0]);
    const average = Math.round(total / chartData.length);
    
    // Get the most recent trailing 30-day average
    const trailing30 = chartData.length > 0 ? chartData[chartData.length - 1].trailingAvg : 0;
    
    return { 
      average, 
      max: maxStepDay.steps, 
      maxDay: maxStepDay.day, 
      total,
      trailing30
    };
  }, [chartData]);

  // Configure chart data for visible window
  const visibleChartData = useMemo(() => {
    // For large datasets, we might want to limit how many days we show at once
    // For now, we'll show everything, but we could limit to last 90 days, etc.
    return chartData;
  }, [chartData]);

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="p-3 bg-blue-50 rounded-lg">
          <div className="text-sm text-gray-500">Daily Average</div>
          <div className="text-xl font-bold">{stats.average.toLocaleString()} steps</div>
        </div>
        <div className="p-3 bg-green-50 rounded-lg">
          <div className="text-sm text-gray-500">Maximum Steps</div>
          <div className="text-xl font-bold">{stats.max.toLocaleString()} steps</div>
          <div className="text-xs text-gray-500">{stats.maxDay}</div>
        </div>
        <div className="p-3 bg-purple-50 rounded-lg">
          <div className="text-sm text-gray-500">Total Steps</div>
          <div className="text-xl font-bold">{stats.total.toLocaleString()} steps</div>
        </div>
        <div className="p-3 bg-amber-50 rounded-lg">
          <div className="text-sm text-gray-500">30-Day Average</div>
          <div className="text-xl font-bold">{stats.trailing30.toLocaleString()} steps</div>
        </div>
      </div>
      
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart
            data={visibleChartData}
            margin={{ top: 10, right: 30, left: 20, bottom: 70 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="day" 
              type="category"
              angle={-45}
              textAnchor="end"
              height={70}
              tickFormatter={(value) => {
                // Safely format the date label to MM/DD
                try {
                  const parts = value.split('-');
                  if (parts.length === 3) {
                    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
                  }
                  return value;
                } catch (e) {
                  return value;
                }
              }}
            />
            <YAxis 
              label={{ value: 'Steps', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              formatter={(value: number, name: string) => {
                if (name === "steps") return [`${value.toLocaleString()} steps`, 'Daily Steps'];
                if (name === "trailingAvg") return [`${value.toLocaleString()} steps`, '30-Day Average'];
                return [value, name];
              }}
              labelFormatter={(label) => {
                // Format the tooltip label as MM/DD/YYYY
                try {
                  const parts = label.split('-');
                  if (parts.length === 3) {
                    return `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0]}`;
                  }
                  return label;
                } catch (e) {
                  return label;
                }
              }}
            />
            <Legend />
            <Bar 
              dataKey="steps" 
              fill="#8884d8" 
              name="Daily Steps" 
              barSize={visibleChartData.length > 60 ? 2 : 8}
            />
            <Line
              type="monotone"
              dataKey="trailingAvg"
              stroke="#ff7300"
              strokeWidth={2}
              dot={false}
              name="30-Day Average"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      
      {chartData.length > 0 && (
        <div className="mt-2 text-center text-xs text-gray-500">
          Showing data from {chartData[0].day} to {chartData[chartData.length - 1].day} 
          ({chartData.length} days)
        </div>
      )}
    </div>
  );
};

export default StepCountChart;