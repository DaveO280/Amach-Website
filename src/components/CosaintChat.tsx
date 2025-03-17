"use client";

import { useEffect, useState } from "react";
import {
  ChatContext,
  useCosaintAgent,
  VeniceMessage,
} from "../lib/agent/hooks/useCosaintAgent";
import { useHealthData } from "../my-health-app/store/healthDataStore";
import { useSelection } from "../my-health-app/store/selectionStore";

const METRIC_DISPLAY_NAMES: Record<string, string> = {
  HKQuantityTypeIdentifierStepCount: "Steps",
  HKQuantityTypeIdentifierHeartRateVariability: "Heart Rate Variability",
  HKQuantityTypeIdentifierActiveEnergyBurned: "Active Energy",
  HKCategoryTypeIdentifierSleepAnalysis: "Sleep",
  HKQuantityTypeIdentifierHeartRate: "Heart Rate",
  HKQuantityTypeIdentifierRespiratoryRate: "Respiratory Rate",
  HKQuantityTypeIdentifierAppleExerciseTime: "Exercise Time",
  HKQuantityTypeIdentifierRestingHeartRate: "Resting Heart Rate",
};

export default function CosaintChat() {
  const [message, setMessage] = useState("");
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const healthData = useHealthData();
  const selection = useSelection();
  const {
    isLoading,
    error,
    sendMessage,
    initializeContext,
    prepareMetricContext,
    characteristics,
  } = useCosaintAgent();

  // Initialize chat context when health data is available
  useEffect(() => {
    if (healthData.hasData()) {
      const metrics = selection.selectedMetrics.map((metricId) => {
        return prepareMetricContext(
          metricId,
          METRIC_DISPLAY_NAMES[metricId] || metricId,
          healthData.metricData[metricId] || [],
        );
      });

      const context = initializeContext(metrics);
      setChatContext(context);
    }
  }, [
    healthData,
    selection.selectedMetrics,
    initializeContext,
    prepareMetricContext,
  ]);

  const handleSendMessage = async () => {
    if (!message.trim() || !chatContext) return;

    const response = await sendMessage(message, chatContext);
    if (response) {
      setChatContext(response.context);
      setMessage("");
    }
  };

  if (!chatContext) {
    return <div className="p-4">Loading health data...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatContext.previousMessages.map(
          (msg: VeniceMessage, idx: number) =>
            msg.role !== "system" && (
              <div
                key={idx}
                className={`p-3 rounded-lg max-w-[80%] ${
                  msg.role === "assistant"
                    ? "bg-emerald-50 ml-auto"
                    : "bg-gray-100"
                }`}
              >
                {msg.content}
              </div>
            ),
        )}
        {isLoading && (
          <div className="p-3 bg-gray-50 rounded-lg animate-pulse">
            Thinking...
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-lg">
            Error: {error}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask about your health data..."
            className="flex-1 p-2 border rounded-lg"
            onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
