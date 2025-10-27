const { createPublicClient, http, parseAbi } = require("viem");
const { zkSyncSepoliaTestnet } = require("viem/chains");

const HEALTH_TOKEN_CONTRACT = "0xBcd8dC8A5F1A6A704c10A7A3c78d2048dAC224c7";
const PROFILE_VERIFICATION_CONTRACT =
  "0xB7484a0D79BEe9d4caf50aD705565d99f624F44f";

async function testTokenStats() {
  console.log("🔍 Testing admin dashboard token stats logic...");

  try {
    // Create a public client for reading contract data
    const publicClient = createPublicClient({
      chain: zkSyncSepoliaTestnet,
      transport: http("https://sepolia.era.zksync.dev"),
    });

    // ABIs
    const tokenAbi = parseAbi([
      "function totalSupply() view returns (uint256)",
      "function balanceOf(address) view returns (uint256)",
      "event Transfer(address indexed from, address indexed to, uint256 value)",
    ]);

    const verificationAbi = parseAbi([
      "function getAllocationConfig() view returns (uint256, uint256, uint256, bool)",
      "function getTotalVerifiedUsers() view returns (uint256)",
      "event TokensClaimed(address indexed user, uint256 amount, uint256 timestamp)",
    ]);

    // Read token supply
    const totalSupply = await publicClient.readContract({
      address: HEALTH_TOKEN_CONTRACT,
      abi: tokenAbi,
      functionName: "totalSupply",
    });

    // Read allocation config
    const allocationConfig = await publicClient.readContract({
      address: PROFILE_VERIFICATION_CONTRACT,
      abi: verificationAbi,
      functionName: "getAllocationConfig",
    });

    // Read total verified users
    const totalVerifiedUsers = await publicClient.readContract({
      address: PROFILE_VERIFICATION_CONTRACT,
      abi: verificationAbi,
      functionName: "getTotalVerifiedUsers",
    });

    // Get actual claimed tokens by reading TokensClaimed events
    const claimedEvents = await publicClient.getLogs({
      address: PROFILE_VERIFICATION_CONTRACT,
      event: parseAbi([
        "event TokensClaimed(address indexed user, uint256 amount, uint256 timestamp)",
      ])[0],
      fromBlock: "earliest",
    });

    console.log("📊 Results:");
    console.log(`  Total Supply: ${Number(totalSupply) / 1e18} AHP`);
    console.log(`  Total Verified Users: ${Number(totalVerifiedUsers)}`);
    console.log(`  Claimed Events Found: ${claimedEvents.length}`);

    if (claimedEvents.length > 0) {
      const totalClaimedWei = claimedEvents.reduce((sum, event) => {
        return sum + (event.args.amount || 0n);
      }, 0n);
      console.log(`  Total Claimed: ${Number(totalClaimedWei) / 1e18} AHP`);

      claimedEvents.forEach((event, i) => {
        console.log(
          `    Event ${i + 1}: ${event.args.user} - ${Number(event.args.amount) / 1e18} AHP`,
        );
      });
    }

    const totalAllocatedWei = allocationConfig[0];
    const allocationPerUserWei = allocationConfig[2];

    console.log(`  Total Allocated: ${Number(totalAllocatedWei) / 1e18} AHP`);
    console.log(
      `  Allocation Per User: ${Number(allocationPerUserWei) / 1e18} AHP`,
    );
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testTokenStats().catch(console.error);
