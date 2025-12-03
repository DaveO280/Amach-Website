/**
 * Update ProfileVerification Contract Address
 *
 * This script automatically updates the contract address in networkConfig.ts
 * Usage: node scripts/update-contract-address.js <new-contract-address>
 */

const fs = require("fs");
const path = require("path");

function updateContractAddress() {
  const newAddress = process.argv[2];

  if (!newAddress) {
    console.error("❌ Error: Please provide the new contract address");
    console.log(
      "\nUsage: node scripts/update-contract-address.js <new-contract-address>",
    );
    console.log(
      "Example: node scripts/update-contract-address.js 0x1234567890123456789012345678901234567890",
    );
    process.exit(1);
  }

  // Validate address format
  if (!newAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    console.error("❌ Error: Invalid Ethereum address format");
    console.log("Address must be 42 characters starting with 0x");
    process.exit(1);
  }

  console.log("\n🔄 Updating ProfileVerification Contract Address");
  console.log("=================================================");
  console.log(`New address: ${newAddress}\n`);

  const oldAddress = "0xA2D3b1b8080895C5bE335d8352D867e4b6e51ab3";

  // Update networkConfig.ts
  const networkConfigPath = path.join(__dirname, "../src/lib/networkConfig.ts");

  if (!fs.existsSync(networkConfigPath)) {
    console.error("❌ Error: networkConfig.ts not found");
    process.exit(1);
  }

  let content = fs.readFileSync(networkConfigPath, "utf8");
  const originalContent = content;

  // Replace the address
  content = content.replace(
    `PROFILE_VERIFICATION_CONTRACT: "${oldAddress}"`,
    `PROFILE_VERIFICATION_CONTRACT: "${newAddress}"`,
  );

  if (content === originalContent) {
    console.warn(
      "⚠️  Warning: No changes made. The old address might not exist in the file.",
    );
    console.log(
      "   Looking for:",
      `PROFILE_VERIFICATION_CONTRACT: "${oldAddress}"`,
    );

    // Try to find what exists
    const match = content.match(
      /PROFILE_VERIFICATION_CONTRACT:\s*"(0x[a-fA-F0-9]{40})"/,
    );
    if (match) {
      console.log("   Found:", `PROFILE_VERIFICATION_CONTRACT: "${match[1]}"`);
      console.log("\n❓ Do you want to replace this address instead?");
      console.log("   If yes, manually update the script or the file.");
    }
    process.exit(1);
  }

  fs.writeFileSync(networkConfigPath, content);
  console.log("✅ Updated src/lib/networkConfig.ts");

  // Archive old deployment
  const deploymentPath = path.join(
    __dirname,
    "../deployments/archive/fresh-system-deployment.json",
  );
  if (fs.existsSync(deploymentPath)) {
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    if (deployment.contracts && deployment.contracts.profileVerification) {
      const timestamp = Date.now();
      const archivePath = path.join(
        __dirname,
        `../deployments/archive/fresh-system-deployment-backup-${timestamp}.json`,
      );
      fs.writeFileSync(archivePath, JSON.stringify(deployment, null, 2));
      console.log(
        `✅ Archived old deployment to: deployments/archive/fresh-system-deployment-backup-${timestamp}.json`,
      );

      // Update the deployment file with new address
      deployment.contracts.profileVerification.address = newAddress;
      deployment.timestamp = new Date().toISOString();
      deployment.notes = `Contract redeployed on ${new Date().toISOString()} - Previous registrations cleared`;
      fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
      console.log(
        "✅ Updated deployments/archive/fresh-system-deployment.json",
      );
    }
  }

  console.log("\n✅ Contract address updated successfully!");
  console.log("\n📝 NEXT STEPS:");
  console.log("=============");
  console.log("1. Restart your development server (Ctrl+C and npm run dev)");
  console.log("2. Clear your browser's localStorage for this app");
  console.log("3. Try the wallet creation wizard again");
  console.log("\n🎉 Your email should now be available for registration!\n");
}

updateContractAddress();
