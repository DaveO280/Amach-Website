import { test, expect } from "@playwright/test";

/**
 * Smoke tests — verify that core pages load without crashes after any change.
 *
 * These are intentionally minimal. They confirm the app starts and renders
 * without a white screen or uncaught error, not that every feature works.
 */

test.describe("Page smoke tests", () => {
  test("landing page loads and has a title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/.+/); // Any non-empty title
    // Should not show a Next.js error page
    await expect(page.locator("body")).not.toContainText(
      "Application error: a client-side exception has occurred",
    );
  });

  test("landing page has no uncaught JS errors that crash the page", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Filter out known-acceptable errors (e.g. wallet extension not available)
    const fatalErrors = errors.filter(
      (e) =>
        !e.includes("MetaMask") &&
        !e.includes("ethereum") &&
        !e.includes("window.ethereum"),
    );

    expect(fatalErrors).toHaveLength(0);
  });

  test("wallet connection page loads", async ({ page }) => {
    await page.goto("/wallet");
    // Should render something (not a 404 or crash)
    await expect(page.locator("body")).not.toContainText("404");
    await expect(page.locator("body")).not.toContainText(
      "Application error: a client-side exception has occurred",
    );
  });

  test("dashboard redirects or renders without server error", async ({
    page,
  }) => {
    const response = await page.goto("/dashboard");
    // Either redirects to wallet (302/307) or renders — either way, not a 500
    expect(response?.status()).toBeLessThan(500);
  });
});
