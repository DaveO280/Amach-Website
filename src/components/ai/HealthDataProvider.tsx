// src/components/ai/HealthDataProvider.tsx
"use client";

import { useHealthData } from "@/my-health-app/store/healthDataStore/provider";
import React, { createContext, useContext } from "react";

interface HealthDataProviderProps {
  children: React.ReactNode;
}

const HealthDataContext = createContext<ReturnType<
  typeof useHealthData
> | null>(null);

export const HealthDataProvider: React.FC<HealthDataProviderProps> = ({
  children,
}) => {
  const healthData = useHealthData();

  return (
    <HealthDataContext.Provider value={healthData}>
      {children}
    </HealthDataContext.Provider>
  );
};

export function useHealthDataContext(): ReturnType<typeof useHealthData> {
  const context = useContext(HealthDataContext);
  if (!context) {
    throw new Error(
      "useHealthDataContext must be used within a HealthDataProvider",
    );
  }
  return context;
}

export default HealthDataProvider;
