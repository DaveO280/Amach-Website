"use client";

import { Button } from "@/components/ui/button";
import { useAi } from "@/store/aiStore";
import { Send } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

// Define types for our message interface
interface MessageType {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

const CosaintChatUI: React.FC = () => {
  const {
    messages,
    sendMessage,
    isLoading,
    error,
    healthData: metrics,
  } = useAi();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to the bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus the input field when the component mounts
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSendMessage = async (): Promise<void> => {
    if (input.trim() === "") return;
    await sendMessage(input);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[60vh] max-h-[600px]">
      {/* Health Data Status */}
      <div className="mb-2 text-sm text-emerald-800">
        Available Metrics:{" "}
        {Object.keys(metrics)
          .map((key) => {
            // Special case for HRV
            if (key === "hrv") return "HRV";
            // Special case for RestingHR
            if (key === "restingHR") return "Resting HR";
            // Default case
            return (
              key.charAt(0).toUpperCase() +
              key
                .slice(1)
                .split(/(?=[A-Z])/)
                .join(" ")
            );
          })
          .join(", ")}
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-4 bg-white/30 rounded-lg mb-4 border border-emerald-100">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
              <span className="text-2xl">🌿</span>
            </div>
            <h3 className="text-lg font-semibold mb-2 text-emerald-700">
              Welcome to Cosaint AI Health Companion
            </h3>
            <p className="text-sm max-w-md">
              I&apos;m here to provide holistic health insights combining
              traditional wisdom with modern science. How can I help you today?
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message: MessageType) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-lg ${
                    message.role === "user"
                      ? "bg-emerald-600 text-white"
                      : "bg-amber-50 text-amber-900 border border-amber-100"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-2 p-2 bg-red-50 text-red-600 rounded text-sm">
          {error}
        </div>
      )}

      {/* Input Area */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            setInput(e.target.value)
          }
          onKeyDown={handleKeyDown}
          placeholder="Ask Cosaint about your health..."
          className="w-full pr-12 min-h-[60px] resize-none rounded-md border border-gray-300 p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          maxLength={500}
          disabled={isLoading}
        />
        <Button
          className="absolute right-2 bottom-2"
          size="sm"
          onClick={handleSendMessage}
          disabled={isLoading || input.trim() === ""}
        >
          {isLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"></div>
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Character limit counter */}
      <div className="text-xs text-right mt-1 text-gray-500">
        {input.length}/500
      </div>
    </div>
  );
};

export default CosaintChatUI;
