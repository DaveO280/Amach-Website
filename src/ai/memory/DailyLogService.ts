/**
 * Daily Log Service
 * Generate and manage daily summaries from health data
 */

import {
  DailyHealthLog,
  DailySummary,
  SleepData,
  ActivityData,
  MealEntry,
  MoodEntry,
  BiometricData,
  TrendIndicator,
  DailyLogGenerationEvent,
} from './types';
import { LocalStorageAdapter } from './LocalStorageAdapter';
import { HybridSearchIndex } from './HybridSearchIndex';

export interface HealthDataInput {
  date: string;
  userId: string;
  sleep?: SleepData;
  activity?: ActivityData;
  meals?: MealEntry[];
  moods?: MoodEntry[];
  biometrics?: BiometricData;
  dataSources: string[];
}

export interface DailyLogServiceConfig {
  autoGenerateEnabled: boolean;
  autoGenerateTime: string; // HH:MM format
  enableDeduplication: boolean;
  generationTimeoutMs: number;
}

export class DailyLogService {
  private config: DailyLogServiceConfig;
  private storage: LocalStorageAdapter;
  private searchIndex: HybridSearchIndex;
  private generationInProgress: Set<string> = new Set();
  private generationCallbacks: Array<(log: DailyHealthLog) => void> = [];

  constructor(
    config: Partial<DailyLogServiceConfig>,
    storage: LocalStorageAdapter,
    searchIndex: HybridSearchIndex
  ) {
    this.config = {
      autoGenerateEnabled: true,
      autoGenerateTime: '23:00',
      enableDeduplication: true,
      generationTimeoutMs: 30000,
      ...config,
    };
    this.storage = storage;
    this.searchIndex = searchIndex;
  }

  /**
   * Generate a daily log from health data
   * Supports both auto (nightly) and on-demand generation with deduplication
   */
  async generateDailyLog(
    input: HealthDataInput,
    event: DailyLogGenerationEvent
  ): Promise<DailyHealthLog | null> {
    const logId = `log:${input.userId}:${input.date}`;

    // Deduplication: Check if already in progress
    if (this.config.enableDeduplication && this.generationInProgress.has(logId)) {
      console.log(`Generation already in progress for ${logId}, skipping`);
      return null;
    }

    // Deduplication: Check if already exists and is recent
    if (this.config.enableDeduplication && event.type === 'auto') {
      const existing = await this.storage.retrieveLog(input.userId, input.date);
      if (existing && this.isLogRecent(existing)) {
        console.log(`Recent log exists for ${input.date}, skipping auto-generation`);
        return existing;
      }
    }

    try {
      this.generationInProgress.add(logId);

      const log = await this.createLog(input);
      
      // Store the log
      await this.storage.storeLog(log);
      
      // Index for search
      this.searchIndex.indexDailyLog(log);

      // Notify callbacks
      this.generationCallbacks.forEach(cb => {
        try {
          cb(log);
        } catch (e) {
          console.error('Generation callback failed:', e);
        }
      });

      return log;
    } finally {
      this.generationInProgress.delete(logId);
    }
  }

  /**
   * Check if a log is recent (within last hour)
   */
  private isLogRecent(log: DailyHealthLog): boolean {
    const updated = new Date(log.updatedAt);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return updated > oneHourAgo;
  }

  /**
   * Create a daily log with AI-generated summary
   */
  private async createLog(input: HealthDataInput): Promise<DailyHealthLog> {
    const now = new Date().toISOString();
    const completeness = this.calculateCompleteness(input);

    const log: DailyHealthLog = {
      id: `log:${input.userId}:${input.date}`,
      date: input.date,
      userId: input.userId,
      createdAt: now,
      updatedAt: now,
      sleep: input.sleep,
      activity: input.activity,
      meals: input.meals,
      moods: input.moods,
      biometrics: input.biometrics,
      summary: this.generateSummary(input),
      dataSources: input.dataSources,
      completeness,
      tier: 'hot',
    };

    return log;
  }

  /**
   * Calculate data completeness score (0-1)
   */
  private calculateCompleteness(input: HealthDataInput): number {
    let score = 0;
    let maxScore = 0;

    // Sleep data (25%)
    maxScore += 0.25;
    if (input.sleep) {
      score += 0.25 * (input.sleep.durationMinutes > 0 ? 1 : 0.5);
    }

    // Activity data (25%)
    maxScore += 0.25;
    if (input.activity) {
      score += 0.25 * (input.activity.steps > 0 ? 1 : 0.3);
    }

    // Nutrition data (25%)
    maxScore += 0.25;
    if (input.meals && input.meals.length > 0) {
      const mealCompleteness = Math.min(input.meals.length / 3, 1);
      score += 0.25 * mealCompleteness;
    }

    // Mood data (15%)
    maxScore += 0.15;
    if (input.moods && input.moods.length > 0) {
      score += 0.15;
    }

    // Biometrics (10%)
    maxScore += 0.1;
    if (input.biometrics) {
      score += 0.1;
    }

    return maxScore > 0 ? score / maxScore : 0;
  }

  /**
   * Generate AI summary from health data
   * This is a simplified implementation - in production would call LLM
   */
  private generateSummary(input: HealthDataInput): DailySummary {
    const insights: string[] = [];
    const recommendations: string[] = [];
    const trends: TrendIndicator[] = [];

    // Sleep analysis
    let sleepAnalysis: string | undefined;
    if (input.sleep) {
      const hours = Math.round(input.sleep.durationMinutes / 60 * 10) / 10;
      sleepAnalysis = `You slept ${hours} hours with ${input.sleep.quality} quality`;
      
      if (hours < 6) {
        insights.push('Sleep duration was below recommended 7-9 hours');
        recommendations.push('Consider establishing a consistent bedtime routine');
      } else if (input.sleep.quality === 'poor') {
        insights.push('Sleep quality was low despite adequate duration');
        recommendations.push('Review sleep environment and pre-bed activities');
      }

      trends.push({
        metric: 'sleep_duration',
        direction: hours >= 7 ? 'stable' : 'down',
        significance: hours < 6 ? 'high' : 'low',
      });
    }

    // Activity analysis
    let activityAnalysis: string | undefined;
    if (input.activity) {
      activityAnalysis = `You took ${input.activity.steps.toLocaleString()} steps and were active for ${input.activity.activeMinutes} minutes`;
      
      if (input.activity.steps < 5000) {
        insights.push('Activity level was lower than recommended 10,000 steps');
        recommendations.push('Try a 10-minute walk after lunch tomorrow');
      } else if (input.activity.steps > 10000) {
        insights.push('Great job meeting your step goal!');
      }

      if (input.activity.workouts && input.activity.workouts.length > 0) {
        const workoutTypes = input.activity.workouts.map(w => w.type).join(', ');
        activityAnalysis += `. Workouts: ${workoutTypes}`;
      }

      trends.push({
        metric: 'daily_steps',
        direction: input.activity.steps >= 8000 ? 'stable' : 'down',
        changePercent: Math.round((input.activity.steps / 10000) * 100),
        significance: input.activity.steps < 4000 ? 'high' : 'medium',
      });
    }

    // Nutrition analysis
    let nutritionAnalysis: string | undefined;
    if (input.meals && input.meals.length > 0) {
      const mealCount = input.meals.length;
      const totalCalories = input.meals.reduce((sum, m) => sum + (m.totalCalories || 0), 0);
      nutritionAnalysis = `You had ${mealCount} meals`;
      if (totalCalories > 0) {
        nutritionAnalysis += ` totaling approximately ${totalCalories} calories`;
      }

      // Check meal timing
      const hasBreakfast = input.meals.some(m => m.type === 'breakfast');
      if (!hasBreakfast) {
        recommendations.push('Consider adding breakfast to maintain energy levels');
      }
    }

    // Mood analysis
    let moodAnalysis: string | undefined;
    if (input.moods && input.moods.length > 0) {
      const avgMood = input.moods.reduce((sum, m) => sum + m.level, 0) / input.moods.length;
      moodAnalysis = `Average mood level was ${avgMood.toFixed(1)}/5`;
      
      const emotions = [...new Set(input.moods.flatMap(m => m.emotions))];
      if (emotions.length > 0) {
        moodAnalysis += `. Emotions: ${emotions.join(', ')}`;
      }

      if (avgMood < 3) {
        recommendations.push('Consider journaling or mindfulness practice');
      }

      trends.push({
        metric: 'mood_avg',
        direction: avgMood >= 3 ? 'stable' : 'down',
        significance: avgMood < 2 ? 'high' : 'medium',
      });
    }

    // Generate overview
    const parts: string[] = [];
    if (sleepAnalysis) parts.push(sleepAnalysis);
    if (activityAnalysis) parts.push(activityAnalysis);
    if (moodAnalysis) parts.push(moodAnalysis);
    
    const overview = parts.length > 0
      ? `Today ${parts.join('. ')}.`
      : 'No health data recorded for this day.';

    return {
      overview,
      sleepAnalysis,
      activityAnalysis,
      nutritionAnalysis,
      moodAnalysis,
      insights: insights.length > 0 ? insights : ['Keep tracking to see personalized insights'],
      recommendations,
      trends,
    };
  }

  /**
   * Get a daily log by date
   */
  async getLog(userId: string, date: string): Promise<DailyHealthLog | null> {
    return this.storage.retrieveLog(userId, date);
  }

  /**
   * Get logs for a date range
   */
  async getLogsForRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyHealthLog[]> {
    const logs: DailyHealthLog[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const log = await this.getLog(userId, dateStr);
      if (log) {
        logs.push(log);
      }
    }

    return logs;
  }

  /**
   * Update an existing log
   */
  async updateLog(
    userId: string,
    date: string,
    updates: Partial<HealthDataInput>
  ): Promise<DailyHealthLog | null> {
    const existing = await this.getLog(userId, date);
    if (!existing) return null;

    const updated: DailyHealthLog = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Update summary if data changed
    if (updates.sleep || updates.activity || updates.meals || updates.moods) {
      updated.summary = this.generateSummary({
        date,
        userId,
        sleep: updated.sleep,
        activity: updated.activity,
        meals: updated.meals,
        moods: updated.moods,
        biometrics: updated.biometrics,
        dataSources: updated.dataSources,
      });
    }

    await this.storage.storeLog(updated);
    this.searchIndex.indexDailyLog(updated);

    return updated;
  }

  /**
   * Delete a log
   */
  async deleteLog(userId: string, date: string): Promise<boolean> {
    const logId = `log:${userId}:${date}`;
    this.searchIndex.removeDocument(logId);
    // Note: Actual deletion from storage would be implemented in LocalStorageAdapter
    return true;
  }

  /**
   * Register a callback for log generation events
   */
  onLogGenerated(callback: (log: DailyHealthLog) => void): () => void {
    this.generationCallbacks.push(callback);
    return () => {
      const index = this.generationCallbacks.indexOf(callback);
      if (index > -1) {
        this.generationCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Schedule nightly auto-generation
   */
  scheduleAutoGeneration(
    userId: string,
    dataProvider: () => Promise<HealthDataInput>
  ): () => void {
    if (!this.config.autoGenerateEnabled) {
      return () => {};
    }

    const [hours, minutes] = this.config.autoGenerateTime.split(':').map(Number);
    
    const scheduleNext = () => {
      const now = new Date();
      const next = new Date();
      next.setHours(hours, minutes, 0, 0);
      
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      
      return next.getTime() - now.getTime();
    };

    let timeoutId: ReturnType<typeof setTimeout>;

    const runGeneration = async () => {
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];

        const data = await dataProvider();
        
        await this.generateDailyLog(data, {
          type: 'auto',
          date: dateStr,
          userId,
          triggeredAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error('Auto-generation failed:', e);
      }

      // Schedule next
      timeoutId = setTimeout(runGeneration, scheduleNext());
    };

    // Initial schedule
    timeoutId = setTimeout(runGeneration, scheduleNext());

    // Return cleanup function
    return () => {
      clearTimeout(timeoutId);
    };
  }

  /**
   * Get statistics about logs
   */
  async getStats(userId: string): Promise<{
    totalLogs: number;
    avgCompleteness: number;
    dateRange: { start: string | null; end: string | null };
    dataSources: string[];
  }> {
    // This would query the storage adapter for actual stats
    // Simplified implementation
    return {
      totalLogs: 0,
      avgCompleteness: 0,
      dateRange: { start: null, end: null },
      dataSources: [],
    };
  }
}
