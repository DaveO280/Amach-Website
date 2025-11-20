// Conversation Memory Types for AI Chat Context Management
// Supports local IndexedDB storage and blockchain persistence

export type MemoryCategory =
  | "medication"
  | "condition"
  | "allergy"
  | "surgery"
  | "goal"
  | "preference"
  | "concern";

export type MemoryImportance = "critical" | "high" | "medium" | "low";

export type StorageLocation = "local" | "blockchain" | "both";

/**
 * A single critical fact extracted from conversation
 */
export interface CriticalFact {
  id: string; // UUID
  category: MemoryCategory;
  value: string; // e.g., "Enclomiphene", "Sleep Apnea"
  context?: string; // Additional context from conversation
  dateIdentified: string; // ISO timestamp
  dateStarted?: string; // When medication/condition started
  dateEnded?: string; // When medication stopped/condition resolved
  isActive: boolean;
  source: "ai-extracted" | "user-input" | "blockchain";
  storageLocation: StorageLocation;
  blockchainTxHash?: string; // If saved on blockchain
  confidence?: number; // 0-1, AI confidence in extraction
}

/**
 * A conversation session summary
 */
export interface SessionSummary {
  id: string; // UUID
  date: string; // ISO timestamp
  summary: string; // 2-3 sentence summary
  topics: string[]; // ["sleep", "nutrition", "exercise"]
  importance: MemoryImportance;
  reasoning?: string; // Why this session is important
  extractedFacts: string[]; // IDs of CriticalFacts extracted
  messageCount: number;
  durationMinutes?: number;
}

/**
 * User preferences learned over time
 */
export interface UserPreferences {
  exercise?: {
    preferred: string[]; // ["strength training", "hiking"]
    disliked: string[]; // ["cardio", "running"]
  };
  diet?: {
    preferred: string[]; // ["Mediterranean", "high protein"]
    disliked: string[]; // ["keto", "low carb"]
    restrictions: string[]; // ["dairy-free", "gluten-free"]
  };
  communication?: {
    style: "detailed" | "concise" | "balanced";
    tone: "clinical" | "friendly" | "mixed";
  };
  tracking?: {
    metrics: string[]; // Metrics user cares most about
    frequency: "daily" | "weekly" | "monthly";
  };
}

/**
 * Complete conversation memory structure
 */
export interface ConversationMemory {
  userId: string;

  // Critical facts (never auto-pruned)
  criticalFacts: CriticalFact[];

  // Session summaries (tiered by importance)
  importantSessions: SessionSummary[]; // Keep 20 most recent
  recentSessions: SessionSummary[]; // Keep 5 most recent, auto-prune

  // User preferences (updated over time)
  preferences: UserPreferences;

  // Metadata
  lastUpdated: string; // ISO timestamp
  totalSessions: number;
  totalFactsExtracted: number;
}

/**
 * Prompt data for blockchain save UI
 */
export interface BlockchainSavePrompt {
  fact: CriticalFact;
  estimatedGasCost: string; // e.g., "$0.05"
  icon: string; // Emoji for category
  message: string; // User-friendly prompt message
  urgency: "high" | "medium" | "low"; // For safety-critical items
}

/**
 * AI analysis result from conversation
 */
export interface ConversationAnalysis {
  summary: string;
  extractedFacts: CriticalFact[];
  importance: MemoryImportance;
  reasoning: string;
  topics: string[];
  suggestedFollowUp?: string;
}

/**
 * Blockchain memory entry (encrypted on-chain)
 */
export interface BlockchainMemoryEntry {
  category: MemoryCategory;
  encryptedData: string; // Encrypted CriticalFact
  dataHash: string; // bytes32 for verification
  timestamp: number; // Unix timestamp
  isActive: boolean;
  txHash: string; // Transaction hash
}
