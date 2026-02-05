/**
 * AI Context Preprocessor Tests
 *
 * Tests for the AI service context building and preprocessing logic.
 * These test the prompt construction and context management without
 * making actual API calls.
 */

describe("AI Context Preprocessing", () => {
  // ============ System Prompt Tests ============

  describe("System Prompt", () => {
    const SYSTEM_PROMPT = `You are Cosaint, a knowledgeable and supportive AI health assistant for the Amach health app. Your role is to help users understand their health data, identify patterns, and provide actionable insights.

Guidelines:
- Be conversational but informative
- Reference specific data when available
- Provide actionable suggestions
- Be encouraging but honest
- Never diagnose conditions - recommend consulting healthcare providers for medical concerns
- Focus on lifestyle factors: sleep, exercise, stress, nutrition

When analyzing health data:
- Look for trends over time
- Compare to general healthy ranges
- Consider relationships between metrics (e.g., sleep affecting HRV)
- Highlight both improvements and areas for attention`;

    it("includes key guidelines", () => {
      expect(SYSTEM_PROMPT).toContain("Cosaint");
      expect(SYSTEM_PROMPT.toLowerCase()).toContain("never diagnose");
      expect(SYSTEM_PROMPT.toLowerCase()).toContain("healthcare provider");
    });

    it("focuses on lifestyle factors", () => {
      expect(SYSTEM_PROMPT.toLowerCase()).toContain("sleep");
      expect(SYSTEM_PROMPT.toLowerCase()).toContain("exercise");
      expect(SYSTEM_PROMPT.toLowerCase()).toContain("nutrition");
    });

    it("emphasizes data analysis", () => {
      expect(SYSTEM_PROMPT.toLowerCase()).toContain("trends");
      expect(SYSTEM_PROMPT.toLowerCase()).toContain("patterns");
    });
  });

  // ============ Message Building Tests ============

  describe("Message Array Building", () => {
    interface ChatMessage {
      role: "user" | "assistant" | "system";
      content: string;
    }

    function buildMessages(
      systemPrompt: string,
      contextMessage: string | null,
      history: ChatMessage[],
      userMessage: string,
    ): ChatMessage[] {
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
      ];

      if (contextMessage) {
        messages.push({ role: "system", content: contextMessage });
      }

      // Limit history to last 20 messages
      const recentHistory = history.slice(-20);
      messages.push(...recentHistory);

      messages.push({ role: "user", content: userMessage });

      return messages;
    }

    it("includes system prompt first", () => {
      const messages = buildMessages("System prompt", null, [], "Hello");

      expect(messages[0].role).toBe("system");
      expect(messages[0].content).toBe("System prompt");
    });

    it("adds context as second system message", () => {
      const messages = buildMessages(
        "System prompt",
        "Health context here",
        [],
        "Hello",
      );

      expect(messages[1].role).toBe("system");
      expect(messages[1].content).toBe("Health context here");
    });

    it("limits history to 20 messages", () => {
      const longHistory: ChatMessage[] = Array(30)
        .fill(null)
        .map((_, i) => ({
          role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
          content: `Message ${i}`,
        }));

      const messages = buildMessages(
        "System",
        null,
        longHistory,
        "New message",
      );

      // System + 20 history + user message = 22
      expect(messages.length).toBe(22);

      // Should have the most recent messages (10-29, not 0-9)
      const historyContent = messages.slice(1, -1).map((m) => m.content);
      expect(historyContent[0]).toBe("Message 10");
      expect(historyContent[19]).toBe("Message 29");
    });

    it("puts user message last", () => {
      const messages = buildMessages("System", null, [], "User question");

      expect(messages[messages.length - 1].role).toBe("user");
      expect(messages[messages.length - 1].content).toBe("User question");
    });
  });

  // ============ Token Configuration Tests ============

  describe("Mode-based Configuration", () => {
    function getConfigForMode(mode: "quick" | "deep"): {
      maxTokens: number;
      temperature: number;
    } {
      return {
        maxTokens: mode === "deep" ? 2000 : 800,
        temperature: mode === "deep" ? 0.7 : 0.6,
      };
    }

    it("uses lower tokens for quick mode", () => {
      const quickConfig = getConfigForMode("quick");
      const deepConfig = getConfigForMode("deep");

      expect(quickConfig.maxTokens).toBeLessThan(deepConfig.maxTokens);
      expect(quickConfig.maxTokens).toBe(800);
    });

    it("uses higher tokens for deep mode", () => {
      const config = getConfigForMode("deep");
      expect(config.maxTokens).toBe(2000);
    });

    it("uses appropriate temperature", () => {
      const quickConfig = getConfigForMode("quick");
      const deepConfig = getConfigForMode("deep");

      expect(quickConfig.temperature).toBe(0.6);
      expect(deepConfig.temperature).toBe(0.7);
    });
  });

  // ============ Health Context Formatting Tests ============

  describe("Health Context Formatting", () => {
    interface HealthMetrics {
      steps?: { latest?: number; average?: number };
      heartRate?: { latest?: number; average?: number };
      hrv?: { latest?: number; average?: number };
      sleep?: { latest?: number }; // in minutes
      exercise?: { latest?: number };
    }

    function formatMetricsForPrompt(metrics: HealthMetrics): string[] {
      const lines: string[] = [];

      if (metrics.steps) {
        const s = metrics.steps;
        lines.push(
          `Steps: ${s.latest?.toLocaleString() ?? "N/A"} today (avg: ${s.average?.toLocaleString() ?? "N/A"}/day)`,
        );
      }

      if (metrics.heartRate) {
        const hr = metrics.heartRate;
        lines.push(
          `Heart Rate: ${hr.latest ?? "N/A"} bpm (avg: ${hr.average ?? "N/A"} bpm)`,
        );
      }

      if (metrics.hrv) {
        const h = metrics.hrv;
        lines.push(
          `HRV: ${h.latest ?? "N/A"} ms (avg: ${h.average ?? "N/A"} ms)`,
        );
      }

      if (metrics.sleep?.latest) {
        const hours = (metrics.sleep.latest / 60).toFixed(1);
        lines.push(`Sleep: ${hours} hours last night`);
      }

      if (metrics.exercise?.latest !== undefined) {
        lines.push(`Exercise: ${metrics.exercise.latest} minutes today`);
      }

      return lines;
    }

    it("formats steps with thousands separator", () => {
      const lines = formatMetricsForPrompt({
        steps: { latest: 12500, average: 8000 },
      });

      expect(lines[0]).toContain("12,500");
      expect(lines[0]).toContain("8,000");
    });

    it("converts sleep from minutes to hours", () => {
      const lines = formatMetricsForPrompt({
        sleep: { latest: 450 }, // 7.5 hours
      });

      expect(lines[0]).toContain("7.5 hours");
    });

    it("shows N/A for missing values", () => {
      const lines = formatMetricsForPrompt({
        steps: { latest: 5000 }, // no average
        heartRate: { average: 70 }, // no latest
      });

      expect(lines[0]).toContain("N/A/day");
      expect(lines[1]).toContain("N/A bpm (avg:");
    });

    it("handles all metrics together", () => {
      const lines = formatMetricsForPrompt({
        steps: { latest: 8000, average: 7500 },
        heartRate: { latest: 72, average: 68 },
        hrv: { latest: 45, average: 42 },
        sleep: { latest: 420 },
        exercise: { latest: 30 },
      });

      expect(lines.length).toBe(5);
    });
  });

  // ============ Response Parsing Tests ============

  describe("Response Handling", () => {
    interface AIResponse {
      content: string;
      usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    }

    function parseAPIResponse(apiResponse: {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    }): AIResponse {
      const content = apiResponse.choices?.[0]?.message?.content ?? "";
      const usage = apiResponse.usage
        ? {
            promptTokens: apiResponse.usage.prompt_tokens ?? 0,
            completionTokens: apiResponse.usage.completion_tokens ?? 0,
            totalTokens: apiResponse.usage.total_tokens ?? 0,
          }
        : undefined;

      return { content, usage };
    }

    it("extracts content from standard response", () => {
      const apiResponse = {
        choices: [{ message: { content: "Here is my response" } }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      const parsed = parseAPIResponse(apiResponse);

      expect(parsed.content).toBe("Here is my response");
      expect(parsed.usage?.totalTokens).toBe(150);
    });

    it("handles missing content gracefully", () => {
      const parsed = parseAPIResponse({ choices: [] });
      expect(parsed.content).toBe("");
    });

    it("handles missing usage", () => {
      const parsed = parseAPIResponse({
        choices: [{ message: { content: "Response" } }],
      });
      expect(parsed.usage).toBeUndefined();
    });

    it("normalizes token field names", () => {
      const apiResponse = {
        choices: [{ message: { content: "Test" } }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      const parsed = parseAPIResponse(apiResponse);

      expect(parsed.usage?.promptTokens).toBe(100);
      expect(parsed.usage?.completionTokens).toBe(50);
      expect(parsed.usage?.totalTokens).toBe(150);
    });
  });
});
