// Test configuration for development
export const TEST_CONFIG = {
  // Set to true to use mock services instead of blockchain
  USE_MOCK_SERVICES:
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_USE_MOCK === "true",

  // Test wallet addresses (rotate through these)
  TEST_WALLETS: [
    "0x1234567890123456789012345678901234567890",
    "0x2345678901234567890123456789012345678901",
    "0x3456789012345678901234567890123456789012",
    "0x4567890123456789012345678901234567890123",
    "0x5678901234567890123456789012345678901234",
  ],

  // Test emails (rotate through these)
  TEST_EMAILS: [
    "test1@example.com",
    "test2@example.com",
    "test3@example.com",
    "test4@example.com",
    "test5@example.com",
  ],

  // Current test index (increment after each test)
  currentTestIndex: 0,
};

export function getNextTestWallet(): string {
  const wallet =
    TEST_CONFIG.TEST_WALLETS[
      TEST_CONFIG.currentTestIndex % TEST_CONFIG.TEST_WALLETS.length
    ];
  TEST_CONFIG.currentTestIndex++;
  return wallet;
}

export function getNextTestEmail(): string {
  const email =
    TEST_CONFIG.TEST_EMAILS[
      TEST_CONFIG.currentTestIndex % TEST_CONFIG.TEST_EMAILS.length
    ];
  return email;
}
