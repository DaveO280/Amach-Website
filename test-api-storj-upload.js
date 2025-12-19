/**
 * Test the /api/storj endpoint for timeline event upload
 * This simulates what the browser does when creating a health event
 */

async function testStorjAPI() {
  console.log("🧪 Testing /api/storj endpoint for timeline upload...\n");

  // Mock encryption key (in real app, this comes from wallet signature)
  const mockEncryptionKey = {
    key: Buffer.from("0".repeat(64), "hex"),
    salt: Buffer.from("0".repeat(32), "hex"),
  };

  // Mock user address
  const mockAddress = "0x464a2ccf9897e268" + "0".repeat(24); // Shortened for example

  // Mock timeline event
  const mockEvent = {
    id: crypto.randomUUID(),
    eventType: "TEST_EVENT",
    timestamp: Date.now(),
    data: {
      description: "Test event from Node.js",
      severity: "low",
    },
  };

  try {
    console.log("📤 Sending POST request to http://localhost:3000/api/storj");
    console.log("   Action: timeline/store");
    console.log("   Event ID:", mockEvent.id);

    const response = await fetch("http://localhost:3000/api/storj", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "timeline/store",
        userAddress: mockAddress,
        encryptionKey: mockEncryptionKey,
        data: mockEvent,
        options: {
          metadata: {
            eventType: mockEvent.eventType,
            eventId: mockEvent.id,
          },
        },
      }),
    });

    console.log("\n📥 Response received:");
    console.log("   Status:", response.status, response.statusText);
    console.log("   OK:", response.ok);

    const result = await response.json();
    console.log("\n📋 Response body:", JSON.stringify(result, null, 2));

    if (result.success && result.result?.storjUri) {
      console.log("\n✅ Upload successful!");
      console.log("   Storj URI:", result.result.storjUri);
      console.log("   Content Hash:", result.result.contentHash);
    } else {
      console.log("\n❌ Upload failed!");
      console.log("   Error:", result.error || "Unknown error");
    }
  } catch (error) {
    console.error("\n❌ Request failed:", error.message);
    if (error.cause) {
      console.error("   Cause:", error.cause);
    }
  }
}

// Check if dev server is running
fetch("http://localhost:3000")
  .then(() => {
    console.log("✅ Dev server is running\n");
    return testStorjAPI();
  })
  .catch(() => {
    console.error("❌ Dev server is not running!");
    console.error("   Please start it with: pnpm dev");
    process.exit(1);
  });
