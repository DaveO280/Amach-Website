const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const RPC_URL = "https://sepolia.era.zksync.dev";
  const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  console.log(
    "🔍 Checking OpenZeppelin v5 ReentrancyGuard storage (ERC-7201 namespaced)...\n",
  );

  // In OpenZeppelin v5, ReentrancyGuard uses ERC-7201 namespaced storage
  // Namespace: "openzeppelin.storage.ReentrancyGuard"
  // Formula: keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.ReentrancyGuard")) - 1)) & ~bytes32(uint256(0xff))

  // Calculate the namespace
  const namespace = "openzeppelin.storage.ReentrancyGuard";
  const namespaceHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(namespace),
  );
  console.log("📝 Namespace:", namespace);
  console.log("   Hash:", namespaceHash);

  // ERC-7201 formula: keccak256(abi.encode(uint256(keccak256(id)) - 1)) & ~bytes32(uint256(0xff))
  const hashBN = ethers.BigNumber.from(namespaceHash);
  const minusOne = hashBN.sub(1);
  const encoded = ethers.utils.defaultAbiCoder.encode(["uint256"], [minusOne]);
  const secondHash = ethers.utils.keccak256(encoded);

  // AND with ~0xff (clear last byte)
  const mask = ethers.BigNumber.from(
    "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00",
  );
  const storageSlot = ethers.BigNumber.from(secondHash).and(mask);
  const storageSlotHex = ethers.utils.hexZeroPad(storageSlot.toHexString(), 32);

  console.log("   Storage slot:", storageSlotHex);
  console.log("");

  // Read the ReentrancyGuard _status value
  console.log("📦 Reading ReentrancyGuard _status from namespace storage:");
  const statusValue = await provider.getStorageAt(
    PROXY_ADDRESS,
    storageSlotHex,
  );
  console.log("   _status value:", statusValue);
  console.log(
    "   _status decimal:",
    ethers.BigNumber.from(statusValue).toString(),
  );
  console.log("");

  console.log("📋 Expected values:");
  console.log("   0 = UNINITIALIZED (❌ BAD - will cause bootloader failure!)");
  console.log("   1 = _NOT_ENTERED (✅ GOOD - properly initialized)");
  console.log("   2 = _ENTERED (⚠️  Should not be this when not in a call)");
  console.log("");

  const statusNum = ethers.BigNumber.from(statusValue).toNumber();

  if (statusNum === 0) {
    console.log("🚨 CRITICAL: ReentrancyGuard is NOT INITIALIZED!");
    console.log(
      '   This is why your transaction fails with "Bootloader-based tx failed"',
    );
    console.log("");
    console.log("🔧 ROOT CAUSE:");
    console.log("   The upgrade did NOT call __ReentrancyGuard_init()");
    console.log(
      "   When _status = 0, the nonReentrant modifier fails in zkSync bootloader",
    );
    console.log("");
    console.log("💡 SOLUTION:");
    console.log("   You need to call a reinitializer function that includes:");
    console.log("   __ReentrancyGuard_init()");
    console.log("");
  } else if (statusNum === 1) {
    console.log("✅ GOOD: ReentrancyGuard is properly initialized");
    console.log("   The issue must be something else");
  } else if (statusNum === 2) {
    console.log("⚠️  WARNING: ReentrancyGuard shows ENTERED state");
    console.log("   This is unusual - a transaction may have been interrupted");
  }

  // Also check the Ownable namespace
  console.log("\n🔍 Checking Ownable storage (for comparison):");
  const ownableNamespace = "openzeppelin.storage.Ownable";
  const ownableHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(ownableNamespace),
  );
  const ownableHashBN = ethers.BigNumber.from(ownableHash);
  const ownableMinusOne = ownableHashBN.sub(1);
  const ownableEncoded = ethers.utils.defaultAbiCoder.encode(
    ["uint256"],
    [ownableMinusOne],
  );
  const ownableSecondHash = ethers.utils.keccak256(ownableEncoded);
  const ownableStorageSlot = ethers.BigNumber.from(ownableSecondHash).and(mask);
  const ownableSlotHex = ethers.utils.hexZeroPad(
    ownableStorageSlot.toHexString(),
    32,
  );

  console.log("   Ownable namespace:", ownableNamespace);
  console.log("   Storage slot:", ownableSlotHex);

  const ownerValue = await provider.getStorageAt(PROXY_ADDRESS, ownableSlotHex);
  console.log("   Owner value:", ownerValue);
  console.log("   Owner address:", ethers.utils.hexStripZeros(ownerValue));

  // Check Initializable storage
  console.log("\n🔍 Checking Initializable storage:");
  const initializableNamespace = "openzeppelin.storage.Initializable";
  const initHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(initializableNamespace),
  );
  const initHashBN = ethers.BigNumber.from(initHash);
  const initMinusOne = initHashBN.sub(1);
  const initEncoded = ethers.utils.defaultAbiCoder.encode(
    ["uint256"],
    [initMinusOne],
  );
  const initSecondHash = ethers.utils.keccak256(initEncoded);
  const initStorageSlot = ethers.BigNumber.from(initSecondHash).and(mask);
  const initSlotHex = ethers.utils.hexZeroPad(
    initStorageSlot.toHexString(),
    32,
  );

  console.log("   Initializable namespace:", initializableNamespace);
  console.log("   Storage slot:", initSlotHex);

  const initValue = await provider.getStorageAt(PROXY_ADDRESS, initSlotHex);
  console.log("   Initializable value:", initValue);

  // Parse the Initializable storage
  // In OZ v5, Initializable uses a struct: { uint64 _initialized; bool _initializing; }
  const initBN = ethers.BigNumber.from(initValue);
  const initialized = initBN
    .and(ethers.BigNumber.from("0xffffffffffffffff"))
    .toNumber();
  const initializing = initBN
    .shr(64)
    .and(ethers.BigNumber.from("0xff"))
    .toNumber();

  console.log("   _initialized version:", initialized);
  console.log("   _initializing:", initializing === 1 ? "true" : "false");
}

main().catch(console.error);
