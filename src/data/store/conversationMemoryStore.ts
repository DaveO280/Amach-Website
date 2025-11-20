// IndexedDB Store for Conversation Memory
// Handles local persistence of chat context, critical facts, and session summaries

import type {
  ConversationMemory,
  CriticalFact,
  SessionSummary,
  UserPreferences,
} from "@/types/conversationMemory";

const DB_NAME = "amach-conversation-memory";
const DB_VERSION = 1;
const MEMORY_STORE = "conversation_memory";

class ConversationMemoryStore {
  private db: IDBDatabase | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (): void => {
        console.error("❌ Failed to open conversation memory database");
        reject(request.error);
      };

      request.onsuccess = (): void => {
        this.db = request.result;
        this.isInitialized = true;
        console.log("✅ Conversation memory database initialized");
        resolve();
      };

      request.onupgradeneeded = (event): void => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store for conversation memory
        if (!db.objectStoreNames.contains(MEMORY_STORE)) {
          const store = db.createObjectStore(MEMORY_STORE, {
            keyPath: "userId",
          });
          store.createIndex("lastUpdated", "lastUpdated", { unique: false });
          console.log("✅ Created conversation memory object store");
        }
      };
    });
  }

  private async initDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) {
      throw new Error("Database not initialized");
    }
    return this.db;
  }

  /**
   * Get conversation memory for a user
   */
  async getMemory(userId: string): Promise<ConversationMemory | null> {
    const db = await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MEMORY_STORE], "readonly");
      const store = transaction.objectStore(MEMORY_STORE);
      const request = store.get(userId);

      request.onsuccess = (): void => {
        resolve(request.result || null);
      };

      request.onerror = (): void => {
        console.error("❌ Error getting conversation memory:", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Save or update conversation memory
   */
  async saveMemory(memory: ConversationMemory): Promise<void> {
    const db = await this.initDB();

    memory.lastUpdated = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MEMORY_STORE], "readwrite");
      const store = transaction.objectStore(MEMORY_STORE);
      const request = store.put(memory);

      request.onsuccess = (): void => {
        console.log("✅ Conversation memory saved");
        resolve();
      };

      request.onerror = (): void => {
        console.error("❌ Error saving conversation memory:", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Add a critical fact to memory
   */
  async addCriticalFact(userId: string, fact: CriticalFact): Promise<void> {
    let memory = await this.getMemory(userId);

    if (!memory) {
      memory = this.createEmptyMemory(userId);
    }

    // Check if fact already exists
    const exists = memory.criticalFacts.some(
      (f) => f.category === fact.category && f.value === fact.value,
    );

    if (!exists) {
      memory.criticalFacts.push(fact);
      memory.totalFactsExtracted++;
      await this.saveMemory(memory);
      console.log(`✅ Added critical fact: ${fact.category} - ${fact.value}`);
    } else {
      console.log(`ℹ️ Fact already exists: ${fact.category} - ${fact.value}`);
    }
  }

  /**
   * Update a critical fact (e.g., mark as inactive, move to blockchain)
   */
  async updateCriticalFact(
    userId: string,
    factId: string,
    updates: Partial<CriticalFact>,
  ): Promise<void> {
    const memory = await this.getMemory(userId);
    if (!memory) return;

    const factIndex = memory.criticalFacts.findIndex((f) => f.id === factId);
    if (factIndex === -1) return;

    memory.criticalFacts[factIndex] = {
      ...memory.criticalFacts[factIndex],
      ...updates,
    };

    await this.saveMemory(memory);
    console.log(`✅ Updated critical fact: ${factId}`);
  }

  /**
   * Add a session summary
   */
  async addSessionSummary(
    userId: string,
    summary: SessionSummary,
  ): Promise<void> {
    let memory = await this.getMemory(userId);

    if (!memory) {
      memory = this.createEmptyMemory(userId);
    }

    // Add to appropriate tier based on importance
    if (summary.importance === "critical" || summary.importance === "high") {
      memory.importantSessions.push(summary);
      // Keep only most recent 20
      if (memory.importantSessions.length > 20) {
        memory.importantSessions = memory.importantSessions.slice(-20);
      }
    } else {
      memory.recentSessions.push(summary);
      // Keep only most recent 5
      if (memory.recentSessions.length > 5) {
        memory.recentSessions = memory.recentSessions.slice(-5);
      }
    }

    memory.totalSessions++;
    await this.saveMemory(memory);
    console.log(`✅ Added session summary (${summary.importance})`);
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    userId: string,
    preferences: Partial<UserPreferences>,
  ): Promise<void> {
    let memory = await this.getMemory(userId);

    if (!memory) {
      memory = this.createEmptyMemory(userId);
    }

    memory.preferences = {
      ...memory.preferences,
      ...preferences,
    };

    await this.saveMemory(memory);
    console.log("✅ Updated user preferences");
  }

  /**
   * Get all critical facts by category
   */
  async getCriticalFactsByCategory(
    userId: string,
    category: CriticalFact["category"],
  ): Promise<CriticalFact[]> {
    const memory = await this.getMemory(userId);
    if (!memory) return [];

    return memory.criticalFacts.filter(
      (f) => f.category === category && f.isActive,
    );
  }

  /**
   * Get facts that need blockchain save prompt
   */
  async getFactsNeedingBlockchainPrompt(
    userId: string,
  ): Promise<CriticalFact[]> {
    const memory = await this.getMemory(userId);
    if (!memory) return [];

    return memory.criticalFacts.filter(
      (f) => f.isActive && f.storageLocation === "local",
    );
  }

  /**
   * Clear all memory for a user
   */
  async clearMemory(userId: string): Promise<void> {
    const db = await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MEMORY_STORE], "readwrite");
      const store = transaction.objectStore(MEMORY_STORE);
      const request = store.delete(userId);

      request.onsuccess = (): void => {
        console.log("✅ Conversation memory cleared");
        resolve();
      };

      request.onerror = (): void => {
        console.error("❌ Error clearing conversation memory:", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Create empty memory structure for new user
   */
  private createEmptyMemory(userId: string): ConversationMemory {
    return {
      userId,
      criticalFacts: [],
      importantSessions: [],
      recentSessions: [],
      preferences: {},
      lastUpdated: new Date().toISOString(),
      totalSessions: 0,
      totalFactsExtracted: 0,
    };
  }
}

// Export singleton instance
export const conversationMemoryStore = new ConversationMemoryStore();
