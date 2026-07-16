/**
 * Server-side Venice caller with model fallback + TEE telemetry.
 *
 * Both non-streaming Venice routes (`/api/venice`, `/api/ai/chat`) use this so
 * enclave overload (HTTP 429) or a per-model parameter rejection (HTTP 400)
 * transparently degrades down a model chain instead of failing the user.
 *
 * Records which model actually served and whether it was TEE-attested (read
 * from the `x-venice-tee` response header) so we can watch the enclave-served
 * ratio — the signal for when it's robust enough to build device-side E2EE on.
 *
 * See docs/architecture/13-... N/A; see the AI model registry src/config/aiModels.ts.
 */

import { isEnclaveModel } from "@/config/aiModels";

export interface VeniceFallbackResult {
  /** Parsed Venice JSON response (chat.completion object). */
  data: unknown;
  /** Model that actually produced the response. */
  modelUsed: string;
  /** True if served by a TEE/E2EE enclave (from x-venice-tee header). */
  teeServed: boolean;
  /** TEE provider header, if present (e.g. "phala"). */
  teeProvider: string | null;
  /** True if a model other than the chain's primary served the response. */
  fellBack: boolean;
  /** Per-model attempts, in order, for logging/telemetry. */
  attempts: Array<{ model: string; status: number; ok: boolean }>;
}

/** Retry on these HTTP statuses (overload / capacity / transient upstream). */
function isRetriable(status: number): boolean {
  return status === 429 || status === 503 || status === 502 || status === 500;
}

/**
 * Per-model failures the NEXT model can resolve:
 *  - 400: parameter incompatibility (enclave models reject `response_format`);
 *         the chain ends in the permissive legacy model. A genuinely malformed
 *         body just exhausts the chain and surfaces the last error.
 *  - 404: model renamed/deprecated upstream — fall back rather than hard-fail
 *         chat; the attempts array + telemetry surface the misconfiguration.
 * Auth (401/403) and 413 are NOT here — same outcome on every model.
 */
function isRetriableParamError(status: number): boolean {
  return status === 400 || status === 404;
}

export interface CallVeniceArgs {
  apiKey: string;
  endpoint: string; // e.g. "https://api.venice.ai/api/v1"
  /** Request body WITHOUT `model` — the caller-built payload. */
  baseBody: Record<string, unknown>;
  /** Ordered model fallback chain (primary first). */
  chain: string[];
  /** Label for telemetry logs (e.g. tier name). */
  label: string;
  /** Optional per-request timeout in ms. */
  timeoutMs?: number;
}

export async function callVeniceWithFallback(
  args: CallVeniceArgs,
): Promise<VeniceFallbackResult> {
  const { apiKey, endpoint, baseBody, chain, label, timeoutMs } = args;
  const attempts: VeniceFallbackResult["attempts"] = [];
  let lastErrorText = "";
  let lastStatus = 0;

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const body = { ...baseBody, model };

    const fetchOptions: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    };
    if (timeoutMs) fetchOptions.signal = AbortSignal.timeout(timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${endpoint}/chat/completions`, fetchOptions);
    } catch (err) {
      // Network/timeout — treat as retriable, try next model.
      attempts.push({ model, status: 0, ok: false });
      lastStatus = 0;
      lastErrorText = err instanceof Error ? err.message : String(err);
      continue;
    }

    attempts.push({ model, status: res.status, ok: res.ok });

    if (res.ok) {
      const data = await res.json();
      const teeHeader = res.headers.get("x-venice-tee");
      const teeServed = teeHeader === "true" || isEnclaveModel(model);
      const teeProvider = res.headers.get("x-venice-tee-provider");
      const fellBack = i > 0;
      // Telemetry: one structured line per served request.
      console.log(
        `[venice:${label}] served by ${model} tee=${teeServed}${
          teeProvider ? `/${teeProvider}` : ""
        } fallback=${fellBack} attempt=${i + 1}/${chain.length}`,
      );
      return {
        data,
        modelUsed: model,
        teeServed,
        teeProvider,
        fellBack,
        attempts,
      };
    }

    lastStatus = res.status;
    lastErrorText = await res.text().catch(() => "");

    const canRetry =
      i < chain.length - 1 &&
      (isRetriable(res.status) || isRetriableParamError(res.status));
    if (!canRetry) break;

    console.warn(
      `[venice:${label}] ${model} returned ${res.status}; falling back to ${
        chain[i + 1]
      }`,
    );
  }

  const err = new Error(
    `[venice:${label}] all ${chain.length} models failed; last status ${lastStatus}: ${lastErrorText.slice(0, 300)}`,
  );
  (err as Error & { status?: number }).status = lastStatus || 502;
  throw err;
}
