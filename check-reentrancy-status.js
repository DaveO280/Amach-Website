const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const RPC_URL = "https://sepolia.era.zksync.dev";
  const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  console.log("🔍 Checking ReentrancyGuard initialization status...\n");

  // ReentrancyGuardUpgradeable uses storage slot based on keccak256("openzeppelin.storage.ReentrancyGuard")
  // For older versions it's a simple storage slot
  // The _status variable should be 1 (_NOT_ENTERED) when properly initialized

  // Try to read the storage slot where _status should be
  // ReentrancyGuardUpgradeable in OZ uses a namespaced storage pattern
  // But for contracts-upgradeable < v5, it's stored in a regular slot

  // Let's check multiple possible storage slots
  const slots = [
    "0x0000000000000000000000000000000000000000000000000000000000000000", // slot 0
    "0x0000000000000000000000000000000000000000000000000000000000000001", // slot 1
    "0x0000000000000000000000000000000000000000000000000000000000000002", // slot 2
    "0x0000000000000000000000000000000000000000000000000000000000000003", // slot 3
    "0x0000000000000000000000000000000000000000000000000000000000000004", // slot 4
    "0x0000000000000000000000000000000000000000000000000000000000000005", // slot 5
    "0x0000000000000000000000000000000000000000000000000000000000000006", // slot 6
    "0x0000000000000000000000000000000000000000000000000000000000000007", // slot 7
    "0x0000000000000000000000000000000000000000000000000000000000000008", // slot 8
    "0x0000000000000000000000000000000000000000000000000000000000000009", // slot 9
  ];

  console.log("📦 Reading first 10 storage slots:\n");
  for (let i = 0; i < slots.length; i++) {
    const value = await provider.getStorageAt(PROXY_ADDRESS, slots[i]);
    console.log(`Slot ${i}: ${value}`);
  }

  // Check EIP-1967 implementation slot
  console.log("\n📍 Checking EIP-1967 implementation slot:");
  const implSlot =
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const implAddress = await provider.getStorageAt(PROXY_ADDRESS, implSlot);
  console.log("Implementation:", ethers.utils.hexStripZeros(implAddress));

  // According to V1 contract:
  // Storage layout should be:
  // Slot 0: Initializable (gap)
  // Slot 1-50: OwnableUpgradeable storage (owner at specific slot)
  // Slot 51-100: ReentrancyGuardUpgradeable storage (_status should be here)
  // Slot 101-150: UUPSUpgradeable storage
  // Then actual contract storage starts

  // In ReentrancyGuardUpgradeable, the __gap is 49 slots
  // So _status is in the first slot of ReentrancyGuard storage

  // Let's check the standard ReentrancyGuard slot
  // The exact slot depends on inheritance order
  // Based on V1: Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable

  console.log("\n🔍 Checking likely ReentrancyGuard _status slots:");
  const reentrancySlots = [51, 52, 53, 54, 100, 101, 102, 150, 151, 152];
  for (const slot of reentrancySlots) {
    const value = await provider.getStorageAt(PROXY_ADDRESS, slot);
    console.log(`Slot ${slot}: ${value}`);
  }

  // Check owner to verify storage is working
  console.log("\n👤 Checking owner (for comparison):");
  const ownerSlot =
    "0x9016d09d72d40fdae2fd8ceac6b6234c7706214fd39c1cd1e609a0528c199300"; // OZ v5 owner slot
  const owner = await provider.getStorageAt(PROXY_ADDRESS, ownerSlot);
  console.log("Owner from storage:", owner);

  // Try calling the contract to see current state
  const abi = [
    "function owner() view returns (address)",
    "function hasProfile(address) view returns (bool)",
    "function totalProfiles() view returns (uint256)",
    "function getContractVersion() view returns (uint8)",
  ];
  const contract = new ethers.Contract(PROXY_ADDRESS, abi, provider);

  console.log("\n📋 Contract state:");
  const contractOwner = await contract.owner();
  console.log("Owner:", contractOwner);
  const totalProfiles = await contract.totalProfiles();
  console.log("Total profiles:", totalProfiles.toString());
  const version = await contract.getContractVersion();
  console.log("Contract version:", version);

  // Test if a user has a profile
  const USER_ADDRESS = "0x5aE248bAb1B22690d9137B0F27b7fa3A89E01fa3";
  const hasProfile = await contract.hasProfile(USER_ADDRESS);
  console.log(`User ${USER_ADDRESS} has profile:`, hasProfile);
}

main().catch(console.error);
