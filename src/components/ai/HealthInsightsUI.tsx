// src/components/ai/HealthInsightsUI.tsx
"use client";

import { RefreshCw } from "lucide-react";
import React from "react";

const placeholderInsights = [
  "Morning sunlight exposure improves sleep quality by 42% according to 2022 chronobiology research",
  "Consistent meal timing can regulate circadian rhythms and improve metabolic health",
  "Regular movement throughout the day is more beneficial than a single workout session",
];

const HealthInsightsUI: React.FC = () => {
  return (
    <div className="h-[500px] bg-white rounded-lg shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-emerald-50/50 border-b">
        <h3 className="text-lg text-emerald-800 font-semibold">
          Health Insights
        </h3>
        <button
          className="p-1.5 rounded-full hover:bg-emerald-100 text-emerald-700"
          title="Refresh insights"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Insights */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-4">
          {placeholderInsights.map((insight, index) => (
            <div
              key={index}
              className="p-3 rounded-md bg-emerald-50 border-l-4 border-emerald-600"
            >
              <p className="text-emerald-900">{insight}</p>
            </div>
          ))}
          <div className="p-3 rounded-md bg-amber-50 border-l-4 border-amber-400">
            <p className="text-amber-800">
              Connect your wearable device to receive personalized insights
              based on your health data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HealthInsightsUI;
