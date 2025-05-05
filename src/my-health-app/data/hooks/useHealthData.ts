import { useEffect, useState } from "react";
import { healthDataStore } from "../store/healthDataStore";
import {
  HealthDataResults,
  HealthMetric,
  MetricType,
} from "../types/healthMetrics";

export const useHealthData: () => {
  data: HealthDataResults | null;
  isLoading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
  updateMetric: (
    metricType: MetricType,
    metricData: HealthMetric[],
  ) => Promise<void>;
  clearData: () => Promise<void>;
} = () => {
  const [data, setData] = useState<HealthDataResults | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Load data from IndexedDB on startup
  useEffect(() => {
    const loadData = async (): Promise<void> => {
      try {
        console.log("[DEBUG] Loading data from IndexedDB...");
        const healthData = await healthDataStore.getHealthData();
        if (healthData) {
          console.log(
            "[DEBUG] Data loaded from IndexedDB:",
            Object.keys(healthData).length,
            "metrics",
          );
          setData(healthData);
        } else {
          console.log("[DEBUG] No data found in IndexedDB");
        }

        const lastUpdated = await healthDataStore.getLastUpdated();
        if (lastUpdated) {
          setLastUpdated(lastUpdated);
        }
      } catch (err) {
        console.error("[ERROR] Failed to load data from IndexedDB:", err);
        setError(err instanceof Error ? err : new Error("Failed to load data"));
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const updateMetric = async (
    metricType: MetricType,
    metricData: HealthMetric[],
  ): Promise<void> => {
    try {
      console.log(
        `[DEBUG] Updating metric ${metricType} with ${metricData.length} points`,
      );
      await healthDataStore.updateMetricData(metricType, metricData);

      // Refresh data after update
      const updatedData = await healthDataStore.getHealthData();
      if (updatedData) {
        setData(updatedData);
      }

      const lastUpdated = await healthDataStore.getLastUpdated();
      if (lastUpdated) {
        setLastUpdated(lastUpdated);
      }
    } catch (err) {
      console.error("[ERROR] Failed to update metric:", err);
      throw err;
    }
  };

  const clearData = async (): Promise<void> => {
    try {
      console.log("[DEBUG] Clearing all data from IndexedDB");
      await healthDataStore.clearHealthData();
      setData(null);
      setLastUpdated(null);
    } catch (err) {
      console.error("[ERROR] Failed to clear data:", err);
      throw err;
    }
  };

  return {
    data,
    isLoading,
    error,
    lastUpdated,
    updateMetric,
    clearData,
  };
};
