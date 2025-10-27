const { ethers } = require("ethers");

const PROFILE_VERIFICATION_CONTRACT =
  "0xB7484a0D79BEe9d4caf50aD705565d99f624F44f";
const RPC_URL = "https://sepolia.era.zksync.dev";

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const contract = new ethers.Contract(
  PROFILE_VERIFICATION_CONTRACT,
  [
    "event TokensClaimed(address indexed user, uint256 amount, uint256 timestamp)",
  ],
  provider,
);

async function checkClaimedEvents() {
  console.log("🔍 Checking TokensClaimed events...");

  try {
    const events = await contract.queryFilter("TokensClaimed");
    console.log(`Found ${events.length} TokensClaimed events`);

    if (events.length > 0) {
      events.forEach((event, i) => {
        console.log(`\nEvent ${i + 1}:`);
        console.log(`  User: ${event.args.user}`);
        console.log(
          `  Amount: ${ethers.utils.formatEther(event.args.amount)} AHP`,
        );
        console.log(
          `  Timestamp: ${new Date(Number(event.args.timestamp) * 1000).toISOString()}`,
        );
        console.log(`  Block: ${event.blockNumber}`);
        console.log(`  TX: ${event.transactionHash}`);
      });
    } else {
      console.log("❌ No TokensClaimed events found");
      console.log(
        "This means the contract is not emitting the event when claims happen",
      );
    }
  } catch (error) {
    console.error("❌ Error checking events:", error.message);
  }
}

checkClaimedEvents().catch(console.error);
