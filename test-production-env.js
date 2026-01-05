/**
 * Test script to diagnose Storj credential issues in production
 * Run this to see what environment variables are available
 */

console.log("=== Environment Variables Check ===");
console.log(
  "STORJ_ACCESS_KEY:",
  process.env.STORJ_ACCESS_KEY
    ? `SET (length: ${process.env.STORJ_ACCESS_KEY.length})`
    : "MISSING",
);
console.log(
  "STORJ_SECRET_KEY:",
  process.env.STORJ_SECRET_KEY
    ? `SET (length: ${process.env.STORJ_SECRET_KEY.length})`
    : "MISSING",
);
console.log("STORJ_ENDPOINT:", process.env.STORJ_ENDPOINT || "MISSING");

console.log("\n=== Testing S3Client Initialization ===");
try {
  const { S3Client, ListBucketsCommand } = require("@aws-sdk/client-s3");

  const config = {
    endpoint: process.env.STORJ_ENDPOINT || "https://gateway.storjshare.io",
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.STORJ_ACCESS_KEY || "",
      secretAccessKey: process.env.STORJ_SECRET_KEY || "",
    },
    forcePathStyle: true,
  };

  console.log("Config (sanitized):", {
    endpoint: config.endpoint,
    region: config.region,
    accessKeyId: config.credentials.accessKeyId
      ? `${config.credentials.accessKeyId.substring(0, 4)}...`
      : "EMPTY",
    secretAccessKey: config.credentials.secretAccessKey ? "***SET***" : "EMPTY",
    forcePathStyle: config.forcePathStyle,
  });

  const client = new S3Client(config);
  console.log("✅ S3Client created successfully");

  // Try to list buckets
  console.log("\n=== Testing ListBuckets Command ===");
  client
    .send(new ListBucketsCommand({}))
    .then((result) => {
      console.log("✅ ListBuckets succeeded!");
      console.log(`Found ${result.Buckets?.length || 0} buckets`);
    })
    .catch((error) => {
      console.error("❌ ListBuckets failed:");
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      if (error.$metadata) {
        console.error("HTTP status:", error.$metadata.httpStatusCode);
      }
    });
} catch (error) {
  console.error("❌ Failed to initialize S3Client:");
  console.error(error);
}
