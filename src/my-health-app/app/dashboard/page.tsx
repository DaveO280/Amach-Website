"use client";

import { HealthDashboard } from "../../components/dashboard/HealthDashboard";
import { HealthDataProvider } from "../../store/healthDataStore/provider";
import { SelectionProvider } from "../../store/selectionStore/provider";

export default function DashboardPage() {
  return (
    <SelectionProvider>
      <HealthDataProvider>
        <HealthDashboard />
      </HealthDataProvider>
    </SelectionProvider>
  );
}
