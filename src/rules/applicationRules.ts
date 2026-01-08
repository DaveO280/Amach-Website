/**
 * Application-wide rules and standards
 */

// API Configuration Rules
export const APIRules = {
  // Venice API Configuration
  VENICE: {
    ENDPOINT: "https://api.venice.ai/api/v1",
    MODEL: process.env.NEXT_PUBLIC_VENICE_MODEL_NAME || "zai-org-glm-4.7",
    MAX_TOKENS: 2000,
    TEMPERATURE: 0.7,
    TIMEOUT: 60000, // 60 seconds
    RETRY_ATTEMPTS: 2,
    RETRY_DELAY: 1000, // 1 second
  },

  // Health Data API Configuration
  HEALTH_DATA: {
    MAX_HISTORY_DAYS: 30,
    MIN_DATA_POINTS: 3,
    REFRESH_INTERVAL: 300000, // 5 minutes
  },

  // Error Handling
  ERROR_HANDLING: {
    MAX_ERROR_MESSAGE_LENGTH: 500,
    RETRYABLE_STATUS_CODES: [429, 503, 504],
    NON_RETRYABLE_STATUS_CODES: [400, 401, 403, 404],
  },
};

// Data Structure Rules
export const DataRules = {
  // Health Data Structure
  HEALTH_DATA: {
    REQUIRED_METRICS: [
      "heartRate",
      "steps",
      "activeEnergy",
      "exerciseTime",
      "sleep",
    ],
    METRIC_UNITS: {
      heartRate: "bpm",
      steps: "steps",
      activeEnergy: "calories",
      exerciseTime: "minutes",
      sleep: "hours",
    },
    MIN_VALUES: {
      heartRate: 30,
      steps: 0,
      activeEnergy: 0,
      exerciseTime: 0,
      sleep: 0,
    },
    MAX_VALUES: {
      heartRate: 220,
      steps: 50000,
      activeEnergy: 5000,
      exerciseTime: 1440, // 24 hours
      sleep: 24,
    },
  },

  // AI Chat Structure
  CHAT: {
    MAX_HISTORY_LENGTH: 50,
    MAX_MESSAGE_LENGTH: 2000,
    MIN_MESSAGE_LENGTH: 1,
    SYSTEM_ROLES: ["user", "assistant", "system"] as const,
  },
};

// Styling Rules
export const StylingRules = {
  // Color Palette
  COLORS: {
    PRIMARY: "#4F46E5",
    SECONDARY: "#10B981",
    ACCENT: "#F59E0B",
    BACKGROUND: "#F9FAFB",
    TEXT: {
      PRIMARY: "#111827",
      SECONDARY: "#6B7280",
      LIGHT: "#9CA3AF",
    },
    ERROR: "#EF4444",
    SUCCESS: "#10B981",
    WARNING: "#F59E0B",
  },

  // Typography
  TYPOGRAPHY: {
    FONT_FAMILY: {
      PRIMARY: "Inter, sans-serif",
      SECONDARY: "Roboto, sans-serif",
    },
    FONT_SIZES: {
      SMALL: "0.875rem",
      MEDIUM: "1rem",
      LARGE: "1.25rem",
      XLARGE: "1.5rem",
      XXLARGE: "2rem",
    },
    FONT_WEIGHTS: {
      LIGHT: 300,
      REGULAR: 400,
      MEDIUM: 500,
      BOLD: 700,
    },
  },

  // Spacing
  SPACING: {
    XS: "0.25rem",
    SM: "0.5rem",
    MD: "1rem",
    LG: "1.5rem",
    XL: "2rem",
    XXL: "3rem",
  },

  // Border Radius
  BORDER_RADIUS: {
    SM: "0.25rem",
    MD: "0.5rem",
    LG: "1rem",
    FULL: "9999px",
  },

  // Shadows
  SHADOWS: {
    SM: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    MD: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    LG: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
  },
};

// Component Rules
export const ComponentRules = {
  // Button Rules
  BUTTON: {
    SIZES: {
      SM: {
        padding: "0.5rem 1rem",
        fontSize: "0.875rem",
      },
      MD: {
        padding: "0.75rem 1.5rem",
        fontSize: "1rem",
      },
      LG: {
        padding: "1rem 2rem",
        fontSize: "1.25rem",
      },
    },
    VARIANTS: {
      PRIMARY: {
        backgroundColor: StylingRules.COLORS.PRIMARY,
        color: "white",
      },
      SECONDARY: {
        backgroundColor: StylingRules.COLORS.SECONDARY,
        color: "white",
      },
      OUTLINE: {
        border: `1px solid ${StylingRules.COLORS.PRIMARY}`,
        color: StylingRules.COLORS.PRIMARY,
      },
    },
  },

  // Input Rules
  INPUT: {
    SIZES: {
      SM: {
        padding: "0.5rem 0.75rem",
        fontSize: "0.875rem",
      },
      MD: {
        padding: "0.75rem 1rem",
        fontSize: "1rem",
      },
      LG: {
        padding: "1rem 1.25rem",
        fontSize: "1.25rem",
      },
    },
    STATES: {
      FOCUS: {
        borderColor: StylingRules.COLORS.PRIMARY,
        boxShadow: `0 0 0 2px ${StylingRules.COLORS.PRIMARY}20`,
      },
      ERROR: {
        borderColor: StylingRules.COLORS.ERROR,
        boxShadow: `0 0 0 2px ${StylingRules.COLORS.ERROR}20`,
      },
    },
  },

  // Card Rules
  CARD: {
    PADDING: StylingRules.SPACING.MD,
    BORDER_RADIUS: StylingRules.BORDER_RADIUS.MD,
    SHADOW: StylingRules.SHADOWS.MD,
  },
};

// Performance Rules
export const PerformanceRules = {
  // API Caching
  CACHING: {
    HEALTH_DATA: {
      TTL: 300000, // 5 minutes
      MAX_SIZE: 100, // Maximum number of cached items
    },
    AI_RESPONSES: {
      TTL: 3600000, // 1 hour
      MAX_SIZE: 50,
    },
  },

  // Resource Loading
  RESOURCE_LOADING: {
    MAX_CONCURRENT_REQUESTS: 5,
    REQUEST_TIMEOUT: 30000, // 30 seconds
    RETRY_DELAY: 1000, // 1 second
  },
};

// Security Rules
export const SecurityRules = {
  // API Security
  API: {
    MAX_REQUEST_SIZE: 1024 * 1024, // 1MB
    RATE_LIMIT: {
      WINDOW: 60000, // 1 minute
      MAX_REQUESTS: 60,
    },
  },

  // Data Security
  DATA: {
    ENCRYPTION: {
      ALGORITHM: "AES-GCM",
      KEY_LENGTH: 256,
    },
    SANITIZATION: {
      MAX_STRING_LENGTH: 10000,
      ALLOWED_HTML_TAGS: ["b", "i", "em", "strong", "p", "br"],
    },
  },
};

// Logging Rules
export const LoggingRules = {
  // Log Levels
  LEVELS: {
    ERROR: "error",
    WARN: "warn",
    INFO: "info",
    DEBUG: "debug",
  },

  // Log Format
  FORMAT: {
    TIMESTAMP: "YYYY-MM-DD HH:mm:ss.SSS",
    MAX_MESSAGE_LENGTH: 1000,
  },

  // Log Categories
  CATEGORIES: {
    API: "api",
    HEALTH: "health",
    AI: "ai",
    UI: "ui",
    SECURITY: "security",
  },
};

// Export all rules
export const ApplicationRules = {
  API: APIRules,
  DATA: DataRules,
  STYLING: StylingRules,
  COMPONENTS: ComponentRules,
  PERFORMANCE: PerformanceRules,
  SECURITY: SecurityRules,
  LOGGING: LoggingRules,
};
