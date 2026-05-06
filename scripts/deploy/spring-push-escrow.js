/**
 * Deploy SpringPushEscrowV1
 *
 * Non-upgradeable prize escrow for the Spring Push Season One contest.
 * Plain hardhat-ethers (ethers v5), no proxy, no initializer.
 *
 * Usage:
 *   pnpm exec hardhat run scripts/deploy/spring-push-escrow.js --network zksyncSepolia
 *
 * Env vars:
 *   PRIVATE_KEY              required — deployer key (also pays gas)
 *   ADMIN_ADDRESS            optional — admin (Gnosis Safe on mainnet, EOA on testnet);
 *                                       defaults to deployer wallet
 *   SPRING_PUSH_VERIFIER     optional — override AverageImprovementProofV1Verifier address
 *   CONTEST_DURATION_SECS    optional — default 7776000 (90 days)
 *   CLAIM_WINDOW_SECS        optional — default 2592000 (30 days)
 *   MAX_PARTICIPANTS         optional — default 100
 *   MIN_PARTICIPANTS         optional — default 20
 *   SPEED_RUN                optional — if "true", overrides defaults to:
 *                                       contest=300s, claim=180s, max=5, min=2
 *                                       (individual env vars still take precedence)
 *
 * After deployment, the JSON receipt is written to:
 *   deployments/spring-push-escrow-<unix-ts>.json
 */

const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const DEFAULT_VERIFIER = "0x2248040f9833A6C91bfC161F244E0238da64615b";

// Production defaults (90/30/100/20).
const PROD_DEFAULTS = {
  CONTEST_DURATION_SECS: 90 * 24 * 60 * 60,
  CLAIM_WINDOW_SECS: 30 * 24 * 60 * 60,
  MAX_PARTICIPANTS: 100,
  MIN_PARTICIPANTS: 20,
};

// Speed-run defaults (5min/3min/5/2) — handy for end-to-end smoke tests.
const SPEED_RUN_DEFAULTS = {
  CONTEST_DURATION_SECS: 300,
  CLAIM_WINDOW_SECS: 180,
  MAX_PARTICIPANTS: 5,
  MIN_PARTICIPANTS: 2,
};

function pickInt(envName, fallback) {
  const raw = process.env[envName];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    console.error(`❌ ${envName} must be a non-negative integer, got: ${raw}`);
    process.exit(1);
  }
  return n;
}

async function main() {
  const speedRun = String(process.env.SPEED_RUN || "").toLowerCase() === "true";
  const baseDefaults = speedRun ? SPEED_RUN_DEFAULTS : PROD_DEFAULTS;

  const verifier = process.env.SPRING_PUSH_VERIFIER || DEFAULT_VERIFIER;
  const contestDuration = pickInt(
    "CONTEST_DURATION_SECS",
    baseDefaults.CONTEST_DURATION_SECS,
  );
  const claimWindow = pickInt(
    "CLAIM_WINDOW_SECS",
    baseDefaults.CLAIM_WINDOW_SECS,
  );
  const maxParticipants = pickInt(
    "MAX_PARTICIPANTS",
    baseDefaults.MAX_PARTICIPANTS,
  );
  const minParticipants = pickInt(
    "MIN_PARTICIPANTS",
    baseDefaults.MIN_PARTICIPANTS,
  );

  if (!ethers.utils.isAddress(verifier)) {
    console.error("❌ Invalid verifier address:", verifier);
    process.exit(1);
  }
  if (minParticipants > maxParticipants) {
    console.error(
      `❌ MIN_PARTICIPANTS (${minParticipants}) cannot exceed MAX_PARTICIPANTS (${maxParticipants})`,
    );
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  const adminEnv = process.env.ADMIN_ADDRESS;
  const admin = adminEnv && adminEnv.length > 0 ? adminEnv : deployer.address;
  if (!ethers.utils.isAddress(admin)) {
    console.error("❌ Invalid ADMIN_ADDRESS:", adminEnv);
    process.exit(1);
  }

  console.log("🚀 Deploying SpringPushEscrowV1");
  console.log(
    "   Network:    ",
    network.name,
    "(chainId:",
    network.chainId + ")",
  );
  console.log("   Deployer:   ", deployer.address);
  console.log("   Balance:    ", ethers.utils.formatEther(balance), "ETH");
  console.log("   Verifier:   ", verifier);
  console.log(
    "   Admin:      ",
    admin,
    admin === deployer.address ? "(deployer)" : "",
  );
  console.log("   Mode:       ", speedRun ? "SPEED_RUN" : "production");
  console.log("   Contest:    ", contestDuration, "sec");
  console.log("   Claim wnd:  ", claimWindow, "sec");
  console.log("   Max parts:  ", maxParticipants);
  console.log("   Min parts:  ", minParticipants);
  console.log("");

  const Factory = await ethers.getContractFactory("SpringPushEscrowV1");
  const escrow = await Factory.deploy(
    verifier,
    admin,
    contestDuration,
    claimWindow,
    maxParticipants,
    minParticipants,
  );
  await escrow.deployed();

  console.log("✅ SpringPushEscrowV1 deployed at:", escrow.address);

  const [
    durationOnChain,
    claimWindowOnChain,
    maxOnChain,
    minOnChain,
    founderDelay,
    verifierOnChain,
    adminOnChain,
  ] = await Promise.all([
    escrow.CONTEST_DURATION(),
    escrow.CLAIM_WINDOW(),
    escrow.MAX_PARTICIPANTS(),
    escrow.MIN_PARTICIPANTS(),
    escrow.FOUNDER_RECLAIM_DELAY(),
    escrow.IMPROVEMENT_VERIFIER(),
    escrow.ADMIN(),
  ]);

  console.log("\n📋 Immutables:");
  console.log("   CONTEST_DURATION:     ", durationOnChain.toString(), "sec");
  console.log(
    "   CLAIM_WINDOW:         ",
    claimWindowOnChain.toString(),
    "sec",
  );
  console.log("   MAX_PARTICIPANTS:     ", maxOnChain.toString());
  console.log("   MIN_PARTICIPANTS:     ", minOnChain.toString());
  console.log("   FOUNDER_RECLAIM_DELAY:", founderDelay.toString(), "sec");
  console.log("   IMPROVEMENT_VERIFIER: ", verifierOnChain);
  console.log("   ADMIN:                ", adminOnChain);

  const ts = Math.floor(Date.now() / 1000);
  const out = {
    contract: "SpringPushEscrowV1",
    address: escrow.address,
    deployer: deployer.address,
    txHash: escrow.deployTransaction.hash,
    network: { name: network.name, chainId: network.chainId },
    mode: speedRun ? "speed-run" : "production",
    constructorArgs: {
      verifier,
      admin,
      contestDuration,
      claimWindow,
      maxParticipants,
      minParticipants,
    },
    immutables: {
      CONTEST_DURATION: durationOnChain.toString(),
      CLAIM_WINDOW: claimWindowOnChain.toString(),
      MAX_PARTICIPANTS: maxOnChain.toString(),
      MIN_PARTICIPANTS: minOnChain.toString(),
      FOUNDER_RECLAIM_DELAY: founderDelay.toString(),
      IMPROVEMENT_VERIFIER: verifierOnChain,
      ADMIN: adminOnChain,
    },
    deployedAt: new Date(ts * 1000).toISOString(),
  };

  const dir = path.join(__dirname, "..", "..", "deployments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = path.join(dir, `spring-push-escrow-${ts}.json`);
  fs.writeFileSync(filename, JSON.stringify(out, null, 2));
  console.log(
    "\n💾 Receipt written to:",
    path.relative(process.cwd(), filename),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
