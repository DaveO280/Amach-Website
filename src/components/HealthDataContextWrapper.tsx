"use client";

import { HealthDataProvider } from "@/my-health-app/store/healthDataStore/provider";
import { SelectionProvider } from "@/my-health-app/store/selectionStore/provider";
import React, { createContext, useContext, useState } from "react";

// Create a context to track mounted state
export const HealthContextState = createContext({
  isDashboardOpen: false,
  setIsDashboardOpen: (state: boolean) => {},
  isAiCompanionOpen: false,
  setIsAiCompanionOpen: (state: boolean) => {},
});

export const useHealthContext = () => useContext(HealthContextState);

export default function HealthDataContextWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isAiCompanionOpen, setIsAiCompanionOpen] = useState(false);

  return (
    <HealthContextState.Provider
      value={{
        isDashboardOpen,
        setIsDashboardOpen,
        isAiCompanionOpen,
        setIsAiCompanionOpen,
      }}
    >
      <SelectionProvider>
        <HealthDataProvider>{children}</HealthDataProvider>
      </SelectionProvider>
    </HealthContextState.Provider>
  );
}
