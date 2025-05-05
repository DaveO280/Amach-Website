"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import React from "react";

interface NotificationProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void; // Added to support proceeding to dashboard after closing
}

const BetaNotification: React.FC<NotificationProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const handleConfirm = (): void => {
    onClose();
    if (onConfirm) onConfirm();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative max-w-md w-full bg-gradient-to-br from-amber-50 via-white to-emerald-50 rounded-lg shadow-xl overflow-hidden p-6 border border-emerald-100"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the notification itself
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 rounded-full p-1 text-amber-900 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
              aria-label="Close notification"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mb-2">
              <h3 className="text-lg font-semibold text-emerald-800">
                Beta Version Notice
              </h3>
            </div>

            <div className="mt-2">
              <p className="text-amber-800/80">
                During Beta, only Apple Health Data will be compatible. More
                devices will be added with later builds.
              </p>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleConfirm}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors text-sm font-medium"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BetaNotification;
