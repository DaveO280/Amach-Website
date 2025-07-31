import { VeniceApiService } from "@/api/venice/VeniceApiService";
import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { Button } from "@/components/ui/button";
import { useSaveGoalsMutation } from "@/data/hooks/useGoalsMutation";
import { useGoalsQuery } from "@/data/hooks/useGoalsQuery";
import { CosaintAiService } from "@/services/CosaintAiService";
import type { HealthGoal, UploadedFileSummary } from "@/types/HealthContext";
import { CheckCircle2, Loader2, Pencil, Sparkles, Trash2 } from "lucide-react";
import React, { useMemo, useState } from "react";

const GoalsTab: React.FC = (): JSX.Element => {
  const { uploadedFiles, metrics } = useHealthDataContext();
  const { data: goals = [] } = useGoalsQuery();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editTimeframe, setEditTimeframe] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newGoalTimeframeOption, setNewGoalTimeframeOption] =
    useState("1 week");
  const [aiLoading, setAiLoading] = useState(false);
  const veniceApi = useMemo(
    () =>
      VeniceApiService.fromEnv
        ? VeniceApiService.fromEnv()
        : new VeniceApiService("llama-3.1-405b"),
    [],
  );
  const aiService = useMemo(() => new CosaintAiService(veniceApi), [veniceApi]);
  const {
    mutate: saveGoals,
    isPending: isSaving,
    error: saveError,
  } = useSaveGoalsMutation();
  const [aiProposedGoals, setAiProposedGoals] = useState<HealthGoal[]>([]);
  const [selectedAiGoalIds, setSelectedAiGoalIds] = useState<Set<string>>(
    new Set(),
  );
  const [recentlyAddedGoalIds, setRecentlyAddedGoalIds] = useState<Set<string>>(
    new Set(),
  );
  const [showAddCheck, setShowAddCheck] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);

  const TIMEFRAME_OPTIONS = [
    "1 week",
    "1 month",
    "3 months",
    "6 months",
    "1 year",
    "Custom",
  ];
  const [customGoalTimeframe, setCustomGoalTimeframe] = useState("");
  const [aiGoalTimeframeOptions, setAiGoalTimeframeOptions] = useState<
    Record<string, string>
  >({});
  const [aiGoalCustomTimeframes, setAiGoalCustomTimeframes] = useState<
    Record<string, string>
  >({});

  // Check if there is any health data present
  const hasHealthData =
    (metrics?.steps && metrics.steps.average > 0) ||
    (metrics?.exercise && metrics.exercise.average > 0) ||
    (metrics?.heartRate && metrics.heartRate.average > 0) ||
    (metrics?.activeEnergy && metrics.activeEnergy.average > 0) ||
    (metrics?.sleep && metrics.sleep.average > 0);

  const handleEdit = (id: string, text: string, timeframe?: string): void => {
    setEditingId(id);
    setEditText(text);
    setEditTimeframe(timeframe || "");
  };

  const handleAddGoal = (): void => {
    if (newGoal.trim()) {
      let timeframe =
        newGoalTimeframeOption === "Custom"
          ? customGoalTimeframe.trim()
          : newGoalTimeframeOption;
      const newGoalObj: HealthGoal = {
        id: Date.now().toString(),
        text: newGoal.trim(),
        selected: true,
        source: "user",
        timeframe: timeframe || undefined,
      };
      saveGoals([...goals, newGoalObj]);
      setRecentlyAddedGoalIds(new Set([newGoalObj.id]));
      setShowAddCheck(true);
      setTimeout(() => setShowAddCheck(false), 1000);
      setTimeout(() => setRecentlyAddedGoalIds(new Set()), 1000);
      setNewGoal("");
      setNewGoalTimeframeOption("1 week");
      setCustomGoalTimeframe("");
    }
  };

  const handleAiSuggestGoals = async (): Promise<void> => {
    setAiLoading(true);
    try {
      if (!metrics) {
        setAiLoading(false);
        return;
      }
      const files =
        uploadedFiles?.map((f: UploadedFileSummary) => ({
          type: f.type,
          summary: f.summary,
          date: f.date,
        })) || [];
      const aiGoals = await aiService.generateGoalsFromHealthData(
        metrics,
        files,
      );
      const proposed = aiGoals.map((text, i) => ({
        id: `ai-${Date.now()}-${i}`,
        text,
        selected: false,
        source: "ai" as const,
      }));
      setAiProposedGoals(proposed);
      setSelectedAiGoalIds(new Set(proposed.map((g) => g.id)));
    } catch (err) {
      console.error("AI goal generation failed", err);
    }
    setAiLoading(false);
  };

  const handleSelectAiGoal = (id: string): void => {
    setSelectedAiGoalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSaveSelectedAiGoals = (): void => {
    const selectedGoals = aiProposedGoals
      .filter((g) => selectedAiGoalIds.has(g.id))
      .map((g) => {
        let timeframeOption = aiGoalTimeframeOptions[g.id] || "1 week";
        let timeframe =
          timeframeOption === "Custom"
            ? aiGoalCustomTimeframes[g.id]?.trim()
            : timeframeOption;
        return {
          ...g,
          timeframe: timeframe || undefined,
        };
      });
    if (selectedGoals.length > 0) {
      saveGoals([...goals, ...selectedGoals]);
      setRecentlyAddedGoalIds(new Set(selectedGoals.map((g) => g.id)));
      setShowAddCheck(true);
      setTimeout(() => setShowAddCheck(false), 1000);
      setTimeout(() => setRecentlyAddedGoalIds(new Set()), 1000);
      setAiProposedGoals(
        aiProposedGoals.filter((g) => !selectedAiGoalIds.has(g.id)),
      );
      setSelectedAiGoalIds(new Set());
      setAiGoalTimeframeOptions((prev) => {
        const next = { ...prev };
        selectedGoals.forEach((g) => {
          delete next[g.id];
        });
        return next;
      });
      setAiGoalTimeframeOptions((prev) => {
        const next = { ...prev };
        selectedGoals.forEach((g) => {
          delete next[g.id];
        });
        return next;
      });
      setAiGoalCustomTimeframes((prev) => {
        const next = { ...prev };
        selectedGoals.forEach((g) => {
          delete next[g.id];
        });
        return next;
      });
    }
  };

  // Handler to edit AI proposed goal text
  const handleEditAiGoalText = (id: string, text: string): void => {
    setAiProposedGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, text } : g)),
    );
    return;
  };

  // Handler to clear all goals
  const handleClearGoals = (): void => {
    setShowClearModal(true);
  };

  const confirmClearGoals = (): void => {
    // Only delete selected goals from the main goals list
    if (
      selectedAiGoalIds.size === 0 &&
      goals.filter((g) => g.selected).length === 0
    ) {
      setShowClearModal(false);
      return;
    }
    // Remove selected goals from the main goals list
    const remainingGoals = goals.filter((g) => !g.selected);
    saveGoals(remainingGoals);
    setRecentlyAddedGoalIds(new Set());
    setAiProposedGoals((prev) =>
      prev.filter((g) => !selectedAiGoalIds.has(g.id)),
    );
    setSelectedAiGoalIds(new Set());
    setAiGoalTimeframeOptions((prev) => {
      const next = { ...prev };
      Array.from(selectedAiGoalIds).forEach((id) => {
        delete next[id];
      });
      return next;
    });
    setAiGoalCustomTimeframes((prev) => {
      const next = { ...prev };
      Array.from(selectedAiGoalIds).forEach((id) => {
        delete next[id];
      });
      return next;
    });
    setShowClearModal(false);
  };

  return (
    <div className="flex flex-col flex-1 h-full bg-white/30 rounded-lg border border-emerald-100 p-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-2xl font-bold text-emerald-800 flex-1">
          Your Health Goals
        </h2>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleAiSuggestGoals}
          disabled={aiLoading || !hasHealthData}
          title={
            !hasHealthData
              ? "Please import or sync your health data to get personalized goals."
              : undefined
          }
        >
          {aiLoading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-1" />
          ) : (
            <span className="mr-1">✨</span>
          )}
          AI Suggest Goals
        </Button>
      </div>
      {/* Clear Goals Button */}
      {goals.length > 0 && (
        <div className="flex flex-col items-end mb-2 gap-2">
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={handleClearGoals}>
              Clear Goals
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const updatedGoals = goals.map((g) => ({
                  ...g,
                  selected: false,
                }));
                saveGoals(updatedGoals);
              }}
            >
              Deselect All
            </Button>
          </div>
        </div>
      )}
      {/* AI Proposed Goals Selection UI */}
      {aiProposedGoals.length > 0 && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="flex items-center mb-2">
            <Sparkles className="h-5 w-5 text-emerald-500 mr-2" />
            <span className="font-semibold text-emerald-800">
              AI Suggested Goals
            </span>
          </div>
          <ul className="space-y-2">
            {aiProposedGoals.map((goal) => (
              <li key={goal.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedAiGoalIds.has(goal.id)}
                  onChange={() => handleSelectAiGoal(goal.id)}
                  className="accent-emerald-600 h-5 w-5"
                />
                <input
                  className="flex-1 border rounded p-1 text-sm"
                  value={goal.text}
                  onChange={(e) =>
                    handleEditAiGoalText(goal.id, e.target.value)
                  }
                />
                <select
                  className="w-28 border rounded p-1 text-xs"
                  value={aiGoalTimeframeOptions[goal.id] || "1 week"}
                  onChange={(e) =>
                    setAiGoalTimeframeOptions((prev) => ({
                      ...prev,
                      [goal.id]: e.target.value,
                    }))
                  }
                >
                  {TIMEFRAME_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {aiGoalTimeframeOptions[goal.id] === "Custom" && (
                  <input
                    className="w-28 border rounded p-1 text-xs"
                    placeholder="Custom timeframe"
                    value={aiGoalCustomTimeframes[goal.id] || ""}
                    onChange={(e) =>
                      setAiGoalCustomTimeframes((prev) => ({
                        ...prev,
                        [goal.id]: e.target.value,
                      }))
                    }
                  />
                )}
                {selectedAiGoalIds.has(goal.id) && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                )}
              </li>
            ))}
          </ul>
          <div className="flex justify-end mt-2">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center"
              onClick={handleSaveSelectedAiGoals}
              disabled={isSaving || selectedAiGoalIds.size === 0}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : showAddCheck ? (
                <CheckCircle2 className="h-4 w-4 mr-1 text-emerald-300 animate-fade-in" />
              ) : null}
              Add
            </Button>
          </div>
          {saveError ? (
            <div className="text-red-600 mt-2">
              Error saving goals:{" "}
              {String((saveError as Error)?.message || saveError || "")}
            </div>
          ) : null}
        </div>
      )}
      <ul className="space-y-3 mb-6 overflow-y-auto flex-1">
        {Array.isArray(goals) ? (
          goals.length === 0 ? (
            <li className="text-center text-gray-400 py-8">
              No goals yet. Add a goal or use AI Suggest!
            </li>
          ) : (
            goals.map((goal) => (
              <li
                key={goal.id}
                className={`flex items-center rounded px-2 py-1 border border-emerald-200 bg-white shadow-sm transition-all duration-700
                  ${goal.selected ? "opacity-100" : "opacity-70"}
                  ${recentlyAddedGoalIds.has(goal.id) ? "bg-emerald-100 animate-fade-in" : ""}
                `}
              >
                <input
                  type="checkbox"
                  checked={goal.selected}
                  onChange={() => {
                    const updatedGoals = goals.map((g): typeof g =>
                      g.id === goal.id ? { ...g, selected: !g.selected } : g,
                    );
                    saveGoals(updatedGoals);
                  }}
                  className="mr-3 accent-emerald-600 h-5 w-5"
                />
                {editingId === goal.id ? (
                  <>
                    <input
                      className="flex-1 border rounded p-1 text-sm mr-2"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={() => {
                        const updatedGoals = goals.map((g): typeof g =>
                          g.id === goal.id
                            ? {
                                ...g,
                                text: editText,
                                timeframe: editTimeframe || undefined,
                              }
                            : g,
                        );
                        saveGoals(updatedGoals);
                        setEditingId(null);
                        setEditText("");
                        setEditTimeframe("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const updatedGoals = goals.map((g): typeof g =>
                            g.id === goal.id
                              ? {
                                  ...g,
                                  text: editText,
                                  timeframe: editTimeframe || undefined,
                                }
                              : g,
                          );
                          saveGoals(updatedGoals);
                          setEditingId(null);
                          setEditText("");
                          setEditTimeframe("");
                        }
                      }}
                      autoFocus
                    />
                    <input
                      className="w-28 border rounded p-1 text-xs mr-2"
                      placeholder="Timeframe"
                      value={editTimeframe}
                      onChange={(e) => setEditTimeframe(e.target.value)}
                    />
                  </>
                ) : (
                  <span className="flex-1 text-emerald-900 text-base">
                    {goal.text}
                    {goal.timeframe && (
                      <span className="ml-2 text-xs text-emerald-700 font-medium">
                        [{goal.timeframe}]
                      </span>
                    )}
                  </span>
                )}
                {goal.source === "ai" && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-emerald-200 text-emerald-800 rounded flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> AI
                  </span>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-2"
                  onClick={() =>
                    editingId === goal.id
                      ? ((): void => {
                          const updatedGoals = goals.map((g): typeof g =>
                            g.id === goal.id
                              ? {
                                  ...g,
                                  text: editText,
                                  timeframe: editTimeframe || undefined,
                                }
                              : g,
                          );
                          saveGoals(updatedGoals);
                          setEditingId(null);
                          setEditText("");
                          setEditTimeframe("");
                          return;
                        })()
                      : handleEdit(goal.id, goal.text, goal.timeframe)
                  }
                  aria-label="Edit goal"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {goal.source === "user" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="ml-1"
                    onClick={() => {
                      const updatedGoals = goals.filter(
                        (g) => g.id !== goal.id,
                      );
                      saveGoals(updatedGoals);
                    }}
                    aria-label="Delete goal"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
                {recentlyAddedGoalIds.has(goal.id) && (
                  <CheckCircle2 className="h-4 w-4 ml-2 text-emerald-500 animate-fade-in" />
                )}
              </li>
            ))
          )
        ) : (
          <li className="text-center text-gray-400 py-8">Loading goals...</li>
        )}
      </ul>
      <div className="flex gap-2 mt-2">
        <input
          type="text"
          className="flex-1 border rounded p-2 text-sm"
          placeholder="Add a custom goal..."
          value={newGoal}
          onChange={(e) => setNewGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddGoal();
          }}
        />
        <select
          className="w-32 border rounded p-2 text-sm"
          value={newGoalTimeframeOption}
          onChange={(e) => setNewGoalTimeframeOption(e.target.value)}
        >
          {TIMEFRAME_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {newGoalTimeframeOption === "Custom" && (
          <input
            type="text"
            className="w-32 border rounded p-2 text-sm"
            placeholder="Custom timeframe"
            value={customGoalTimeframe}
            onChange={(e) => setCustomGoalTimeframe(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddGoal();
            }}
          />
        )}
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleAddGoal}
        >
          Add
        </Button>
      </div>
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-gradient-to-b from-emerald-50 to-emerald-100 rounded-lg shadow-xl border border-emerald-200 p-8 w-full max-w-sm flex flex-col items-center font-sans">
            <div className="text-lg font-bold text-emerald-800 mb-2 text-center">
              This will erase selected Goals.
            </div>
            <div className="text-sm text-gray-700 mb-6 text-center">
              Are you sure you want to continue?
            </div>
            <div className="flex gap-4 w-full justify-center">
              <Button
                variant="outline"
                onClick={() => setShowClearModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="bg-red-600 hover:bg-red-700 text-white border-none"
                onClick={confirmClearGoals}
              >
                Erase Selected
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoalsTab;
