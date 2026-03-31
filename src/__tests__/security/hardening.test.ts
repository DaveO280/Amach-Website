/**
 * Supply chain hardening configuration tests.
 *
 * These tests validate the security configuration statically — no running
 * server required. They act as a regression guard so that hardening changes
 * are never accidentally reverted by a dependency update or config edit.
 *
 * Run with: pnpm test
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../../");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJSON(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(ROOT, filePath), "utf8"));
}

function readText(filePath: string): string {
  return fs.readFileSync(path.join(ROOT, filePath), "utf8");
}

// ---------------------------------------------------------------------------
// vercel.json
// ---------------------------------------------------------------------------

describe("vercel.json", () => {
  let config: Record<string, unknown>;

  beforeAll(() => {
    config = readJSON("vercel.json");
  });

  it("uses --frozen-lockfile so Vercel cannot resolve newer (malicious) package versions at deploy time", () => {
    expect(config.installCommand).toContain("--frozen-lockfile");
  });

  it("does not use --no-frozen-lockfile", () => {
    expect(config.installCommand).not.toContain("--no-frozen-lockfile");
  });
});

// ---------------------------------------------------------------------------
// .npmrc
// ---------------------------------------------------------------------------

describe(".npmrc", () => {
  let content: string;

  beforeAll(() => {
    content = readText(".npmrc");
  });

  it("sets ignore-scripts=true to block postinstall malware", () => {
    expect(content).toContain("ignore-scripts=true");
  });

  it("pins registry to npmjs.org to prevent registry redirection attacks", () => {
    expect(content).toContain("registry=https://registry.npmjs.org/");
  });
});

// ---------------------------------------------------------------------------
// package.json — critical dependency pinning
// ---------------------------------------------------------------------------

describe("package.json critical dependency pinning", () => {
  let deps: Record<string, string>;
  let devDeps: Record<string, string>;

  beforeAll(() => {
    const pkg = readJSON("package.json");
    deps = (pkg.dependencies as Record<string, string>) || {};
    devDeps = (pkg.devDependencies as Record<string, string>) || {};
  });

  // Packages where a compromised patch/minor version causes maximum damage.
  const criticalDeps: Array<[string, "deps" | "devDeps"]> = [
    ["axios", "deps"],
    ["crypto-js", "deps"],
    ["@privy-io/react-auth", "deps"],
    ["@simplewebauthn/browser", "deps"],
    ["@simplewebauthn/server", "deps"],
    ["viem", "deps"],
    ["@wagmi/core", "deps"],
    ["@aws-sdk/client-s3", "deps"],
    ["next", "deps"],
  ];

  it.each(criticalDeps)(
    "%s should be pinned to an exact version (no ^ or ~ prefix)",
    (pkg, location) => {
      const source = location === "deps" ? deps : devDeps;
      const version = source[pkg];
      expect(version).toBeDefined();
      expect(version).not.toMatch(/^[\^~]/);
    },
  );
});

// ---------------------------------------------------------------------------
// next.config.js — security headers
// ---------------------------------------------------------------------------

describe("next.config.js security headers", () => {
  let headers: Array<{
    source: string;
    headers: Array<{ key: string; value: string }>;
  }>;

  beforeAll(async () => {
    // Load the next config and call its headers() function
     
    const nextConfig = require(path.join(ROOT, "next.config.js")) as {
      headers?: () => Promise<typeof headers>;
    };
    if (typeof nextConfig.headers === "function") {
      headers = await nextConfig.headers();
    } else {
      headers = [];
    }
  });

  function getHeaderValue(source: string, key: string): string | undefined {
    const route = headers.find((h) => h.source === source);
    return route?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())
      ?.value;
  }

  it("sets Content-Security-Policy-Report-Only on all routes", () => {
    const csp = getHeaderValue(
      "/:path*",
      "Content-Security-Policy-Report-Only",
    );
    expect(csp).toBeDefined();
    expect(csp!.length).toBeGreaterThan(0);
  });

  it("CSP includes default-src 'self'", () => {
    const csp = getHeaderValue(
      "/:path*",
      "Content-Security-Policy-Report-Only",
    );
    expect(csp).toContain("default-src 'self'");
  });

  it("CSP restricts object-src to none (blocks plugin-based attacks)", () => {
    const csp = getHeaderValue(
      "/:path*",
      "Content-Security-Policy-Report-Only",
    );
    expect(csp).toContain("object-src 'none'");
  });

  it("CSP sets frame-ancestors 'none' (prevents clickjacking)", () => {
    const csp = getHeaderValue(
      "/:path*",
      "Content-Security-Policy-Report-Only",
    );
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("CSP sets base-uri 'self' (prevents base tag injection)", () => {
    const csp = getHeaderValue(
      "/:path*",
      "Content-Security-Policy-Report-Only",
    );
    expect(csp).toContain("base-uri 'self'");
  });

  it("CSP connect-src includes Venice AI domain", () => {
    const csp = getHeaderValue(
      "/:path*",
      "Content-Security-Policy-Report-Only",
    );
    expect(csp).toContain("https://api.venice.ai");
  });

  it("CSP connect-src includes Storj gateway", () => {
    const csp = getHeaderValue(
      "/:path*",
      "Content-Security-Policy-Report-Only",
    );
    expect(csp).toContain("https://gateway.storjshare.io");
  });

  it("sets X-Content-Type-Options: nosniff on all routes", () => {
    expect(getHeaderValue("/:path*", "X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets X-Frame-Options: DENY on all routes", () => {
    expect(getHeaderValue("/:path*", "X-Frame-Options")).toBe("DENY");
  });

  it("sets Referrer-Policy on all routes", () => {
    const rp = getHeaderValue("/:path*", "Referrer-Policy");
    expect(rp).toBeDefined();
    expect(rp).not.toBe("");
  });

  it("CORS Access-Control-Allow-Origin is not a bare wildcard (*)", () => {
    const origin = getHeaderValue("/api/:path*", "Access-Control-Allow-Origin");
    // Wildcard + credentials is invalid per the CORS spec and is a security risk.
    // The origin must be a specific domain (from NEXT_PUBLIC_APP_URL or the default).
    expect(origin).not.toBe("*");
  });
});

// ---------------------------------------------------------------------------
// pdfParser.ts — no CDN fallback
// ---------------------------------------------------------------------------

describe("pdfParser.ts", () => {
  it("does not reference unpkg.com (CDN supply chain risk)", () => {
    const content = readText("src/utils/pdfParser.ts");
    expect(content).not.toContain("unpkg.com");
  });
});
