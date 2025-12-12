/**
 * Types for Storj-based storage of timeline events and conversation history
 */

/**
 * Timeline event stored on Storj
 */
/**
 * Attestation from a verified source (doctor, device, etc.)
 */
export interface EventAttestation {
  attesterAddress: string; // Wallet address of attester (doctor, device, etc.)
  attesterName?: string; // Human-readable name (e.g., "Dr. Smith")
  attestationType: "doctor" | "device" | "lab" | "pharmacy" | "other";
  signature: string; // Cryptographic signature
  proofHash?: string; // ZK proof hash for privacy-preserving verification
  timestamp: number; // When attestation was made
  verified: boolean; // Whether attestation has been verified on-chain
}

export interface StorjTimelineEvent {
  id: string; // UUID
  eventType: string; // e.g., "MEDICATION_STARTED", "CONDITION_DIAGNOSED"
  timestamp: number; // Unix timestamp
  data: Record<string, unknown>; // Event-specific data
  metadata?: {
    source?: string; // "user-input" | "ai-extracted" | "imported" | "attested"
    confidence?: number; // 0-1 for AI-extracted events
    tags?: string[]; // Additional tags for filtering
  };
  // Future: Attestations support
  attestations?: EventAttestation[]; // Array of attestations (doctors, devices, etc.)
}

/**
 * Conversation message stored on Storj
 */
export interface StorjConversationMessage {
  id: string; // UUID
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number; // Unix timestamp
  metadata?: {
    sessionId?: string; // Links messages to a session
    messageIndex?: number; // Order within session
    tokensUsed?: number; // For assistant messages
    model?: string; // AI model used
  };
}

/**
 * Conversation session stored on Storj
 */
export interface StorjConversationSession {
  id: string; // UUID
  userId: string; // Wallet address
  startedAt: number; // Unix timestamp
  endedAt?: number; // Unix timestamp (if session ended)
  messageCount: number;
  summary?: string; // AI-generated summary
  importance: "critical" | "high" | "medium" | "low";
  topics: string[]; // Extracted topics
  extractedFacts?: string[]; // IDs of critical facts extracted
  storjUri?: string; // Storj URI where full session is stored
}

/**
 * Conversation history snapshot stored on Storj
 * Contains full conversation memory state
 */
export interface StorjConversationHistory {
  userId: string;
  version: number; // Schema version
  lastSyncedAt: number; // Unix timestamp
  sessions: StorjConversationSession[];
  criticalFacts: Array<{
    id: string;
    category: string;
    value: string;
    context?: string;
    dateIdentified: string;
    isActive: boolean;
    storageLocation: "local" | "blockchain" | "both";
    blockchainTxHash?: string;
  }>;
  preferences: Record<string, unknown>;
}

/**
 * Storage metadata for tracking what's stored where
 */
export interface StorjStorageMetadata {
  userId: string;
  dataType:
    | "timeline-event"
    | "conversation-session"
    | "conversation-history"
    | "conversation-message";
  storjUri: string;
  contentHash: string;
  size: number;
  uploadedAt: number;
  lastAccessedAt?: number;
  accessCount?: number;
  isActive: boolean;
  version: number;
}

/**
 * Sync status for local vs Storj data
 */
export interface SyncStatus {
  lastSyncAt?: number; // Unix timestamp
  lastSyncHash?: string; // Hash of last synced data
  pendingChanges: boolean;
  conflictDetected: boolean;
  syncError?: string;
}
