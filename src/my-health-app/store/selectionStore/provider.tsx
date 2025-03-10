"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { coreMetrics, optionalMetrics } from "../../core/metricDefinitions";
import { TimeFrame } from "../../types/healthData";

interface SelectionContextType {
  // Time frame selection
  timeFrame: TimeFrame;
  setTimeFrame: (timeFrame: TimeFrame) => void;

  // Metric selections - now a unified list instead of only optional metrics
  selectedMetrics: string[];
  setSelectedMetrics: (metrics: string[]) => void;

  // Legacy property for backward compatibility
  selectedOptionalMetrics: string[];

  // Selection management
  toggleMetric: (metricId: string) => void;
  toggleOptionalMetric: (metricId: string) => void; // Add this line to match the provider value
  selectOnlyMetric: (metricId: string) => void;
  clearSelections: () => void;
  selectAllCoreMetrics: () => void;
  getAllSelectedMetrics: () => string[];
  isMetricSelected: (metricId: string) => boolean;

  // File selection
  uploadedFile: File | null;
  setUploadedFile: (file: File | null) => void;
}

const SelectionContext = createContext<SelectionContextType | undefined>(
  undefined,
);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  // Fix timeFrame state to match the type definition
  // Change "3M" to "3mo" to match the TimeFrame type
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("3mo");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Save selections to localStorage when they change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("timeFrame", timeFrame);
    }
  }, [timeFrame]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("selectedMetrics", JSON.stringify(selectedMetrics));
    }
  }, [selectedMetrics]);

  const toggleMetric = useCallback((metricId: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(metricId)
        ? prev.filter((id) => id !== metricId)
        : [...prev, metricId],
    );
  }, []);

  const getAllSelectedMetrics = useCallback(() => {
    return selectedMetrics;
  }, [selectedMetrics]);

  // Clear all selections
  const clearSelections = useCallback(() => {
    setSelectedMetrics([]);
  }, []);

  // Select only one metric (useful for testing)
  const selectOnlyMetric = useCallback((metricId: string) => {
    setSelectedMetrics([metricId]);
  }, []);

  // Select all core metrics
  const selectAllCoreMetrics = useCallback(() => {
    setSelectedMetrics(coreMetrics.map((m) => m.id));
  }, []);

  // Compute selectedOptionalMetrics for backward compatibility
  const selectedOptionalMetrics = selectedMetrics.filter((id) =>
    optionalMetrics.some((m) => m.id === id),
  );

  // Legacy function renamed for backward compatibility
  const toggleOptionalMetric = toggleMetric;

  // Check if a metric is selected
  const isMetricSelected = useCallback(
    (metricId: string) => {
      return selectedMetrics.includes(metricId);
    },
    [selectedMetrics],
  );

  return (
    <SelectionContext.Provider
      value={{
        timeFrame,
        setTimeFrame,
        selectedMetrics,
        setSelectedMetrics,
        selectedOptionalMetrics,
        toggleMetric,
        toggleOptionalMetric,
        selectOnlyMetric,
        clearSelections,
        selectAllCoreMetrics,
        getAllSelectedMetrics,
        isMetricSelected,
        uploadedFile,
        setUploadedFile,
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  const context = useContext(SelectionContext);
  if (context === undefined) {
    throw new Error("useSelection must be used within a SelectionProvider");
  }
  return context;
}
