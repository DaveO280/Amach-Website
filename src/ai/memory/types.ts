/**
 * AI Memory System - Type Definitions
 * Phase 2: Tiered Storage with BM25 Search
 */

// ============================================================================
// Daily Logs
// ============================================================================

export interface SleepData {
  durationMinutes: number;
  quality: 'poor' | 'fair' | 'good' | 'excellent';
  deepSleepMinutes?: number;
  remSleepMinutes?: number;
  bedtime?: string;
  wakeTime?: string;
  notes?: string;
}

export interface ActivityData {
  steps: number;
  activeMinutes: number;
  caloriesBurned?: number;
  workouts?: WorkoutEntry[];
  distanceMeters?: number;
}

export interface WorkoutEntry {
  type: string;
  durationMinutes: number;
  caloriesBurned?: number;
  intensity: 'low' | 'moderate' | 'high';
  notes?: string;
}

export interface MealEntry {
  id: string;
  timestamp: string;
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  foods: FoodItem[];
  totalCalories?: number;
  macros?: Macronutrients;
  notes?: string;
}

export interface FoodItem {
  name: string;
  quantity: string;
  calories?: number;
  macros?: Partial<Macronutrients>;
}

export interface Macronutrients {
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

export interface MoodEntry {
  timestamp: string;
  level: 1 | 2 | 3 | 4 | 5;
  emotions: string[];
  context?: string;
  triggers?: string[];
  notes?: string;
}

export interface BiometricData {
  weight?: number;
  weightUnit: 'kg' | 'lbs';
  heartRateAvg?: number;
  heartRateMax?: number;
  heartRateMin?: number;
  bloodPressure?: { systolic: number; diastolic: number };
  bloodGlucose?: number;
  hydrationMl?: number;
}

export interface DailyHealthLog {
  id: string;
  date: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  
  // Raw data
  sleep?: SleepData;
  activity?: ActivityData;
  meals?: MealEntry[];
  moods?: MoodEntry[];
  biometrics?: BiometricData;
  
  // AI-generated summary
  summary?: DailySummary;
  
  // Metadata
  dataSources: string[];
  completeness: number; // 0-1 score
  
  // Storage tier tracking
  tier: StorageTier;
  archivedAt?: string;
}

export interface DailySummary {
  overview: string;
  sleepAnalysis?: string;
  activityAnalysis?: string;
  nutritionAnalysis?: string;
  moodAnalysis?: string;
  insights: string[];
  recommendations: string[];
  trends: TrendIndicator[];
}

export interface TrendIndicator {
  metric: string;
  direction: 'up' | 'down' | 'stable';
  changePercent?: number;
  significance: 'low' | 'medium' | 'high';
}

// ============================================================================
// Health Profile
// ============================================================================

export interface HealthProfile {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  
  // Demographics & Baselines
  demographics?: UserDemographics;
  baselines?: HealthBaselines;
  
  // Curated long-term insights
  patterns: HealthPattern[];
  triggers: TriggerAnalysis[];
  correlations: CorrelationInsight[];
  
  // Goals & Progress
  goals: HealthGoal[];
  
  // AI-generated persona
  wellnessPersona?: WellnessPersona;
}

export interface UserDemographics {
  birthDate?: string;
  gender?: 'male' | 'female' | 'non-binary' | 'other';
  heightCm?: number;
  timezone: string;
}

export interface HealthBaselines {
  avgSleepHours: number;
  avgSteps: number;
  avgCalories: number;
  restingHeartRate?: number;
  typicalBedtime?: string;
  typicalWakeTime?: string;
}

export interface HealthPattern {
  id: string;
  type: 'sleep' | 'activity' | 'nutrition' | 'mood' | 'biometric';
  description: string;
  confidence: number; // 0-1
  firstObserved: string;
  lastObserved: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  evidence: string[];
  relatedMetrics: string[];
}

export interface TriggerAnalysis {
  id: string;
  trigger: string;
  effect: string;
  confidence: number;
  examples: string[];
  mitigation?: string;
}

export interface CorrelationInsight {
  id: string;
  metricA: string;
  metricB: string;
  correlationType: 'positive' | 'negative';
  strength: number; // -1 to 1
  lagHours?: number;
  explanation: string;
  confidence: number;
}

export interface HealthGoal {
  id: string;
  category: 'sleep' | 'activity' | 'nutrition' | 'weight' | 'mood' | 'other';
  description: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  deadline?: string;
  status: 'active' | 'achieved' | 'abandoned';
  createdAt: string;
}

export interface WellnessPersona {
  archetype: string;
  description: string;
  strengths: string[];
  challenges: string[];
  motivators: string[];
  communicationStyle: string;
}

// ============================================================================
// Search
// ============================================================================

export interface SearchOptions {
  mode: 'standard' | 'deep';
  dateRange?: { start: string; end: string };
  categories?: SearchCategory[];
  limit?: number;
  offset?: number;
}

export type SearchCategory = 'sleep' | 'activity' | 'nutrition' | 'mood' | 'biometrics' | 'insights';

export interface SearchResult {
  id: string;
  type: 'daily_log' | 'pattern' | 'insight' | 'goal';
  date?: string;
  score: number;
  content: string;
  highlights: string[];
  metadata: Record<string, unknown>;
}

export interface SearchIndexEntry {
  id: string;
  document: string;
  tokens: string[];
  termFrequencies: Record<string, number>;
  documentLength: number;
  metadata: Record<string, unknown>;
  vector?: number[]; // For deep search mode
}

export interface BM25Params {
  k1: number;
  b: number;
}

export const DEFAULT_BM25_PARAMS: BM25Params = {
  k1: 1.5,
  b: 0.75,
};

// ============================================================================
// Storage
// ============================================================================

export type StorageTier = 'hot' | 'warm' | 'cold';

export interface StorageStats {
  hot: { count: number; sizeBytes: number; oldestDate: string | null };
  warm: { count: number; sizeBytes: number; oldestDate: string | null };
  cold: { count: number; sizeBytes: number; archiveUrl?: string };
}

export interface TierMigrationResult {
  success: boolean;
  migrated: string[];
  failed: string[];
  bytesMoved: number;
}

export interface LocalStorageEntry<T> {
  key: string;
  value: T;
  createdAt: string;
  accessedAt: string;
  accessCount: number;
  tier: StorageTier;
  encrypted: boolean;
}

// ============================================================================
// Encryption
// ============================================================================

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  salt: string;
  authTag?: string;
  algorithm: string;
}

export interface EncryptionConfig {
  algorithm: 'AES-256-GCM' | 'AES-256-CBC';
  keyDerivation: 'PBKDF2' | 'scrypt';
  iterations: number;
}

export const DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig = {
  algorithm: 'AES-256-GCM',
  keyDerivation: 'PBKDF2',
  iterations: 100000,
};

// ============================================================================
// Feature Flags
// ============================================================================

export interface MemoryFeatureFlags {
  memoryEnabled: boolean;
  encryptionEnabled: boolean;
  tieredStorageEnabled: boolean;
  deepSearchEnabled: boolean;
  autoDailyLogEnabled: boolean;
  autoArchiveEnabled: boolean;
  cloudArchiveEnabled: boolean;
  
  // Tier configuration
  hotStorageDays: number;
  warmStorageDays: number;
  
  // Search configuration
  bm25Params: BM25Params;
  embeddingModel?: string;
  
  // Archive configuration
  storjBucket?: string;
  storjEndpoint?: string;
}

export const DEFAULT_MEMORY_FLAGS: MemoryFeatureFlags = {
  memoryEnabled: true,
  encryptionEnabled: true,
  tieredStorageEnabled: true,
  deepSearchEnabled: false,
  autoDailyLogEnabled: true,
  autoArchiveEnabled: true,
  cloudArchiveEnabled: false,
  hotStorageDays: 30,
  warmStorageDays: 60,
  bm25Params: DEFAULT_BM25_PARAMS,
};

// ============================================================================
// Events
// ============================================================================

export interface DailyLogGenerationEvent {
  type: 'auto' | 'manual';
  date: string;
  userId: string;
  triggeredAt: string;
}

export interface MemoryEnrichmentContext {
  userId: string;
  currentQuery: string;
  recentLogs: DailyHealthLog[];
  profile: HealthProfile;
  relevantPatterns: HealthPattern[];
  timeframe: { start: string; end: string };
}

export interface EnrichedResponse {
  response: string;
  sources: SearchResult[];
  confidence: number;
  suggestedFollowups: string[];
}
