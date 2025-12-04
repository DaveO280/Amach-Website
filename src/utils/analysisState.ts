/**
 * Manages analysis state in localStorage
 * Eventually this will move to Storej, but for now we use localStorage
 */

export interface AnalysisState {
  lastAnalysisDate: string | null; // ISO date string
  lastAnalysisMode: "initial" | "ongoing" | null;
  hasCompletedInitialAnalysis: boolean;
  lastAnalysisDataRange: {
    start: string; // ISO date string
    end: string; // ISO date string
  } | null;
}

const STORAGE_KEY = "amach_analysis_state";

/**
 * Get current analysis state from localStorage
 */
export function getAnalysisState(): AnalysisState {
  if (typeof window === "undefined") {
    return {
      lastAnalysisDate: null,
      lastAnalysisMode: null,
      hasCompletedInitialAnalysis: false,
      lastAnalysisDataRange: null,
    };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as AnalysisState;
    }
  } catch (error) {
    console.warn("[AnalysisState] Failed to parse stored state:", error);
  }

  return {
    lastAnalysisDate: null,
    lastAnalysisMode: null,
    hasCompletedInitialAnalysis: false,
    lastAnalysisDataRange: null,
  };
}

/**
 * Update analysis state in localStorage
 */
export function updateAnalysisState(
  mode: "initial" | "ongoing",
  dataRange?: { start: Date; end: Date },
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const state: AnalysisState = {
      lastAnalysisDate: new Date().toISOString(),
      lastAnalysisMode: mode,
      hasCompletedInitialAnalysis:
        mode === "initial"
          ? true
          : getAnalysisState().hasCompletedInitialAnalysis,
      lastAnalysisDataRange: dataRange
        ? {
            start: dataRange.start.toISOString(),
            end: dataRange.end.toISOString(),
          }
        : getAnalysisState().lastAnalysisDataRange,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("[AnalysisState] Failed to update state:", error);
  }
}

/**
 * Clear analysis state (useful for testing or reset)
 */
export function clearAnalysisState(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("[AnalysisState] Failed to clear state:", error);
  }
}

/**
 * Determine if initial analysis should be run
 * Returns true if:
 * - User hasn't completed initial analysis yet, OR
 * - Data spans more than 180 days (6 months) regardless of previous analysis, OR
 * - Data spans more than 90 days and last analysis was more than 30 days ago, OR
 * - Data range has significantly changed since last analysis
 */
export function shouldRunInitialAnalysis(currentDataRange?: {
  start: Date;
  end: Date;
}): boolean {
  const state = getAnalysisState();

  // If no data range provided, can't determine
  if (!currentDataRange) {
    return false;
  }

  const currentStart = currentDataRange.start;
  const currentEnd = currentDataRange.end;
  const dataSpanDays =
    (currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24);

  // If data spans more than 180 days (6 months), always recommend initial analysis
  // This ensures we capture long-term trends and seasonal patterns
  if (dataSpanDays > 180) {
    // Only skip if we did an initial analysis very recently (within last 7 days)
    if (state.hasCompletedInitialAnalysis && state.lastAnalysisDate) {
      const lastAnalysisDate = new Date(state.lastAnalysisDate);
      const daysSinceAnalysis =
        (Date.now() - lastAnalysisDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceAnalysis < 7) {
        return false; // Recent initial analysis, skip
      }
    }
    return true;
  }

  // If never completed initial analysis, recommend it
  if (!state.hasCompletedInitialAnalysis) {
    return true;
  }

  // If no previous data range, can't compare
  if (!state.lastAnalysisDataRange) {
    return false;
  }

  const lastStart = new Date(state.lastAnalysisDataRange.start);

  // Check if data range has expanded significantly (more than 30 days earlier)
  const daysExpanded =
    (currentStart.getTime() - lastStart.getTime()) / (1000 * 60 * 60 * 24);
  if (daysExpanded > 30) {
    return true;
  }

  // Check if data spans more than 90 days and last analysis was more than 30 days ago
  if (dataSpanDays > 90) {
    const lastAnalysisDate = state.lastAnalysisDate
      ? new Date(state.lastAnalysisDate)
      : null;
    if (lastAnalysisDate) {
      const daysSinceAnalysis =
        (Date.now() - lastAnalysisDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceAnalysis > 30) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get recommended analysis mode based on current state and data
 */
export function getRecommendedAnalysisMode(
  currentDataRange?: { start: Date; end: Date },
  forceInitial?: boolean,
): "initial" | "ongoing" {
  if (forceInitial) {
    return "initial";
  }

  if (shouldRunInitialAnalysis(currentDataRange)) {
    return "initial";
  }

  return "ongoing";
}
