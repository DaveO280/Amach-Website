"use client";

import Papa from "papaparse";
import { useState } from "react";
import { HealthDashboard } from "../../components/dashboard/HealthDashboard";
import { OnChainProfileDisplay } from "../../components/OnChainProfileDisplay";
import { SelectionProvider } from "../../store/selectionStore/provider";
import { HealthContext, UploadedFileSummary } from "../../types/HealthContext";
import { exportCompleteBackup, importCompleteBackup } from "../../utils/utils";

declare global {
  interface Window {
    __lastExportedCSVFile?: File;
  }
}

// Example default context
const defaultContext: HealthContext = {
  version: 1,
  userProfile: {},
  chatHistory: [],
  healthScores: [],
  uploadedFiles: [],
  userFeedback: [],
  goals: [],
};

export default function DashboardPage(): JSX.Element {
  const [healthContext, setHealthContext] =
    useState<HealthContext>(defaultContext);
  const [message, setMessage] = useState<string>("");

  // Handler for adding CSV to AI context
  const handleAddToAIContext = (csvFile: File | null): void => {
    if (!csvFile) {
      setMessage("No CSV file available to add to context.");
      return;
    }
    Papa.parse(csvFile, {
      header: true,
      complete: (results) => {
        const parsedCsvData = results.data;
        const summary: UploadedFileSummary = {
          type: "csv",
          summary: `Added health data from CSV on ${new Date().toLocaleDateString()}`,
          date: new Date().toISOString(),
          rawData: { data: parsedCsvData },
        };
        setHealthContext((prev) => ({
          ...prev,
          uploadedFiles: [...prev.uploadedFiles, summary],
        }));
        setMessage("CSV data added to AI context!");
      },
      error: () => setMessage("Failed to parse CSV file."),
    });
  };

  return (
    <SelectionProvider>
      <div className="container mx-auto px-4 py-8">
        {/* Dashboard page now shows only data selector and visualizations */}
        <div>
          <HealthDashboard />
        </div>

        {/* On-Chain Profile Section */}
        <div className="mt-8">
          <OnChainProfileDisplay userAddress="0x1177909D90D96b787d5e5A8ac613f88231650524" />
        </div>

        <div style={{ margin: "1rem 0" }}>
          <button
            onClick={async () => {
              try {
                await exportCompleteBackup(healthContext);
              } catch (error) {
                console.error("Backup failed:", error);
                alert("Backup failed. Check console for details.");
              }
            }}
          >
            Export Complete Backup
          </button>
          <button
            onClick={async () => {
              try {
                await importCompleteBackup(setHealthContext);
              } catch (error) {
                console.error("Import failed:", error);
                alert("Import failed. Check console for details.");
              }
            }}
            style={{ marginLeft: 8 }}
          >
            Import Complete Backup
          </button>
          <button
            onClick={() =>
              handleAddToAIContext(window.__lastExportedCSVFile || null)
            }
            style={{ marginLeft: 8 }}
          >
            Add to AI Context
          </button>
          {message && (
            <div style={{ marginTop: 8, color: "green" }}>{message}</div>
          )}
        </div>
      </div>
    </SelectionProvider>
  );
}
