// Stub module to replace viem test files in webpack builds
// This prevents bundling errors when viem tries to import test-only modules
// We export stubs that match what viem's index.js expects

// Stub for createTestClient
function createTestClient() {
  throw new Error("createTestClient is not available in production builds");
}

// Stub for testActions
const testActions = {};

// Export both as CommonJS (for webpack) and ES module style
module.exports = {
  createTestClient,
  testActions,
};

// Also support ES module exports
if (typeof exports !== "undefined") {
  exports.createTestClient = createTestClient;
  exports.testActions = testActions;
}
