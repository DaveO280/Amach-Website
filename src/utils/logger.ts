// src/utils/logger.ts

/**
 * Simple logging utility for consistent logging throughout the application.
 * In a production environment, this could be replaced with a more sophisticated
 * logging solution.
 */
export const logger = {
  /**
   * Log informational messages
   */
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${message}`, data || "");
  },

  /**
   * Log warning messages
   */
  warn: (message: string, data?: any) => {
    console.warn(`[WARN] ${message}`, data || "");
  },

  /**
   * Log error messages
   */
  error: (message: string, data?: any) => {
    console.error(`[ERROR] ${message}`, data || "");
  },

  /**
   * Log debug messages (only when debug mode is enabled)
   */
  debug: (message: string, data?: any) => {
    if (process.env.API_DEBUG_MODE === "true") {
      console.debug(`[DEBUG] ${message}`, data || "");
    }
  },
};
