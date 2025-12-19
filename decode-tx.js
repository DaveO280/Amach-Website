/**
 * Decode the transaction input data
 */

const { ethers } = require("ethers");

const inputData =
  "0x0b4198ee00000000000000000000000000000000000000000000000000000000000000800258aee730f0d40290ba2490fe526c4d9e1f69374eeb5b29d897e25907428eca00000000000000000000000000000000000000000000000000000000000000a0b87e879f1db74466dfa39ebb9527a7961f97eb34d059bbe02559b107ef3ecb500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004f73746f726a3a2f2f616d6163682d6865616c74682d343634613263636639383937653236382f74696d656c696e652d6576656e742f313736353535373831303031312d64366563613934362e656e630000000000000000000000000000000000";

const abi = [
  "function addHealthEventWithStorj(string encryptedData, bytes32 searchTag, string storjUri, bytes32 contentHash) external",
];

const iface = new ethers.utils.Interface(abi);

console.log("🔍 Decoding transaction input...\n");

try {
  const decoded = iface.parseTransaction({ data: inputData });

  console.log("Function:", decoded.name);
  console.log("Selector:", decoded.sighash);
  console.log("\nArguments:");
  console.log("  encryptedData:", decoded.args[0]);
  console.log("  searchTag:", decoded.args[1]);
  console.log("  storjUri:", decoded.args[2]);
  console.log("  contentHash:", decoded.args[3]);

  console.log("\n📋 Argument Details:");
  console.log("  encryptedData length:", decoded.args[0].length, "bytes");
  console.log(
    "  searchTag valid:",
    decoded.args[1] !== ethers.constants.HashZero,
  );
  console.log("  storjUri:", decoded.args[2]);
  console.log(
    "  contentHash valid:",
    decoded.args[3] !== ethers.constants.HashZero,
  );
} catch (e) {
  console.error("❌ Failed to decode:", e.message);
}
