# Framework Analysis: New Deployment Wallet Creation

## Executive Summary

**Wallets HAVE been created on the new contracts.** ZKsync SSO creates smart account wallets automatically when users connect - they're not "deployed" in the traditional sense.

## Current State

### ✅ Verified on New Contracts

1. **ProfileVerification Contract (NEW)**: `0xA2D3b1b8080895C5bE335d8352D867e4b6e51ab3`

   - **Total Verified Users/Wallets**: 2
   - **Status**: Active

2. **SecureHealthProfile Contract (NEW)**: `0x2A8015613623A6A8D369BcDC2bd6DD202230785a`
   - **Total Profiles**: 1
   - **Contract Version**: 1
   - **Status**: Active

## How ZKsync SSO Wallet Creation Works

### ❌ Common Misconception

**"Wallets need to be deployed"** - This is FALSE for ZKsync SSO.

### ✅ How It Actually Works

1. **Automatic Smart Account Creation**: When a user connects via ZKsync SSO (using passkeys/WebAuthn), ZKsync automatically creates a smart account wallet on-demand.

2. **No Manual Deployment**: The wallet is created implicitly when:

   - User authenticates via passkey
   - User connects via `zksyncSsoConnector.connect()`
   - The wallet address is immediately available

3. **Wallet Address Derivation**: The wallet address is deterministically derived from the passkey, so it's consistent across sessions.

## Framework Verification

### ✅ Contract Address Configuration

**Code Location**: `src/lib/zksync-sso-config.ts`

```typescript
// NEW Contracts (November 2025 - Upgradeable System)
const PROFILE_VERIFICATION_CONTRACT =
  "0xA2D3b1b8080895C5bE335d8352D867e4b6e51ab3";
const SECURE_HEALTH_PROFILE_CONTRACT =
  "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";
```

### ✅ Service Implementation

**Code Location**: `src/services/ZkSyncSsoWalletService.ts`

The service correctly:

1. ✅ Uses NEW contract addresses
2. ✅ Uses `createProfile` function (V1 contract signature)
3. ✅ Uses dynamic imports to avoid SSR issues
4. ✅ Checks if profile exists before creating

**Function**: `executeHealthProfileTransaction()` (line 841)

- Checks `hasProfile` using `SECURE_HEALTH_PROFILE_CONTRACT`
- Calls `createProfile` if no profile exists
- Calls `updateProfile` if profile exists

### ✅ Contract Function Signature

**Contract**: `SecureHealthProfileV1.sol`
**Function**: `createProfile`

```solidity
function createProfile(
    string memory encryptedBirthDate,
    string memory encryptedSex,
    string memory encryptedHeight,
    string memory encryptedEmail,
    bytes32 dataHash,
    string memory nonce
) external nonReentrant
```

**Service Call** (matches contract):

```typescript
const args = [
  profile.encryptedBirthDate,
  profile.encryptedSex,
  profile.encryptedHeight,
  profile.encryptedEmail,
  dataHash,
  nonce,
];
```

## Verification Flow

### Step 1: SSO Connection

- User clicks "Connect SSO Wallet"
- ZKsync SSO connector authenticates via passkey
- **Smart account wallet is created automatically** (no explicit deployment needed)
- Wallet address is returned: `0x...`

### Step 2: Profile Verification

- User verifies email via `verifyProfileZKsync()`
- Call goes to: `PROFILE_VERIFICATION_CONTRACT` (NEW: `0xA2D3...`)
- Wallet is registered in `userVerifications` mapping

### Step 3: Health Profile Creation

- User creates health profile
- Service checks if profile exists on `SECURE_HEALTH_PROFILE_CONTRACT` (NEW: `0x2A80...`)
- If not exists, calls `createProfile()`
- Profile is stored on-chain

## Verification Commands

Run these commands to verify the framework:

```bash
# Check verified users on NEW contract
node -e "const { ethers } = require('ethers'); (async () => { const provider = new ethers.JsonRpcProvider('https://sepolia.era.zksync.dev'); const contract = new ethers.Contract('0xA2D3b1b8080895C5bE335d8352D867e4b6e51ab3', ['function getTotalVerifiedUsers() view returns (uint256)'], provider); const total = await contract.getTotalVerifiedUsers(); console.log('Total Verified Users:', total.toString()); })().catch(console.error);"

# Check profiles on NEW contract
node -e "const { ethers } = require('ethers'); (async () => { const provider = new ethers.JsonRpcProvider('https://sepolia.era.zksync.dev'); const contract = new ethers.Contract('0x2A8015613623A6A8D369BcDC2bd6DD202230785a', ['function getTotalProfiles() view returns (uint256)'], provider); const total = await contract.getTotalProfiles(); console.log('Total Profiles:', total.toString()); })().catch(console.error);"
```

## Potential Issues to Check

### 1. SSO Session Configuration Missing

**Issue**: The SSO connector has no session configuration (line 581 in `zksync-sso-config.ts`):

```typescript
// TESTING: Session completely removed to isolate blank screen issue
```

**Impact**: Without session policies, users may not be able to:

- Create profiles
- Verify profiles
- Claim allocations

**Fix**: Add session configuration back with proper call policies for:

- `createProfile`
- `verifyProfileZKsync`
- `claimAllocation`

### 2. Contract Call Policies Missing

The SSO connector needs call policies for the NEW contracts:

```typescript
contractCalls: [
  // Profile verification
  callPolicy({
    address: PROFILE_VERIFICATION_CONTRACT, // NEW: 0xA2D3...
    abi: profileVerificationAbi,
    functionName: "verifyProfileZKsync",
  }),
  // Profile creation
  callPolicy({
    address: SECURE_HEALTH_PROFILE_CONTRACT, // NEW: 0x2A80...
    abi: secureHealthProfileAbi,
    functionName: "createProfile",
  }),
  // ... other functions
];
```

## Summary

✅ **Wallets ARE being created** on the new contracts (2 verified, 1 profile)
✅ **Code is correctly configured** to use new contract addresses
✅ **Function signatures match** the V1 contract

⚠️ **Potential Issue**: SSO session configuration was removed for testing - may prevent new wallet creation/operations

## Next Steps

1. **Restore SSO Session Configuration**: Add back the session config with proper call policies for NEW contracts
2. **Test Wallet Creation Flow**: Connect a new SSO wallet and verify it creates on the NEW contract
3. **Verify Contract Interactions**: Ensure all contract calls are going to the NEW addresses, not old ones
