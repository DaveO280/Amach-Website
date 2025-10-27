const fetch = require("node-fetch");

async function testAddEmail() {
  console.log("🧪 Testing email addition to whitelist...\n");

  try {
    const response = await fetch("http://localhost:3001/api/whitelist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "ogara.d@gmail.com",
        action: "add",
        adminEmail: "admin@amachhealth.com",
      }),
    });

    const result = await response.json();

    if (response.ok) {
      console.log("✅ SUCCESS! Email added to whitelist:");
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("❌ FAILED to add email:");
      console.log(JSON.stringify(result, null, 2));
    }

    // Check database
    console.log("\n📊 Checking database...");
    const db = require("better-sqlite3")("./admin-data/whitelist-tracking.db");
    const whitelist = db.prepare("SELECT * FROM whitelist").all();
    console.log(`Database now has ${whitelist.length} whitelisted email(s)`);
    if (whitelist.length > 0) {
      whitelist.forEach((item, i) => {
        console.log(`  ${i + 1}. ${item.email}`);
      });
    }
    db.close();
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testAddEmail();
