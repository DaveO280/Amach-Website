module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
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
      testEnvironment: "jsdom",
      testMatch: ["**/__tests__/**/*.test.ts", "!**/storage/**"],
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
