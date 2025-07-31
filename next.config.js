import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable Edge Runtime for API routes
  experimental: {
    runtime: "edge",
  },
  // Configure environment variables for Edge runtime
  env: {
    VENICE_API_KEY: process.env.VENICE_API_KEY,
    VENICE_API_ENDPOINT:
      process.env.VENICE_API_ENDPOINT || "https://api.venice.ai/api/v1",
    VENICE_MODEL_NAME: process.env.VENICE_MODEL_NAME || "llama-3.1-405b",
  },
  // Add webpack config to include my-health-app
  webpack: (config, { isServer }) => {
    // Add my-health-app to the modules included in the build
    config.resolve.modules.push(path.resolve(__dirname, "./my-health-app"));

    // Also make sure the resolve paths include my-health-app/src
    config.resolve.alias = {
      ...config.resolve.alias,
      "health-app": path.resolve(__dirname, "./my-health-app/src"),
    };

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
