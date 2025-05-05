"use client";

import { HealthScoreCards } from "@/components/ai/HealthScoreCards";
import HealthStatCards from "@/components/ai/HealthStatCards";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHealthData } from "@/my-health-app/store/healthDataStore/provider";
import AiProvider from "@/store/aiStore";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import CosaintChatUI from "./ai/CosaintChatUI";
import HealthReport from "./ai/HealthReport";

interface ProfileData {
  age: number;
  sex: "male" | "female";
  height: number;
  weight: number;
}

interface AiCompanionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AiCompanionModal: React.FC<AiCompanionModalProps> = (props) => {
  const [isMobile, setIsMobile] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [profileData, setProfileData] = useState<ProfileData | undefined>(
    undefined,
  );
  const [showProfileModal, setShowProfileModal] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Access the health data provider to check for available data
  const { metricData } = useHealthData();

  // Check if health data is available
  const hasHealthData = Object.keys(metricData).length > 0;

  const handleProfileDataChange = (
    field: keyof ProfileData,
    value: string | number,
  ): void => {
    setProfileData((prev) => {
      if (!prev) {
        return {
          age: field === "age" ? (value as number) : 0,
          sex: field === "sex" ? (value as "male" | "female") : "male",
          height: field === "height" ? (value as number) : 0,
          weight: field === "weight" ? (value as number) : 0,
        };
      }
      return {
        ...prev,
        [field]: value,
      };
    });
  };

  // Check viewport size to adjust UI accordingly
  useEffect(() => {
    const handleResize = (): void => {
      setIsMobile(window.innerWidth < 768);
    };

    // Initial check
    handleResize();

    // Listen for resize events
    window.addEventListener("resize", handleResize);

    // Clean up listener
    return (): void => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Prevent clicks on the modal from closing it
  const handleModalClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
  };

  if (!props.isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm flex justify-center items-center p-2">
      <div
        ref={modalRef}
        className={`relative w-full rounded-lg shadow-xl overflow-hidden animate-in fade-in duration-300 ${
          isMobile
            ? "max-w-full max-h-[95vh]" // Full width on mobile with slight padding
            : "max-w-[95vw] max-h-[90vh]" // 95% width on desktop
        }`}
        style={{
          background:
            "linear-gradient(to bottom right, #FFE3B4, #ffffff, #CAF2DD)",
        }}
        onClick={handleModalClick}
      >
        {/* Adaptive header structure for both mobile and desktop */}
        <header className="sticky top-0 z-10 w-full bg-white/90 border-b border-amber-100 backdrop-blur-sm">
          {/* Title row */}
          <div className="px-3 py-2 flex items-center justify-between">
            <h2 className="text-base sm:text-xl font-black text-emerald-900">
              Amach Health
            </h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={props.onClose}
                className="rounded-full p-2 text-amber-900 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                aria-label="Close dashboard"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <div
          className="p-2 sm:p-4 md:p-6 overflow-auto"
          style={{ maxHeight: "calc(90vh - 60px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Health Stats Section with Toggle */}
          {hasHealthData && (
            <div className="mb-4">
              <div
                className="flex items-center justify-between cursor-pointer bg-white/60 p-3 rounded-lg shadow-sm mb-2"
                onClick={() => setShowStats(!showStats)}
              >
                <h3 className="font-semibold text-emerald-800">
                  Your Health Overview
                </h3>
                <button className="text-emerald-600 hover:text-emerald-700">
                  {showStats ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </button>
              </div>

              {showStats && (
                <div className="mb-4">
                  {profileData ? (
                    <HealthScoreCards profileData={profileData} />
                  ) : (
                    <HealthStatCards />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Health Report Section */}
          {hasHealthData ? (
            <HealthReport profileData={profileData} />
          ) : (
            <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-amber-800">
                No health data available yet. Process your data in the Health
                Dashboard for personalized insights.
              </p>
            </div>
          )}

          {/* AI chat component with necessary providers */}
          <AiProvider>
            <div className="bg-white/70 p-4 rounded-lg shadow-sm border border-emerald-50">
              <CosaintChatUI />
            </div>
          </AiProvider>
        </div>
      </div>

      {/* Profile Input Modal */}
      <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Your Profile Information</DialogTitle>
            <DialogDescription>
              Please provide your basic information for personalized health
              analysis
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  placeholder="Enter your age"
                  onChange={(e) =>
                    handleProfileDataChange("age", parseInt(e.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sex">Sex</Label>
                <Select
                  onValueChange={(value: "male" | "female") =>
                    handleProfileDataChange("sex", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select sex" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="height">Height (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  placeholder="Enter your height"
                  onChange={(e) =>
                    handleProfileDataChange("height", parseInt(e.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight">Weight (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  placeholder="Enter your weight"
                  onChange={(e) =>
                    handleProfileDataChange("weight", parseInt(e.target.value))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (
                  profileData?.age &&
                  profileData?.sex &&
                  profileData?.height &&
                  profileData?.weight
                ) {
                  setShowProfileModal(false);
                }
              }}
              disabled={
                !profileData?.age ||
                !profileData?.sex ||
                !profileData?.height ||
                !profileData?.weight
              }
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AiCompanionModal;
