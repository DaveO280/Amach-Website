# Amach Health App - Implementation Phases

This document outlines the phased implementation plan for the Amach health data platform, covering the web app refactoring, native iOS development, AI integration, and blockchain features.

## Overview

| Phase | Name                     | Status      | Description                                            |
| ----- | ------------------------ | ----------- | ------------------------------------------------------ |
| A     | Foundation & Web Cleanup | ✅ Complete | Consolidate data flows, create abstractions, add tests |
| B     | iOS App Core             | 🔜 Planned  | Native iOS app with HealthKit integration              |
| C     | AI Integration           | 🔜 Planned  | Apple Intelligence + Venice AI coordination            |
| D     | Memory System            | 🔜 Planned  | Persistent health context and conversation memory      |
| E     | zkProof Integration      | 🔜 Planned  | Client-side proof generation for data verification     |
| F     | Token & Rewards          | 🔜 Planned  | ERC-20 rewards token on zkSync                         |
| G     | Polish & Launch          | 🔜 Planned  | App Store submission, beta testing, launch             |

---

## Phase A: Foundation & Web Cleanup ✅

**Goal:** Clean up data flows, create testable abstractions, prepare codebase for iOS integration.

### A1: Consolidate Deduplication ✅

**Problem:** 5 different deduplication passes causing inconsistent and "touchy" data behavior.

**Solution:**

- Removed redundant `deduplicateData()` calls in `HealthDataContextWrapper.tsx`
- Established clear deduplication flow:
  1. XMLStreamParser: Import-time overlap prevention
  2. HealthDataSelector: Watch > phone priority, hourly blocks
  3. healthDataStore: Safety net on save
  4. HealthDataProcessor: Daily aggregation

**Files Modified:**

- `src/components/HealthDataContextWrapper.tsx`

**Files Created:**

- `src/data/processors/__tests__/deduplication.test.ts` (38 tests)

### A2: Create Abstraction Interfaces ✅

**Purpose:** Enable platform-agnostic implementations and easier testing.

**Interfaces Created:**

| Interface          | Purpose                       | Web Implementation | iOS Implementation |
| ------------------ | ----------------------------- | ------------------ | ------------------ |
| `IStorageService`  | Encrypted health data storage | Storj              | CloudKit           |
| `IHealthDataStore` | Local health data persistence | IndexedDB          | HealthKit/CoreData |
| `IAuthService`     | Wallet authentication         | Privy              | WalletConnect      |
| `IAiService`       | AI health assistant           | Venice API         | Apple Intelligence |

**Files Created:**

- `src/interfaces/IStorageService.ts`
- `src/interfaces/IHealthDataStore.ts`
- `src/interfaces/IAuthService.ts`
- `src/interfaces/IAiService.ts`
- `src/interfaces/index.ts`
- `src/interfaces/__tests__/interfaces.test.ts` (4 tests)

### A3: Create Missing API Endpoints ✅

**New Endpoints:**

| Endpoint              | Method | Purpose                               |
| --------------------- | ------ | ------------------------------------- |
| `/api/ai/chat`        | POST   | AI health assistant with context      |
| `/api/health/sync`    | POST   | Push/pull health data to Storj        |
| `/api/health/summary` | POST   | Generate aggregated health statistics |

**Features:**

- `/api/ai/chat`: Cosaint persona, health context injection, quick/deep modes
- `/api/health/sync`: Push/pull/status actions, metadata tracking
- `/api/health/summary`: Trend analysis, multi-period support, overall health score

**Files Created:**

- `src/app/api/ai/chat/route.ts`
- `src/app/api/health/sync/route.ts`
- `src/app/api/health/summary/route.ts`

### A4: Add Critical Tests ✅

**Test Suites Added:**

| Suite           | Tests | Coverage                                                 |
| --------------- | ----- | -------------------------------------------------------- |
| API Endpoints   | 19    | Trend calculation, context building, metadata extraction |
| Storage Service | 17    | Hash normalization, URI parsing, bucket naming           |
| AI Context      | 18    | Prompt building, token config, response parsing          |

**Files Created:**

- `src/app/api/__tests__/endpoints.test.ts`
- `src/storage/__tests__/storageService.test.ts`
- `src/ai/__tests__/contextPreprocessor.test.ts`

**Total Tests:** 120 passing

---

## Phase B: iOS App Core 🔜

**Goal:** Build native iOS app for direct HealthKit integration.

### B1: Project Setup

- [ ] Create Xcode project with SwiftUI
- [ ] Configure HealthKit entitlements
- [ ] Set up WalletConnect for iOS
- [ ] Create shared types with web app

### B2: HealthKit Integration

- [ ] Request HealthKit permissions
- [ ] Read health data (steps, HR, HRV, sleep, exercise)
- [ ] Background refresh for new data
- [ ] Efficient batch queries

### B3: Data Pipeline

- [ ] Implement `IHealthDataStore` for iOS (CoreData)
- [ ] Implement `IStorageService` for iOS (CloudKit/Storj)
- [ ] Sync status UI
- [ ] Offline support

### B4: Authentication

- [ ] WalletConnect integration
- [ ] Secure key storage (Keychain)
- [ ] Biometric unlock option

**Apple Developer Account:** Required before App Store submission

---

## Phase C: AI Integration 🔜

**Goal:** Dual AI system with Apple Intelligence for on-device and Venice for cloud.

### C1: Apple Intelligence (On-Device)

- [ ] Integrate with Apple's on-device ML
- [ ] Quick health insights
- [ ] Privacy-first processing
- [ ] Offline capability

### C2: Venice AI (Cloud)

- [ ] Deep health analysis
- [ ] Pattern recognition across time
- [ ] Personalized recommendations
- [ ] Tool use for data queries

### C3: AI Coordination

- [ ] Route queries appropriately
- [ ] Combine insights
- [ ] Consistent persona (Cosaint)
- [ ] Fallback handling

---

## Phase D: Memory System 🔜

**Goal:** Persistent context for personalized AI interactions.

### D1: Caching Layer ✅

- Already implemented with IndexedDB caching

### D2: Short-term Memory

- [ ] Session context window
- [ ] Recent conversation tracking
- [ ] Topic continuity

### D3: Long-term Memory

- [ ] User health patterns
- [ ] Preferences and goals
- [ ] Historical insights
- [ ] Encrypted Storj storage

### D4: Memory Integration

- [ ] Context injection into prompts
- [ ] Memory pruning/consolidation
- [ ] Cross-device sync

---

## Phase E: zkProof Integration 🔜

**Goal:** Client-side proof generation for data verification and rewards.

### E1: Proof System Design

- [ ] Define proof circuits
- [ ] Choose proving system (Plonky2, Halo2, etc.)
- [ ] Design verification contracts

### E2: Client-Side Proofs

- [ ] WebAssembly prover for web
- [ ] Native prover for iOS
- [ ] Proof generation for upload verification

### E3: On-Chain Verification

- [ ] Deploy verifier contracts on zkSync
- [ ] Integrate with existing contracts
- [ ] Gas optimization

---

## Phase F: Token & Rewards 🔜

**Goal:** ERC-20 rewards token for verified health data uploads.

### F1: Token Contract

- [ ] ERC-20 on zkSync Sepolia (testnet)
- [ ] Minting mechanism for rewards
- [ ] Transfer restrictions (if any)

### F2: Rewards System

- [ ] Monthly batched claims
- [ ] Proof-based rewards
- [ ] Reward calculation algorithm

### F3: Wallet Integration

- [ ] Token display in app
- [ ] Transfer to external wallet
- [ ] Transaction history

**Note:** No buying/selling in app (App Store compliance)

---

## Phase G: Polish & Launch 🔜

**Goal:** Production-ready release on App Store.

### G1: UI/UX Polish

- [ ] Design review
- [ ] Accessibility audit
- [ ] Performance optimization
- [ ] Error handling improvement

### G2: App Store Preparation

- [ ] App Store assets (screenshots, descriptions)
- [ ] Privacy policy update
- [ ] Review guidelines compliance
- [ ] TestFlight beta

### G3: Launch

- [ ] Staged rollout
- [ ] Monitoring setup
- [ ] Support channels
- [ ] Marketing materials

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Devices                              │
├─────────────────────────────┬───────────────────────────────────┤
│        iOS App              │           Web App                 │
│  ┌─────────────────────┐    │    ┌─────────────────────┐        │
│  │  HealthKit Native   │    │    │  XML Import         │        │
│  │  Apple Intelligence │    │    │  Venice AI          │        │
│  │  WalletConnect      │    │    │  Privy Auth         │        │
│  └─────────────────────┘    │    └─────────────────────┘        │
└─────────────────────────────┴───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Shared Services                             │
├─────────────────────────────┬───────────────────────────────────┤
│  IStorageService (Storj)    │  IAuthService (Wallet)            │
│  IHealthDataStore           │  IAiService                       │
│  zkProof Generation         │  Memory System                    │
└─────────────────────────────┴───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Blockchain (zkSync)                         │
├─────────────────────────────────────────────────────────────────┤
│  Health Profile Contract    │  Rewards Token (ERC-20)           │
│  Proof Verifier Contract    │  Data Reference Registry          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Current Status

**Phase A Complete** - Foundation work done:

- ✅ Deduplication consolidated
- ✅ Service interfaces created
- ✅ API endpoints added
- ✅ 120 tests passing

**Next Steps:**

1. Apple Developer account activation (for iOS development)
2. Begin Phase B (iOS app setup)
3. Continue web app improvements in parallel

---

_Last Updated: February 2026_
_Branch: claude/discuss-data-flow-refactor-xgSrv_
