const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use Node.js runtime for blockchain interactions
  serverExternalPackages: ["ethers", "zksync-sso", "@wagmi/core", "viem"],
  // Turbopack config (empty to silence Next.js 16 warning, using webpack instead)
  turbopack: {},
  // Add webpack config to include my-health-app and fix ethers.js issues
  webpack: (config, { isServer }) => {
    // Add my-health-app to the modules included in the build
    config.resolve.modules.push(path.resolve(__dirname, "./my-health-app"));

    // Also make sure the resolve paths include my-health-app/src
    config.resolve.alias = {
      ...config.resolve.alias,
      "health-app": path.resolve(__dirname, "./my-health-app/src"),
    };

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
