// src/utils/logger.ts

/**
 * Simple logging utility for consistent logging throughout the application.
 * In a production environment, this could be replaced with a more sophisticated
 * logging solution.
 */
const isProd = process.env.NODE_ENV === "production";

export const logger = {
  /**
   * Log informational messages
   */
  info: (message: string, data?: unknown): void => {
    if (!isProd) console.log(`[INFO] ${message}`, data || "");
  },

  /**
   * Log warning messages
   */
  warn: (message: string, data?: unknown): void => {
    if (!isProd) console.warn(`[WARN] ${message}`, data || "");
  },

  /**
   * Log error messages
   */
  error: (message: string, data?: unknown): void => {
    // Always log errors, or send to a service in production
    console.error(`[ERROR] ${message}`, data || "");
  },

  /**
   * Log debug messages (only when debug mode is enabled)
   */
  debug: (message: string, data?: unknown): void => {
    if (!isProd && process.env.API_DEBUG_MODE === "true") {
      console.debug(`[DEBUG] ${message}`, data || "");
    }
  },
};
