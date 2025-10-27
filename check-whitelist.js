const { ethers } = require("ethers");

const PROFILE_VERIFICATION_CONTRACT =
  "0x87B69bDBa7e9E15E7e8e3337D76c62A2b6A78356";
const provider = new ethers.providers.JsonRpcProvider(
  "https://sepolia.era.zksync.dev",
);

const verificationAbi = [
  "function getWhitelistedEmailsCount() view returns (uint256)",
  "function whitelistedEmails(uint256) view returns (string)",
];

async function checkWhitelist() {
  console.log("🔍 Checking Whitelist on Fresh Contract...\n");

  const contract = new ethers.Contract(
    PROFILE_VERIFICATION_CONTRACT,
    verificationAbi,
    provider,
  );

  try {
    const count = await contract.getWhitelistedEmailsCount();
    console.log("📊 Total Whitelisted Emails on Blockchain:", count.toString());

    if (count > 0) {
      console.log("\n📧 Whitelisted Emails:");
      for (let i = 0; i < count; i++) {
        const email = await contract.whitelistedEmails(i);
        console.log(`${i + 1}. ${email}`);
      }
    }
  } catch (error) {
    console.log("⚠️ Contract may not have getWhitelistedEmailsCount function");
    console.log(
      "This is expected - whitelist is managed by admin, not readable from contract",
    );
  }
}

checkWhitelist().catch(console.error);
