import React, { useState } from "react";
import { healthDataStore } from "../data/store/healthDataStore";
import {
  calculateAndStoreDailyHealthScores,
  DailyHealthScores,
  getDailyHealthScores,
} from "../utils/dailyHealthScoreCalculator";
import { useHealthDataContext } from "./HealthDataContextWrapper";

export const DailyScoresDebugger: React.FC = () => {
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [storedScores, setStoredScores] = useState<DailyHealthScores[] | null>(
    null,
  );
  const { userProfile } = useHealthDataContext();

  const addDebugInfo = (info: string): void => {
    setDebugInfo((prev) => [...prev, `${new Date().toISOString()}: ${info}`]);
  };

  const testDailyScoreCalculation = async (): Promise<void> => {
    addDebugInfo("Starting daily score calculation test...");

    try {
      // Get current health data
      const currentHealthData = await healthDataStore.getHealthData();
      addDebugInfo(
        `Current health data keys: ${currentHealthData ? Object.keys(currentHealthData) : "null"}`,
      );

      if (!currentHealthData || Object.keys(currentHealthData).length === 0) {
        addDebugInfo("No health data available for testing");
        return;
      }

      // Get user profile from context
      const profile = userProfile || {};
      addDebugInfo(`User profile: ${JSON.stringify(profile)}`);

      // Calculate and store daily scores
      addDebugInfo("Calculating daily scores...");
      const dailyScores = await calculateAndStoreDailyHealthScores(
        currentHealthData,
        profile,
      );
      addDebugInfo(`Calculated ${dailyScores.length} daily scores`);

      // Retrieve stored scores
      addDebugInfo("Retrieving stored scores...");
      const retrievedScores = await getDailyHealthScores();
      addDebugInfo(
        `Retrieved ${retrievedScores ? retrievedScores.length : 0} stored scores`,
      );

      setStoredScores(retrievedScores);
    } catch (error) {
      addDebugInfo(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const clearDebugInfo = (): void => {
    setDebugInfo([]);
    setStoredScores(null);
  };

  const checkIndexedDB = async (): Promise<void> => {
    addDebugInfo("Checking IndexedDB directly...");

    try {
      const scores = await getDailyHealthScores();
      addDebugInfo(
        `Direct IndexedDB check: ${scores ? scores.length : 0} scores found`,
      );
      setStoredScores(scores);
    } catch (error) {
      addDebugInfo(
        `IndexedDB check error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <h3 className="text-lg font-semibold mb-4">Daily Scores Debugger</h3>

      <div className="space-y-2 mb-4">
        <button
          onClick={testDailyScoreCalculation}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Test Daily Score Calculation
        </button>

        <button
          onClick={checkIndexedDB}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 ml-2"
        >
          Check IndexedDB
        </button>

        <button
          onClick={clearDebugInfo}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 ml-2"
        >
          Clear Debug Info
        </button>
      </div>

      <div className="mb-4">
        <h4 className="font-medium mb-2">Debug Information:</h4>
        <div className="bg-white p-3 rounded border max-h-60 overflow-y-auto">
          {debugInfo.length === 0 ? (
            <p className="text-gray-500">
              No debug information yet. Click a button to start testing.
            </p>
          ) : (
            debugInfo.map((info, index) => (
              <div key={index} className="text-sm font-mono mb-1">
                {info}
              </div>
            ))
          )}
        </div>
      </div>

      {storedScores && (
        <div>
          <h4 className="font-medium mb-2">Stored Daily Scores:</h4>
          <div className="bg-white p-3 rounded border max-h-60 overflow-y-auto">
            <pre className="text-sm">
              {JSON.stringify(storedScores, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
