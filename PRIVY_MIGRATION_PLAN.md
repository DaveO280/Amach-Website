# Privy Migration Plan

## Overview

Migrate from zkSync SSO to Privy while maintaining all existing functionality:

- ✅ Wallet connection
- ✅ Contract interactions (createProfile, updateProfile, verifyProfileZKsync, claimAllocation)
- ✅ Encryption/decryption (already validated - signatures are deterministic)
- ✅ Context vault save/load
- ✅ Funding/onboarding flow
- ✅ Admin app functionality
- ✅ WL contract interactions

## Migration Strategy

### Phase 1: Core Service Layer (START HERE)

**Goal**: Create `PrivyWalletService` that mirrors `ZkSyncSsoWalletService` functionality

**Steps**:

1. ✅ Create `PrivyWalletService.ts` with core methods
2. ✅ Implement wallet connection using Privy hooks
3. ✅ Implement message signing for encryption key derivation (already validated)
4. ✅ Implement contract interactions using Privy wallet
5. ✅ Test each method individually

**Files to create**:

- `src/services/PrivyWalletService.ts` - Main service class

### Phase 2: Encryption/Decryption

**Goal**: Ensure encryption works with Privy signatures

**Steps**:

1. ✅ Reuse existing `walletEncryption.ts` utilities
2. ✅ Update to use Privy's `useSignMessage` instead of wallet.signMessage
3. ✅ Test encryption/decryption flow

**Files to update**:

- `src/utils/walletEncryption.ts` (if needed)

### Phase 3: Contract Interactions

**Goal**: Replace wagmi/zksync-sso contract calls with Privy wallet calls

**Steps**:

1. Update `createProfile` / `updateProfile` to use Privy wallet
2. Update `verifyProfileZKsync` to use Privy wallet
3. Update `claimAllocation` to use Privy wallet
4. Test each contract interaction

**Key difference**:

- zkSync SSO uses `@wagmi/core` with `zksync-sso` connector
- Privy uses Privy's wallet directly (can still use viem for contract calls)

### Phase 4: Components Migration

**Goal**: Update components to use PrivyWalletService

**Steps**:

1. Update `WalletSetupWizard` to use Privy
2. Update `HealthProfileManager` to use Privy
3. Update `HealthDataContextWrapper` to use Privy
4. Update admin app components
5. Test each component

### Phase 5: Feature Toggle

**Goal**: Allow switching between SSO and Privy

**Steps**:

1. Create environment variable: `NEXT_PUBLIC_USE_PRIVY=true/false`
2. Update service factory to return correct service
3. Test both paths work

## Testing Checklist

For each phase, test:

- [ ] Wallet connection works
- [ ] Message signing works (encryption key derivation)
- [ ] Profile creation works
- [ ] Profile update works
- [ ] Profile verification works
- [ ] Token claim works
- [ ] Context vault save/load works
- [ ] Funding flow works
- [ ] Admin app can read profiles

## Current Status

- ✅ Privy signature determinism validated (2 matching signatures)
- ✅ Encryption/decryption compatibility confirmed
- ⏳ Starting Phase 1: Core Service Layer
