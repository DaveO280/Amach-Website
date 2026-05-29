import { resolveIdentityToken } from "../privyIdentityToken";

describe("resolveIdentityToken", () => {
  // ── Tier 1 — hook returns a token immediately ───────────────────────
  test("returns the hook value without calling the cookie fallback", async () => {
    const fetchFromCookie = jest.fn<Promise<string | null>, []>();
    const token = await resolveIdentityToken({
      readFromHook: () => "hook-token",
      fetchFromCookie,
    });
    expect(token).toBe("hook-token");
    expect(fetchFromCookie).not.toHaveBeenCalled();
  });

  // ── Tier 2 — hook null, cookie returns a token ──────────────────────
  test("falls back to fetchFromCookie when hook returns null", async () => {
    const fetchFromCookie = jest.fn().mockResolvedValue("cookie-token");
    const token = await resolveIdentityToken({
      readFromHook: () => null,
      fetchFromCookie,
    });
    expect(token).toBe("cookie-token");
    expect(fetchFromCookie).toHaveBeenCalledTimes(1);
  });

  // ── Tier 3 — both initially null, hook becomes ready mid-poll ───────
  test("polls the hook until it returns a token", async () => {
    let hookValue: string | null = null;
    const fetchFromCookie = jest.fn().mockResolvedValue(null);

    // Hook flips to a real token after 500 ms.
    setTimeout(() => {
      hookValue = "delayed-hook-token";
    }, 500);

    const token = await resolveIdentityToken({
      readFromHook: () => hookValue,
      fetchFromCookie,
      pollIntervalMs: 50,
      timeoutMs: 2000,
    });

    expect(token).toBe("delayed-hook-token");
    // fetchFromCookie should have been called at least once during the wait.
    expect(fetchFromCookie.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  // ── Tier 3 — both initially null, cookie becomes ready mid-poll ─────
  test("polls fetchFromCookie until it returns a token", async () => {
    const callCount = { n: 0 };
    const fetchFromCookie = jest.fn(async () => {
      callCount.n += 1;
      // First two calls return null; third call returns a token.
      return callCount.n >= 3 ? "delayed-cookie-token" : null;
    });

    const token = await resolveIdentityToken({
      readFromHook: () => null,
      fetchFromCookie,
      pollIntervalMs: 50,
      timeoutMs: 2000,
    });

    expect(token).toBe("delayed-cookie-token");
    // The first call happens at Tier 2 (before polling), then polling calls
    // it again until it returns truthy. Expect 3 calls total.
    expect(callCount.n).toBe(3);
  });

  // ── Tier 3 timeout — both stay null for the whole window ────────────
  test("returns null after the timeout when neither source provides a token", async () => {
    const fetchFromCookie = jest.fn().mockResolvedValue(null);

    const start = Date.now();
    const token = await resolveIdentityToken({
      readFromHook: () => null,
      fetchFromCookie,
      pollIntervalMs: 50,
      timeoutMs: 250,
    });
    const elapsed = Date.now() - start;

    expect(token).toBeNull();
    // Should respect the timeout — not poll forever, not return before
    // the timeout (within reasonable jitter).
    expect(elapsed).toBeGreaterThanOrEqual(200);
    expect(elapsed).toBeLessThan(500);
  });

  // ── Hook is preferred over the cookie when both have values ─────────
  test("prefers the hook value during polling", async () => {
    let hookValue: string | null = null;
    let cookieReady = false;
    const fetchFromCookie = jest.fn(async () =>
      cookieReady ? "cookie-token" : null,
    );

    // Both flip at the same time.
    setTimeout(() => {
      hookValue = "hook-token";
      cookieReady = true;
    }, 300);

    const token = await resolveIdentityToken({
      readFromHook: () => hookValue,
      fetchFromCookie,
      pollIntervalMs: 50,
      timeoutMs: 2000,
    });

    expect(token).toBe("hook-token");
  });

  // ── Behavior matches the buggy assumption in v1 of the fix ──────────
  test("does NOT re-call fetchFromCookie once the hook is ready (avoids redundant /users/me refresh)", async () => {
    // This guards against a regression where the loop awaits fetchFromCookie
    // even after the hook has already produced a token. Repeatedly calling
    // /users/me when identity tokens are disabled in the Privy dashboard
    // *clears* the in-memory state on every call (the SDK's
    // `updateIdentityToken` clears state when the response omits
    // `identity_token`), so we want to short-circuit on the hook value.
    let hookValue: string | null = null;
    const fetchFromCookie = jest.fn().mockResolvedValue(null);

    setTimeout(() => {
      hookValue = "hook-token";
    }, 120);

    const token = await resolveIdentityToken({
      readFromHook: () => hookValue,
      fetchFromCookie,
      pollIntervalMs: 50,
      timeoutMs: 2000,
    });

    expect(token).toBe("hook-token");
    // Tier 2 + at most ~2 polls before the hook flips. Should NOT keep
    // hammering /users/me after the hook flips truthy.
    expect(fetchFromCookie.mock.calls.length).toBeLessThanOrEqual(4);
  });
});
