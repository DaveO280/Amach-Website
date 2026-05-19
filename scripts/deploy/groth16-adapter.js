/**
 * Deploy Groth16VerifierAdapter — adapts the snarkjs-generated
 * AverageImprovementProofV1Verifier (uint[2]/uint[2][2]/uint[2]/uint[5])
 * to the SpringPushEscrowV1.IGroth16Verifier interface (bytes,uint[4]).
 *
 * Env:
 *   PRIVATE_KEY          required — deployer key
 *   SNARKJS_VERIFIER     optional — underlying verifier
 *                                   (default: 0x2248040f9833A6C91bfC161F244E0238da64615b)
 *
 * After deploy, the adapter address is written to
 *   deployments/groth16-adapter-<unix-ts>.json
 * for later reuse as SPRING_PUSH_VERIFIER when deploying the escrow.
 */

const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const DEFAULT_SNARKJS_VERIFIER = "0x2248040f9833A6C91bfC161F244E0238da64615b";

async function main() {
  const verifier = process.env.SNARKJS_VERIFIER || DEFAULT_SNARKJS_VERIFIER;
  if (!ethers.utils.isAddress(verifier)) {
    console.error("❌ Invalid SNARKJS_VERIFIER:", verifier);
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("🚀 Deploying Groth16VerifierAdapter");
  console.log(
    "   Network:    ",
    network.name,
    "(chainId:",
    network.chainId + ")",
  );
  console.log("   Deployer:   ", deployer.address);
  console.log("   Balance:    ", ethers.utils.formatEther(balance), "ETH");
  console.log("   Underlying: ", verifier);
  console.log("");

  const code = await ethers.provider.getCode(verifier);
  if (code === "0x" || code.length < 4) {
    console.error("❌ Underlying verifier has no bytecode at", verifier);
    process.exit(1);
  }

  const Factory = await ethers.getContractFactory("Groth16VerifierAdapter");
  const adapter = await Factory.deploy(verifier);
  await adapter.deployed();

  console.log("✅ Groth16VerifierAdapter deployed at:", adapter.address);
  const verifierOnChain = await adapter.VERIFIER();
  console.log("   VERIFIER:", verifierOnChain);

  const ts = Math.floor(Date.now() / 1000);
  const out = {
    contract: "Groth16VerifierAdapter",
    address: adapter.address,
    deployer: deployer.address,
    txHash: adapter.deployTransaction.hash,
    network: { name: network.name, chainId: network.chainId },
    underlyingVerifier: verifierOnChain,
    deployedAt: new Date(ts * 1000).toISOString(),
  };
  const dir = path.join(__dirname, "..", "..", "deployments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = path.join(dir, `groth16-adapter-${ts}.json`);
  fs.writeFileSync(filename, JSON.stringify(out, null, 2));
  console.log("💾 Receipt written to:", path.relative(process.cwd(), filename));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
