import { HealthDataPoint } from "../types/healthData";

// Interfaces for sleep data processing
export interface TimeRange {
  start: string; // ISO timestamp
  end: string; // ISO timestamp
}

export enum SleepStage {
  Core = "HKCategoryValueSleepAnalysisAsleepCore", // Core sleep stage
  Deep = "HKCategoryValueSleepAnalysisAsleepDeep", // Deep sleep stage
  REM = "HKCategoryValueSleepAnalysisAsleepREM", // REM sleep stage
  Awake = "HKCategoryValueSleepAnalysisAwake", // Awake stage
  InBed = "HKCategoryValueSleepAnalysisInBed", // In bed stage
}

export interface SleepSegment {
  stage: SleepStage; // The sleep stage type
  startTime: string; // ISO timestamp
  endTime: string; // ISO timestamp
  durationMinutes: number; // Duration in minutes
}

export interface SleepSession {
  date: string; // YYYY-MM-DD format (primary day of the sleep session)
  startTime: string; // Full ISO timestamp
  endTime: string; // Full ISO timestamp
  lastUpdate: string; // Last update timestamp
  inBedMarkers: TimeRange[]; // Array of in-bed time ranges
  stageMarkers: {
    core: TimeRange[];
    deep: TimeRange[];
    rem: TimeRange[];
    awake: TimeRange[];
  };
  firstSleepTime: string | null; // Time when sleep first started
  totalDuration: number; // Minutes
  sleepDuration: number; // Minutes (excluding awake time)
  timeInBed: number; // Total time in bed in minutes
  timeToFallAsleep: number; // Time to fall asleep in minutes
  stageData: {
    core: number; // Minutes
    deep: number; // Minutes
    rem: number; // Minutes
    awake: number; // Minutes
  };
  metrics: {
    sleepEfficiency: number; // Percentage (0-100)
    deepSleepPercentage: number; // Percentage (0-100)
    remSleepPercentage: number; // Percentage (0-100)
    awakenings: number; // Count
  };
  segments: SleepSegment[]; // Chronological segments for visualization
  isOvernight: boolean; // Whether the session spans across midnight
}

export interface ProcessedSleepSession {
  date: string; // YYYY-MM-DD format
  startTime: string; // ISO timestamp
  endTime: string; // ISO timestamp
  timeInBed: number; // Minutes
  totalSleepTime: number; // Minutes
  timeToFallAsleep: number; // Minutes
  stageData: {
    core: number; // Minutes
    deep: number; // Minutes
    rem: number; // Minutes
    awake: number; // Minutes
  };
  metrics: {
    sleepEfficiency: number; // Percentage (0-100)
    deepSleepPercentage: number; // Percentage (0-100)
    remSleepPercentage: number; // Percentage (0-100)
    awakenings: number; // Count
  };
  segments: SleepSegment[]; // Chronological segments for visualization
  isOvernight: boolean; // Whether the session spans across midnight
}

export interface DailyProcessedSleepData {
  date: string; // YYYY-MM-DD format
  totalDuration: number; // Total time in bed in minutes
  sleepDuration: number; // Total sleep time in minutes (excluding awake time)
  sessions: SleepSession[]; // Array of sleep sessions for this day
  stageData: {
    core: number; // Total core sleep in minutes
    deep: number; // Total deep sleep in minutes
    rem: number; // Total REM sleep in minutes
    awake: number; // Total awake time in minutes
  };
  metrics: {
    sleepEfficiency: number; // Percentage (0-100)
    deepSleepPercentage: number; // Percentage (0-100)
    remSleepPercentage: number; // Percentage (0-100)
    awakenings: number; // Total number of awakenings
  };
}

/**
 * Processes raw sleep data into structured daily sleep information with improved
 * handling of sleep sessions and accurate stage calculation
 */
export const processSleepData = (
  sleepData: HealthDataPoint[],
): DailyProcessedSleepData[] => {
  // Skip if no data
  if (!sleepData || sleepData.length === 0) {
    return [];
  }

  // Filter out Pillow app data
  const filteredData = sleepData.filter((record) => {
    const source = record.source?.toLowerCase() || "";
    const device = record.device?.toLowerCase() || "";
    return !source.includes("pillow") && !device.includes("pillow");
  });

  if (filteredData.length !== sleepData.length) {
    // Log removed Pillow app records
  }

  // Group sleep records into distinct sessions
  const sleepSessions = groupSleepSessions(filteredData);

  // Process each session
  const processedSessions: SleepSession[] = [];

  sleepSessions.forEach((sessionRecords) => {
    try {
      // Guardrails for malformed Apple Health exports (occasionally includes absurdly-long segments)
      // If a single segment is longer than this, it's almost certainly bad data and would blow up charts.
      const MAX_REASONABLE_SLEEP_SEGMENT_MINUTES = 24 * 60; // 24h
      const MAX_REASONABLE_SLEEP_SESSION_MINUTES = 36 * 60; // 36h (hard cap to prevent multi-day merges)

      // Sort records by start time
      const sortedRecords = [...sessionRecords].sort(
        (a, b) =>
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
      );

      // Get overall session boundaries (earliest start time to latest end time)
      const sessionStart = sortedRecords[0].startDate;
      const sessionEnd =
        sortedRecords.reduce<string>((latestEnd, record) => {
          const candidateEnd = (record.endDate as string) || record.startDate;
          if (!latestEnd) return candidateEnd;
          const candidateMs = new Date(candidateEnd).getTime();
          const latestMs = new Date(latestEnd).getTime();
          if (Number.isNaN(candidateMs)) return latestEnd;
          if (Number.isNaN(latestMs)) return candidateEnd;
          return candidateMs > latestMs ? candidateEnd : latestEnd;
        }, "") || (sortedRecords[sortedRecords.length - 1].endDate as string);

      // Session start and end dates for reference
      const startDate = new Date(sessionStart);
      const endDate = new Date(sessionEnd);

      // Determine if this is an overnight session
      const isOvernight =
        extractDatePart(sessionStart) !== extractDatePart(sessionEnd);

      // Determine the primary day for this sleep session
      const sessionDate = determinePrimaryDay(sessionStart, sessionEnd);

      // Calculate session duration in minutes
      const sessionDurationMs = endDate.getTime() - startDate.getTime();
      const sessionDurationMinutes = Math.round(
        sessionDurationMs / (1000 * 60),
      );

      // Hard cap: if we somehow got a multi-day "session", drop it instead of corrupting charts.
      if (
        Number.isNaN(sessionDurationMinutes) ||
        sessionDurationMinutes <= 0 ||
        sessionDurationMinutes > MAX_REASONABLE_SLEEP_SESSION_MINUTES
      ) {
        return;
      }

      // Skip if session is too short (less than 15 minutes)
      // (Allows naps while still filtering obvious noise.)
      if (sessionDurationMinutes < 15) {
        // Log skipped short sleep session
        return;
      }

      // Process sleep stages
      const segments: SleepSegment[] = [];
      let coreSleepMinutes = 0;
      let deepSleepMinutes = 0;
      let remSleepMinutes = 0;
      let awakeMinutes = 0;
      let awakeningCount = 0;
      let lastAwakeEndTime: Date | null = null;

      // Initialize stage markers
      const stageMarkers = {
        core: [] as TimeRange[],
        deep: [] as TimeRange[],
        rem: [] as TimeRange[],
        awake: [] as TimeRange[],
      };

      // Initialize in-bed markers
      const inBedMarkers: TimeRange[] = [];
      let firstSleepTime: string | null = null;

      sortedRecords.forEach((record) => {
        const startTime = new Date(record.startDate);
        const endTime = new Date(record.endDate as string);
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationMinutes = Math.round(durationMs / (1000 * 60));

        // Skip malformed segments (negative or absurd duration)
        if (
          Number.isNaN(startTime.getTime()) ||
          Number.isNaN(endTime.getTime()) ||
          durationMinutes <= 0 ||
          durationMinutes > MAX_REASONABLE_SLEEP_SEGMENT_MINUTES
        ) {
          return;
        }

        // Handle in-bed records
        if (record.value === SleepStage.InBed || record.value === "inBed") {
          inBedMarkers.push({
            start: record.startDate,
            end: record.endDate as string,
          });
          return;
        }

        // Add to the appropriate sleep stage counter and markers
        const stage = record.value as string;
        switch (stage) {
          case SleepStage.Core:
          case "core":
            coreSleepMinutes += durationMinutes;
            stageMarkers.core.push({
              start: record.startDate,
              end: record.endDate as string,
            });
            break;
          case SleepStage.Deep:
          case "deep":
            deepSleepMinutes += durationMinutes;
            stageMarkers.deep.push({
              start: record.startDate,
              end: record.endDate as string,
            });
            break;
          case SleepStage.REM:
          case "rem":
            remSleepMinutes += durationMinutes;
            stageMarkers.rem.push({
              start: record.startDate,
              end: record.endDate as string,
            });
            break;
          case SleepStage.Awake:
          case "awake":
            awakeMinutes += durationMinutes;
            stageMarkers.awake.push({
              start: record.startDate,
              end: record.endDate as string,
            });

            // Count as an awakening if it's been at least 5 minutes since the last awakening
            if (
              !lastAwakeEndTime ||
              startTime.getTime() - lastAwakeEndTime.getTime() > 5 * 60 * 1000
            ) {
              awakeningCount++;
            }

            lastAwakeEndTime = endTime;
            break;
        }

        // Track first sleep time (excluding awake)
        if (!firstSleepTime && record.value !== SleepStage.Awake) {
          firstSleepTime = record.startDate;
        }

        // Add segment for visualization
        segments.push({
          stage: record.value as SleepStage,
          startTime: record.startDate,
          endTime: record.endDate as string,
          durationMinutes,
        });
      });

      // Calculate total sleep time (excluding awake time)
      const sleepDurationMinutes =
        coreSleepMinutes + deepSleepMinutes + remSleepMinutes;

      // Skip if no actual sleep time was recorded
      if (sleepDurationMinutes === 0) {
        // Log skipped session with no sleep time recorded
        return;
      }

      // Calculate total time in bed as sum of all stages
      const timeInBedMinutes = sleepDurationMinutes + awakeMinutes;

      // Calculate metrics
      const sleepEfficiency = Math.round(
        (sleepDurationMinutes / timeInBedMinutes) * 100,
      );
      const deepSleepPercentage = Math.round(
        (deepSleepMinutes / sleepDurationMinutes) * 100,
      );
      const remSleepPercentage = Math.round(
        (remSleepMinutes / sleepDurationMinutes) * 100,
      );

      // Calculate time to fall asleep
      const timeToFallAsleep = firstSleepTime
        ? Math.round(
            (new Date(firstSleepTime).getTime() - startDate.getTime()) /
              (1000 * 60),
          )
        : 0;

      // Sort segments chronologically for visualization
      const sortedSegments = segments.sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );

      // Create the sleep session object with all required properties
      const sleepSession: SleepSession = {
        date: sessionDate,
        startTime: sessionStart,
        endTime: sessionEnd,
        lastUpdate: sessionEnd,
        inBedMarkers,
        stageMarkers,
        firstSleepTime,
        totalDuration: timeInBedMinutes,
        sleepDuration: sleepDurationMinutes,
        timeInBed: timeInBedMinutes,
        timeToFallAsleep,
        stageData: {
          core: coreSleepMinutes,
          deep: deepSleepMinutes,
          rem: remSleepMinutes,
          awake: awakeMinutes,
        },
        metrics: {
          sleepEfficiency,
          deepSleepPercentage,
          remSleepPercentage,
          awakenings: awakeningCount,
        },
        segments: sortedSegments,
        isOvernight,
      };

      processedSessions.push(sleepSession);
    } catch (e) {
      // Log error processing sleep session
    }
  });

  // Group sessions by date
  const dateGroupedData: { [date: string]: SleepSession[] } = {};

  processedSessions.forEach((session) => {
    if (!dateGroupedData[session.date]) {
      dateGroupedData[session.date] = [];
    }
    dateGroupedData[session.date].push(session);
  });

  // Create the final daily data
  const result: DailyProcessedSleepData[] = [];

  for (const [date, sessions] of Object.entries(dateGroupedData)) {
    const totalTimeInBed = sessions.reduce((sum, s) => sum + s.timeInBed, 0);
    const totalSleepTime = sessions.reduce(
      (sum, s) => sum + s.sleepDuration,
      0,
    );
    const totalCore = sessions.reduce((sum, s) => sum + s.stageData.core, 0);
    const totalDeep = sessions.reduce((sum, s) => sum + s.stageData.deep, 0);
    const totalRem = sessions.reduce((sum, s) => sum + s.stageData.rem, 0);
    const totalAwake = sessions.reduce((sum, s) => sum + s.stageData.awake, 0);

    result.push({
      date,
      totalDuration: totalTimeInBed,
      sleepDuration: totalSleepTime,
      sessions,
      stageData: {
        core: totalCore,
        deep: totalDeep,
        rem: totalRem,
        awake: totalAwake,
      },
      metrics: {
        sleepEfficiency: Math.round((totalSleepTime / totalTimeInBed) * 100),
        deepSleepPercentage: Math.round((totalDeep / totalSleepTime) * 100),
        remSleepPercentage: Math.round((totalRem / totalSleepTime) * 100),
        awakenings: sessions.reduce((sum, s) => sum + s.metrics.awakenings, 0),
      },
    });
  }

  // Sort by date
  return result.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
};

// Update the extractDatePart function
export const extractDatePart = (dateString: string): string => {
  return dateString.split("T")[0];
};

// Update the determinePrimaryDay function
const determinePrimaryDay = (startTime: string, _endTime: string): string => {
  // Attribute a sleep session to the day the user fell asleep.
  // This also aligns naps (midday sessions) naturally to the day they occurred.
  return extractDatePart(startTime);
};

// Update the groupSleepSessions function
const groupSleepSessions = (
  records: HealthDataPoint[],
): HealthDataPoint[][] => {
  const sortedRecords = [...records].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );

  // Nap/session splitting rules:
  // - If there is a ≥120 minute gap between sleep-stage records AND there are NO InBed markers
  //   overlapping that gap, start a new session.
  // - If there are no InBed markers at all, fall back to splitting on the ≥120 minute gap alone.
  const NAP_GAP_THRESHOLD_MS = 120 * 60 * 1000;
  const MAX_REASONABLE_INBED_MARKER_MS = 24 * 60 * 60 * 1000; // 24h
  const MAX_REASONABLE_SLEEP_SEGMENT_MS = 24 * 60 * 60 * 1000; // 24h

  const isInBedRecord = (record: HealthDataPoint): boolean =>
    record.value === SleepStage.InBed || record.value === "inBed";

  const inBedRanges = sortedRecords
    .filter(isInBedRecord)
    .map((r) => ({
      start: new Date(r.startDate),
      end: new Date((r.endDate as string) || r.startDate),
    }))
    .filter(
      (r) => !Number.isNaN(r.start.getTime()) && !Number.isNaN(r.end.getTime()),
    );

  const inBedRangesReasonable = inBedRanges.filter((r) => {
    const dur = r.end.getTime() - r.start.getTime();
    return dur > 0 && dur <= MAX_REASONABLE_INBED_MARKER_MS;
  });

  const hasAnyInBedMarkers = inBedRangesReasonable.length > 0;

  const hasInBedBridgeAcrossGap = (gapStart: Date, gapEnd: Date): boolean => {
    // "Still in bed" bridge check:
    // Only treat as continuous sleep if an InBed marker starts BEFORE the gap and ends AFTER it.
    // This avoids next-night InBed markers (which start late in the gap) falsely preventing splits.
    return inBedRangesReasonable.some(
      (r) =>
        r.start.getTime() <= gapStart.getTime() &&
        r.end.getTime() >= gapEnd.getTime(),
    );
  };

  const sessions: HealthDataPoint[][] = [];
  let currentSession: HealthDataPoint[] = [];
  let currentSessionMaxEndTime: Date | null = null;
  let lastNonInBedEndTime: Date | null = null;

  sortedRecords.forEach((record) => {
    const startTime = new Date(record.startDate);
    const endTime = new Date((record.endDate as string) || record.startDate);
    const inBed = isInBedRecord(record);

    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      return;
    }

    // Drop absurd segments early so they can't:
    // - poison session boundaries, or
    // - accidentally bridge gaps and merge unrelated nights.
    const segMs = endTime.getTime() - startTime.getTime();
    if (segMs <= 0 || segMs > MAX_REASONABLE_SLEEP_SEGMENT_MS) {
      return;
    }

    // Start the very first session
    if (currentSession.length === 0) {
      currentSession = [record];
      currentSessionMaxEndTime = endTime;
      if (!inBed) {
        lastNonInBedEndTime = endTime;
      }
      return;
    }

    // Decide if we should split BEFORE adding this record.
    // We only split when we encounter a non-InBed record, because InBed markers alone
    // are not reliable indicators of a distinct sleep session.
    let shouldSplit = false;
    if (!inBed) {
      const referenceEnd = lastNonInBedEndTime ?? currentSessionMaxEndTime;
      if (referenceEnd) {
        const gapMs = startTime.getTime() - referenceEnd.getTime();
        if (gapMs >= NAP_GAP_THRESHOLD_MS) {
          if (!hasAnyInBedMarkers) {
            shouldSplit = true;
          } else {
            const inBedBridgesGap = hasInBedBridgeAcrossGap(
              referenceEnd,
              startTime,
            );
            shouldSplit = !inBedBridgesGap;
          }
        }
      }
    }

    if (shouldSplit) {
      sessions.push([...currentSession]);
      currentSession = [record];
      currentSessionMaxEndTime = endTime;
      lastNonInBedEndTime = inBed ? null : endTime;
      return;
    }

    // Add to current session
    currentSession.push(record);

    // Track max end time for the session
    if (!currentSessionMaxEndTime || endTime > currentSessionMaxEndTime) {
      currentSessionMaxEndTime = endTime;
    }

    // Track last end time of a non-InBed record (used to compute meaningful gaps)
    if (!inBed && (!lastNonInBedEndTime || endTime > lastNonInBedEndTime)) {
      lastNonInBedEndTime = endTime;
    }
  });

  // Add the final session if it exists
  if (currentSession.length > 0) {
    sessions.push(currentSession);
  }

  return sessions;
};

// Update the calculateAverageSleepMetrics function
export const calculateAverageSleepMetrics = (
  sessions: SleepSession[],
): {
  avgSleepDuration: number;
  avgSleepEfficiency: number;
  avgDeepSleep: number;
  avgRemSleep: number;
  avgCoreSleep: number;
  avgAwake: number;
  avgAwakenings: number;
} => {
  if (!sessions || sessions.length === 0) {
    return {
      avgSleepDuration: 0,
      avgSleepEfficiency: 0,
      avgDeepSleep: 0,
      avgRemSleep: 0,
      avgCoreSleep: 0,
      avgAwake: 0,
      avgAwakenings: 0,
    };
  }

  let totalSleepDuration = 0;
  let totalSleepEfficiency = 0;
  let totalDeepPercentage = 0;
  let totalRemPercentage = 0;
  let totalAwakenings = 0;

  sessions.forEach((session) => {
    totalSleepDuration += session.sleepDuration;
    totalSleepEfficiency += session.metrics.sleepEfficiency;
    totalDeepPercentage += session.metrics.deepSleepPercentage;
    totalRemPercentage += session.metrics.remSleepPercentage;
    totalAwakenings += session.metrics.awakenings;
  });

  return {
    avgSleepDuration: Math.round(totalSleepDuration / sessions.length),
    avgSleepEfficiency: Math.round(totalSleepEfficiency / sessions.length),
    avgDeepSleep: Math.round(totalDeepPercentage / sessions.length),
    avgRemSleep: Math.round(totalRemPercentage / sessions.length),
    avgCoreSleep: Math.round(totalSleepDuration / sessions.length),
    avgAwake: Math.round(totalSleepDuration / sessions.length),
    avgAwakenings: Math.round(totalAwakenings / sessions.length),
  };
};

// Update the formatSleepDuration function
export const formatSleepDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) {
    return `${mins}m`;
  } else if (mins === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${mins}m`;
  }
};
