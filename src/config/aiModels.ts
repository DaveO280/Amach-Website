/**
 * Central AI model registry — single source of truth for which Venice model
 * each workload uses. Replaces ~15 copy-pasted `"zai-org-glm-4.7"` literals.
 *
 * WHY THIS EXISTS
 * Venice now offers TEE / E2EE models that run inside a hardware-attested
 * enclave the GPU host cannot read (provider: Phala), verified per-response via
 * `x-venice-tee` headers. Amach's health data is exactly what belongs there.
 * This registry moves the conversational + memory tiers onto enclave models,
 * each behind a FALLBACK CHAIN (enclave pool capacity fluctuates — overload
 * returns HTTP 429), degrading to the legacy non-TEE model as a last resort.
 *
 * VERIFIED BEHAVIOR (2026-07-07, live calls):
 *  - Enclave models honor `venice_parameters.strip_thinking_response`,
 *    `include_venice_system_prompt`, `disable_thinking` (all 200).
 *  - Enclave models REJECT `response_format` (HTTP 400 "not supported by this
 *    model") and their strict validator 400s on any unknown top-level key.
 *    => JSON-mode report parsers (parseText) and the vision model stay non-TEE
 *       for now; migrating them needs response_format removed + re-tested
 *       against the report fixtures. Tracked as a follow-up, not this change.
 *  - e2ee-glm-5-2-p and e2ee-qwen3-30b-a3b-p tested reliable; e2ee-glm-4-7-p and
 *    the enclave vision model were chronically overloaded — excluded from chains.
 */

export const ENCLAVE_PREFIX = "e2ee-";

/** Verified-working model IDs (see header). */
export const MODELS = {
  enclaveFlagship: "e2ee-glm-5-2-p", // 524K ctx, best reasoning, TEE+E2EE
  enclaveFast: "e2ee-qwen3-30b-a3b-p", // 256K ctx, fast, TEE+E2EE
  legacy: "zai-org-glm-4.7", // non-TEE, response_format-capable
  vision: "qwen3-vl-235b-a22b", // non-TEE vision (enclave vision is 429-bound)
} as const;

export type ModelTier =
  | "chat" // Luma conversational + final synthesis (quality-first)
  | "agent" // multi-agent fan-out (speed-first, many parallel calls)
  | "memory" // conversation-memory extraction (frequent, cheap)
  | "parseText" // report text extraction — uses response_format (JSON mode)
  | "parseVision"; // report page vision passes

/** True for TEE/E2EE enclave models. */
export function isEnclaveModel(model: string): boolean {
  return model.startsWith(ENCLAVE_PREFIX);
}

/** Enclave models reject OpenAI-style `response_format`. */
export function supportsResponseFormat(model: string): boolean {
  return !isEnclaveModel(model);
}

function env(name: string): string | undefined {
  const v = typeof process !== "undefined" ? process.env[name] : undefined;
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * Legacy global override. If ops set NEXT_PUBLIC_VENICE_MODEL_NAME (the var the
 * old code read everywhere), it PINS the primary of the conversational tiers —
 * an emergency escape hatch that also preserves prior behavior for any
 * deployment that already sets it. Unset ⇒ enclave chains apply.
 */
const GLOBAL_PIN = env("NEXT_PUBLIC_VENICE_MODEL_NAME");

/** Ordered fallback chains (primary first). Undefined entries are dropped. */
const TIER_CHAINS: Record<ModelTier, Array<string | undefined>> = {
  chat: [
    GLOBAL_PIN,
    env("VENICE_CHAT_MODEL"),
    MODELS.enclaveFlagship,
    MODELS.enclaveFast,
    MODELS.legacy,
  ],
  agent: [
    GLOBAL_PIN,
    env("VENICE_AGENT_MODEL"),
    MODELS.enclaveFast,
    MODELS.enclaveFlagship,
    MODELS.legacy,
  ],
  memory: [
    GLOBAL_PIN,
    env("VENICE_MEMORY_MODEL"),
    MODELS.enclaveFast,
    MODELS.legacy,
  ],
  // Non-TEE: response_format (JSON mode) is unsupported by enclave models.
  parseText: [env("VENICE_PARSE_MODEL"), MODELS.legacy],
  // Non-TEE: enclave vision model is chronically 429.
  parseVision: [env("VENICE_VISION_MODEL_NAME"), MODELS.vision],
};

/** The fallback chain for a tier, de-duplicated, primary first. */
export function getModelChain(tier: ModelTier): string[] {
  const seen = new Set<string>();
  const chain: string[] = [];
  for (const m of TIER_CHAINS[tier]) {
    if (m && !seen.has(m)) {
      seen.add(m);
      chain.push(m);
    }
  }
  return chain;
}

/** The primary (first-choice) model for a tier. */
export function getPrimaryModel(tier: ModelTier): string {
  return getModelChain(tier)[0] ?? MODELS.legacy;
}

/** Every model referenced by any tier — used to validate client-supplied ids. */
export function knownModels(): Set<string> {
  const all = new Set<string>();
  (Object.keys(TIER_CHAINS) as ModelTier[]).forEach((t) =>
    getModelChain(t).forEach((m) => all.add(m)),
  );
  return all;
}
