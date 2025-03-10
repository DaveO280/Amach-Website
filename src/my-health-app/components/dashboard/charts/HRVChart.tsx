"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, ReferenceArea
} from 'recharts';
import { HealthData } from '../../../types/healthData';
import { extractDatePart } from '../../../utils/dataDeduplicator';

interface HRVChartProps {
  data: HealthData[];
  height?: number;
}

const HRVChart: React.FC<HRVChartProps> = ({ 
  data, 
  height = 300 
}) => {
  const [left, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);
  const [refAreaLeft, setRefAreaLeft] = useState<string>('');
  const [refAreaRight, setRefAreaRight] = useState<string>('');
  const [top, setTop] = useState<number | 'auto'>('auto');
  const [bottom, setBottom] = useState<number | 'auto'>('auto');
  const [zoomHistory, setZoomHistory] = useState<Array<{ left: string | null, right: string | null, top: number | 'auto', bottom: number | 'auto' }>>([]);

  // Add debugging
  useEffect(() => {
    console.log("HRVChart - data received:", data.length);
    if (data.length > 0) {
      console.log("HRVChart - first data point:", data[0]);
    }
  }, [data]);

  // Convert the data to the format expected by recharts
  const chartData = useMemo(() => {
    // Group data by day using extractDatePart to avoid timezone issues
    const dailyData: Record<string, { values: number[], count: number, sum: number }> = {};
    
    data.forEach(point => {
      try {
        // Use extractDatePart to get consistent date string regardless of timezone
        const dayKey = extractDatePart(point.startDate);
        const value = parseFloat(point.value as string);
        
        if (!isNaN(value)) {
          if (!dailyData[dayKey]) {
            dailyData[dayKey] = { 
              values: [], 
              count: 0,
              sum: 0
            };
          }
          
          dailyData[dayKey].values.push(value);
          dailyData[dayKey].count++;
          dailyData[dayKey].sum += value;
        }
      } catch (e) {
        console.error("Error processing HRV data point:", e);
      }
    });
    
    // Format for chart - calculate daily averages
    const result = Object.entries(dailyData).map(([day, data]) => {
      const avgHRV = data.count > 0 ? Math.round((data.sum / data.count) * 10) / 10 : 0;
      
      return {
        day,
        date: new Date(day + 'T12:00:00'), // Use noon time to avoid date shifting
        avgHRV,
        count: data.count
      };
    }).sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Add debugging for chart data
    console.log("HRVChart - processed chart data:", result.length);
    if (result.length > 0) {
      console.log("HRVChart - first chart data point:", result[0]);
    }
    
    return result;
  }, [data]);

  const handleZoomIn = () => {
    if (refAreaLeft === refAreaRight || refAreaRight === '') {
      setRefAreaLeft('');
      setRefAreaRight('');
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
      item => item.day >= leftDay && item.day <= rightDay
    );

    if (rangeData.length > 0) {
      const minValue = Math.min(...rangeData.map(item => item.avgHRV));
      const maxValue = Math.max(...rangeData.map(item => item.avgHRV));
      
      // Add some padding to the min/max
      const padding = (maxValue - minValue) * 0.1;
      
      setRefAreaLeft('');
      setRefAreaRight('');
      setLeft(leftDay);
      setRight(rightDay);
      setBottom(Math.max(0, Math.floor(minValue - padding)));
      setTop(Math.ceil(maxValue + padding));
    }
  };

  const handleZoomOut = () => {
    if (zoomHistory.length === 0) {
      // If no history, reset to full view
      setLeft(null);
      setRight(null);
      setTop('auto');
      setBottom('auto');
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

  const handleMouseDown = (e: any) => {
    if (!e || !e.activeLabel) return;
    setRefAreaLeft(e.activeLabel);
  };

  const handleMouseMove = (e: any) => {
    if (!e || !e.activeLabel || !refAreaLeft) return;
    setRefAreaRight(e.activeLabel);
  };

  const handleMouseUp = () => {
    if (refAreaLeft && refAreaRight) {
      handleZoomIn();
    }
    setRefAreaLeft('');
  };

  // Get the unit from the data
  const unit = data.length > 0 && data[0].unit ? data[0].unit : 'ms';

  // Helper function to format date labels consistently
  const formatDateLabel = (label: string): string => {
    const parts = label.split('-');
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
      
      <div style={{ width: '100%', height }}>
        {/* Add a fallback message if no data */}
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">No heart rate variability data available for the selected time period.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <LineChart
              data={chartData}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="day" 
                domain={[left || 'dataMin', right || 'dataMax']}
                type="category"
                tickFormatter={(value) => {
                  // Parse MM/DD directly from the YYYY-MM-DD format
                  const parts = value.split('-');
                  if (parts.length === 3) {
                    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
                  }
                  return value;
                }}
              />
              <YAxis 
                domain={[bottom || 0, top || 'auto']} 
                label={{ value: unit, angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                formatter={(value: number) => [`${value} ${unit}`, 'Average HRV']}
                labelFormatter={formatDateLabel}
              />
              <Legend />
              <Line 
                type="monotone"
                dataKey="avgHRV" 
                stroke="#8884d8" 
                activeDot={{ r: 8 }}
                name={`Daily Average HRV (${unit})`} 
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
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default HRVChart;