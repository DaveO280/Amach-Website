/**
 * Jest configuration for @amach/legitimacy.
 *
 * Coverage targets per the Spring Push session brief:
 *   - 95%+ on check functions (src/checks/**)
 *   - 85%+ overall
 */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/__tests__"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/cli.ts",
    "!src/**/index.ts",
    "!src/**/*.d.ts"
  ],
  coverageThreshold: {
    global: {
      statements: 85,
      branches: 75,
      functions: 85,
      lines: 85
    },
    "src/checks/": {
      statements: 95,
      branches: 85,
      functions: 95,
      lines: 95
    }
  },
  testTimeout: 30000
};
