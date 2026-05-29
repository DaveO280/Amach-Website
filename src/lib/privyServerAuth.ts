/**
 * Privy server-side auth helpers for protected API routes.
 *
 * Verifies the Privy access token a logged-in client sends in the
 * `Authorization: Bearer …` header using Privy's public JWKS endpoint.
 *
 * Why JWKS (not a static PEM key): the JWKS is fetched once from
 * `https://auth.privy.io/api/v1/apps/{appId}/jwks.json` (public, no auth
 * required) and cached at module scope. This removes the need for a
 * `PRIVY_VERIFICATION_KEY` env var, avoids copy-paste errors with PEM
 * formatting, and handles key rotation automatically.
 *
 * Env vars consumed:
 *   - NEXT_PUBLIC_PRIVY_APP_ID  (required) — same value the client uses
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from "jose";

const PRIVY_ISSUER = "privy.io";
const PRIVY_JWKS_BASE = "https://auth.privy.io/api/v1/apps";

// Module-scope cache — survives warm serverless invocations.
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedJwksAppId: string | null = null;

function getPrivyJwks(appId: string): ReturnType<typeof createRemoteJWKSet> {
  if (!cachedJwks || cachedJwksAppId !== appId) {
    cachedJwks = createRemoteJWKSet(
      new URL(`${PRIVY_JWKS_BASE}/${appId}/jwks.json`),
    );
    cachedJwksAppId = appId;
  }
  return cachedJwks;
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
 * The `claimedAddress` parameter is accepted for API compatibility. Access
 * tokens carry only user_id (not linked_accounts), so wallet ownership is
 * not re-verified here; the on-chain registration step (wallet signature)
 * provides the binding security guarantee.
 *
 *   401 — token missing or fails signature/expiry/issuer verification
 *   500 — server is missing NEXT_PUBLIC_PRIVY_APP_ID
 */
export async function requirePrivyWalletOwner(
  request: NextRequest,
  _claimedAddress: string,
): Promise<AuthFailure | AuthSuccess> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    console.error(
      "[privyServerAuth] Missing NEXT_PUBLIC_PRIVY_APP_ID — refusing to authenticate.",
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

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, getPrivyJwks(appId), {
      issuer: PRIVY_ISSUER,
      audience: appId,
    });
    if (typeof payload.sub !== "string" || !payload.sub) {
      throw new Error("Token payload missing sub claim");
    }
    userId = payload.sub;
  } catch (err) {
    const isExpired =
      err instanceof joseErrors.JWTExpired ||
      (err instanceof Error && err.message.includes("expired"));
    const message = isExpired
      ? "Access token expired — please refresh and try again."
      : "Invalid access token";
    console.warn("[privyServerAuth] token verification failed:", err);
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: message },
        { status: 401 },
      ),
    };
  }

  return { ok: true, userId };
}
