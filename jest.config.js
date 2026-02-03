module.exports = {
  preset: "ts-jest",
  // Default to node to avoid jsdom/canvas native dependency issues on Windows.
  // If we add DOM-dependent tests later, create a dedicated "browser" project.
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  // Use node environment for storage tests (no DOM needed)
  testEnvironmentOptions: {
    customExportConditions: [""],
  },
  // Override environment for specific test files
  projects: [
    {
      displayName: "default",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: [
        "**/__tests__/**/*.test.ts",
        "!**/storage/**",
        "!**/utils/reportParsers/__tests__/**",
        "!**/data/parsers/__tests__/**",
      ],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
      },
      transform: {
        "^.+\\.tsx?$": "ts-jest",
      },
    },
    {
      displayName: "parsers",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: [
        "**/utils/reportParsers/__tests__/**/*.test.ts",
        "**/data/parsers/__tests__/**/*.test.ts",
      ],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
      },
      transform: {
        "^.+\\.tsx?$": "ts-jest",
      },
    },
    {
      displayName: "storage",
      preset: "ts-jest",
      testEnvironment: "node", // Use node for storage tests
      testMatch: ["**/storage/__tests__/**/*.test.ts"],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
      },
      transform: {
        "^.+\\.tsx?$": "ts-jest",
      },
    },
  ],
};
