/**
 * Privy server-side auth helpers for protected API routes.
 *
 * Verifies the Privy identity token a logged-in client sends in the
 * `Authorization: Bearer …` header, parses it into a `User`, and checks that
 * a claimed Ethereum wallet address is one of the user's linked accounts.
 *
 * Why identity tokens (not access tokens): identity tokens are self-contained
 * JWTs carrying the User object inline (including `linked_accounts`), so we
 * can verify wallet ownership locally with no extra Privy API roundtrip.
 *
 * Env vars consumed:
 *   - NEXT_PUBLIC_PRIVY_APP_ID  (required) — same as the client uses
 *   - PRIVY_VERIFICATION_KEY    (required) — ES256 SPKI PEM string from the
 *     Privy dashboard. `\n` escapes are normalized so it can be pasted into
 *     Vercel / .env without manual newline handling.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  verifyIdentityToken,
  InvalidAuthTokenError,
  type LinkedAccount,
} from "@privy-io/node";

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

function getEthereumAddressesFromLinkedAccounts(
  accounts: ReadonlyArray<LinkedAccount>,
): string[] {
  const out: string[] = [];
  for (const acc of accounts) {
    // External wallets and smart wallets expose chain_type + address.
    if (
      (acc.type === "wallet" || acc.type === "smart_wallet") &&
      "chain_type" in acc &&
      acc.chain_type === "ethereum" &&
      "address" in acc &&
      typeof acc.address === "string"
    ) {
      out.push(acc.address.toLowerCase());
    }
  }
  return out;
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
 * Verify the bearer identity token and confirm `claimedAddress` is one of the
 * caller's linked Ethereum wallets. Returns either a NextResponse to short-
 * circuit the route, or a success record with the verified user id.
 *
 *   401 — token missing or fails signature/expiry verification
 *   403 — token is valid but wallet doesn't belong to the caller
 *   500 — server is missing PRIVY_APP_ID or PRIVY_VERIFICATION_KEY
 */
export async function requirePrivyWalletOwner(
  request: NextRequest,
  claimedAddress: string,
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

  let user;
  try {
    user = await verifyIdentityToken({
      identity_token: token,
      app_id: appId,
      verification_key: normalizePemEnvVar(verificationKeyRaw),
    });
  } catch (err) {
    const message =
      err instanceof InvalidAuthTokenError
        ? "Invalid or expired identity token"
        : "Failed to verify identity token";
    console.warn("[privyServerAuth] token verification failed:", err);
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: message },
        { status: 401 },
      ),
    };
  }

  const linkedEthAddresses = getEthereumAddressesFromLinkedAccounts(
    user.linked_accounts,
  );
  if (!linkedEthAddresses.includes(claimedAddress.toLowerCase())) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error:
            "Wallet address in body is not linked to the authenticated user",
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, userId: user.id };
}
