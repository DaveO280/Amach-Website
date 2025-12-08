const path = require("path");
const webpack = require("webpack");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use Node.js runtime for blockchain interactions
  // Also externalize packages that have test files that shouldn't be bundled
  serverExternalPackages: [
    "ethers",
    "zksync-sso",
    "@wagmi/core",
    "viem",
    "pino",
    "thread-stream",
  ],
  // Explicitly disable Turbopack - we need webpack for custom configs
  // The --webpack flag should work, but removing turbopack config ensures webpack is used
  // Add webpack config to include my-health-app and fix ethers.js issues
  webpack: (config, { isServer }) => {
    // Ignore test files and other unnecessary files from node_modules
    config.plugins = config.plugins || [];
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

    // Ignore README, LICENSE, and other non-code files
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /\.(md|txt|LICENSE|CHANGELOG)$/,
        contextRegExp: /node_modules/,
      }),
    );

    // Ignore test directories and files in node_modules
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "health-app": path.resolve(__dirname, "./my-health-app/src"),
    };

    // Add my-health-app to the modules included in the build
    config.resolve.modules = config.resolve.modules || [];
    config.resolve.modules.push(path.resolve(__dirname, "./my-health-app"));

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
