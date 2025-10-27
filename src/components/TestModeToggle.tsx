"use client";

import { useState, useEffect } from "react";
import { Button } from "./ui/button";

export function TestModeToggle(): JSX.Element | null {
  const [isTestMode, setIsTestMode] = useState(false);

  useEffect((): void => {
    const saved = localStorage.getItem("test-mode");
    setIsTestMode(saved === "true");
  }, []);

  const toggleTestMode = (): void => {
    const newMode = !isTestMode;
    setIsTestMode(newMode);
    localStorage.setItem("test-mode", newMode.toString());
    window.location.reload(); // Reload to apply changes
  };

  if (process.env.NODE_ENV !== "development") {
    return null; // Only show in development
  }

  return (
    <div className="fixed top-4 right-4 z-50 bg-yellow-100 border border-yellow-300 rounded-lg p-3 shadow-lg">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Test Mode</span>
        <Button
          size="sm"
          variant={isTestMode ? "default" : "outline"}
          onClick={toggleTestMode}
        >
          {isTestMode ? "ON" : "OFF"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            localStorage.removeItem("test-mode");
            window.location.reload();
          }}
        >
          Reset
        </Button>
      </div>
      {isTestMode && (
        <div className="text-xs text-yellow-700 mt-1">
          Using mock services - no blockchain calls
        </div>
      )}
    </div>
  );
}
