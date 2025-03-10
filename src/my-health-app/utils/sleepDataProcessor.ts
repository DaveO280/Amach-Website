import { HealthData } from '../types/healthData';
import { extractDatePart } from './dataDeduplicator';

// Sleep stage types from Apple Health
export enum SleepStage {
  Core = 'HKCategoryValueSleepAnalysisAsleepCore',
  Deep = 'HKCategoryValueSleepAnalysisAsleepDeep',
  REM = 'HKCategoryValueSleepAnalysisAsleepREM',
  Awake = 'HKCategoryValueSleepAnalysisAwake',
  InBed = 'HKCategoryValueSleepAnalysisInBed'
}

// Interface for a processed sleep session
export interface SleepSession {
  date: string; // YYYY-MM-DD format (primary day of the sleep session)
  startTime: string; // Full ISO timestamp
  endTime: string; // Full ISO timestamp
  totalDuration: number; // Minutes
  sleepDuration: number; // Minutes (excluding awake time)
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

// Interface for a sleep segment (used for visualization)
export interface SleepSegment {
  stage: SleepStage;
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

/**
 * Groups sleep records into distinct sessions based on time proximity
 * This properly handles overnight sleep that spans across midnight
 */
const groupSleepSessions = (records: HealthData[]): HealthData[][] => {
  // Sort records by start time
  const sortedRecords = [...records].sort((a, b) => 
    new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
  
  const sessions: HealthData[][] = [];
  let currentSession: HealthData[] = [];
  let lastEndTime: Date | null = null;
  
  // Time gap threshold for considering records part of the same session (in milliseconds)
  // 2 hour gap means these are separate sleep sessions
  const sessionGapThreshold = 2 * 60 * 60 * 1000; 
  
  sortedRecords.forEach(record => {
    const startTime = new Date(record.startDate);
    
    // Start a new session if:
    // 1. This is the first record, OR
    // 2. There's a significant gap between this record and the last session's end
    if (currentSession.length === 0 || !lastEndTime || 
        (startTime.getTime() - lastEndTime.getTime() > sessionGapThreshold)) {
      
      // Save previous session if it exists
      if (currentSession.length > 0) {
        sessions.push([...currentSession]);
      }
      
      // Start a new session
      currentSession = [record];
    } else {
      // Add to current session
      currentSession.push(record);
    }
    
    // Update last end time if this record extends it
    const endTime = new Date(record.endDate as string || record.startDate);
    if (!lastEndTime || endTime > lastEndTime) {
      lastEndTime = endTime;
    }
  });
  
  // Add the final session if it exists
  if (currentSession.length > 0) {
    sessions.push(currentSession);
  }
  
  return sessions;
};

/**
 * Determines the primary day for a sleep session based on when most of the sleep occurred
 * For night sleep, this is typically the day after going to bed (e.g., sleep starting on
 * Nov 5 at 11 PM will typically be associated with Nov 6)
 */
const determinePrimaryDay = (startTime: string, endTime: string): string => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  
  // If the sleep doesn't cross midnight, use the start date
  if (extractDatePart(startTime) === extractDatePart(endTime)) {
    return extractDatePart(startTime);
  }
  
  // For overnight sessions, determine which day contains more of the sleep
  // Calculate midnight after the sleep started
  const midnightAfterStart = new Date(start);
  midnightAfterStart.setHours(24, 0, 0, 0);
  
  // Calculate time before and after midnight
  const msBeforeMidnight = midnightAfterStart.getTime() - start.getTime();
  const msAfterMidnight = end.getTime() - midnightAfterStart.getTime();
  
  // If more sleep occurred after midnight, use the end date
  if (msAfterMidnight > msBeforeMidnight) {
    return extractDatePart(endTime);
  }
  
  // Otherwise, use the start date
  return extractDatePart(startTime);
};

/**
 * Processes raw sleep data into organized sleep sessions
 * @param sleepData - Raw sleep data from Apple Health
 * @returns Array of processed sleep sessions
 */
export const processSleepData = (sleepData: HealthData[]): SleepSession[] => {
  // Skip if no data
  if (!sleepData || sleepData.length === 0) {
    return [];
  }

  console.log(`Processing ${sleepData.length} sleep records...`);
  
  // Group sleep records into distinct sessions
  const sleepSessions = groupSleepSessions(sleepData);
  console.log(`Identified ${sleepSessions.length} distinct sleep sessions`);
  
  // Process each session
  const processedSessions: SleepSession[] = [];
  
  sleepSessions.forEach((sessionRecords, sessionIndex) => {
    try {
      // Sort records by start time
      const sortedRecords = [...sessionRecords].sort((a, b) => 
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );
      
      // Get overall session boundaries (first start time to last end time)
      const sessionStart = sortedRecords[0].startDate;
      const sessionEnd = sortedRecords[sortedRecords.length - 1].endDate as string;
      
      // Session start and end dates for reference
      const startDate = new Date(sessionStart);
      const endDate = new Date(sessionEnd);
      
      // Determine if this is an overnight session
      const isOvernight = extractDatePart(sessionStart) !== extractDatePart(sessionEnd);
      
      // Determine the primary day for this sleep session
      // This is the calendar day that will "own" this sleep session
      const sessionDate = determinePrimaryDay(sessionStart, sessionEnd);
      
      // Calculate session duration in minutes
      const sessionDurationMs = endDate.getTime() - startDate.getTime();
      const sessionDurationMinutes = Math.round(sessionDurationMs / (1000 * 60));
      
      // Skip if session is too short (less than 30 minutes)
      if (sessionDurationMinutes < 30) {
        console.log(`Skipping short sleep session on ${sessionDate} (${sessionDurationMinutes} minutes)`);
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
      
      sortedRecords.forEach(record => {
        // Skip "InBed" records for stage calculation to avoid double-counting
        if (record.value === SleepStage.InBed) {
          return;
        }
        
        const startTime = new Date(record.startDate);
        const endTime = new Date(record.endDate as string);
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationMinutes = Math.round(durationMs / (1000 * 60));
        
        // Add to the appropriate sleep stage counter
        switch (record.value) {
          case SleepStage.Core:
            coreSleepMinutes += durationMinutes;
            break;
          case SleepStage.Deep:
            deepSleepMinutes += durationMinutes;
            break;
          case SleepStage.REM:
            remSleepMinutes += durationMinutes;
            break;
          case SleepStage.Awake:
            awakeMinutes += durationMinutes;
            
            // Count as an awakening if it's been at least 5 minutes since the last awakening
            if (!lastAwakeEndTime || 
                (startTime.getTime() - lastAwakeEndTime.getTime() > 5 * 60 * 1000)) {
              awakeningCount++;
            }
            
            lastAwakeEndTime = endTime;
            break;
        }
        
        // Add segment for visualization
        segments.push({
          stage: record.value as SleepStage,
          startTime: record.startDate,
          endTime: record.endDate as string,
          durationMinutes
        });
      });
      
      // Calculate total sleep time (excluding awake time)
      const sleepDurationMinutes = coreSleepMinutes + deepSleepMinutes + remSleepMinutes;
      
      // Skip if no actual sleep time was recorded
      if (sleepDurationMinutes === 0) {
        console.log(`Skipping session on ${sessionDate} with no sleep time recorded`);
        return;
      }
      
      // Calculate metrics
      const sleepEfficiency = Math.round((sleepDurationMinutes / sessionDurationMinutes) * 100);
      const deepSleepPercentage = Math.round((deepSleepMinutes / sleepDurationMinutes) * 100);
      const remSleepPercentage = Math.round((remSleepMinutes / sleepDurationMinutes) * 100);
      
      // Sort segments chronologically for visualization
      const sortedSegments = segments.sort((a, b) => 
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
      
      // Create the sleep session object
      const sleepSession: SleepSession = {
        date: sessionDate,
        startTime: sessionStart,
        endTime: sessionEnd,
        totalDuration: sessionDurationMinutes,
        sleepDuration: sleepDurationMinutes,
        stageData: {
          core: coreSleepMinutes,
          deep: deepSleepMinutes,
          rem: remSleepMinutes,
          awake: awakeMinutes
        },
        metrics: {
          sleepEfficiency,
          deepSleepPercentage,
          remSleepPercentage,
          awakenings: awakeningCount
        },
        segments: sortedSegments,
        isOvernight
      };
      
      processedSessions.push(sleepSession);
      
      // Log session details for debugging
      console.log(`Sleep Session ${sessionIndex + 1}:`);
      console.log(`- Start time: ${startDate.toLocaleString()}`);
      console.log(`- End time: ${endDate.toLocaleString()}`);
      console.log(`- Assigned to day: ${sessionDate}`);
      console.log(`- Is overnight: ${isOvernight}`);
      console.log(`- Duration: ${sessionDurationMinutes} minutes`);
      
    } catch (e) {
      console.error(`Error processing sleep session:`, e);
    }
  });
  
  // Sort sessions by date and then by start time
  const sortedSessions = processedSessions.sort((a, b) => {
    // First sort by date
    const dateComparison = a.date.localeCompare(b.date);
    if (dateComparison !== 0) return dateComparison;
    
    // If same date, sort by start time
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });
  
  console.log(`Processed ${sortedSessions.length} valid sleep sessions (${processedSessions.filter(s => s.isOvernight).length} overnight)`);
  return sortedSessions;
};

/**
 * Calculates average sleep metrics across multiple sessions
 * @param sessions - Array of sleep sessions
 * @returns Object containing average metrics
 */
export const calculateAverageSleepMetrics = (sessions: SleepSession[]) => {
  if (!sessions || sessions.length === 0) {
    return null;
  }
  
  let totalSleepDuration = 0;
  let totalSleepEfficiency = 0;
  let totalDeepPercentage = 0;
  let totalRemPercentage = 0;
  let totalAwakenings = 0;
  
  sessions.forEach(session => {
    totalSleepDuration += session.sleepDuration;
    totalSleepEfficiency += session.metrics.sleepEfficiency;
    totalDeepPercentage += session.metrics.deepSleepPercentage;
    totalRemPercentage += session.metrics.remSleepPercentage;
    totalAwakenings += session.metrics.awakenings;
  });
  
  return {
    averageSleepDuration: Math.round(totalSleepDuration / sessions.length),
    averageSleepEfficiency: Math.round(totalSleepEfficiency / sessions.length),
    averageDeepPercentage: Math.round(totalDeepPercentage / sessions.length),
    averageRemPercentage: Math.round(totalRemPercentage / sessions.length),
    averageAwakenings: Math.round(totalAwakenings / sessions.length)
  };
};

/**
 * Formats a duration in minutes into a readable hours and minutes string
 * @param minutes - Duration in minutes
 * @returns Formatted string (e.g., "7h 30m")
 */
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