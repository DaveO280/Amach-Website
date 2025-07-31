// src/components/SharedProvidersWrapper.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Activity, Bot } from "lucide-react";
import React, { useState } from "react";
import { SelectionProvider } from "../store/selectionStore/provider";
import AiCompanionModal from "./AiCompanionModal";
import HealthDashboardModal from "./HealthDashboardModal";

interface SharedProvidersWrapperProps {
  // Optional props if needed
}

const SharedProvidersWrapper: React.FC<SharedProvidersWrapperProps> = () => {
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isAiCompanionOpen, setIsAiCompanionOpen] = useState(false);

  return (
    <SelectionProvider>
      <div className="flex space-x-2">
        <Button
          onClick={() => setIsDashboardOpen(true)}
          className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700"
        >
          <Activity className="h-4 w-4" />
          <span>Health Dashboard</span>
        </Button>

        <Button
          onClick={() => setIsAiCompanionOpen(true)}
          className="flex items-center space-x-2 bg-amber-600 hover:bg-amber-700"
        >
          <Bot className="h-4 w-4" />
          <span>AI Companion</span>
        </Button>
      </div>

      {/* Health Dashboard Modal */}
      <HealthDashboardModal
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
      />

      {/* AI Companion Modal */}
      <AiCompanionModal
        isOpen={isAiCompanionOpen}
        onClose={() => setIsAiCompanionOpen(false)}
      />
    </SelectionProvider>
  );
};

export default SharedProvidersWrapper;
