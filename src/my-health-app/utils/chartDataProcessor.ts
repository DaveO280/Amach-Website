import { HealthData } from "../types/healthData";
import { extractDatePart } from "./dataDeduplicator";

export interface DailyDataPoint {
  day: string;
  date: Date;
  count: number;
}

export interface DailyNumericData extends DailyDataPoint {
  value: number;
}

export interface DailyHeartRateData extends DailyDataPoint {
  avg: number;
  min: number;
  max: number;
  range: number;
}

export interface DailySleepData extends DailyDataPoint {
  inBedHours: number;
  asleepHours: number;
  deepSleepHours: number;
  remSleepHours: number;
  lightSleepHours: number;
  sleepEfficiency: number;
}

export const processDailyNumericData = (
  data: HealthData[],
  valueTransform: (value: number) => number = (v) => v,
): DailyNumericData[] => {
  const dailyData: Record<string, { total: number; count: number }> = {};

  data.forEach((point) => {
    try {
      const dayKey = extractDatePart(point.startDate);
      const value = parseFloat(point.value);

      if (!isNaN(value)) {
        if (!dailyData[dayKey]) {
          dailyData[dayKey] = { total: 0, count: 0 };
        }

        dailyData[dayKey].total += valueTransform(value);
        dailyData[dayKey].count += 1;
      }
    } catch (e) {
      console.error("Error processing numeric data point:", e);
    }
  });

  return Object.entries(dailyData)
    .map(([day, data]) => ({
      day,
      date: new Date(day + "T12:00:00"),
      value: Math.round(data.total),
      count: data.count,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
};

export const processDailyHeartRateData = (
  data: HealthData[],
): DailyHeartRateData[] => {
  const dailyData: Record<
    string,
    { values: number[]; min: number; max: number }
  > = {};

  data.forEach((point) => {
    try {
      const dayKey = extractDatePart(point.startDate);
      const value = parseFloat(point.value);
      const minValue = point.min ? parseFloat(point.min) : value;
      const maxValue = point.max ? parseFloat(point.max) : value;

      if (!isNaN(value)) {
        if (!dailyData[dayKey]) {
          dailyData[dayKey] = {
            values: [],
            min: Number.MAX_SAFE_INTEGER,
            max: Number.MIN_SAFE_INTEGER,
          };
        }

        dailyData[dayKey].values.push(value);
        dailyData[dayKey].min = Math.min(dailyData[dayKey].min, minValue);
        dailyData[dayKey].max = Math.max(dailyData[dayKey].max, maxValue);
      }
    } catch (e) {
      console.error("Error processing heart rate data point:", e);
    }
  });

  return Object.entries(dailyData)
    .map(([day, data]) => ({
      day,
      date: new Date(day + "T12:00:00"),
      avg: Math.round(
        data.values.reduce((sum, val) => sum + val, 0) / data.values.length,
      ),
      min: Math.round(data.min),
      max: Math.round(data.max),
      range: Math.round(data.max - data.min),
      count: data.values.length,
    }))
    .sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime());
};

export const processDailySleepData = (data: HealthData[]): DailySleepData[] => {
  const dailyData: Record<
    string,
    {
      inBedHours: number;
      asleepHours: number;
      deepSleepHours: number;
      remSleepHours: number;
      lightSleepHours: number;
      sleepEfficiency: number;
    }
  > = {};

  data.forEach((point) => {
    try {
      const dayKey = extractDatePart(point.startDate);
      const value = parseFloat(point.value);

      if (!isNaN(value)) {
        if (!dailyData[dayKey]) {
          dailyData[dayKey] = {
            inBedHours: 0,
            asleepHours: 0,
            deepSleepHours: 0,
            remSleepHours: 0,
            lightSleepHours: 0,
            sleepEfficiency: 0,
          };
        }

        // Convert minutes to hours
        const hours = value / 60;

        switch (point.type) {
          case "HKCategoryTypeIdentifierSleepAnalysis":
            switch (point.value) {
              case "inBed":
                dailyData[dayKey].inBedHours += hours;
                break;
              case "deep":
                dailyData[dayKey].deepSleepHours += hours;
                dailyData[dayKey].asleepHours += hours;
                break;
              case "rem":
                dailyData[dayKey].remSleepHours += hours;
                dailyData[dayKey].asleepHours += hours;
                break;
              case "core":
                dailyData[dayKey].lightSleepHours += hours;
                dailyData[dayKey].asleepHours += hours;
                break;
            }
            break;
        }
      }
    } catch (e) {
      console.error("Error processing sleep data point:", e);
    }
  });

  return Object.entries(dailyData)
    .map(([day, data]) => {
      // Calculate sleep efficiency
      const sleepEfficiency =
        data.inBedHours > 0
          ? Math.round((data.asleepHours / data.inBedHours) * 100)
          : 0;

      return {
        day,
        date: new Date(day + "T12:00:00"),
        inBedHours: Math.round(data.inBedHours * 10) / 10,
        asleepHours: Math.round(data.asleepHours * 10) / 10,
        deepSleepHours: Math.round(data.deepSleepHours * 10) / 10,
        remSleepHours: Math.round(data.remSleepHours * 10) / 10,
        lightSleepHours: Math.round(data.lightSleepHours * 10) / 10,
        sleepEfficiency,
        count: 1, // Each day counts as one data point
      };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
};
