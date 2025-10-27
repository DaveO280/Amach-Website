const { whitelistQueries, hashEmail } = require("./shared-database.ts");

// Test emails to add to whitelist
const testEmails = [
  "test15@test.com",
  "test14@test.com",
  "test13@test.com",
  "test12@test.com",
  "test11@test.com",
  "test10@test.com",
  "test9@test.com",
  "test8@test.com",
  "test7@test.com",
  "test6@test.com",
  "test5@test.com",
  "test4@test.com",
  "test3@test.com",
  "user1@example.com",
  "user2@example.com",
  "user3@example.com",
  "user4@example.com",
  "user5@example.com",
];

console.log("🗄️ Populating shared database with test data...");

testEmails.forEach((email) => {
  try {
    const emailHash = hashEmail(email);
    const whitelistProof = `whitelist_proof_${emailHash}`;

    whitelistQueries.addEmail.run(
      email,
      emailHash,
      whitelistProof,
      "admin@amachhealth.com",
    );
    console.log(`✅ Added ${email} to whitelist`);
  } catch (error) {
    if (error.message.includes("UNIQUE constraint failed")) {
      console.log(`⚠️  ${email} already exists in whitelist`);
    } else {
      console.error(`❌ Error adding ${email}:`, error.message);
    }
  }
});

console.log("✅ Test data population complete!");
