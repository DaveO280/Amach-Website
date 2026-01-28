export type VeniceThinkingScope = "deep" | "analysis";

function parseBool(raw: string | null | undefined): boolean | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v.length === 0) return null;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return null;
}

function readDevLocalStorageFlag(key: string): boolean | null {
  if (process.env.NODE_ENV !== "development") return null;
  if (typeof window === "undefined") return null;
  try {
    return parseBool(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function readEnvFlag(name: string): boolean | null {
  // NEXT_PUBLIC_ vars are available client-side; this helper is safe anywhere.
  return parseBool(process.env[name]);
}

/**
 * Whether to ask Venice to avoid generating "thinking" / reasoning content.
 *
 * Defaults to false to preserve existing Deep/Analysis behavior.
 * Can be enabled via:
 * - NEXT_PUBLIC_VENICE_DISABLE_THINKING_ALL=true
 * - NEXT_PUBLIC_VENICE_DISABLE_THINKING_DEEP=true
 * - NEXT_PUBLIC_VENICE_DISABLE_THINKING_ANALYSIS=true
 *
 * Dev-only localStorage overrides (highest priority):
 * - cosaint_disable_thinking_all=true|false
 * - cosaint_disable_thinking_deep=true|false
 * - cosaint_disable_thinking_analysis=true|false
 */
export function shouldDisableVeniceThinking(
  scope: VeniceThinkingScope,
): boolean {
  const devAll = readDevLocalStorageFlag("cosaint_disable_thinking_all");
  if (devAll !== null) return devAll;
  const devScoped = readDevLocalStorageFlag(
    `cosaint_disable_thinking_${scope}`,
  );
  if (devScoped !== null) return devScoped;

  const envAll = readEnvFlag("NEXT_PUBLIC_VENICE_DISABLE_THINKING_ALL");
  if (envAll !== null) return envAll;
  const envScoped = readEnvFlag(
    scope === "deep"
      ? "NEXT_PUBLIC_VENICE_DISABLE_THINKING_DEEP"
      : "NEXT_PUBLIC_VENICE_DISABLE_THINKING_ANALYSIS",
  );
  if (envScoped !== null) return envScoped;

  return false;
}
