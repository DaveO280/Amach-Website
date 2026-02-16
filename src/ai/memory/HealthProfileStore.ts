/**
 * Health Profile Store
 * Curated long-term health profile with auto-updates
 */

import {
  HealthProfile,
  HealthPattern,
  HealthGoal,
  CorrelationInsight,
  WellnessPersona,
  DailyHealthLog,
} from './types';
import { HybridSearchIndex } from './HybridSearchIndex';

const PROFILE_KEY = 'health_profile';

export interface HealthProfileStoreConfig {
  autoUpdateEnabled: boolean;
  updateIntervalDays: number;
  minLogsForPattern: number;
  patternConfidenceThreshold: number;
  correlationMinStrength: number;
}

export class HealthProfileStore {
  private config: HealthProfileStoreConfig;
  private searchIndex: HybridSearchIndex;
  private profileCache: Map<string, HealthProfile> = new Map();

  constructor(
    config: Partial<HealthProfileStoreConfig>,
    searchIndex: HybridSearchIndex
  ) {
    this.config = {
      autoUpdateEnabled: true,
      updateIntervalDays: 7,
      minLogsForPattern: 5,
      patternConfidenceThreshold: 0.7,
      correlationMinStrength: 0.5,
      ...config,
    };
    this.searchIndex = searchIndex;
  }

  async getOrCreateProfile(userId: string): Promise<HealthProfile> {
    const cached = this.profileCache.get(userId);
    if (cached) return cached;

    const key = `${PROFILE_KEY}:${userId}`;
    const stored = localStorage.getItem(key);
    
    if (stored) {
      try {
        const profile: HealthProfile = JSON.parse(stored);
        this.profileCache.set(userId, profile);
        return profile;
      } catch (e) {
        console.error('Failed to parse stored profile:', e);
      }
    }

    const newProfile = this.createDefaultProfile(userId);
    await this.saveProfile(newProfile);
    return newProfile;
  }

  private createDefaultProfile(userId: string): HealthProfile {
    const now = new Date().toISOString();
    return {
      id: `profile:${userId}`,
      userId,
      createdAt: now,
      updatedAt: now,
      version: 1,
      patterns: [],
      triggers: [],
      correlations: [],
      goals: [],
    };
  }

  private async saveProfile(profile: HealthProfile): Promise<void> {
    profile.updatedAt = new Date().toISOString();
    profile.version++;
    
    const key = `${PROFILE_KEY}:${profile.userId}`;
    localStorage.setItem(key, JSON.stringify(profile));
    this.profileCache.set(profile.userId, profile);
    this.searchIndex.indexProfile(profile);
  }

  async updateFromLogs(userId: string, logs: DailyHealthLog[]): Promise<HealthProfile> {
    const profile = await this.getOrCreateProfile(userId);

    if (logs.length >= this.config.minLogsForPattern) {
      await this.detectPatterns(profile, logs);
      await this.detectCorrelations(profile, logs);
      await this.updatePersona(profile);
    }

    await this.saveProfile(profile);
    return profile;
  }

  private async detectPatterns(profile: HealthProfile, logs: DailyHealthLog[]): Promise<void> {
    const patterns: HealthPattern[] = [];

    // Social jetlag pattern
    const sleepLogs = logs.filter(l => l.sleep);
    if (sleepLogs.length >= this.config.minLogsForPattern) {
      const weekendSleep = sleepLogs.filter(l => [0, 6].includes(new Date(l.date).getDay()));
      const weekdaySleep = sleepLogs.filter(l => [1, 2, 3, 4, 5].includes(new Date(l.date).getDay()));

      if (weekendSleep.length > 0 && weekdaySleep.length > 0) {
        const weekendAvg = weekendSleep.reduce((s, l) => s + (l.sleep?.durationMinutes || 0), 0) / weekendSleep.length;
        const weekdayAvg = weekdaySleep.reduce((s, l) => s + (l.sleep?.durationMinutes || 0), 0) / weekdaySleep.length;
        
        if (weekendAvg > weekdayAvg + 60) {
          patterns.push({
            id: `pattern:social_jetlag:${Date.now()}`,
            type: 'sleep',
            description: 'You sleep significantly longer on weekends (social jetlag)',
            confidence: Math.min(0.95, weekendSleep.length / 10),
            firstObserved: weekendSleep[0].date,
            lastObserved: weekendSleep[weekendSleep.length - 1].date,
            frequency: 'weekly',
            evidence: [`${Math.round((weekendAvg - weekdayAvg) / 60)} hour weekend sleep extension`],
            relatedMetrics: ['sleep_duration', 'bedtime'],
          });
        }
      }
    }

    profile.patterns = patterns;
  }

  private async detectCorrelations(profile: HealthProfile, logs: DailyHealthLog[]): Promise<void> {
    const correlations: CorrelationInsight[] = [];

    const sleepMood = logs.filter(l => l.sleep && l.moods?.length);
    if (sleepMood.length >= 5) {
      const qualityMap = { poor: 1, fair: 2, good: 3, excellent: 4 };
      const sleepScores = sleepMood.map(l => qualityMap[l.sleep!.quality] || 2);
      const moodScores = sleepMood.map(l => l.moods!.reduce((s, m) => s + m.level, 0) / l.moods!.length);
      
      const corr = this.pearson(sleepScores, moodScores);
      if (Math.abs(corr) >= this.config.correlationMinStrength) {
        correlations.push({
          id: `corr:sleep_mood:${Date.now()}`,
          metricA: 'sleep_quality',
          metricB: 'mood',
          correlationType: corr > 0 ? 'positive' : 'negative',
          strength: Math.abs(corr),
          lagHours: 0,
          explanation: 'Sleep quality correlates with mood levels',
          confidence: Math.min(0.9, sleepMood.length / 20),
        });
      }
    }

    profile.correlations = correlations;
  }

  private pearson(x: number[], y: number[]): number {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((s, xi, i) => s + xi * y[i], 0);
    const sumX2 = x.reduce((s, xi) => s + xi * xi, 0);
    const sumY2 = y.reduce((s, yi) => s + yi * yi, 0);
    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return den === 0 ? 0 : num / den;
  }

  private async updatePersona(profile: HealthProfile): Promise<void> {
    const archetype = profile.patterns.some(p => p.type === 'sleep' && p.description.includes('jetlag'))
      ? 'Weekend Warrior'
      : 'Steady Tracker';

    profile.wellnessPersona = {
      archetype,
      description: `A ${archetype.toLowerCase()} building health awareness through consistent tracking`,
      strengths: ['consistent data logging'],
      challenges: profile.patterns.filter(p => p.type === 'sleep').map(p => p.description),
      motivators: ['progress visibility', 'personal insights'],
      communicationStyle: 'supportive',
    };
  }

  async addGoal(userId: string, goal: Omit<HealthGoal, 'id' | 'createdAt'>): Promise<HealthGoal> {
    const profile = await this.getOrCreateProfile(userId);
    const newGoal: HealthGoal = {
      ...goal,
      id: `goal:${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    profile.goals.push(newGoal);
    await this.saveProfile(profile);
    return newGoal;
  }

  async updateGoal(userId: string, goalId: string, updates: Partial<HealthGoal>): Promise<void> {
    const profile = await this.getOrCreateProfile(userId);
    const idx = profile.goals.findIndex(g => g.id === goalId);
    if (idx >= 0) {
      profile.goals[idx] = { ...profile.goals[idx], ...updates };
      await this.saveProfile(profile);
    }
  }
}
