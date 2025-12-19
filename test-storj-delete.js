/**
 * Test script to verify Storj DELETE permissions
 */

const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require("@aws-sdk/client-s3");

const client = new S3Client({
  endpoint: "https://gateway.storjshare.io",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.STORJ_ACCESS_KEY,
    secretAccessKey: process.env.STORJ_SECRET_KEY,
  },
  forcePathStyle: true,
});

async function testStorjPermissions() {
  console.log("🔍 Testing Storj credentials permissions...\n");

  const bucket = "amach-encrypted";
  const testKey = `test-delete-${Date.now()}.txt`;

  try {
    // Test 1: LIST permission
    console.log("1️⃣ Testing LIST permission...");
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 1,
      });
      await client.send(listCommand);
      console.log("✅ LIST permission: GRANTED\n");
    } catch (error) {
      console.log("❌ LIST permission: DENIED");
      console.log("   Error:", error.message, "\n");
    }

    // Test 2: WRITE permission
    console.log("2️⃣ Testing WRITE permission...");
    try {
      const putCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: "test data for delete",
      });
      await client.send(putCommand);
      console.log("✅ WRITE permission: GRANTED");
      console.log(`   Created test file: ${testKey}\n`);
    } catch (error) {
      console.log("❌ WRITE permission: DENIED");
      console.log("   Error:", error.message, "\n");
      return;
    }

    // Test 3: DELETE permission
    console.log("3️⃣ Testing DELETE permission...");
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: bucket,
        Key: testKey,
      });
      const result = await client.send(deleteCommand);
      console.log("✅ DELETE permission: GRANTED");
      console.log(`   Deleted test file: ${testKey}`);
      console.log("   Response:", JSON.stringify(result, null, 2), "\n");
    } catch (error) {
      console.log("❌ DELETE permission: DENIED");
      console.log("   Error:", error.name);
      console.log("   Message:", error.message);
      console.log("\n⚠️  The access grant does NOT have DELETE permissions!");
      console.log(
        "   You need to create a new access grant with DELETE permission.\n",
      );
    }
  } catch (error) {
    console.error("❌ Unexpected error:", error);
  }
}

testStorjPermissions();
