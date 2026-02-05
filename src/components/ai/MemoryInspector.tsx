// src/components/ai/MemoryInspector.tsx
// Dev tool component for inspecting and testing conversation memory

"use client";

import React, { useState } from "react";
import { useConversationMemory } from "@/hooks/useConversationMemory";
import type { CriticalFact } from "@/types/conversationMemory";

interface MemoryInspectorProps {
  userId: string;
}

const MemoryInspector: React.FC<MemoryInspectorProps> = ({ userId }) => {
  const {
    memory,
    isLoading,
    error,
    loadMemory,
    clearMemory,
    addFact,
    deactivateFact,
    pruneMemory,
    consolidateFacts,
    getStats,
  } = useConversationMemory({ userId, autoLoad: true });

  const [stats, setStats] = useState<{
    totalFacts: number;
    activeFacts: number;
    factsByCategory: Record<string, number>;
    totalSessions: number;
    importantSessions: number;
    recentSessions: number;
    lastUpdated: string | null;
  } | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [actionResult, setActionResult] = useState<string>("");

  const handleLoadStats = async (): Promise<void> => {
    setLoadingStats(true);
    try {
      const s = await getStats();
      setStats(s);
      setActionResult("Stats loaded");
    } catch (e) {
      setActionResult(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleAddTestFact = async (): Promise<void> => {
    try {
      await addFact({
        category: "goal",
        value: `Test goal ${Date.now()}`,
        context: "Added via Memory Inspector",
        isActive: true,
        source: "user-input",
        storageLocation: "local",
        confidence: 1.0,
      });
      setActionResult("Test fact added");
    } catch (e) {
      setActionResult(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  };

  const handlePrune = async (): Promise<void> => {
    try {
      await pruneMemory();
      setActionResult("Memory pruned");
    } catch (e) {
      setActionResult(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  };

  const handleConsolidate = async (): Promise<void> => {
    try {
      const count = await consolidateFacts();
      setActionResult(`Consolidated ${count} duplicate facts`);
    } catch (e) {
      setActionResult(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  };

  const handleClear = async (): Promise<void> => {
    if (
      !window.confirm("Are you sure you want to clear all conversation memory?")
    )
      return;
    try {
      await clearMemory();
      setStats(null);
      setActionResult("Memory cleared");
    } catch (e) {
      setActionResult(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  };

  const handleDeactivateFact = async (factId: string): Promise<void> => {
    try {
      await deactivateFact(factId);
      setActionResult(`Deactivated fact ${factId.slice(0, 8)}...`);
    } catch (e) {
      setActionResult(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  };

  const categoryColors: Record<CriticalFact["category"], string> = {
    goal: "bg-emerald-100 text-emerald-800",
    concern: "bg-amber-100 text-amber-800",
    medication: "bg-blue-100 text-blue-800",
    condition: "bg-purple-100 text-purple-800",
    allergy: "bg-rose-100 text-rose-800",
    surgery: "bg-slate-100 text-slate-800",
    preference: "bg-cyan-100 text-cyan-800",
  };

  if (isLoading) {
    return (
      <div className="rounded border border-slate-200 bg-white p-3 text-xs">
        Loading memory...
      </div>
    );
  }

  return (
    <div className="rounded border border-slate-200 bg-white p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-slate-800">Memory Inspector</span>
        <span className="text-slate-500">User: {userId.slice(0, 10)}...</span>
      </div>

      {error && (
        <div className="mb-2 rounded bg-rose-50 p-2 text-rose-700">{error}</div>
      )}

      {actionResult && (
        <div className="mb-2 rounded bg-blue-50 p-2 text-blue-700">
          {actionResult}
        </div>
      )}

      {/* Actions */}
      <div className="mb-3 flex flex-wrap gap-1">
        <button
          onClick={() => void loadMemory()}
          className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50"
        >
          Refresh
        </button>
        <button
          onClick={() => void handleLoadStats()}
          disabled={loadingStats}
          className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50 disabled:opacity-50"
        >
          {loadingStats ? "..." : "Stats"}
        </button>
        <button
          onClick={() => void handleAddTestFact()}
          className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800 hover:bg-emerald-100"
        >
          + Test Fact
        </button>
        <button
          onClick={() => void handlePrune()}
          className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800 hover:bg-amber-100"
        >
          Prune
        </button>
        <button
          onClick={() => void handleConsolidate()}
          className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-800 hover:bg-blue-100"
        >
          Consolidate
        </button>
        <button
          onClick={() => void handleClear()}
          className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-800 hover:bg-rose-100"
        >
          Clear All
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-3 rounded bg-slate-50 p-2">
          <div className="font-medium text-slate-700">Stats</div>
          <div className="mt-1 grid grid-cols-2 gap-1 text-slate-600">
            <span>Total Facts: {stats.totalFacts}</span>
            <span>Active: {stats.activeFacts}</span>
            <span>Sessions: {stats.totalSessions}</span>
            <span>Important: {stats.importantSessions}</span>
            {stats.lastUpdated && (
              <span className="col-span-2 text-slate-500">
                Last: {new Date(stats.lastUpdated).toLocaleString()}
              </span>
            )}
          </div>
          {Object.keys(stats.factsByCategory).length > 0 && (
            <div className="mt-1 text-slate-600">
              By category:{" "}
              {Object.entries(stats.factsByCategory)
                .map(([k, v]) => `${k}(${v})`)
                .join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Memory display */}
      {!memory ? (
        <div className="text-slate-500">No memory data for this user</div>
      ) : (
        <div className="space-y-3">
          {/* Critical Facts */}
          <div>
            <div className="font-medium text-slate-700">
              Critical Facts ({memory.criticalFacts?.length || 0})
            </div>
            {memory.criticalFacts && memory.criticalFacts.length > 0 ? (
              <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                {memory.criticalFacts.map((fact) => (
                  <div
                    key={fact.id}
                    className={`flex items-start justify-between rounded p-1.5 ${
                      fact.isActive ? "bg-white" : "bg-slate-100 opacity-60"
                    }`}
                  >
                    <div className="flex-1">
                      <span
                        className={`mr-1 inline-block rounded px-1 py-0.5 text-[10px] font-medium ${categoryColors[fact.category]}`}
                      >
                        {fact.category}
                      </span>
                      <span className={fact.isActive ? "" : "line-through"}>
                        {fact.value}
                      </span>
                      {fact.confidence !== undefined && (
                        <span className="ml-1 text-slate-400">
                          ({Math.round(fact.confidence * 100)}%)
                        </span>
                      )}
                    </div>
                    {fact.isActive && (
                      <button
                        onClick={() => void handleDeactivateFact(fact.id)}
                        className="ml-1 text-slate-400 hover:text-rose-600"
                        title="Deactivate"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-1 text-slate-400">No facts recorded</div>
            )}
          </div>

          {/* Session Summaries */}
          <div>
            <div className="font-medium text-slate-700">
              Recent Sessions (
              {(memory.recentSessions?.length || 0) +
                (memory.importantSessions?.length || 0)}
              )
            </div>
            {(memory.importantSessions?.length || 0) +
              (memory.recentSessions?.length || 0) >
            0 ? (
              <div className="mt-1 max-h-32 space-y-1 overflow-y-auto">
                {[
                  ...(memory.importantSessions || []),
                  ...(memory.recentSessions || []),
                ]
                  .slice(0, 5)
                  .map((session) => (
                    <div key={session.id} className="rounded bg-slate-50 p-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">
                          {new Date(session.date).toLocaleDateString()}
                        </span>
                        <span
                          className={`rounded px-1 text-[10px] ${
                            session.importance === "high"
                              ? "bg-amber-100 text-amber-700"
                              : session.importance === "medium"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {session.importance}
                        </span>
                      </div>
                      <div className="mt-0.5 text-slate-500 line-clamp-2">
                        {session.summary}
                      </div>
                      {session.topics && session.topics.length > 0 && (
                        <div className="mt-0.5 text-slate-400">
                          Topics: {session.topics.join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            ) : (
              <div className="mt-1 text-slate-400">No sessions recorded</div>
            )}
          </div>

          {/* Preferences */}
          {memory.preferences && Object.keys(memory.preferences).length > 0 && (
            <div>
              <div className="font-medium text-slate-700">Preferences</div>
              <div className="mt-1 rounded bg-slate-50 p-2 text-slate-600">
                {memory.preferences.diet && (
                  <div>
                    Diet:{" "}
                    {[
                      ...(memory.preferences.diet.preferred || []),
                      ...(memory.preferences.diet.restrictions || []),
                    ].join(", ") || "None set"}
                  </div>
                )}
                {memory.preferences.exercise && (
                  <div>
                    Exercise:{" "}
                    {memory.preferences.exercise.preferred?.join(", ") ||
                      "None set"}
                  </div>
                )}
                {memory.preferences.communication && (
                  <div>
                    Style: {memory.preferences.communication.style} /{" "}
                    {memory.preferences.communication.tone}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Meta info */}
          <div className="text-slate-400">
            Last updated:{" "}
            {memory.lastUpdated
              ? new Date(memory.lastUpdated).toLocaleString()
              : "Never"}
            {" | "}
            Total extracted: {memory.totalFactsExtracted || 0}
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoryInspector;
