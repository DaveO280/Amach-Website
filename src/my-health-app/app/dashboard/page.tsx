"use client";

import { HealthDashboard } from "../../components/dashboard/HealthDashboard";
import { HealthDataProvider } from "../../store/healthDataStore/provider";
import { SelectionProvider } from "../../store/selectionStore/provider";

export default function DashboardPage(): JSX.Element {
  return (
    <SelectionProvider>
      <HealthDataProvider>
        <div className="container mx-auto px-4 py-8">
          <div className="mt-8">
            <HealthDashboard />
          </div>
        </div>
      </HealthDataProvider>
    </SelectionProvider>
  );
}
