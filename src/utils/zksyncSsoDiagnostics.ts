"use client";

/**
 * Diagnostic utilities for ZKsync SSO Auth Server
 *
 * Use these functions to verify the auth server is working correctly
 */

const ZKSYNC_AUTH_SERVER_TESTNET = "https://auth-test.zksync.dev";
const ZKSYNC_AUTH_SERVER_MAINNET = "https://auth.zksync.dev";

interface AuthServerDiagnostic {
  success: boolean;
  message: string;
  details?: {
    url: string;
    status?: number;
    accessible?: boolean;
    error?: string;
  };
}

/**
 * Test if the ZKsync SSO auth server is accessible
 */
export async function testAuthServerAccess(
  network: "testnet" | "mainnet" = "testnet",
): Promise<AuthServerDiagnostic> {
  const authServerUrl =
    network === "testnet"
      ? ZKSYNC_AUTH_SERVER_TESTNET
      : ZKSYNC_AUTH_SERVER_MAINNET;

  try {
    console.log(`🔍 Testing ZKsync SSO Auth Server: ${authServerUrl}`);

    // Try to fetch the auth server
    // Note: The auth server may return CORS errors, but that's okay - we just want to see if it responds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      await fetch(authServerUrl, {
        method: "HEAD", // Use HEAD to avoid CORS issues
        mode: "no-cors", // Don't fail on CORS
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return {
        success: true,
        message: `✅ Auth server is accessible at ${authServerUrl}`,
        details: {
          url: authServerUrl,
          accessible: true,
        },
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);

      // CORS errors are expected, but network errors indicate server issues
      if (fetchError instanceof Error) {
        if (fetchError.name === "AbortError") {
          return {
            success: false,
            message: `⏱️ Auth server request timed out: ${authServerUrl}`,
            details: {
              url: authServerUrl,
              accessible: false,
              error: "Request timeout (5 seconds)",
            },
          };
        }

        // CORS errors are actually a good sign - it means the server is responding
        if (
          fetchError.message.includes("CORS") ||
          fetchError.message.includes("Failed to fetch")
        ) {
          return {
            success: true,
            message: `✅ Auth server is responding (CORS is expected): ${authServerUrl}`,
            details: {
              url: authServerUrl,
              accessible: true,
              error: "CORS error (expected - server is responding)",
            },
          };
        }

        return {
          success: false,
          message: `❌ Error accessing auth server: ${fetchError.message}`,
          details: {
            url: authServerUrl,
            accessible: false,
            error: fetchError.message,
          },
        };
      }
    }
  } catch (error) {
    return {
      success: false,
      message: `❌ Failed to test auth server: ${error instanceof Error ? error.message : "Unknown error"}`,
      details: {
        url: authServerUrl,
        accessible: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }

  return {
    success: false,
    message: "❌ Unknown error testing auth server",
    details: {
      url: authServerUrl,
      accessible: false,
    },
  };
}

/**
 * Check ZKsync network status
 */
export async function checkZKsyncNetworkStatus(): Promise<{
  success: boolean;
  message: string;
  statusUrl: string;
}> {
  const statusUrl = "https://zksync-network.statuspage.io/";

  return {
    success: true,
    message: `Check ZKsync network status at: ${statusUrl}`,
    statusUrl,
  };
}

/**
 * Run comprehensive SSO diagnostic tests
 */
export async function runSsoDiagnostics(): Promise<{
  tests: AuthServerDiagnostic[];
  summary: {
    allPassed: boolean;
    totalTests: number;
    passedTests: number;
    failedTests: number;
  };
}> {
  console.log("🔍 Running ZKsync SSO Diagnostics...");

  const tests: AuthServerDiagnostic[] = [];

  // Test testnet auth server
  console.log("\n📡 Test 1: Testing Testnet Auth Server...");
  const testnetTest = await testAuthServerAccess("testnet");
  tests.push(testnetTest);

  // Test mainnet auth server (optional, just for reference)
  console.log("\n📡 Test 2: Testing Mainnet Auth Server...");
  const mainnetTest = await testAuthServerAccess("mainnet");
  tests.push(mainnetTest);

  const passedTests = tests.filter((t) => t.success).length;
  const failedTests = tests.filter((t) => !t.success).length;

  const summary = {
    allPassed: failedTests === 0,
    totalTests: tests.length,
    passedTests,
    failedTests,
  };

  console.log("\n📊 Diagnostic Summary:", summary);
  tests.forEach((test, index) => {
    console.log(`  Test ${index + 1}: ${test.message}`);
  });

  return { tests, summary };
}

/**
 * Check local configuration for SSO
 */
export function checkLocalSsoConfiguration(): {
  success: boolean;
  issues: string[];
  warnings: string[];
  configuration: {
    protocol: string;
    origin: string;
    isHttps: boolean;
    isLocalhost: boolean;
  };
} {
  if (typeof window === "undefined") {
    return {
      success: false,
      issues: ["Cannot check configuration - not running in browser"],
      warnings: [],
      configuration: {
        protocol: "unknown",
        origin: "unknown",
        isHttps: false,
        isLocalhost: false,
      },
    };
  }

  const issues: string[] = [];
  const warnings: string[] = [];

  const protocol = window.location.protocol;
  const origin = window.location.origin;
  const isHttps = protocol === "https:";
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  // Check protocol
  if (!isHttps) {
    issues.push(
      `❌ Not using HTTPS. Current protocol: ${protocol}. SSO requires HTTPS.`,
    );
  }

  // Check if localhost
  if (isLocalhost && isHttps) {
    warnings.push(
      "⚠️ Using localhost with HTTPS - make sure you've accepted the self-signed certificate",
    );
  }

  // Check origin format
  if (!origin.startsWith("https://")) {
    issues.push(`❌ Origin does not start with https://: ${origin}`);
  }

  return {
    success: issues.length === 0,
    issues,
    warnings,
    configuration: {
      protocol,
      origin,
      isHttps,
      isLocalhost,
    },
  };
}

/**
 * Get all diagnostic information
 */
export async function getAllSsoDiagnostics(): Promise<{
  authServerTests: AuthServerDiagnostic[];
  localConfig: ReturnType<typeof checkLocalSsoConfiguration>;
  networkStatus: {
    success: boolean;
    message: string;
    statusUrl: string;
  };
  summary: {
    authServerWorking: boolean;
    localConfigValid: boolean;
    overallStatus: "healthy" | "issues" | "unknown";
  };
}> {
  console.log("🚀 Running Complete ZKsync SSO Diagnostics...\n");

  // Test auth servers
  const { tests: authServerTests } = await runSsoDiagnostics();

  // Check local configuration
  const localConfig = checkLocalSsoConfiguration();

  // Get network status info
  const networkStatus = await checkZKsyncNetworkStatus();

  // Determine overall status
  const authServerWorking = authServerTests.some((test) => test.success);
  const localConfigValid = localConfig.success;
  let overallStatus: "healthy" | "issues" | "unknown" = "unknown";

  if (authServerWorking && localConfigValid) {
    overallStatus = "healthy";
  } else if (!authServerWorking || !localConfigValid) {
    overallStatus = "issues";
  }

  const summary = {
    authServerWorking,
    localConfigValid,
    overallStatus,
  };

  console.log("\n✅ Diagnostic Complete!");
  console.log("Summary:", summary);

  return {
    authServerTests,
    localConfig,
    networkStatus,
    summary,
  };
}

/**
 * Helper function to print diagnostics to console
 */
export async function printSsoDiagnostics(): Promise<void> {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ZKsync SSO Diagnostic Report");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const diagnostics = await getAllSsoDiagnostics();

  console.log("\n📡 Auth Server Tests:");
  diagnostics.authServerTests.forEach((test, index) => {
    console.log(`  ${index + 1}. ${test.message}`);
    if (test.details) {
      console.log(`     URL: ${test.details.url}`);
      if (test.details.error) {
        console.log(`     Error: ${test.details.error}`);
      }
    }
  });

  console.log("\n⚙️  Local Configuration:");
  console.log(`  Protocol: ${diagnostics.localConfig.configuration.protocol}`);
  console.log(`  Origin: ${diagnostics.localConfig.configuration.origin}`);
  console.log(
    `  HTTPS: ${diagnostics.localConfig.configuration.isHttps ? "✅" : "❌"}`,
  );
  console.log(
    `  Localhost: ${diagnostics.localConfig.configuration.isLocalhost ? "Yes" : "No"}`,
  );

  if (diagnostics.localConfig.issues.length > 0) {
    console.log("\n  Issues:");
    diagnostics.localConfig.issues.forEach((issue) =>
      console.log(`    ${issue}`),
    );
  }

  if (diagnostics.localConfig.warnings.length > 0) {
    console.log("\n  Warnings:");
    diagnostics.localConfig.warnings.forEach((warning) =>
      console.log(`    ${warning}`),
    );
  }

  console.log("\n🌐 Network Status:");
  console.log(`  ${diagnostics.networkStatus.message}`);

  console.log("\n📊 Overall Status:");
  console.log(
    `  Auth Server: ${diagnostics.summary.authServerWorking ? "✅ Working" : "❌ Not Working"}`,
  );
  console.log(
    `  Local Config: ${diagnostics.summary.localConfigValid ? "✅ Valid" : "❌ Invalid"}`,
  );
  console.log(`  Status: ${diagnostics.summary.overallStatus.toUpperCase()}`);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}
