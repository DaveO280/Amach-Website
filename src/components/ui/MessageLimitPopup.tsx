"use client";

import { X, Mail } from "lucide-react";
import React from "react";

interface MessageLimitPopupProps {
  isVisible: boolean;
  onClose: () => void;
  messageCount: number;
  maxMessages: number;
}

export const MessageLimitPopup: React.FC<MessageLimitPopupProps> = ({
  isVisible,
  onClose,
  messageCount,
  maxMessages,
}) => {
  if (!isVisible) return null;

  const isWarning = messageCount >= 5 && messageCount < maxMessages;
  const isBlocked = messageCount >= maxMessages;

  const emailAddress = "support@amachhealth.com";
  const emailSubject = encodeURIComponent("Request for Chat Access Whitelist");
  const emailBody = encodeURIComponent(
    "Hello,\n\nI would like to request whitelist access to continue using the AI chat feature without a wallet connection.\n\nThank you!",
  );
  const mailtoLink = `mailto:${emailAddress}?subject=${emailSubject}&body=${emailBody}`;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[200] bg-black/20" onClick={onClose} />
      {/* Popup */}
      <div className="fixed inset-0 z-[201] flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-emerald-50 to-amber-50 rounded-lg shadow-xl border-2 border-emerald-300 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h3 className="font-semibold text-emerald-900 text-lg mb-2">
                {isBlocked
                  ? "📊 Message Limit Reached"
                  : "⚠️ Message Limit Warning"}
              </h3>
              {isWarning && (
                <p className="text-sm text-emerald-800 mb-2">
                  You&apos;ve sent {messageCount} messages. You have{" "}
                  {maxMessages - messageCount} messages remaining before
                  reaching the limit.
                </p>
              )}
              {isBlocked && (
                <p className="text-sm text-emerald-800 mb-2">
                  You&apos;ve reached the limit of {maxMessages} messages. To
                  continue using the AI chat, please connect a wallet or request
                  whitelist access.
                </p>
              )}
              <p className="text-sm text-emerald-700 mb-4">
                {isWarning
                  ? "Connect your wallet for unlimited access to AI insights and personalized health recommendations."
                  : "Connect your wallet to continue chatting, or request whitelist access by emailing us."}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded-full p-1 transition-colors ml-2 flex-shrink-0"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {isBlocked && (
              <a
                href={mailtoLink}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md transition-all duration-300 hover:scale-105 shadow-sm"
              >
                <Mail className="h-4 w-4" />
                Email for Whitelist Consideration
              </a>
            )}
            <button
              onClick={onClose}
              className={`px-4 py-2.5 text-sm font-medium rounded-md transition-all duration-300 shadow-sm ${
                isBlocked
                  ? "bg-white border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white hover:scale-105"
              }`}
            >
              {isBlocked ? "Got it" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
