import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Amach Health E2E and security tests.
 *
 * Two test categories:
 *   - Security tests (e2e/security/): headers, CSP, API smoke tests
 *   - Smoke tests (e2e/smoke/): basic page load and navigation
 *
 * In CI the app is built and started before tests run (see webServer config).
 * Locally, start the dev server with `pnpm dev:http` and run `pnpm test:e2e`.
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL,
    // Capture browser console messages so tests can assert on CSP violations
    // and other security-relevant log output.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // In CI: build once, start the production server, run tests against it.
  // Locally: comment this out and start your dev server manually.
  webServer: process.env.CI
    ? {
        command: "pnpm start",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        // Pass through required env vars for the Next.js server
        env: {
          PORT: "3000",
          NODE_ENV: "production",
        },
      }
    : undefined,
});
