/**
 * Check what files exist in Storj and when they were created
 */

const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");

const client = new S3Client({
  endpoint: "https://gateway.storjshare.io",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.STORJ_ACCESS_KEY,
    secretAccessKey: process.env.STORJ_SECRET_KEY,
  },
  forcePathStyle: true,
});

async function checkStorjFiles() {
  console.log("📋 Checking Storj files...\n");

  const bucket = "amach-health-464a2ccf9897e268";

  try {
    // List ALL files in the bucket
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      MaxKeys: 100, // Get up to 100 files
    });

    const result = await client.send(listCommand);

    if (!result.Contents || result.Contents.length === 0) {
      console.log("❌ No files found in bucket!");
      return;
    }

    console.log(`Found ${result.Contents.length} total files\n`);

    // Sort by last modified (newest first)
    const sortedFiles = result.Contents.sort(
      (a, b) =>
        (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0),
    );

    // Show all files with dates
    console.log("📅 All files (newest first):\n");
    sortedFiles.forEach((file, i) => {
      const date = file.LastModified;
      const now = new Date();
      const ageHours = date
        ? (now.getTime() - date.getTime()) / (1000 * 60 * 60)
        : 0;
      const ageDays = Math.floor(ageHours / 24);

      console.log(`${i + 1}. ${file.Key}`);
      console.log(`   Size: ${file.Size} bytes`);
      console.log(`   Modified: ${date?.toISOString()}`);
      console.log(
        `   Age: ${ageDays} days, ${Math.floor(ageHours % 24)} hours ago`,
      );

      // Highlight if created today
      if (ageDays === 0 && ageHours < 24) {
        console.log(`   ⭐ CREATED TODAY! (${Math.floor(ageHours)} hours ago)`);
      }
      console.log();
    });

    // Check for today's files
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaysFiles = sortedFiles.filter((file) => {
      const fileDate = file.LastModified;
      return fileDate && fileDate >= today;
    });

    console.log("\n" + "=".repeat(60));
    if (todaysFiles.length > 0) {
      console.log(`✅ Found ${todaysFiles.length} file(s) created today!`);
    } else {
      console.log(`⚠️  NO files created today (${today.toLocaleDateString()})`);
      console.log(
        `   Most recent file: ${sortedFiles[0].LastModified?.toLocaleDateString()}`,
      );
    }
    console.log("=".repeat(60));
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

checkStorjFiles();
