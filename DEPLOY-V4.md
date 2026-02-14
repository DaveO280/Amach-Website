# Deploy SecureHealthProfileV4 (Upgrade)

Upgrade the existing UUPS proxy on zkSync Sepolia to the V4 implementation (attestation support).

## Prerequisites

1. **Deployer wallet**
   - Use the same wallet that can upgrade the proxy (proxy owner / UUPS authority).
   - Fund it with ETH on **zkSync Sepolia** for gas.

2. **Environment**
   - In project root, create or edit `.env` and set:
     ```bash
     PRIVATE_KEY=0x...   # deployer private key (no 0x prefix also ok)
     ```
   - Do not commit `.env`.

3. **Compile**
   - Contracts must be built with the default Hardhat config (V4 uses `viaIR`):
     ```bash
     pnpm exec hardhat compile
     ```

## Upgrade command

From project root:

```bash
pnpm exec hardhat run scripts/deploy-v4-attestation.js --network zksyncSepolia
```

- **Proxy (unchanged):** `0x2A8015613623A6A8D369BcDC2bd6DD202230785a`
- Script deploys a new V4 implementation and calls `upgradeTo` on the proxy, then verifies `getContractVersion()` and attestation getters.

## If you see errors

- **"insufficient funds"** – Add ETH to the deployer on [zkSync Sepolia](https://sepolia.era.zksync.dev).
- **"upgrades is undefined"** – Ensure `hardhat.config.js` includes `require("@openzeppelin/hardhat-upgrades");`.
- **"Contract code size exceeds 24576"** – V4 is over the mainnet limit; this deploy is for **testnet** (zkSync Sepolia). For mainnet, reduce size (e.g. lower optimizer `runs`, use libraries) before deploying.

## After a successful upgrade

- Proxy address is unchanged; app and `contractConfig.ts` keep using it.
- New implementation address is printed; you can save it for verification or records.
- **Health event / timeline:** If a future version (V5+) changes the timeline or Storj write function, update the frontend to match. See **[deployments/HEALTH-EVENT-UPGRADE-NOTES.md](deployments/HEALTH-EVENT-UPGRADE-NOTES.md)** for what to check and where to change code.
