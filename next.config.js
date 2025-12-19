const path = require("path");
const webpack = require("webpack");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Skip global-error page during static generation (Next.js 16 issue)
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  // Use Node.js runtime for blockchain interactions
  // Also externalize packages that have test files that shouldn't be bundled
  serverExternalPackages: [
    "ethers",
    "zksync-sso",
    "@wagmi/core",
    // Note: viem removed from here - it needs to be bundled for client-side use
    // and webpack aliases need to apply to replace test file imports
    "pino",
    "thread-stream",
    // AWS SDK must be external to prevent webpack from breaking credential signing
    "@aws-sdk/client-s3",
  ],
  // Empty turbopack config to silence Next.js 16 warning
  // We're using webpack via --webpack flag, but need this to prevent the error
  turbopack: {},
  // Add webpack config to include my-health-app and fix ethers.js issues
  webpack: (config, { isServer }) => {
    // Ignore test files and other unnecessary files from node_modules
    config.plugins = config.plugins || [];

    // CRITICAL: Ignore ALL test files in viem BEFORE other rules
    // This must come first to catch test imports early
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /dropTransaction|testClient|test\.js/,
        contextRegExp: /node_modules\/viem/,
      }),
    );

    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /\.(test|spec)\.(js|ts|mjs)$/,
        contextRegExp: /node_modules/,
      }),
    );

    // Ignore test directories
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /\/test\//,
        contextRegExp: /node_modules/,
      }),
    );

    // Aggressively ignore ALL viem test files and directories
    // This prevents bundling errors when viem tries to import test-only modules
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /\/actions\/test\//,
        contextRegExp: /node_modules\/viem/,
      }),
    );

    // Ignore viem test decorators
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /\/clients\/decorators\/test\.js$/,
        contextRegExp: /node_modules\/viem/,
      }),
    );

    // Ignore viem test client creation
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /\/clients\/createTestClient\.js$/,
        contextRegExp: /node_modules\/viem/,
      }),
    );

    // Use NormalModuleReplacementPlugin to catch relative imports
    // Match any import that resolves to viem test files
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^.*viem.*[\/\\]actions[\/\\]test[\/\\]dropTransaction/,
        require.resolve("./webpack-viem-test-stub.js"),
      ),
    );

    // Replace test decorators with ES module stub
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^.*viem.*[\/\\]clients[\/\\]decorators[\/\\]test\.js$/,
        require.resolve("./webpack-viem-test-decorators-stub.mjs"),
      ),
    );

    // Replace createTestClient with ES module stub - multiple patterns to catch all variations
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^.*viem.*[\/\\]clients[\/\\]createTestClient\.js$/,
        require.resolve("./webpack-viem-createTestClient-stub.mjs"),
      ),
    );

    // Catch relative imports from within viem package (e.g., ./clients/createTestClient.js)
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /[\/\\]clients[\/\\]createTestClient\.js$/,
        require.resolve("./webpack-viem-createTestClient-stub.mjs"),
      ),
    );

    // CRITICAL: Catch the exact path that Vercel production build uses
    // The error shows: ./clients/createTestClient.js from viem/_cjs/index.js
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /node_modules[\/\\]viem[\/\\]_cjs[\/\\]clients[\/\\]createTestClient\.js$/,
        require.resolve("./webpack-viem-createTestClient-stub.mjs"),
      ),
    );

    // Also match for _esm variant
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /node_modules[\/\\]viem[\/\\]_esm[\/\\]clients[\/\\]createTestClient\.js$/,
        require.resolve("./webpack-viem-createTestClient-stub.mjs"),
      ),
    );

    // Ignore README, LICENSE, and other non-code files
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /\.(md|txt|LICENSE|CHANGELOG)$/,
        contextRegExp: /node_modules/,
      }),
    );

    // Ignore test directories and files in node_modules
    config.resolve = config.resolve || {};

    // Get the absolute path to the stub file
    const testStubPath = require.resolve("./webpack-viem-test-stub.js");
    const createTestClientStubPath =
      require.resolve("./webpack-viem-createTestClient-stub.mjs");

    // Get absolute path to viem's createTestClient to use as alias key
    const viemPath = path.dirname(require.resolve("viem/package.json"));

    config.resolve.alias = {
      ...config.resolve.alias,
      "health-app": path.resolve(__dirname, "./my-health-app/src"),
      // Use absolute paths for viem test files - this catches relative imports
      [path.join(viemPath, "_cjs", "clients", "createTestClient.js")]:
        createTestClientStubPath,
      [path.join(viemPath, "_esm", "clients", "createTestClient.js")]:
        createTestClientStubPath,
      [path.join(viemPath, "_cjs", "clients", "decorators", "test.js")]:
        testStubPath,
      [path.join(viemPath, "_esm", "clients", "decorators", "test.js")]:
        testStubPath,
      [path.join(viemPath, "_cjs", "actions", "test", "dropTransaction.js")]:
        testStubPath,
      [path.join(viemPath, "_esm", "actions", "test", "dropTransaction.js")]:
        testStubPath,
      // Also keep the module-style aliases
      "viem/_esm/actions/test/dropTransaction": testStubPath,
      "viem/_esm/clients/decorators/test": testStubPath,
      "viem/_esm/clients/createTestClient": testStubPath,
      "viem/_esm/clients/createTestClient.js": testStubPath,
      "viem/_cjs/actions/test/dropTransaction": testStubPath,
      "viem/_cjs/clients/decorators/test": testStubPath,
      "viem/_cjs/clients/createTestClient": testStubPath,
      "viem/_cjs/clients/createTestClient.js": testStubPath,
      "viem/clients/createTestClient": testStubPath,
      "viem/clients/createTestClient.js": testStubPath,
    };

    // Mark viem test files as external (prevents bundling)
    if (!isServer) {
      config.externals = config.externals || [];
      if (typeof config.externals === "function") {
        const originalExternals = config.externals;
        config.externals = [
          originalExternals,
          ({ request }, callback) => {
            if (
              (request &&
                typeof request === "string" &&
                request.includes("viem") &&
                request.includes("test")) ||
              request.includes("dropTransaction")
            ) {
              return callback(null, "commonjs " + request);
            }
            callback();
          },
        ];
      } else if (Array.isArray(config.externals)) {
        config.externals.push(({ request }, callback) => {
          if (
            request &&
            typeof request === "string" &&
            ((request.includes("viem") && request.includes("test")) ||
              request.includes("dropTransaction"))
          ) {
            return callback(null, "commonjs " + request);
          }
          callback();
        });
      }
    }

    // Add my-health-app to the modules included in the build
    config.resolve.modules = config.resolve.modules || [];
    config.resolve.modules.push(path.resolve(__dirname, "./my-health-app"));

    // Fix PDF.js webpack issues - PDF.js uses ESM and needs special handling
    if (!isServer) {
      config.module = config.module || {};
      config.module.rules = config.module.rules || [];
      config.module.rules.push({
        test: /\.m?js$/,
        include: /node_modules[\\/]pdfjs-dist/,
        type: "javascript/auto",
        resolve: {
          fullySpecified: false,
        },
      });

      // Add canvas polyfill for PDF.js
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      };
    }

    // Fix ethers.js network detection issues in Next.js
    // Only disable Node.js modules for client-side builds
    // Server-side (isServer=true) needs http/https for ethers.js RPC calls
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
      };
    } else {
      // Server-side: allow Node.js modules for ethers.js
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        // Don't disable http/https on server - ethers needs them for RPC calls
      };
    }

    return config;
  },
  // Make sure Next.js knows to transpile my-health-app
  transpilePackages: ["my-health-app"],
  // Add headers for CORS
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,OPTIONS,PATCH,DELETE,POST,PUT",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
