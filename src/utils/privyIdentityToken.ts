/**
 * Privy identity-token resolution helper.
 *
 * Resolves the current Privy identity token by trying the in-memory state
 * first (via the caller's `readFromHook` accessor — typically wired to
 * `useIdentityToken().identityToken` mirrored through a ref so async callers
 * see the latest value), then falling back to the cookie/refresh path
 * (`getIdentityToken()` from `@privy-io/react-auth`). If both initially
 * return null, polls both until a token appears or the timeout elapses —
 * needed for fresh email-login sessions where the wallet is linked
 * asynchronously after authentication completes and the SDK refreshes
 * `linked_accounts` on the next `/users/me` call.
 *
 * Pure async helper, no React dependencies — kept separate from the widget
 * so it can be unit-tested without rendering the component tree.
 */

export interface ResolveIdentityTokenOptions {
  /**
   * Synchronously read the current hook-mirrored token. Should reflect the
   * latest value of `useIdentityToken().identityToken` — i.e., callers
   * typically pass `() => hookRef.current` where `hookRef.current` is
   * mutated each render.
   */
  readFromHook: () => string | null;
  /**
   * Async cookie-and-refresh fallback. In production this should be
   * Privy's exported `getIdentityToken` function, which internally calls
   * `updateUserAndIdToken()` (hits `/users/me`) before returning.
   */
  fetchFromCookie: () => Promise<string | null>;
  /** Poll interval while waiting for the token to appear. Defaults to 250 ms. */
  pollIntervalMs?: number;
  /** Total wait budget once both initial reads fail. Defaults to 10 s. */
  timeoutMs?: number;
}

export async function resolveIdentityToken(
  opts: ResolveIdentityTokenOptions,
): Promise<string | null> {
  const {
    readFromHook,
    fetchFromCookie,
    pollIntervalMs = 250,
    timeoutMs = 10000,
  } = opts;

  // Tier 1: in-memory hook value, set as soon as Privy issues the token.
  let token = readFromHook();
  if (token) return token;

  // Tier 2: cookie + forced refresh via /users/me.
  token = await fetchFromCookie();
  if (token) return token;

  // Tier 3: poll both sources until one returns a token or we time out.
  // Reading the hook first each iteration avoids hammering /users/me when
  // the in-memory state has already been updated by another code path.
  const start = Date.now();
  while (!token && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    token = readFromHook();
    if (!token) {
      token = await fetchFromCookie();
    }
  }
  return token;
}
