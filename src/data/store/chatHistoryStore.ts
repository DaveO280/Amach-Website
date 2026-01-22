import { v4 as uuidv4 } from "uuid";
import type { ChatMessageForContext } from "@/utils/chatContextSelector";
import {
  buildPromptMessages,
  isTopicShift,
  tokenizeForTopic,
} from "@/utils/chatContextSelector";

type ThreadId = string;

export type ChatThread = {
  id: ThreadId;
  userId: string;
  createdAt: string; // ISO
  lastMessageAt: string; // ISO
  // lightweight keyword cache to detect topic shifts quickly
  topicKeywords: string[];
  messages: ChatMessageForContext[];
};

const DB_NAME = "amach-chat-history";
const DB_VERSION = 1;
const THREADS_STORE = "threads";

const MAX_THREADS_PER_USER = 10;
const MAX_MESSAGES_PER_THREAD = 250;
const INACTIVITY_NEW_THREAD_MINUTES = 45;

function nowIso(): string {
  return new Date().toISOString();
}

function safeDateMs(iso: string): number {
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function getThreadRecentText(thread: ChatThread, lastMessages = 12): string {
  const slice = thread.messages.slice(-lastMessages);
  return slice.map((m) => m.content).join("\n");
}

function mergeKeywords(existing: string[], nextText: string): string[] {
  // Take a small window of tokens to keep this cheap and stable
  const tokens = tokenizeForTopic(nextText).slice(0, 40);
  const next = new Set([...existing, ...tokens]);
  return Array.from(next).slice(0, 40);
}

export class ChatHistoryStore {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (typeof window === "undefined") return;
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(THREADS_STORE)) {
          const store = db.createObjectStore(THREADS_STORE, { keyPath: "id" });
          store.createIndex("userId", "userId", { unique: false });
          store.createIndex("lastMessageAt", "lastMessageAt", {
            unique: false,
          });
        }
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };
    });

    return this.initPromise;
  }

  private async getDb(): Promise<IDBDatabase> {
    await this.initialize();
    if (!this.db) throw new Error("ChatHistoryStore not initialized");
    return this.db;
  }

  async listThreads(userId: string): Promise<ChatThread[]> {
    if (typeof window === "undefined") return [];
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([THREADS_STORE], "readonly");
      const store = tx.objectStore(THREADS_STORE);
      const index = store.index("userId");
      const req = index.getAll(userId);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const items = (req.result as ChatThread[]) || [];
        items.sort(
          (a, b) => safeDateMs(b.lastMessageAt) - safeDateMs(a.lastMessageAt),
        );
        resolve(items);
      };
    });
  }

  async getLatestThread(userId: string): Promise<ChatThread | null> {
    const threads = await this.listThreads(userId);
    return threads[0] ?? null;
  }

  async getThreadById(threadId: ThreadId): Promise<ChatThread | null> {
    if (typeof window === "undefined") return null;
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([THREADS_STORE], "readonly");
      const store = tx.objectStore(THREADS_STORE);
      const req = store.get(threadId);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve((req.result as ChatThread) || null);
    });
  }

  private async saveThread(thread: ChatThread): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([THREADS_STORE], "readwrite");
      const store = tx.objectStore(THREADS_STORE);
      const req = store.put(thread);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  private async deleteThread(threadId: ThreadId): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([THREADS_STORE], "readwrite");
      const store = tx.objectStore(THREADS_STORE);
      const req = store.delete(threadId);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  private shouldStartNewThread(params: {
    thread: ChatThread | null;
    newUserMessage: string;
  }): boolean {
    const { thread } = params;
    if (!thread) return true;

    const inactivityMs = Date.now() - safeDateMs(thread.lastMessageAt);
    if (inactivityMs > INACTIVITY_NEW_THREAD_MINUTES * 60_000) return true;

    const recentText = getThreadRecentText(thread);
    return isTopicShift({
      newMessage: params.newUserMessage,
      recentThreadText: recentText,
    });
  }

  async appendMessage(params: {
    userId: string;
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
  }): Promise<{
    threadId: ThreadId;
    startedNewThread: boolean;
    previousThreadId?: ThreadId;
  }> {
    if (typeof window === "undefined") {
      return { threadId: "server", startedNewThread: false };
    }

    await this.initialize();

    const ts = params.timestamp ?? nowIso();
    const latest = await this.getLatestThread(params.userId);
    const previousThreadId = latest?.id;
    const newThread =
      params.role === "user" &&
      this.shouldStartNewThread({
        thread: latest,
        newUserMessage: params.content,
      });

    const thread: ChatThread = newThread
      ? {
          id: uuidv4(),
          userId: params.userId,
          createdAt: ts,
          lastMessageAt: ts,
          topicKeywords: tokenizeForTopic(params.content).slice(0, 40),
          messages: [],
        }
      : {
          ...(latest as ChatThread),
        };

    thread.messages = [
      ...thread.messages,
      { role: params.role, content: params.content, timestamp: ts },
    ];
    if (thread.messages.length > MAX_MESSAGES_PER_THREAD) {
      thread.messages = thread.messages.slice(-MAX_MESSAGES_PER_THREAD);
    }
    thread.lastMessageAt = ts;
    thread.topicKeywords = mergeKeywords(thread.topicKeywords, params.content);

    await this.saveThread(thread);

    // Enforce per-user thread cap
    const threads = await this.listThreads(params.userId);
    const extra = threads.slice(MAX_THREADS_PER_USER);
    for (const t of extra) {
      await this.deleteThread(t.id);
    }

    return {
      threadId: thread.id,
      startedNewThread: newThread,
      previousThreadId: newThread ? previousThreadId : undefined,
    };
  }

  async buildConversationHistoryForPrompt(params: {
    userId: string;
    newUserMessage: string;
    maxChars?: number;
  }): Promise<{
    threadId: ThreadId | null;
    sameTopic: boolean;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }> {
    const thread = await this.getLatestThread(params.userId);
    if (!thread) {
      return {
        threadId: null,
        sameTopic: true,
        messages: [{ role: "user", content: params.newUserMessage }],
      };
    }

    const recentText = getThreadRecentText(thread);
    const sameTopic = !isTopicShift({
      newMessage: params.newUserMessage,
      recentThreadText: recentText,
    });

    const selected = buildPromptMessages({
      threadMessages: thread.messages,
      newUserMessage: {
        role: "user",
        content: params.newUserMessage,
        timestamp: nowIso(),
      },
      sameTopic,
      maxChars: params.maxChars ?? 4500,
      // The latest user message is already stored in the thread before we build prompt context.
      // Do not append it again here (CosaintAiService will add the current user message once).
      includeNewMessage: false,
    });

    return { threadId: thread.id, sameTopic, messages: selected };
  }
}

export const chatHistoryStore = new ChatHistoryStore();
