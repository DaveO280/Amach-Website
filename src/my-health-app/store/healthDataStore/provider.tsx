"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
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

export function HealthDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [metricData, setMetricData] = useState<HealthDataByType>({});
  const [processingState, setProcessingState] = useState<ProcessingState>(
    defaultProcessingState,
  );

  const updateProcessingProgress = useCallback(
    (progress: number, status: string) => {
      setProcessingState((prev) => ({
        ...prev,
        progress,
        status,
      }));
    },
    [],
  );

  const setProcessingError = useCallback((error: string) => {
    setProcessingState((prev) => ({
      ...prev,
      error,
      isProcessing: false,
    }));
  }, []);

  const addMetricData = useCallback(
    (metricId: string, data: HealthDataPoint[]) => {
      console.log(
        `[DEBUG] Adding ${metricId} to store with ${data.length} records`,
      );
      setMetricData((prev) => ({
        ...prev,
        [metricId]: data,
      }));
    },
    [],
  );

  const clearData = useCallback(() => {
    setMetricData({});
    setProcessingState(defaultProcessingState);
  }, []);

  const hasData = useCallback(() => {
    return (
      Object.keys(metricData).length > 0 &&
      Object.values(metricData).some(
        (data) => Array.isArray(data) && data.length > 0,
      )
    );
  }, [metricData]);

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
    return () => {
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
}

export function useHealthData() {
  const context = useContext(HealthDataContext);
  if (context === undefined) {
    throw new Error("useHealthData must be used within a HealthDataProvider");
  }
  return context;
}
