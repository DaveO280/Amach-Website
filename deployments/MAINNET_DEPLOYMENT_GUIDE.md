# Mainnet Deployment Guide

## ⚠️ Critical Differences Between Testnet and Mainnet

### Current Testnet Implementation (ProfileVerification.sol)

- ❌ **Requires pre-funding**: Contract must hold tokens to distribute
- ❌ **Duplicate tracking**: Both contract and HealthToken track allocations
- ❌ **Less efficient**: Tokens minted to deployer, transferred to contract, then to users
- ⚠️ **Works but not optimal**: Good for testing, not ideal for production

### Mainnet Implementation (ProfileVerificationV2.sol)

- ✅ **No pre-funding needed**: Tokens minted directly to users
- ✅ **Single source of truth**: HealthToken tracks all allocations
- ✅ **More efficient**: Direct mint to users (no intermediate transfers)
- ✅ **Cleaner architecture**: Better separation of concerns

---

## Deployment Steps for Mainnet

### Step 1: Deploy HealthToken

```bash
# Deploy HealthToken first
npx hardhat run scripts/deploy-health-token.js --network mainnet
```

**What happens:**

- Initial 500M AHP tokens minted to deployer
- Max supply: 1B AHP
- Max initial allocations: 5,000 users

**Save the address:** `HEALTH_TOKEN_ADDRESS`

---

### Step 2: Deploy ProfileVerificationV2

```solidity
constructor(
    address _healthToken,      // Address from Step 1
    uint256 _allocationPerUser // e.g., 1000 * 10**18 (1000 AHP)
)
```

```bash
# Deploy ProfileVerificationV2
npx hardhat run scripts/deploy-profile-verification-v2.js --network mainnet
```

**Save the address:** `PROFILE_VERIFICATION_V2_ADDRESS`

---

### Step 3: Transfer HealthToken Ownership

**CRITICAL STEP:** ProfileVerificationV2 needs permission to mint tokens.

```bash
# Transfer HealthToken ownership to ProfileVerificationV2
npx hardhat run scripts/transfer-health-token-ownership.js --network mainnet
```

This calls:

```solidity
healthToken.transferOwnership(PROFILE_VERIFICATION_V2_ADDRESS);
```

**⚠️ WARNING:** After this, ProfileVerificationV2 controls the HealthToken!

**Alternative (More Secure):** Instead of transferring full ownership, implement a minter role pattern:

- Keep owner control of HealthToken
- Add ProfileVerificationV2 as authorized minter
- Requires modifying HealthToken to use AccessControl

---

### Step 4: Whitelist Initial Users

```bash
# Add emails to whitelist
npx hardhat run scripts/whitelist-emails.js --network mainnet
```

Or from admin interface:

```solidity
profileVerificationV2.addEmailsToWhitelist([
    "user1@example.com",
    "user2@example.com",
    // ... up to 5,000 users
]);
```

---

### Step 5: Update Frontend Configuration

Update `src/lib/networkConfig.ts`:

```typescript
// Mainnet configuration
if (chainId === 324) {
  // zkSync Mainnet
  return {
    PROFILE_VERIFICATION_CONTRACT: "0x...", // ProfileVerificationV2 address
    HEALTH_TOKEN_CONTRACT: "0x...", // HealthToken address
    SECURE_HEALTH_PROFILE_CONTRACT: "0x...", // Existing
  };
}
```

---

## Key Differences in User Flow

### Testnet (Current):

1. User verifies → ProfileVerification records it
2. User claims → ProfileVerification.transfer(user, 1000 AHP)
3. Contract balance decreases

### Mainnet (V2):

1. User verifies → ProfileVerificationV2 records it
2. User claims → HealthToken.grantInitialAllocation(user, 1000 AHP)
3. Tokens minted directly to user
4. HealthToken tracks allocation internally

---

## Security Considerations

### 1. Owner Role Management

```solidity
// Option A: ProfileVerificationV2 owns HealthToken
✅ Simple
❌ All token control in one contract
❌ If verification contract compromised, token compromised

// Option B: Separate owner + minter role (RECOMMENDED)
✅ Owner retains emergency controls
✅ Verification contract can only mint allocations
✅ More secure
❌ Requires HealthToken modification
```

### 2. Upgrade Path

ProfileVerificationV2 is NOT upgradeable by default. For mainnet, consider:

- Making it upgradeable (UUPS pattern like HealthProfile)
- OR deploying as non-upgradeable after thorough audit
- OR using proxy pattern with timelock

### 3. Allocation Limits

```solidity
// HealthToken enforces:
maxInitialAllocations = 5000
totalInitialAllocations < maxInitialAllocations

// Prevents:
- Unlimited minting
- Going over initial allocation budget
- Exceeding max supply (1B AHP)
```

---

## Migration Script (Testnet → Mainnet)

Create `scripts/deploy-mainnet-system.js`:

```javascript
async function main() {
  console.log("🚀 Deploying Mainnet System...\n");

  // 1. Deploy HealthToken
  const HealthToken = await ethers.getContractFactory("HealthToken");
  const healthToken = await HealthToken.deploy();
  await healthToken.deployed();
  console.log("✅ HealthToken:", healthToken.address);

  // 2. Deploy ProfileVerificationV2
  const allocationPerUser = ethers.utils.parseEther("1000"); // 1000 AHP
  const ProfileVerificationV2 = await ethers.getContractFactory(
    "ProfileVerificationV2",
  );
  const verification = await ProfileVerificationV2.deploy(
    healthToken.address,
    allocationPerUser,
  );
  await verification.deployed();
  console.log("✅ ProfileVerificationV2:", verification.address);

  // 3. Transfer ownership
  console.log("\n⚠️  CRITICAL: Transfer HealthToken ownership");
  console.log(
    "   Run manually: healthToken.transferOwnership(",
    verification.address,
    ")",
  );
  console.log("   This gives ProfileVerificationV2 minting permission");

  // 4. Save deployment
  const deployment = {
    network: "mainnet",
    timestamp: new Date().toISOString(),
    contracts: {
      healthToken: healthToken.address,
      profileVerificationV2: verification.address,
    },
  };

  fs.writeFileSync(
    `deployments/mainnet-${Date.now()}.json`,
    JSON.stringify(deployment, null, 2),
  );

  console.log("\n✅ Deployment complete!");
  console.log("\n📋 Next steps:");
  console.log("   1. Transfer HealthToken ownership to ProfileVerificationV2");
  console.log("   2. Whitelist initial user emails");
  console.log("   3. Update frontend networkConfig.ts");
  console.log("   4. Test with small number of users first");
}
```

---

## Testing Before Mainnet

### 1. Deploy to zkSync Sepolia with V2

Test the new architecture on testnet first:

```bash
npx hardhat run scripts/deploy-mainnet-system.js --network zksync-sepolia
```

### 2. Test All Flows

- ✅ Email whitelisting
- ✅ User verification
- ✅ Allocation claiming
- ✅ Duplicate claim prevention
- ✅ Max allocation enforcement
- ✅ Gas costs

### 3. Audit Checklist

- [ ] Access control (who can mint?)
- [ ] Reentrancy protection
- [ ] Integer overflow/underflow
- [ ] Front-running risks
- [ ] Emergency pause mechanism
- [ ] Upgrade path if needed

---

## Cost Analysis

### Testnet (Current Method):

```
Gas for funding:     ~50,000 per transfer to contract
Gas per claim:       ~100,000 (transfer from contract)
Total for 5000:      ~750M gas
```

### Mainnet (V2 Method):

```
Gas for setup:       0 (no funding needed!)
Gas per claim:       ~150,000 (mint + allocation tracking)
Total for 5000:      ~750M gas
```

**Savings:** No upfront funding cost, slightly higher per-claim but offset by eliminating funding step.

---

## Rollback Plan

If issues arise on mainnet:

1. **Pause system:**

   ```solidity
   profileVerificationV2.setVerificationEnabled(false);
   healthToken.pause(); // Pauses all transfers
   ```

2. **Deploy fixed version:**

   - Deploy new ProfileVerificationV2
   - Transfer HealthToken ownership to new contract
   - Re-enable verification

3. **Migrate users:**
   - Export verified users from old contract
   - Whitelist in new contract
   - Users re-verify if necessary

---

## Monitoring

### Key Metrics to Track:

```solidity
// From ProfileVerificationV2
- totalVerifiedUsers
- getRemainingAllocations()

// From HealthToken
- totalInitialAllocations
- getRemainingInitialAllocations()
- totalSupply()
```

### Alerts to Set:

- ⚠️ Remaining allocations < 100
- ⚠️ Verification contract balance changes (shouldn't happen in V2!)
- ⚠️ Unusual claiming patterns
- ⚠️ Total supply approaching max

---

## Summary

| Feature             | Testnet (V1)                    | Mainnet (V2)                      |
| ------------------- | ------------------------------- | --------------------------------- |
| Contract funding    | Required (5M AHP)               | Not needed ✅                     |
| Token flow          | Mint → Deploy → Contract → User | Mint → User ✅                    |
| Allocation tracking | Duplicate (contract + token)    | Single source (token) ✅          |
| Ownership model     | Contract holds tokens           | Contract mints on-demand ✅       |
| Gas efficiency      | Lower per-claim                 | Slightly higher but no funding ✅ |
| Complexity          | Simple                          | Moderate                          |
| Security            | Good                            | Better (less token custody) ✅    |

**Recommendation:** Use ProfileVerificationV2 for mainnet deployment.
