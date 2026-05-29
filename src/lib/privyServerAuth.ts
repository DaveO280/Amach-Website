/**
 * Privy server-side auth helpers for protected API routes.
 *
 * Verifies the Privy access token a logged-in client sends in the
 * `Authorization: Bearer …` header and confirms the user is authenticated.
 *
 * Why access tokens (not identity tokens): access tokens are issued to every
 * authenticated user by `usePrivy().getAccessToken()` with no extra dashboard
 * configuration. Identity tokens are an optional Privy feature (requires
 * explicit enablement in the dashboard) and are not available in all auth flows.
 *
 * Env vars consumed:
 *   - NEXT_PUBLIC_PRIVY_APP_ID  (required) — same as the client uses
 *   - PRIVY_VERIFICATION_KEY    (required) — ES256 SPKI PEM string from the
 *     Privy dashboard. `\n` escapes are normalized so it can be pasted into
 *     Vercel / .env without manual newline handling.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyAccessToken, InvalidAuthTokenError } from "@privy-io/node";

function normalizePemEnvVar(raw: string): string {
  // Vercel-style envs serialize newlines as the two-character sequence `\n`.
  return raw.includes("-----BEGIN") && raw.includes("\\n")
    ? raw.replace(/\\n/g, "\n")
    : raw;
}

function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

interface AuthFailure {
  ok: false;
  response: NextResponse;
}
interface AuthSuccess {
  ok: true;
  userId: string;
}

/**
 * Verify the Privy access token in the Authorization bearer header.
 * Returns either a NextResponse to short-circuit the route, or a success
 * record with the verified Privy user id.
 *
 * The `claimedAddress` parameter is accepted for API compatibility but is not
 * verified against linked_accounts — access tokens carry only user_id, not
 * the full linked_accounts list. The on-chain registration step (which
 * requires a wallet signature) provides the binding security guarantee.
 *
 *   401 — token missing or fails signature/expiry verification
 *   500 — server is missing PRIVY_APP_ID or PRIVY_VERIFICATION_KEY
 */
export async function requirePrivyWalletOwner(
  request: NextRequest,
  _claimedAddress: string,
): Promise<AuthFailure | AuthSuccess> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const verificationKeyRaw = process.env.PRIVY_VERIFICATION_KEY;

  if (!appId || !verificationKeyRaw) {
    console.error(
      "[privyServerAuth] Missing NEXT_PUBLIC_PRIVY_APP_ID or PRIVY_VERIFICATION_KEY — refusing to authenticate.",
    );
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Auth not configured on server" },
        { status: 500 },
      ),
    };
  }

  const token = extractBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Missing Authorization bearer token" },
        { status: 401 },
      ),
    };
  }

  let result;
  try {
    result = await verifyAccessToken({
      access_token: token,
      app_id: appId,
      verification_key: normalizePemEnvVar(verificationKeyRaw),
    });
  } catch (err) {
    const message =
      err instanceof InvalidAuthTokenError
        ? "Invalid or expired access token"
        : "Failed to verify access token";
    console.warn("[privyServerAuth] token verification failed:", err);
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: message },
        { status: 401 },
      ),
    };
  }

  return { ok: true, userId: result.user_id };
}
