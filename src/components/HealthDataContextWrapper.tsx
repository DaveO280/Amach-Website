"use client";

import { HealthDataProvider } from "@/my-health-app/store/healthDataStore/provider";
import { SelectionProvider } from "@/my-health-app/store/selectionStore/provider";
import React, { createContext, useContext, useState } from "react";

interface HealthContextType {
  isDashboardOpen: boolean;
  setIsDashboardOpen: (value: boolean) => void;
  isAiCompanionOpen: boolean;
  setIsAiCompanionOpen: (value: boolean) => void;
}

// Create a context to track mounted state
export const HealthContextState = createContext<HealthContextType>({
  isDashboardOpen: false,
  setIsDashboardOpen: () => {},
  isAiCompanionOpen: false,
  setIsAiCompanionOpen: () => {},
});

export const useHealthContext = (): HealthContextType =>
  useContext(HealthContextState);

export default function HealthDataContextWrapper({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
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
