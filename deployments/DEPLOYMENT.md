# Amach Health Smart Contract Deployments

## Current Production Contracts (ZKsync Sepolia)

### Latest Deployment: 2025-11-20

**Deployer:** `0xC9fFD981932FA4F91A0f31184264Ce079d196c48`

#### SecureHealthProfileV1 (Upgradeable)

- **Proxy Address:** `0x2A8015613623A6A8D369BcDC2bd6DD202230785a` (permanent - users interact with this)
- **Implementation:** `0x9aD92C50548c7D0628f21836c48230041330D277`
- **Pattern:** UUPS (ERC1967)
- **Features:**
  - Core encrypted profile (birthDate, sex, height, email)
  - Event-based health timeline (medications, conditions, weight, etc.)
  - ZK proof submission
  - Append-only immutable events
  - Soft delete (deactivate) functionality

#### ProfileVerification

- **Address:** `0xA2D3b1b8080895C5bE335d8352D867e4b6e51ab3`
- **Features:**
  - Email whitelist management (hash-based for privacy)
  - Token allocation (1000 AHP per user)
  - Profile verification
  - ZKsync SSO integration

#### HealthToken (AHP)

- **Address:** `0x057df807987f284b55ba6A9ab89d089fd8398B99`
- **Name:** AmachHealth Protocol
- **Symbol:** AHP
- **Total Supply:** 500,000,000 AHP

---

## Upgrade Process

To upgrade SecureHealthProfile to V2:

1. Deploy `SecureHealthProfileV2.sol`
2. Get new implementation address
3. Call: `proxiedContract.upgradeTo(newImplementationAddress)`
4. All data preserved in proxy storage
5. New functions immediately available

---

## Migration History

### November 20, 2025 - Upgradeable Contract Migration

- **Old Contract:** `0xb1e41c4913D52E20aAaF4728c0449Bc6320a45A3`
- **Backup Location:** `backup/contracts-pre-upgrade-2025-11-20/`
- **Note:** 2 profiles exist on old contract - users should re-enter data
- **New Features:** UUPS upgradeable pattern, health timeline events

### October 29, 2025 - Fresh System Deployment

- Initial deployment with HealthToken, SecureHealthProfile (non-upgradeable), ProfileVerification

### October 28, 2025 - Hashed Verification

- ProfileVerification with hash-based email privacy (keccak256)

---

## Archived Deployment Files

Old deployment records are archived in `deployments/archive/` for reference.

---

## Network Configuration

- **Network:** ZKsync Era Sepolia Testnet
- **Chain ID:** 300
- **RPC URL:** https://sepolia.era.zksync.dev

---

## Security Notes

- All health data is encrypted client-side before storage
- Encryption uses AES-256-GCM with wallet-derived keys
- On-chain data is encrypted - only the user can decrypt
- ZK proofs allow verification without revealing raw data
