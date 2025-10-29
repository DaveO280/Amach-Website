"use client";

import { Brain, Home, LogOut, Menu, Wallet, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { useState } from "react";
import AiCompanionModal from "../../components/AiCompanionModal";
import { DailyScoresDebugger } from "../../components/DailyScoresDebugger";
import { HealthDashboard } from "../../components/dashboard/HealthDashboard";
import { FileUploadDebugger } from "../../components/FileUploadDebugger";
import { useHealthDataContext } from "../../components/HealthDataContextWrapper";
import { OnChainProfileDisplay } from "../../components/OnChainProfileDisplay";
import { Button } from "../../components/ui/button";
import { useZkSyncSsoWallet } from "../../hooks/useZkSyncSsoWallet";
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
  const [showDebugger, setShowDebugger] = useState<boolean>(false);
  const [showFileDebugger, setShowFileDebugger] = useState<boolean>(false);
  const { disconnect } = useZkSyncSsoWallet();
  const { isAiCompanionOpen, setIsAiCompanionOpen } = useHealthDataContext();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleNavigateHome = (): void => {
    router.push("/");
    setIsMobileMenuOpen(false);
  };

  const handleNavigateWallet = (): void => {
    router.push("/wallet");
    setIsMobileMenuOpen(false);
  };

  const handleNavigateAICompanion = (): void => {
    setIsAiCompanionOpen(true);
    setIsMobileMenuOpen(false);
  };

  const handleDisconnect = async (): Promise<void> => {
    disconnect();
    setIsMobileMenuOpen(false);
    router.push("/");
  };

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
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50">
        {/* Navigation Bar - Mobile Optimized */}
        <nav className="sticky top-0 z-50 bg-white border-b border-amber-100 shadow-sm">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                {isMobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </Button>

              {/* Desktop Navigation */}
              <div className="hidden md:flex items-center gap-2 w-full">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNavigateHome}
                  className="flex items-center gap-2 text-emerald-700 hover:bg-emerald-50"
                >
                  <Home className="h-4 w-4" />
                  <span>Home</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNavigateWallet}
                  className="flex items-center gap-2 text-emerald-700 hover:bg-emerald-50"
                >
                  <Wallet className="h-4 w-4" />
                  <span>Wallet</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNavigateAICompanion}
                  className="flex items-center gap-2 text-emerald-700 hover:bg-emerald-50"
                >
                  <Brain className="h-4 w-4" />
                  <span>AI Companion</span>
                </Button>
                <div className="ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisconnect}
                    className="flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Disconnect</span>
                  </Button>
                </div>
              </div>

              {/* Page Title - Mobile */}
              <h1 className="text-lg font-bold text-emerald-900 md:hidden">
                Dashboard
              </h1>

              {/* Disconnect Button - Mobile (when menu closed) */}
              {!isMobileMenuOpen && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  className="md:hidden flex items-center gap-1 text-red-600 border-red-300 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Disconnect</span>
                </Button>
              )}
            </div>

            {/* Mobile Menu Dropdown */}
            {isMobileMenuOpen && (
              <div className="md:hidden mt-4 pb-2 space-y-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNavigateHome}
                  className="w-full justify-start flex items-center gap-3 text-emerald-700 hover:bg-emerald-50"
                >
                  <Home className="h-5 w-5" />
                  <span>Home</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNavigateWallet}
                  className="w-full justify-start flex items-center gap-3 text-emerald-700 hover:bg-emerald-50"
                >
                  <Wallet className="h-5 w-5" />
                  <span>Wallet</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNavigateAICompanion}
                  className="w-full justify-start flex items-center gap-3 text-emerald-700 hover:bg-emerald-50"
                >
                  <Brain className="h-5 w-5" />
                  <span>AI Companion</span>
                </Button>
              </div>
            )}
          </div>
        </nav>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-8">
          {/* Dashboard page now shows only data selector and visualizations */}
          <div>
            <HealthDashboard />
          </div>

          {/* On-Chain Profile Section */}
          <div className="mt-8">
            <OnChainProfileDisplay userAddress="0x1177909D90D96b787d5e5A8ac613f88231650524" />
          </div>

          {/* Debug Controls */}
          <div className="mt-4 p-4 border rounded-lg bg-gray-50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Debug Tools</h3>
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowDebugger(!showDebugger)}
                  className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
                >
                  {showDebugger ? "Hide" : "Show"} Daily Scores Debugger
                </button>
                <button
                  onClick={() => setShowFileDebugger(!showFileDebugger)}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  {showFileDebugger ? "Hide" : "Show"} File Upload Debugger
                </button>
              </div>
            </div>

            {showDebugger && <DailyScoresDebugger />}
            {showFileDebugger && <FileUploadDebugger />}
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

        {/* Modals */}
        <AiCompanionModal
          isOpen={isAiCompanionOpen}
          onClose={() => setIsAiCompanionOpen(false)}
        />
      </div>
    </SelectionProvider>
  );
}
