"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { healthDataStore } from "../../data/store/healthDataStore";
import {
  HealthDataByType,
  HealthDataPoint,
  ProcessingState,
} from "../../types/healthData";

// Add global window property declaration
declare global {
  interface Window {
    __healthDataProviderMounted?: boolean;
    __selectionProviderMounted?: boolean;
  }
}

interface HealthDataContextType {
  metricData: HealthDataByType;
  processingState: ProcessingState;
  setProcessingState: (state: ProcessingState) => void;
  updateProcessingProgress: (progress: number, status: string) => void;
  setProcessingError: (error: string) => void;
  addMetricData: (metricId: string, data: HealthDataPoint[]) => void;
  clearData: () => void;
  hasData: () => boolean;
}

const defaultProcessingState: ProcessingState = {
  isProcessing: false,
  progress: 0,
  status: "",
  error: null,
};

const HealthDataContext = createContext<HealthDataContextType | undefined>(
  undefined,
);

export const HealthDataProvider: ({
  children,
}: {
  children: React.ReactNode;
}) => JSX.Element = ({ children }) => {
  const [metricData, setMetricData] = useState<HealthDataByType>({});
  const [processingState, setProcessingState] = useState<ProcessingState>(
    defaultProcessingState,
  );

  // Load data from IndexedDB on startup
  useEffect(() => {
    const loadData = async (): Promise<void> => {
      try {
        const data = await healthDataStore.getHealthData();
        console.log("[HealthDataProvider] Loaded data from IndexedDB:", {
          hasData: !!data,
          availableMetrics: data ? Object.keys(data) : [],
          sampleCounts: data
            ? Object.entries(data).reduce(
                (acc, [key, value]) => ({
                  ...acc,
                  [key]: Array.isArray(value) ? value.length : 0,
                }),
                {},
              )
            : {},
        });
        setMetricData(data || {});
      } catch (error) {
        console.error("[HealthDataProvider] Error loading data:", error);
        setMetricData({});
      }
    };

    loadData();
  }, []);

  const updateProcessingProgress = (progress: number, status: string): void => {
    setProcessingState((prev) => ({
      ...prev,
      progress,
      status,
    }));
  };

  const setProcessingError = (error: string): void => {
    setProcessingState((prev) => ({
      ...prev,
      error,
      isProcessing: false,
    }));
  };

  const addMetricData = (metricId: string, data: HealthDataPoint[]): void => {
    console.log(
      `[DEBUG] Adding ${metricId} to store with ${data.length} records`,
    );
    setMetricData((prev) => ({
      ...prev,
      [metricId]: data,
    }));
  };

  const clearData = (): void => {
    setMetricData({});
    setProcessingState(defaultProcessingState);
  };

  const hasData = (): boolean => {
    return (
      Object.keys(metricData).length > 0 &&
      Object.values(metricData).some(
        (data) => Array.isArray(data) && data.length > 0,
      )
    );
  };

  // Add diagnostic logging
  useEffect(() => {
    console.log("[HealthDataProvider] Data status:", {
      hasData: Boolean(Object.keys(metricData).length > 0),
      metricCount: Object.keys(metricData).length,
      metricIDs: Object.keys(metricData),
      totalDataPoints: Object.values(metricData).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
        0,
      ),
    });

    // Add flag to check component mounting
    window.__healthDataProviderMounted = true;
    return (): void => {
      window.__healthDataProviderMounted = false;
    };
  }, [metricData]);

  return (
    <HealthDataContext.Provider
      value={{
        metricData,
        processingState,
        setProcessingState,
        updateProcessingProgress,
        setProcessingError,
        addMetricData,
        clearData,
        hasData,
      }}
    >
      {children}
    </HealthDataContext.Provider>
  );
};

export const useHealthData: () => HealthDataContextType = () => {
  const context = useContext(HealthDataContext);
  if (context === undefined) {
    throw new Error("useHealthData must be used within a HealthDataProvider");
  }
  return context;
};
