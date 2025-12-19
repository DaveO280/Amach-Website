/**
 * Test DELETE on the actual bucket used by the app
 */

const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListBucketsCommand,
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

async function testActualBucket() {
  console.log("🔍 Testing DELETE on actual app bucket...\n");

  // The bucket from the error log
  const bucket = "amach-health-464a2ccf9897e268";
  const testKey = `timeline-event/test-delete-${Date.now()}.enc`;

  try {
    // First, list all buckets to see what we have access to
    console.log("📋 Listing all buckets...");
    try {
      const listBucketsCommand = new ListBucketsCommand({});
      const bucketsResult = await client.send(listBucketsCommand);
      console.log(
        "Buckets:",
        bucketsResult.Buckets?.map((b) => b.Name).join(", "),
      );
    } catch (error) {
      console.log("Cannot list buckets:", error.message);
    }
    console.log();

    // Test WRITE on actual bucket
    console.log(`1️⃣ Testing WRITE to bucket: ${bucket}...`);
    try {
      const putCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: "test data",
      });
      await client.send(putCommand);
      console.log("✅ WRITE successful");
      console.log(`   Created: ${testKey}\n`);
    } catch (error) {
      console.log("❌ WRITE failed:", error.message);
      console.log("   This bucket might not exist or we don't have access\n");
      return;
    }

    // Test DELETE on actual bucket
    console.log("2️⃣ Testing DELETE...");
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: bucket,
        Key: testKey,
      });
      const result = await client.send(deleteCommand);
      console.log("✅ DELETE successful");
      console.log("   Status:", result.$metadata.httpStatusCode);
    } catch (error) {
      console.log("❌ DELETE failed");
      console.log("   Error name:", error.name);
      console.log("   Error message:", error.message);
      if (error.$metadata) {
        console.log("   HTTP status:", error.$metadata.httpStatusCode);
      }
    }
  } catch (error) {
    console.error("❌ Unexpected error:", error);
  }
}

testActualBucket();
