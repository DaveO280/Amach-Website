# API Authentication

All protected routes require a **Privy access token** in the `Authorization` header.

## Header format

```
Authorization: Bearer <privy-access-token>
```

## How each platform gets the token

| Platform      | Method                                                                                 |
| ------------- | -------------------------------------------------------------------------------------- |
| Web (Next.js) | `const token = await getAccessToken()` from `usePrivy()` hook (`@privy-io/react-auth`) |
| iOS           | `try await privyClient.fetchAuthToken()` from the Privy iOS SDK                        |

The token is a short-lived JWT (≈6 h). Call the method immediately before each authenticated request — the SDK caches and auto-refreshes it.

## Server-side verification

Tokens are verified via Privy's public **JWKS** endpoint:

```
https://auth.privy.io/api/v1/apps/{NEXT_PUBLIC_PRIVY_APP_ID}/jwks.json
```

No private key or secret is required. The JWKS is fetched on the first request per cold start and cached at module scope.

## Required env vars

| Var                        | Environments                     | Notes                               |
| -------------------------- | -------------------------------- | ----------------------------------- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Production, Preview, Development | Only env var needed for server auth |

`PRIVY_VERIFICATION_KEY` is **not** required — the JWKS approach fetches the public key automatically.

## Errors

| Status | Meaning                                          |
| ------ | ------------------------------------------------ |
| 401    | Token missing, expired, or invalid signature     |
| 500    | `NEXT_PUBLIC_PRIVY_APP_ID` not set on the server |
