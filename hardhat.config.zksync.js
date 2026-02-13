/**
 * zkSync-Specific Hardhat Config
 * Use this for zkSync deployments: npx hardhat run script.js --config hardhat.config.zksync.js --network zkSyncSepolia
 *
 * NOTE: Deployment with zksolc currently fails (bytecode/creation issue).
 * Use the default hardhat.config.js for deployments:
 *   pnpm exec hardhat run scripts/deploy-v4-attestation.js --network zksyncSepolia
 */

require("@matterlabs/hardhat-zksync-solc");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  zksolc: {
    version: "1.5.1",
    settings: {
      optimizer: {
        enabled: true,
        mode: "z", // Size optimization (helps avoid stack too deep / large bytecode)
        fallback_to_optimizing_for_size: true,
      },
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100, // Lower runs = smaller bytecode
          },
          viaIR: true, // Required for SecureHealthProfileV4 (stack too deep)
        },
      },
      {
        version: "0.8.22",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
          viaIR: true,
        },
      },
    ],
  },
  networks: {
    zkSyncSepolia: {
      url: "https://sepolia.era.zksync.dev",
      ethNetwork: "sepolia",
      zksync: true,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      verifyURL:
        "https://explorer.sepolia.era.zksync.dev/contract_verification",
    },
    zkSyncMainnet: {
      url: "https://mainnet.era.zksync.io",
      ethNetwork: "mainnet",
      zksync: true,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      verifyURL:
        "https://zksync2-mainnet-explorer.zksync.io/contract_verification",
    },
  },
  paths: {
    artifacts: "./artifacts-zk",
    cache: "./cache-zk",
    sources: "./contracts",
    tests: "./test",
  },
};
