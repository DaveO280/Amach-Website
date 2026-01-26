/**
 * Dev utility: Test whether Venice chat/completions retains session memory across calls
 * when you DO NOT resend conversation history.
 *
 * Run:
 *   pnpm -s tsx scripts/test-venice-session-memory.ts
 *
 * Reads (in this order):
 *   - .env.local (if present)
 *   - .env (if present)
 *   - process environment
 *
 * Required:
 *   VENICE_API_KEY
 *
 * Optional:
 *   NEXT_PUBLIC_VENICE_MODEL_NAME or VENICE_MODEL_NAME
 */
import { config as loadDotenv } from "dotenv";

// Next.js commonly stores secrets in .env.local, but dotenv/config only reads .env by default.
// Load both so this script behaves like your app config.
loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

type VeniceResponse = {
  choices?: Array<{
    message?: { content?: string; reasoning_content?: string };
    finish_reason?: string;
  }>;
  error?: unknown;
};

function short(s: string, n = 200): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + "…";
}

async function callVenice(messages: Array<{ role: string; content: string }>) {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VENICE_API_KEY is not set. Put it in your environment (or .env.local) before running this script.",
    );
  }

  const model =
    process.env.NEXT_PUBLIC_VENICE_MODEL_NAME ||
    process.env.VENICE_MODEL_NAME ||
    "zai-org-glm-4.7";

  const resp = await fetch("https://api.venice.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0,
      max_tokens: 120,
      venice_parameters: {
        // Per Venice docs: disable reasoning mode, and strip any thinking output.
        disable_thinking: true,
        strip_thinking_response: true,
        include_venice_system_prompt: false,
      },
      messages,
    }),
  });

  const json = (await resp.json()) as VeniceResponse;
  if (!resp.ok) {
    throw new Error(
      `Venice HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 300)}`,
    );
  }

  const msg = json?.choices?.[0]?.message;
  const content = String(msg?.content ?? "").trim();
  const reasoning = String(msg?.reasoning_content ?? "").trim();
  return {
    content,
    reasoning,
    finishReason: json?.choices?.[0]?.finish_reason ?? null,
  };
}

async function main() {
  const secret = `alpha-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  console.log("[VeniceSessionMemoryTest] Secret:", secret);

  const first = await callVenice([
    {
      role: "user",
      content: `Reply only with "ACK". Remember this exact string for the *next message in this same conversation*: ${secret}`,
    },
  ]);
  console.log("[Call #1] content:", JSON.stringify(short(first.content)));
  console.log("[Call #1] finish_reason:", first.finishReason);

  // IMPORTANT: Do NOT send any previous messages here.
  const second = await callVenice([
    {
      role: "user",
      content:
        "What exact string did I ask you to remember? Reply only with the string.",
    },
  ]);
  console.log("[Call #2] content:", JSON.stringify(short(second.content)));
  console.log("[Call #2] finish_reason:", second.finishReason);

  const passed = second.content.includes(secret);
  console.log(
    "[VeniceSessionMemoryTest] RESULT:",
    passed
      ? "PASS (stateful across requests)"
      : "FAIL (stateless across requests)",
  );
}

main().catch((e) => {
  console.error("[VeniceSessionMemoryTest] ERROR:", e);
  process.exitCode = 1;
});
