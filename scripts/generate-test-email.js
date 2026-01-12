#!/usr/bin/env node

/**
 * Quick script to generate test email addresses for Privy testing
 *
 * Usage:
 *   node scripts/generate-test-email.js
 *   node scripts/generate-test-email.js --base yourname@gmail.com --count 10
 */

const args = process.argv.slice(2);

// Parse arguments
let baseEmail = "yourname@gmail.com"; // Replace with your actual email
let count = 5;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--base" && args[i + 1]) {
    baseEmail = args[i + 1];
    i++;
  } else if (args[i] === "--count" && args[i + 1]) {
    count = parseInt(args[i + 1], 10);
    i++;
  }
}

// Validate email format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(baseEmail)) {
  console.error("❌ Invalid email format:", baseEmail);
  console.log("\nUsage:");
  console.log("  node scripts/generate-test-email.js");
  console.log(
    "  node scripts/generate-test-email.js --base yourname@gmail.com --count 10",
  );
  process.exit(1);
}

// Extract local and domain parts
const [local, domain] = baseEmail.split("@");

console.log("\n📧 Test Email Addresses for Privy Testing\n");
console.log("=".repeat(60));
console.log(`Base email: ${baseEmail}`);
console.log(`Generating ${count} test addresses...\n`);

// Generate test emails
for (let i = 1; i <= count; i++) {
  const testEmail = `${local}+test${i}@${domain}`;
  console.log(`${i.toString().padStart(2, " ")}. ${testEmail}`);
}

console.log("\n" + "=".repeat(60));
console.log("\n💡 Tips:");
console.log("  • All emails will be delivered to your main inbox");
console.log("  • Search your inbox for '+test1', '+test2', etc. to filter");
console.log("  • These work with Gmail, Outlook, and most email providers");
console.log("  • Use these addresses in Privy signup flow\n");
