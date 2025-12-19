const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const RPC_URL =
    process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
  const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  console.log("🔍 Checking contract storage slots...\n");

  // ReentrancyGuardUpgradeable uses a specific storage slot
  // The slot is calculated as keccak256("openzeppelin.storage.ReentrancyGuard") - 1 for v5
  // OR namespace.ReentrancyGuard for v4

  // For OpenZeppelin v4/v5 upgradeable contracts, ReentrancyGuard typically uses slot 0 or a namespaced slot
  // Let's check the standard storage slots

  // Check slot 0 (often used for initialization/reentrancy status)
  const slot0 = await provider.getStorageAt(PROXY_ADDRESS, 0);
  console.log("Slot 0 (Initializable/Reentrancy):", slot0);

  // Check slot 1 (often Ownable)
  const slot1 = await provider.getStorageAt(PROXY_ADDRESS, 1);
  console.log("Slot 1 (Owner):", slot1);

  // Check slot 2
  const slot2 = await provider.getStorageAt(PROXY_ADDRESS, 2);
  console.log("Slot 2:", slot2);

  // Check implementation slot
  const implSlot =
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const implAddress = await provider.getStorageAt(PROXY_ADDRESS, implSlot);
  console.log("\nImplementation slot:", implAddress);
  console.log("Implementation address: 0x" + implAddress.slice(26));

  // Try calling the contract functions
  const abi = [
    "function owner() view returns (address)",
    "function getContractVersion() view returns (uint8)",
    "function currentVersion() view returns (uint8)",
  ];

  const contract = new ethers.Contract(PROXY_ADDRESS, abi, provider);

  try {
    const owner = await contract.owner();
    console.log("\n✅ Owner:", owner);
  } catch (e) {
    console.log("\n❌ Owner call failed:", e.message);
  }

  try {
    const version = await contract.getContractVersion();
    console.log("✅ getContractVersion:", version.toString());
  } catch (e) {
    console.log("❌ getContractVersion failed:", e.message);
  }

  try {
    const currentVer = await contract.currentVersion();
    console.log("✅ currentVersion:", currentVer.toString());
  } catch (e) {
    console.log("❌ currentVersion failed:", e.message);
  }
}

main().catch(console.error);
