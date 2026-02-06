require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: { enabled: true, runs: 1 },
          viaIR: true, // required for SecureHealthProfileV4 (stack too deep in batch)
        },
      },
      {
        version: "0.8.22",
        settings: {
          optimizer: { enabled: true, runs: 1 },
          viaIR: true,
        },
      },
    ],
  },
  networks: {
    // ZKsync Era Sepolia Testnet
    zksyncSepolia: {
      url: "https://sepolia.era.zksync.dev",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // ZKsync Era Mainnet
    zksyncMainnet: {
      url: "https://mainnet.era.zksync.io",
      ethNetwork: "mainnet", // RPC URL of the network (e.g. https://mainnet.infura.io/v3/<key>)
      zksync: true,
      verifyURL:
        "https://zksync2-mainnet-explorer.zksync.io/contract_verification",
    },
    // Local development
    hardhat: {
      zksync: false,
    },
  },
  // Contract verification
  etherscan: {
    apiKey: {
      zksyncSepolia: process.env.ZKSYNC_API_KEY || "",
      zksyncMainnet: process.env.ZKSYNC_API_KEY || "",
    },
    customChains: [
      {
        network: "zksyncSepolia",
        chainId: 300,
        urls: {
          apiURL: "https://explorer.sepolia.era.zksync.dev/api",
          browserURL: "https://explorer.sepolia.era.zksync.dev",
        },
      },
      {
        network: "zksyncMainnet",
        chainId: 324,
        urls: {
          apiURL: "https://zksync2-mainnet-explorer.zksync.io/api",
          browserURL: "https://explorer.zksync.io",
        },
      },
    ],
  },
  // Path configuration
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  // Gas configuration
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  // Typechain configuration
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v5",
    alwaysGenerateOverloads: false,
    externalArtifacts: ["externalArtifacts/*.json"],
  },
};
