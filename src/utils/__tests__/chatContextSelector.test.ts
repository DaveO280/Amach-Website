import {
  buildPromptMessages,
  isTopicShift,
  tokenizeForTopic,
} from "../chatContextSelector";

describe("chatContextSelector", () => {
  test("tokenizeForTopic drops stopwords and short tokens", () => {
    const t = tokenizeForTopic("I have a big question about my sleep and HRV.");
    expect(t).toContain("sleep");
    expect(t).toContain("hrv");
    expect(t).not.toContain("have");
    expect(t).not.toContain("my");
  });

  test("isTopicShift detects a big topic change", () => {
    const shift = isTopicShift({
      newMessage: "Let's talk about cholesterol and apolipoprotein B.",
      recentThreadText:
        "My sleep was bad and HRV dropped. Resting heart rate up.",
    });
    expect(shift).toBe(true);
  });

  test("isTopicShift treats short acknowledgements as continuation", () => {
    const shift = isTopicShift({
      newMessage: "yeah, please",
      recentThreadText:
        "User: So much of keto involves meats, what percentage should i keep processed meats to?\nCosaint: Would you like some suggestions for keto-friendly unprocessed protein alternatives?",
    });
    expect(shift).toBe(false);
  });

  test("buildPromptMessages uses fewer turns on new topic", () => {
    const threadMessages = Array.from({ length: 30 }).map((_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `msg-${i} about sleep`,
      timestamp: new Date().toISOString(),
    }));
    const newUserMessage = {
      role: "user" as const,
      content: "Cholesterol question",
      timestamp: new Date().toISOString(),
    };

    const same = buildPromptMessages({
      threadMessages,
      newUserMessage,
      sameTopic: true,
      maxTurnsSameTopic: 16,
      maxTurnsNewTopic: 4,
      maxChars: 99999,
    });
    const diff = buildPromptMessages({
      threadMessages,
      newUserMessage,
      sameTopic: false,
      maxTurnsSameTopic: 16,
      maxTurnsNewTopic: 4,
      maxChars: 99999,
    });

    expect(same.length).toBeGreaterThan(diff.length);
    expect(diff.length).toBeLessThanOrEqual(5); // 4 + new user message
  });
});
