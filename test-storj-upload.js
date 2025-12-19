/**
 * Test Storj upload functionality to verify connection
 */

const {
  S3Client,
  PutObjectCommand,
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

async function testStorjUpload() {
  console.log("🔍 Testing Storj upload functionality...\n");

  const bucket = "amach-health-464a2ccf9897e268";
  const testKey = `timeline-event/test-upload-${Date.now()}.enc`;
  const testData = JSON.stringify({
    test: true,
    timestamp: Date.now(),
    message: "Testing Storj upload",
  });

  try {
    // Test 1: Upload a file
    console.log("1️⃣ Testing UPLOAD...");
    console.log(`   Bucket: ${bucket}`);
    console.log(`   Key: ${testKey}`);

    const putCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: testData,
      ContentType: "application/octet-stream",
    });

    const uploadResult = await client.send(putCommand);
    console.log("✅ Upload successful!");
    console.log("   ETag:", uploadResult.ETag);
    console.log("   HTTP Status:", uploadResult.$metadata.httpStatusCode);
    console.log();

    // Test 2: List recent files in timeline-event folder
    console.log("2️⃣ Listing recent timeline events...");
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: "timeline-event/",
      MaxKeys: 10,
    });

    const listResult = await client.send(listCommand);
    console.log(`   Found ${listResult.Contents?.length || 0} objects`);

    if (listResult.Contents && listResult.Contents.length > 0) {
      console.log("\n   Recent files:");
      listResult.Contents.sort(
        (a, b) =>
          (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0),
      )
        .slice(0, 5)
        .forEach((obj, i) => {
          console.log(`   ${i + 1}. ${obj.Key}`);
          console.log(`      Size: ${obj.Size} bytes`);
          console.log(`      Modified: ${obj.LastModified?.toISOString()}`);
        });
    }
    console.log();

    console.log("✅ Storj connection is working!");
    console.log("   Credentials are valid");
    console.log("   Upload permissions: GRANTED");
    console.log("   List permissions: GRANTED");
  } catch (error) {
    console.error("❌ Storj test failed!");
    console.error("   Error name:", error.name);
    console.error("   Error message:", error.message);
    if (error.$metadata) {
      console.error("   HTTP status:", error.$metadata.httpStatusCode);
    }
  }
}

testStorjUpload();
