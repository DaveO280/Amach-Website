# 00 — Master Architecture Map

> **This is the entry point.** Start here, get oriented, then drill into the numbered
> chapter docs. Every claim below is backed by a completed 556-file audit and six
> integration deep-dives, all living in this same directory.

---

## 1. System Overview

**Amach Health is a decentralized health-data platform.** A user's health data
(Apple Health / HealthKit metrics, lab bloodwork, DEXA scans, breathing sessions)
is encrypted client-side-derived-but-server-executed, stored per-wallet on Storj,
selectively attested on-chain, and surfaced through an AI health companion ("Luma",
formerly "Cosaint") backed by a multi-agent analysis system.

### Three clients

| Client          | Repo                 | Role                                                                                                                                                                 |
| --------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Website**     | `Amach-Website`      | Next.js 16 app + the canonical backend. Owns every `/api/*` route; the two iOS apps are thin clients over it.                                                        |
| **iOS app**     | `AmachHealth-iOS`    | SwiftUI health app — HealthKit capture, dashboard, Luma chat, proof anchoring. No direct Storj/Venice/DB access; everything routes through the website API.          |
| **Breathe app** | `AmachHealthBreathe` | SwiftUI/watchOS companion — guided breathing + HRV/cardiac-coherence biofeedback. Shares the backend and PBKDF2/Privy model via a **forked copy** of the API client. |

### Four external integrations

| Integration               | What it does                                                                                                                                              | Chapter                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Storj** (S3-compatible) | Per-wallet encrypted object storage — the canonical full-history data store. S3 credentials live only on the Next.js server.                              | [05](./05-integration-storj.md)        |
| **Privy**                 | Single auth layer (email + auto-created embedded wallet) shared by all three clients under one app ID. Wallet address is the root of all encryption keys. | [06](./06-integration-privy.md)        |
| **Venice AI**             | LLM backing Luma and the 7-agent deep-analysis fan-out. Model `zai-org-glm-4.7`; server-side key.                                                         | [07](./07-integration-venice-ai.md)    |
| **ZKsync Era Sepolia**    | On-chain profiles, timeline references, and attestations + a Groth16/Merkle ZK proof pipeline (poseidon-lite + snarkjs). Chain ID 300.                    | [08](./08-integration-zk-contracts.md) |

Local-only data layers sit in front of these: **IndexedDB** (`amach-health-db`,
180-day working set) on web and **HealthKit** on iOS.

---

## 2. Repo Inventory

| Repo            | Path                                          | Language                            | Files | ~Lines | One-liner                                                           |
| --------------- | --------------------------------------------- | ----------------------------------- | ----- | ------ | ------------------------------------------------------------------- |
| **Website**     | `/Users/dave/Amach-Website`                   | TypeScript (+ Solidity, JS scripts) | 320   | ~100K  | Next.js 16 app **and** the canonical backend for all three clients. |
| **iOS app**     | `/Users/dave/amach-workspace/AmachHealth-iOS` | Swift                               | 102   | ~41K   | SwiftUI health app; thin client over the website API.               |
| **Breathe app** | `/Users/dave/AmachHealthBreathe`              | Swift                               | 117   | ~19K   | SwiftUI/watchOS breathing + biofeedback companion.                  |

### Known fragmentation — read before touching these paths

- **`src 2/`** (inside the website repo) — a stale, pre-Privy duplicate source tree.
  Untracked. **Safe to delete.**
- **`/Users/dave/AmachHealth-iOS`** — a stale iOS repo copy that holds
  **3 unpushed commits + 9 stashes**, plus the entire untracked ZK toolchain
  (circuits, ptau, deploy project) under `zk/`. **Do NOT delete before salvaging**
  the unpushed work and toolchain.
- **`/Users/dave/Documents/AmachHealth-iOS`** — another stale iOS copy, fully merged
  into the canonical checkout. **Disposable.**

The canonical iOS checkout is `/Users/dave/amach-workspace/AmachHealth-iOS`.

---

## 3. Top-Level Architecture

```mermaid
flowchart TB
    subgraph Clients
        WEB[Website - Next.js 16 UI]
        IOS[iOS App - SwiftUI]
        BRE[Breathe App - SwiftUI watchOS]
    end

    subgraph LocalData[On-device Data]
        IDB[IndexedDB amach-health-db]
        HK[HealthKit]
    end

    subgraph Backend[Next.js API Routes]
        API[/api/* routes]
        AGENTS[7 Health Agents + Coordinator]
    end

    subgraph External[External Integrations]
        STORJ[(Storj S3 - per-wallet buckets)]
        PRIVY[Privy Auth + Embedded Wallets]
        VENICE[Venice AI - Luma]
        ZK[ZKsync Era Sepolia - Contracts + Groth16 Proofs]
    end

    WEB --> IDB
    IOS --> HK
    BRE --> HK

    WEB --> API
    IOS --> API
    BRE --> API

    WEB --> PRIVY
    IOS --> PRIVY
    BRE --> PRIVY

    API --> AGENTS
    AGENTS --> VENICE
    API --> STORJ
    API --> VENICE

    WEB --> ZK
    IOS --> ZK
    API --> ZK
    PRIVY -.derives encryption keys.-> STORJ
```

**Key non-obvious edges:** clients POST the PBKDF2-derived encryption key in every
Storj request body — encryption is executed server-side, **not** end-to-end. On-chain
transactions are signed on the client via the Privy embedded wallet, but ZK proofs are
built server-side by `devZkCoverageService`.

---

## 4. Module Directory

One row per module (multiple audit batches of the same module are merged). "Flagged"
= files the audit marked as needing work, dead/orphaned, or refactor candidates.

### Website — `Amach-Website` (chapters [01](./01-website-core.md), [02](./02-website-ui.md))

| Module                                                       | Files | Flagged | Summary                                                                                                                                                                                   | Chapter                                |
| ------------------------------------------------------------ | ----- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `agents`                                                     | 11    | 7       | 7 health analysts + CoordinatorAgent over Venice; heavy copy-pasted helpers, dead cross-signal logic, `dataAggregation` duplicates `tieredDataAggregation`.                               | [01](./01-website-core.md)             |
| `ai`                                                         | 19    | 14      | Live relevance/tool/cache layer is healthy; **~1,700 lines of orphaned Phase-2 memory subsystem** (`src/ai/memory`) with zero callers — delete candidate.                                 | [01](./01-website-core.md)             |
| `api/venice`                                                 | 1     | 1       | Central Venice transport; duplicated retry logic and a desktop-axios/mobile-fetch fork, plus noisy prod logging.                                                                          | [07](./07-integration-venice-ai.md)    |
| `services`                                                   | 23    | 14      | LumaAiService 1.6K-line monolith (double-append bug in deep mode); HealthEventService N+1; two dead migration services; clean proof-generator plugin set.                                 | [01](./01-website-core.md)             |
| `storage`                                                    | 15    | 11      | Storj client + attestation + report/timeline/conversation wrappers; near-duplicate boilerplate parameterized by `dataType`; O(n) HeadObject scans.                                        | [05](./05-integration-storj.md)        |
| `data`                                                       | 22    | 10      | HealthKit parsing + IndexedDB/Storj sources + React Query hooks; `HybridDataSource`/`StorjDataSource` dead/stub; triplicated day-bucketing.                                               | [09](./09-data-flows-website.md)       |
| `hooks`                                                      | 9     | 7       | `usePrivyWalletService` 1.67K-line god hook (6 concerns); two orphaned legacy hooks; dead exports.                                                                                        | [06](./06-integration-privy.md)        |
| `store`                                                      | 4     | 3       | AI/selection/health contexts; aiStore couples orchestration+memory; selectionStore double-mounted; dead healthDataStore folder.                                                           | [09](./09-data-flows-website.md)       |
| `utils`                                                      | 66    | 32      | Report parsers, encryption, caching, formatting; 3 parallel TTL caches, dual DEXA/gut parsers, deprecated-but-live `secureHealthEncryption`.                                              | [02](./02-website-ui.md)               |
| `components`                                                 | 66    | 46      | Dashboard + AI shell + shadcn primitives; several 2–3K-line god components (CosaintChatUI, StorageManagementSection, WalletSetupWizard); duplicated chart `DS` tokens + on-chain helpers. | [02](./02-website-ui.md)               |
| `app` (pages + API routes)                                   | 50    | 25      | Marketing pages (no shared nav/footer), API routes; hardcoded-wallet dashboard bug, ethers-v5/viem split, test endpoints shipping real emails.                                            | [02](./02-website-ui.md)               |
| `lib` / `config` / `core` / `rules` / `interfaces` / `types` | 27    | 15      | Config + type layer; `interfaces` module is **entirely dead code**, `applicationRules.ts` + `featureFlags` mostly unused, contractConfig/networkConfig duplicate addresses.               | [01](./01-website-core.md)             |
| `zk`                                                         | 2     | 1       | `devZkCoverageService` (real, misnamed, hardcoded dev path); `merkleCommitmentLaneA` untracked/zero callers.                                                                              | [08](./08-integration-zk-contracts.md) |
| `contracts` (+ archive)                                      | 13    | 5       | V1→V4 profile lineage forked into hand-synced branches (V3 vs deployed V3_FromV1); duplicate Groth16 verifier names; whitelist-bypass gaps.                                               | [02](./02-website-ui.md)               |
| `scripts`                                                    | 15    | 3       | Deploy/upgrade + parser reliability tests; mostly good, minor hardcoded addresses/paths.                                                                                                  | [02](./02-website-ui.md)               |
| `__tests__`                                                  | 1     | 0       | Security-hardening regression test (CSP, registry locking, dep pinning).                                                                                                                  | [02](./02-website-ui.md)               |

### iOS app — `AmachHealth-iOS` (chapter [03](./03-ios-app.md))

| Module           | Files | Flagged | Summary                                                                                                                                                                  | Chapter                                             |
| ---------------- | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `App`            | 2     | 2       | Root composition; `AppState` is a well-built @Observable store that **no view reads** — dead wiring, decide adopt-or-delete.                                             | [03](./03-ios-app.md)                               |
| `API`            | 4     | 2       | `AmachAPIClient` god-file wrapping all backend endpoints; split into domain-scoped clients, real SSE, parallelize N+1 timeline fetches.                                  | [03](./03-ios-app.md)                               |
| `Services`       | 28    | 18      | Chat/Dashboard/Wallet/FHIR + HealthKit→Storj→chain sync; **3 overlapping sync pipelines**, hardcoded Privy IDs/contracts, dead MerkleTreeBuilder, scattered hex parsing. | [03](./03-ios-app.md), [10](./10-data-flows-ios.md) |
| `Models`         | 8     | 4       | Codable domain models incl. Merkle v1/v2; extract ConversationMemoryStore out of ChatModels.                                                                             | [03](./03-ios-app.md)                               |
| `Components`     | 10    | 7       | Luma chat UI + health visuals; orphaned Sparkline/NavigationHeader; scattered hardcoded Luma-indigo hex.                                                                 | [03](./03-ios-app.md)                               |
| `Views`          | 16    | 8       | Dashboard/Profile/Sync/Trends/Chat + sheets; 900+-line views mixing concerns, duplicated formatting helpers, 1Y-shows-90D mismatch, dead delete-account.                 | [03](./03-ios-app.md)                               |
| `DesignSystem`   | 1     | 1       | 1,162-line token+component file mirroring web; extract `Color.amachTierMetal(_:)`, split tokens from components.                                                         | [03](./03-ios-app.md)                               |
| `Previews`       | 10    | 0       | Full Canvas preview coverage via central MockData — excellent health.                                                                                                    | [03](./03-ios-app.md)                               |
| `Helpers` (test) | 3     | 2       | Mock API/wallet/URLSession; MockURLSession orphaned (private singleton init blocks it).                                                                                  | [03](./03-ios-app.md)                               |
| `Tests`          | 30    | 4       | Broad pipeline coverage (PDF, Merkle/ZK gates, HealthKit mapping, chat); minor TODO-stub visibility.                                                                     | [03](./03-ios-app.md)                               |
| `Package.swift`  | 1     | 1       | SwiftPM manifest duplicates the `.xcodeproj` file/dependency listings — maintain-in-two-places burden.                                                                   | [03](./03-ios-app.md)                               |

### Breathe app — `AmachHealthBreathe` (chapter [04](./04-breathe-app.md))

| Module             | Files | Flagged | Summary                                                                                                                                                                                                   | Chapter                   |
| ------------------ | ----- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `Sources`          | 79    | 14      | SwiftUI/watchOS breathing + HRV coherence + wallet-gate subscription; **duplicates AmachHealth-iOS** design tokens, audio pacer, wallet service; `try?` error suppression; SharedModels mixes 5 concerns. | [04](./04-breathe-app.md) |
| `Shared` (SwiftPM) | 1     | 0       | `AmachBreatheShared` package anchor; sole external dep is privy-ios.                                                                                                                                      | [04](./04-breathe-app.md) |
| `Tests`            | 38    | 6       | Strong parametric coverage (state machines, HRV/coherence DSP, Storj/WatchConnectivity); consolidate overlapping subscription-state + codec tests, add cross-platform PBKDF2 test vectors.                | [04](./04-breathe-app.md) |

---

## 5. Audit Verdict Statistics

The full audit covered **556 files** across all three repos and their integration
surfaces. Of those, **257 files were flagged** — marked as _needs-work_,
_dead/orphaned_, or a _refactor/consolidation candidate_. The remaining ~299 files
rated _good_ or _acceptable_.

| Repo        | Files   | Flagged | Flag rate |
| ----------- | ------- | ------- | --------- |
| Website     | 320     | ~206    | ~64%      |
| iOS app     | 102     | ~49     | ~48%      |
| Breathe app | 117     | ~20     | ~17%      |
| **Total**   | **556** | **257** | **~46%**  |

The high website flag rate is concentrated in the god-file UI components, the fully
dead `src/ai/memory` and `interfaces` subsystems, and cross-file duplication
(chart tokens, on-chain helpers, RPC-client boilerplate) rather than broken logic.
Breathe is the healthiest repo. The **consolidation plan** ([11](./11-consolidation-plan.md),
forthcoming) prioritizes these findings into actionable work.

---

## 6. How to Use This Map

**For any future build/refactor session:**

1. **Start here.** This doc is the index — the repo inventory, the top-level diagram,
   and the module directory tell you _where_ a thing lives across three repos.
2. **Drill into the chapter doc** covering the module or integration you're touching.
   Chapters 01–02 cover website code, 03–04 the mobile apps, 05–08 the four external
   integrations end-to-end, and 09–10 trace concrete runtime data flows.
3. **Check the consolidation plan ([11](./11-consolidation-plan.md)) before adding new
   code.** Much of what looks missing is actually dead scaffolding awaiting deletion
   (`src/ai/memory`, `interfaces`, `applicationRules.ts`, orphaned hooks/components) —
   don't build on it, and don't re-create a utility that a consolidation task is about
   to centralize (RPC-client factory, day-bucketing, PBKDF2 derivation, chart tokens).
4. **Trust the on-chain facts in chapter 08** — live addresses were verified by RPC,
   and CLAUDE.md is known-stale in several places (agent count is 7 not 6, Cosaint↔Luma
   rename, deployed contract is V4 via V3_FromV1 lineage).
5. **Respect the fragmentation warnings in §2** — salvage before deleting the
   `/Users/dave/AmachHealth-iOS` copy; the ZK toolchain lives only there.

**Doc set:** `00` (this) · `01` website-core · `02` website-ui · `03` ios-app ·
`04` breathe-app · `05` storj · `06` privy · `07` venice-ai · `08` zk-contracts ·
`09` data-flows-website · `10` data-flows-ios · `11` consolidation-plan ·
`12` capabilities-and-roadmap.
