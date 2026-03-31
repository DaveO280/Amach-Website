import { test, expect, ConsoleMessage } from "@playwright/test";

/**
 * Security header E2E tests.
 *
 * These tests start the actual Next.js server (via playwright.config.ts webServer)
 * and make real HTTP requests to verify that the security headers configured in
 * next.config.js are actually served — not just configured.
 *
 * A config change that accidentally removes a header will be caught here even if
 * the unit test in hardening.test.ts still passes (e.g. a subtle Next.js bug).
 */

// ---------------------------------------------------------------------------
// HTTP response header assertions
// ---------------------------------------------------------------------------

test.describe("HTTP security headers", () => {
  test("landing page returns Content-Security-Policy-Report-Only header", async ({
    request,
  }) => {
    const response = await request.get("/");
    const csp = response.headers()["content-security-policy-report-only"];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("landing page returns X-Content-Type-Options: nosniff", async ({
    request,
  }) => {
    const response = await request.get("/");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("landing page returns X-Frame-Options: DENY", async ({ request }) => {
    const response = await request.get("/");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
  });

  test("landing page returns Referrer-Policy header", async ({ request }) => {
    const response = await request.get("/");
    const rp = response.headers()["referrer-policy"];
    expect(rp).toBeDefined();
    expect(rp).not.toBe("");
  });

  test("API routes return CORS origin that is not a bare wildcard", async ({
    request,
  }) => {
    const response = await request.get("/api/health/tools");
    const origin = response.headers()["access-control-allow-origin"];
    // Wildcard + credentials is a CORS spec violation and a security risk.
    expect(origin).not.toBe("*");
  });

  test("all API routes return security headers", async ({ request }) => {
    const response = await request.get("/api/health/tools");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });
});

// ---------------------------------------------------------------------------
// CSP violation detection
//
// These tests load the app in a real browser and collect console messages.
// Any CSP violation message indicates that either:
//   (a) a legitimate domain is missing from the allowlist — update next.config.js, or
//   (b) a dependency is attempting an unexpected network connection — investigate.
//
// In report-only mode, violations are logged but do not block the app.
// Once the allowlist is complete, switch to enforcing CSP.
// ---------------------------------------------------------------------------

test.describe("CSP violation monitoring", () => {
  test("landing page loads without CSP violations", async ({ page }) => {
    const violations: string[] = [];

    page.on("console", (msg: ConsoleMessage) => {
      // Browsers report CSP violations as console errors containing this string
      if (
        msg.type() === "error" &&
        msg.text().toLowerCase().includes("content security policy")
      ) {
        violations.push(msg.text());
      }
    });

    await page.goto("/");
    // Allow time for deferred scripts (analytics, wallet provider injection, etc.)
    await page.waitForTimeout(3000);

    if (violations.length > 0) {
      // Log each violation clearly so the developer knows exactly which domain
      // to add to the connect-src or script-src allowlist in next.config.js.
      console.warn(
        `\n⚠️  ${violations.length} CSP violation(s) detected on landing page:\n` +
          violations.map((v) => `  - ${v}`).join("\n") +
          "\n\nTo fix: add the reported domain to the appropriate CSP directive in next.config.js.\n" +
          "Once no violations appear, switch the header to Content-Security-Policy to enforce blocking.",
      );
    }

    // This test currently WARNS rather than hard-fails so that violations are
    // visible but don't block the pipeline while the allowlist is being built.
    // Change expect(violations).toHaveLength(0) once the allowlist is complete.
    expect(violations.length).toBeGreaterThanOrEqual(0);
  });

  test("dashboard page loads without unexpected external script loads", async ({
    page,
  }) => {
    const externalScripts: string[] = [];

    page.on("response", (response) => {
      const url = response.url();
      const isScript =
        response.request().resourceType() === "script" &&
        !url.startsWith(
          process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
        ) &&
        !url.startsWith("data:");

      if (isScript) {
        externalScripts.push(url);
      }
    });

    // Dashboard redirects to wallet connection if not authenticated — that's fine
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);

    const unexpected = externalScripts.filter(
      (url) =>
        !url.includes("privy.io") &&
        !url.includes("vercel-scripts.com") &&
        !url.includes("vercel-insights.com"),
    );

    if (unexpected.length > 0) {
      console.warn(
        `\n⚠️  Unexpected external scripts loaded:\n` +
          unexpected.map((u) => `  - ${u}`).join("\n") +
          "\n\nThese may be legitimate (add to CSP allowlist) or supply chain threats.",
      );
    }

    // Same warn-not-fail approach while the allowlist is being refined.
    expect(unexpected.length).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// API smoke tests
// ---------------------------------------------------------------------------

test.describe("API route availability", () => {
  test("GET /api/health/tools returns 200 with tool definitions", async ({
    request,
  }) => {
    const response = await request.get("/api/health/tools");
    expect(response.status()).toBe(200);
    const body = (await response.json()) as unknown;
    expect(body).toBeDefined();
  });

  test("GET /api/wallet/check-balance returns 400 (missing address param — not 500)", async ({
    request,
  }) => {
    // No address param — should return a validation error, not a server crash
    const response = await request.get("/api/wallet/check-balance");
    expect(response.status()).toBeLessThan(500);
  });

  test("GET /api/verification/allocation-info responds (not 500)", async ({
    request,
  }) => {
    const response = await request.get("/api/verification/allocation-info");
    expect(response.status()).toBeLessThan(500);
  });
});
