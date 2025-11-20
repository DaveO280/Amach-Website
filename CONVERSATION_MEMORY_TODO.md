# 🔔 Conversation Memory Integration - TODO

**Status:** Foundation built, integration pending  
**Priority:** After searchable encryption testing

---

## ✅ What's Already Built

### 1. IndexedDB Store (`src/data/store/conversationMemoryStore.ts`)

- ✅ Save/retrieve conversation memory per user
- ✅ Store critical facts (medications, conditions, allergies, surgeries, goals)
- ✅ Session summaries with importance tiers (critical/high/medium/low)
- ✅ User preferences storage
- ✅ Tiered memory (important sessions kept longer)

### 2. Type Definitions (`src/types/conversationMemory.ts`)

- ✅ ConversationMemory interface
- ✅ CriticalFact interface
- ✅ SessionSummary interface
- ✅ UserPreferences interface

### 3. Blockchain Contract

- ✅ Health timeline events with searchable encryption
- ✅ Ready to store critical facts as immutable events

---

## ❌ What's Not Yet Integrated

### 1. AI Chat Integration (`src/store/aiStore.tsx`)

**Needed:**

```typescript
// On chat session start
await conversationMemoryStore.initialize();
const memory = await conversationMemoryStore.getMemory(userId);

// Include memory in prompts
const relevantFacts = memory.criticalFacts.filter((f) => f.isActive);
const recentSessions = memory.recentSessions;

// After each AI response
const extractedFacts = extractCriticalFacts(aiResponse);
for (const fact of extractedFacts) {
  await conversationMemoryStore.addCriticalFact(userId, fact);
}

// On session end
const summary = await generateSessionSummary(messages);
await conversationMemoryStore.addSessionSummary(userId, summary);
```

### 2. Prompt Context (`src/services/CosaintAiService.ts`)

**Needed:**

```typescript
// Build system prompt with conversation context
const buildPromptWithMemory = (memory: ConversationMemory) => {
  const criticalFactsPrompt = memory.criticalFacts
    .filter((f) => f.isActive)
    .map((f) => `- ${f.category}: ${f.value}`)
    .join("\n");

  const recentContextPrompt = memory.recentSessions
    .map((s) => `Previous discussion: ${s.summary}`)
    .join("\n");

  return `
    PATIENT CRITICAL INFORMATION:
    ${criticalFactsPrompt}

    RECENT CONVERSATION CONTEXT:
    ${recentContextPrompt}

    [rest of prompt...]
  `;
};
```

### 3. Fact Extraction Logic

**Needed:**

```typescript
// Parse AI responses for critical health facts
const extractCriticalFacts = (aiResponse: string): CriticalFact[] => {
  const facts: CriticalFact[] = [];

  // Detect medications
  const medicationPatterns = [
    /taking ([A-Z][a-z]+)/g,
    /prescribed ([A-Z][a-z]+)/g,
  ];

  // Detect conditions
  const conditionPatterns = [/diagnosed with ([a-z ]+)/gi, /have ([a-z ]+)/gi];

  // Extract and structure facts...
  return facts;
};
```

### 4. Blockchain Save Prompt UI

**Needed:**

```typescript
// Prompt user when critical facts detected
const BlockchainSavePrompt = ({ facts }: { facts: CriticalFact[] }) => {
  return (
    <Dialog>
      <DialogTitle>Save Critical Health Information?</DialogTitle>
      <DialogContent>
        <p>We detected important health information:</p>
        <ul>
          {facts.map(f => (
            <li key={f.id}>{f.category}: {f.value}</li>
          ))}
        </ul>
        <p>Would you like to save this to the blockchain for permanent, verifiable storage?</p>
      </DialogContent>
      <DialogActions>
        <Button onClick={saveToBlockchain}>Save to Blockchain</Button>
        <Button onClick={keepLocal}>Keep Local Only</Button>
      </DialogActions>
    </Dialog>
  );
};
```

### 5. Session Summarization

**Needed:**

```typescript
// Generate summary after conversation ends
const generateSessionSummary = async (
  messages: Message[],
): Promise<SessionSummary> => {
  // Use AI to summarize the conversation
  const summary = await veniceApi.generateSummary({
    messages,
    instruction: "Summarize this health conversation in 2-3 sentences",
  });

  // Determine importance
  const importance = determineImportance(messages);

  return {
    id: generateId(),
    timestamp: new Date().toISOString(),
    summary,
    importance,
    messageCount: messages.length,
    topics: extractTopics(messages),
  };
};
```

---

## 📋 Integration Checklist

### Phase 1: Basic Memory

- [ ] Initialize conversation memory store in `aiStore.tsx`
- [ ] Load existing memory on chat session start
- [ ] Include critical facts in AI prompts
- [ ] Include recent session summaries in prompts

### Phase 2: Fact Extraction

- [ ] Parse AI responses for medications
- [ ] Parse AI responses for conditions
- [ ] Parse AI responses for allergies
- [ ] Parse AI responses for surgeries
- [ ] Parse AI responses for health goals
- [ ] Save extracted facts to IndexedDB

### Phase 3: Blockchain Integration

- [ ] Build "Save to Blockchain" prompt UI
- [ ] Detect when critical facts need blockchain save
- [ ] Generate search tags for fact types
- [ ] Save facts as health timeline events
- [ ] Mark facts as "saved to blockchain" in memory

### Phase 4: Session Management

- [ ] Auto-generate session summaries
- [ ] Determine session importance
- [ ] Prune old low-importance sessions
- [ ] Keep critical sessions indefinitely

### Phase 5: Memory Management UI

- [ ] Build memory dashboard
- [ ] Show all stored facts
- [ ] Edit/delete facts
- [ ] View session history
- [ ] Manage blockchain sync status

---

## 🎯 Benefits After Integration

### For Users:

- ✅ AI remembers previous conversations
- ✅ No need to repeat medications/conditions
- ✅ Consistent context across sessions
- ✅ Optional blockchain backup for critical info

### For AI Quality:

- ✅ Better personalized responses
- ✅ Avoids asking repeated questions
- ✅ Understands long-term health journey
- ✅ More accurate recommendations

### For Privacy:

- ✅ User controls what's saved to blockchain
- ✅ Local memory can be cleared anytime
- ✅ Blockchain facts use searchable encryption
- ✅ Selective disclosure to doctors possible

---

## ⏰ Reminder

**After testing searchable encryption:**

1. Review this file
2. Decide integration priority
3. Implement in phases
4. Test with real conversations

**Estimated Time:** 4-6 hours for full integration

---

**Current Focus:** Test searchable encryption deployment 🚀  
**Next Focus:** Integrate conversation memory 💬
