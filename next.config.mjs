import path from "path";
import { fileURLToPath } from "url";

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep any existing options
  eslint: {
    ignoreDuringBuilds: false,
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
};

export default nextConfig;
