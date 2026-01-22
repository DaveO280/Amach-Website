export type ChatRole = "user" | "assistant";

export type ChatMessageForContext = {
  role: ChatRole;
  content: string;
  timestamp: string; // ISO
};

const STOPWORDS = new Set(
  [
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "for",
    "from",
    "has",
    "have",
    "i",
    "if",
    "in",
    "into",
    "is",
    "it",
    "its",
    "me",
    "my",
    "of",
    "on",
    "or",
    "our",
    "so",
    "that",
    "the",
    "their",
    "then",
    "there",
    "these",
    "they",
    "this",
    "to",
    "we",
    "what",
    "when",
    "where",
    "which",
    "with",
    "you",
    "your",
  ].map((s) => s.toLowerCase()),
);

export function tokenizeForTopic(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 3)
    .filter((t) => !STOPWORDS.has(t));
}

export function extractTopKeywords(text: string, maxKeywords = 12): string[] {
  const tokens = tokenizeForTopic(text);
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([k]) => k);
}

export function jaccardSimilarity(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function isTopicShift(params: {
  newMessage: string;
  recentThreadText: string;
  minSimilarity?: number;
}): boolean {
  // Short acknowledgements like "yeah, please" are almost always continuations.
  // Without this, keyword-based similarity can incorrectly start a new thread and drop context.
  const trimmed = params.newMessage.trim().toLowerCase();
  const isAcknowledgement =
    trimmed.length <= 32 &&
    /^(y|yes|yeah|yep|sure|ok|okay|please|pls|go ahead|sounds good|thanks|thank you)\b/.test(
      trimmed,
    );
  if (isAcknowledgement) return false;

  // Continuation cues: even if keywords differ, the user is referring to prior context.
  // This prevents splitting threads when the user says "that timeframe/period" etc.
  const continuationCue =
    /\b(that timeframe|that time frame|that period|same timeframe|same period|during that time|as above|as we discussed|based on that|in that window|that window|previous (?:one|message|answer)|earlier (?:one|message|answer))\b/i.test(
      params.newMessage,
    );
  if (continuationCue) return false;

  const minSim =
    typeof params.minSimilarity === "number" ? params.minSimilarity : 0.12;
  const newKw = extractTopKeywords(params.newMessage);
  const recentKw = extractTopKeywords(params.recentThreadText);
  const sim = jaccardSimilarity(newKw, recentKw);
  return sim < minSim;
}

export function buildPromptMessages(params: {
  threadMessages: ChatMessageForContext[];
  newUserMessage: ChatMessageForContext;
  sameTopic: boolean;
  maxTurnsSameTopic?: number;
  maxTurnsNewTopic?: number;
  maxChars?: number;
  includeNewMessage?: boolean;
}): Array<{ role: ChatRole; content: string }> {
  const maxTurnsSame = params.maxTurnsSameTopic ?? 16; // turns = messages
  const maxTurnsNew = params.maxTurnsNewTopic ?? 4;
  const maxChars = params.maxChars ?? 4000;
  const includeNew = params.includeNewMessage ?? true;

  const takeN = params.sameTopic ? maxTurnsSame : maxTurnsNew;
  const base = params.threadMessages.slice(-takeN);
  const combined = includeNew ? [...base, params.newUserMessage] : base;

  // Enforce a hard character budget (oldest-first trimming).
  const out: Array<{ role: ChatRole; content: string }> = [];
  let total = 0;
  for (let i = combined.length - 1; i >= 0; i--) {
    const m = combined[i]!;
    const len = m.content.length;
    if (out.length > 0 && total + len > maxChars) break;
    out.push({ role: m.role, content: m.content });
    total += len;
  }

  return out.reverse();
}
