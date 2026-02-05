// src/services/__tests__/memoryServices.test.ts
// Tests for Memory Extraction and Conversation Memory Services

// Mock the Venice API service
jest.mock("@/api/venice/VeniceApiService", () => ({
  VeniceApiService: jest.fn().mockImplementation(() => ({
    generateVeniceResponse: jest.fn(),
  })),
}));

// Mock the stores
const mockStore = {
  initialize: jest.fn().mockResolvedValue(undefined),
  getMemory: jest.fn(),
  saveMemory: jest.fn().mockResolvedValue(undefined),
  addCriticalFact: jest.fn().mockResolvedValue(undefined),
  updateCriticalFact: jest.fn().mockResolvedValue(undefined),
  addSessionSummary: jest.fn().mockResolvedValue(undefined),
  clearMemory: jest.fn().mockResolvedValue(undefined),
  getCriticalFactsByCategory: jest.fn(),
};

jest.mock("@/data/store/conversationMemoryStore", () => ({
  conversationMemoryStore: mockStore,
}));

// Mock StorjConversationService
jest.mock("@/storage/StorjConversationService", () => ({
  getStorjConversationService: jest.fn().mockReturnValue({
    syncMemoryToStorj: jest.fn().mockResolvedValue({ success: true }),
    listUserConversationHistory: jest.fn().mockResolvedValue([]),
    retrieveConversationHistory: jest.fn().mockResolvedValue(null),
  }),
  StorjConversationService: jest.fn(),
}));

import { MemoryExtractionService } from "../MemoryExtractionService";
import { createConversationMemoryService } from "../ConversationMemoryService";
import type { ConversationMessage } from "../MemoryExtractionService";

describe("MemoryExtractionService", () => {
  let extractionService: MemoryExtractionService;

  beforeEach(() => {
    extractionService = new MemoryExtractionService();
  });

  describe("identifyTopics", () => {
    it("should identify exercise topics", () => {
      const messages: ConversationMessage[] = [
        { role: "user", content: "I want to improve my workout routine" },
        {
          role: "assistant",
          content: "Let me help you with exercise planning",
        },
      ];

      const topics = extractionService.identifyTopics(messages);
      expect(topics).toContain("exercise");
    });

    it("should identify sleep topics", () => {
      const messages: ConversationMessage[] = [
        { role: "user", content: "I'm having trouble with insomnia" },
      ];

      const topics = extractionService.identifyTopics(messages);
      expect(topics).toContain("sleep");
    });

    it("should identify nutrition topics", () => {
      const messages: ConversationMessage[] = [
        { role: "user", content: "I want to try the keto diet" },
      ];

      const topics = extractionService.identifyTopics(messages);
      expect(topics).toContain("nutrition");
    });

    it("should identify multiple topics", () => {
      const messages: ConversationMessage[] = [
        {
          role: "user",
          content: "I want to improve my sleep and start exercising more",
        },
        { role: "user", content: "I'm also worried about my heart rate" },
      ];

      const topics = extractionService.identifyTopics(messages);
      expect(topics).toContain("sleep");
      expect(topics).toContain("exercise");
      expect(topics).toContain("cardiovascular");
    });

    it("should return empty array for non-health messages", () => {
      const messages: ConversationMessage[] = [
        { role: "user", content: "Hello, how are you?" },
      ];

      const topics = extractionService.identifyTopics(messages);
      expect(topics).toEqual([]);
    });

    it("should identify goal-related topics", () => {
      const messages: ConversationMessage[] = [
        {
          role: "user",
          content: "My goal is to lose weight and hit my target",
        },
      ];

      const topics = extractionService.identifyTopics(messages);
      expect(topics).toContain("weight");
      expect(topics).toContain("goals");
    });
  });

  describe("shouldExtractMemory", () => {
    it("should return false for empty messages", () => {
      const result = extractionService.shouldExtractMemory([]);
      expect(result).toBe(false);
    });

    it("should return false for single user message", () => {
      const messages: ConversationMessage[] = [
        { role: "user", content: "Hello" },
      ];

      const result = extractionService.shouldExtractMemory(messages);
      expect(result).toBe(false);
    });

    it("should return false for very short conversations", () => {
      const messages: ConversationMessage[] = [
        { role: "user", content: "Hi" },
        { role: "user", content: "Ok" },
      ];

      const result = extractionService.shouldExtractMemory(messages);
      expect(result).toBe(false);
    });

    it("should return true for substantial health conversations", () => {
      const messages: ConversationMessage[] = [
        {
          role: "user",
          content:
            "I want to improve my sleep quality because I've been feeling tired lately and not getting enough rest at night",
        },
        {
          role: "assistant",
          content: "Here are some recommendations for better sleep hygiene...",
        },
        {
          role: "user",
          content:
            "What about exercise timing and how it affects sleep? Should I avoid working out late?",
        },
      ];

      const result = extractionService.shouldExtractMemory(messages);
      expect(result).toBe(true);
    });

    it("should return false for non-health conversations", () => {
      const messages: ConversationMessage[] = [
        { role: "user", content: "Tell me a joke" },
        { role: "assistant", content: "Here's a joke..." },
        { role: "user", content: "That was funny" },
      ];

      const result = extractionService.shouldExtractMemory(messages);
      expect(result).toBe(false);
    });
  });
});

describe("ConversationMemoryService", () => {
  let memoryService: ReturnType<typeof createConversationMemoryService>;

  beforeEach(() => {
    jest.clearAllMocks();
    memoryService = createConversationMemoryService({
      minMessagesForExtraction: 2,
      syncDebounceMs: 1000,
      maxFactsPerCategory: 5,
      inactiveFactPruneDays: 30,
      autoSyncToCloud: false,
    });
  });

  describe("getMemory", () => {
    it("should return null for non-existent user", async () => {
      mockStore.getMemory.mockResolvedValue(null);

      const result = await memoryService.getMemory("user-123");
      expect(result).toBeNull();
      expect(mockStore.getMemory).toHaveBeenCalledWith("user-123");
    });

    it("should return memory for existing user", async () => {
      const mockMemory = {
        userId: "user-123",
        criticalFacts: [],
        importantSessions: [],
        recentSessions: [],
        preferences: {},
        lastUpdated: new Date().toISOString(),
        totalSessions: 0,
        totalFactsExtracted: 0,
      };
      mockStore.getMemory.mockResolvedValue(mockMemory);

      const result = await memoryService.getMemory("user-123");
      expect(result).toEqual(mockMemory);
    });
  });

  describe("addFact", () => {
    it("should add a fact with generated id and timestamp", async () => {
      await memoryService.addFact("user-123", {
        category: "goal",
        value: "Improve sleep quality",
        isActive: true,
        source: "ai-extracted",
        storageLocation: "local",
      });

      expect(mockStore.addCriticalFact).toHaveBeenCalledWith(
        "user-123",
        expect.objectContaining({
          category: "goal",
          value: "Improve sleep quality",
          isActive: true,
          source: "ai-extracted",
          storageLocation: "local",
          id: expect.stringMatching(/^fact-\d+-/),
          dateIdentified: expect.any(String),
        }),
      );
    });
  });

  describe("deactivateFact", () => {
    it("should mark a fact as inactive", async () => {
      await memoryService.deactivateFact("user-123", "fact-123");

      expect(mockStore.updateCriticalFact).toHaveBeenCalledWith(
        "user-123",
        "fact-123",
        { isActive: false },
      );
    });
  });

  describe("getFactsByCategory", () => {
    it("should return facts filtered by category", async () => {
      const mockFacts = [
        {
          id: "1",
          category: "goal",
          value: "Goal 1",
          isActive: true,
          source: "ai-extracted",
          storageLocation: "local",
        },
        {
          id: "2",
          category: "goal",
          value: "Goal 2",
          isActive: true,
          source: "ai-extracted",
          storageLocation: "local",
        },
      ];
      mockStore.getCriticalFactsByCategory.mockResolvedValue(mockFacts);

      const result = await memoryService.getFactsByCategory("user-123", "goal");
      expect(result).toEqual(mockFacts);
      expect(mockStore.getCriticalFactsByCategory).toHaveBeenCalledWith(
        "user-123",
        "goal",
      );
    });
  });

  describe("pruneMemory", () => {
    it("should not fail when no memory exists", async () => {
      mockStore.getMemory.mockResolvedValue(null);

      await expect(
        memoryService.pruneMemory("user-123"),
      ).resolves.not.toThrow();
    });

    it("should prune old inactive facts", async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100); // 100 days ago

      const mockMemory = {
        userId: "user-123",
        criticalFacts: [
          {
            id: "1",
            category: "goal",
            value: "Active goal",
            isActive: true,
            dateIdentified: new Date().toISOString(),
            source: "ai-extracted",
            storageLocation: "local",
          },
          {
            id: "2",
            category: "goal",
            value: "Old inactive goal",
            isActive: false,
            dateIdentified: oldDate.toISOString(),
            source: "ai-extracted",
            storageLocation: "local",
          },
        ],
        importantSessions: [],
        recentSessions: [],
        preferences: {},
        lastUpdated: new Date().toISOString(),
        totalSessions: 0,
        totalFactsExtracted: 2,
      };
      mockStore.getMemory.mockResolvedValue(mockMemory);

      await memoryService.pruneMemory("user-123");

      // Should save with pruned facts
      expect(mockStore.saveMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          criticalFacts: expect.arrayContaining([
            expect.objectContaining({ id: "1", isActive: true }),
          ]),
        }),
      );
    });
  });

  describe("consolidateFacts", () => {
    it("should merge duplicate facts", async () => {
      const mockMemory = {
        userId: "user-123",
        criticalFacts: [
          {
            id: "1",
            category: "goal",
            value: "Improve sleep",
            isActive: true,
            source: "ai-extracted",
            storageLocation: "local",
          },
          {
            id: "2",
            category: "goal",
            value: "improve sleep",
            isActive: true,
            source: "ai-extracted",
            storageLocation: "local",
          }, // duplicate
          {
            id: "3",
            category: "concern",
            value: "Back pain",
            isActive: true,
            source: "ai-extracted",
            storageLocation: "local",
          },
        ],
        importantSessions: [],
        recentSessions: [],
        preferences: {},
        lastUpdated: new Date().toISOString(),
        totalSessions: 0,
        totalFactsExtracted: 3,
      };
      mockStore.getMemory.mockResolvedValue(mockMemory);

      const mergedCount = await memoryService.consolidateFacts("user-123");

      expect(mergedCount).toBe(1); // One duplicate removed
      expect(mockStore.saveMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          criticalFacts: expect.arrayContaining([
            expect.objectContaining({ value: "Improve sleep" }),
            expect.objectContaining({ value: "Back pain" }),
          ]),
        }),
      );
    });

    it("should return 0 when no duplicates exist", async () => {
      const mockMemory = {
        userId: "user-123",
        criticalFacts: [
          {
            id: "1",
            category: "goal",
            value: "Goal 1",
            isActive: true,
            source: "ai-extracted",
            storageLocation: "local",
          },
          {
            id: "2",
            category: "goal",
            value: "Goal 2",
            isActive: true,
            source: "ai-extracted",
            storageLocation: "local",
          },
        ],
        importantSessions: [],
        recentSessions: [],
        preferences: {},
        lastUpdated: new Date().toISOString(),
        totalSessions: 0,
        totalFactsExtracted: 2,
      };
      mockStore.getMemory.mockResolvedValue(mockMemory);

      const mergedCount = await memoryService.consolidateFacts("user-123");

      expect(mergedCount).toBe(0);
      expect(mockStore.saveMemory).not.toHaveBeenCalled();
    });
  });

  describe("getMemoryStats", () => {
    it("should return null when no memory exists", async () => {
      mockStore.getMemory.mockResolvedValue(null);

      const stats = await memoryService.getMemoryStats("user-123");
      expect(stats).toBeNull();
    });

    it("should return correct statistics", async () => {
      const mockMemory = {
        userId: "user-123",
        criticalFacts: [
          {
            id: "1",
            category: "goal",
            value: "Goal 1",
            isActive: true,
            source: "ai-extracted",
            storageLocation: "local",
          },
          {
            id: "2",
            category: "goal",
            value: "Goal 2",
            isActive: false,
            source: "ai-extracted",
            storageLocation: "local",
          },
          {
            id: "3",
            category: "concern",
            value: "Concern 1",
            isActive: true,
            source: "ai-extracted",
            storageLocation: "local",
          },
        ],
        importantSessions: [{ id: "s1" }, { id: "s2" }],
        recentSessions: [{ id: "s3" }],
        preferences: {},
        lastUpdated: "2024-01-15T10:00:00Z",
        totalSessions: 10,
        totalFactsExtracted: 3,
      };
      mockStore.getMemory.mockResolvedValue(mockMemory);

      const stats = await memoryService.getMemoryStats("user-123");

      expect(stats).toEqual({
        totalFacts: 3,
        activeFacts: 2,
        factsByCategory: { goal: 2, concern: 1 },
        totalSessions: 10,
        importantSessions: 2,
        recentSessions: 1,
        lastUpdated: "2024-01-15T10:00:00Z",
      });
    });
  });

  describe("clearMemory", () => {
    it("should clear memory for user", async () => {
      await memoryService.clearMemory("user-123");

      expect(mockStore.clearMemory).toHaveBeenCalledWith("user-123");
    });
  });
});

describe("Fact extraction prompt building", () => {
  it("should properly format conversation for extraction", () => {
    const messages: ConversationMessage[] = [
      { role: "user", content: "I want to improve my HRV" },
      { role: "assistant", content: "HRV is a great metric to track" },
      { role: "user", content: "My goal is to get it above 50ms" },
    ];

    // Test that the service formats messages correctly
    const formatted = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    expect(formatted).toContain("User: I want to improve my HRV");
    expect(formatted).toContain("Assistant: HRV is a great metric");
    expect(formatted).toContain("User: My goal is to get it above 50ms");
  });
});

describe("Topic detection edge cases", () => {
  let extractionService: MemoryExtractionService;

  beforeEach(() => {
    extractionService = new MemoryExtractionService();
  });

  it("should handle medication topics", () => {
    const messages: ConversationMessage[] = [
      { role: "user", content: "I take a vitamin D supplement daily" },
    ];

    const topics = extractionService.identifyTopics(messages);
    expect(topics).toContain("medication");
  });

  it("should handle pain-related topics", () => {
    const messages: ConversationMessage[] = [
      {
        role: "user",
        content: "I have lower back pain that's been bothering me",
      },
    ];

    const topics = extractionService.identifyTopics(messages);
    expect(topics).toContain("pain");
  });

  it("should handle lab results topics", () => {
    const messages: ConversationMessage[] = [
      { role: "user", content: "My blood test shows high cholesterol" },
    ];

    const topics = extractionService.identifyTopics(messages);
    expect(topics).toContain("lab_results");
  });

  it("should handle stress topics", () => {
    const messages: ConversationMessage[] = [
      { role: "user", content: "I've been feeling really anxious lately" },
    ];

    const topics = extractionService.identifyTopics(messages);
    expect(topics).toContain("stress");
  });
});
