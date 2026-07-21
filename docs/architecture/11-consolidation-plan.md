# 11 — Consolidation Plan

> Part of the [master architecture map](00-master-map.md). Built from a 556-file audit across the website, iOS app, and Breathe app (July 2026), plus a forensic fragmentation investigation (git history, diffs, and reference checks — every "dead" verdict below was verified by grepping for actual usages).
>
> **Verdict totals:** 40 dead-or-orphan · 7 live duplicates · 4 refactor candidates · 82 needs-work · remainder good/acceptable.

The plan is ordered: each phase is safe to execute only after the one before it. Phase 0 protects unmerged work; everything after it is cleanup and consolidation.

---

## Phase 0 — Salvage before anything is deleted ⚠️

**`/Users/dave/AmachHealth-iOS` (the stale clone in your home dir) contains work that exists nowhere else.** Do these before touching it:

1. **Push 3 unpushed commits** (`git log --branches --not --remotes` in that repo):
   - `0cfa8a9` — **the AverageImprovementProof ZK circuit + 4 primitives.** The deployed verifier's address is referenced by canonical iOS main (`e187c38`), and the generated verifier contract sits untracked in the website repo — but the circuit _source_ exists only in this commit. Losing it means you cannot re-verify, audit, or regenerate your live verifier.
   - `95bede8` — v2 leaf format with cross-platform hash dispatch.
   - `346471b` — WalletEncryptionKey field-name fix matching the web backend.
2. **Triage the 9 stashes** (test seeding, ZK e2e WIP) — apply-and-commit or discard each deliberately.
3. **Salvage untracked files**: `zk/`, `Tests/Scripts/generate-storj-seed.js`, `push-zk-genesis.sh` — confirm duplicated in canonical or copy over.
4. **Commit `contracts/AverageImprovementProofV1Verifier.sol`** in the website repo (deployed-contract source belongs in-repo). First fix its name collision: it declares `contract Groth16Verifier`, identical to `CoverageVerifier.sol`'s contract, which breaks `getContractFactory("Groth16Verifier")` — rename to `AverageImprovementVerifier`.
5. **Decide `src/zk/merkleCommitmentLaneA.ts`** (untracked, orphaned): commit if Lane A is live on-chain, delete if superseded.

## Phase 1 — Safe deletions (verified no unique content / zero importers)

### 1a. Whole trees

| Target                                                          | Size        | Why safe                                                                                                                                                                                               |
| --------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Amach-Website/src 2/`                                          | 130 files   | Finder copy from ~Oct 13 2025, pre-Privy + pre-Luma. Every unique file was _deliberately deleted_ from the tracked tree (SSO removal `c24f8f7`, Luma rebrand `6fd8116`). Recoverable from git history. |
| `/Users/dave/Documents/AmachHealth-iOS`                         | whole clone | HEAD is an ancestor of canonical main; 0 unpushed commits, 0 stashes.                                                                                                                                  |
| `/Users/dave/AmachHealth-iOS`                                   | whole clone | **Only after Phase 0.**                                                                                                                                                                                |
| `zk-local/circom/`, `zk-local/node_modules/`, `zk-local/build/` | ~528 MB     | Upstream compiler clone + regeneratable artifacts. Keep/commit only `circuits/sum_window.circom` + `scripts/full-prove.sh` if the teaching playground is still wanted.                                 |

### 1b. Untracked strays in the website repo

Delete: `luma-ios-audit.txt`, `mockup-*.png` ×7, `wiz-step*.png` ×3, `onboarding-preview.html`, `wallet-design-mockup.html`, `src/app/whitepaper/page.html` (App Router ignores it — dead), `scripts/test-vision-pipeline.ts` (hardcodes personal paths), `amach-visual-qa.skill` (already installed). `Overview.md`: fold its iOS-attestation/EIP-55 knowledge into the amach-agent decision journal first, then delete. Commit: the two `zk-toolchain/build/coverage/coverage_js/*.js` files (they complete the already-tracked artifact set) or gitignore them.

### 1c. Dead website code (zero importers, individually grep-verified)

- **The entire `src/ai/memory/` subsystem (8 files, ~1,500 lines)** — `initMemorySystem`/`searchMemory` have zero call sites; it duplicates `walletEncryption.ts` (with a weaker KDF) and overlaps `StorjConversationService`. **Note the intent, not just the verdict:** this was an attempt at persistent AI memory (long-running health companion). That capability lives on in `ConversationMemoryService` + `StorjConversationService` (web) and `ConversationMemoryStore` (iOS) — but the live service's cloud sync is itself a stub (see Phase 3 adjacent findings). _Harvest before deleting_: record the design ideas (hybrid BM25 search, daily-log summarization, health-profile memory) as roadmap items, then delete the code — git history preserves it. Also `src/ai/ContextPreprocessor.ts` (bypassed by `LumaAiService`; contains the unbounded-Storj-blob bug already fixed elsewhere in PR #91).
- **The entire `src/interfaces/` scaffolding** — `IHealthDataStore`, `IAiService`, `IAuthService`, `IStorageService`: zero implementers.
- **Dead services**: `src/services/PrivyWalletService.ts` (zero importers — the real one is the hook), `src/services/SecureHealthProfileService.ts` (no importers; ABI diverged), `src/storage/StorjSyncService.ts` (superseded by `ConversationMemoryService`).
- **Dead hooks/lib/config**: `useContextPersistence.ts`, `useWalletConnection.ts` (depends on nonexistent `window.amachWallet`), `src/lib/test-config.ts`, `src/lib/zkSyncChain.ts`, `src/rules/applicationRules.ts`, `src/app/metadata.ts` (superseded by `layout.tsx`), `src/data/sources/HybridDataSource.ts`.
- **Dead UI/routes**: `src/app/api/test-rpc/route.ts` (a diagnostic endpoint deployed publicly), `src/app/icon-preview/page.tsx`, `src/components/storage/StorjPruningButton.tsx`, `src/components/ui/sheet.tsx`.
- **Dead parsers/utils**: `aiBloodworkParser.ts`, `aiDexaParser.ts` (both superseded by the registry), `src/utils/ai/useHealthDataForAi.ts`, `src/agents/utils/dataAggregation.ts` (duplicate of `tieredDataAggregation.ts`; migrate SleepAgent, its only consumer), `src/types/whitepaper.ts`, `src/types/uuid.d.ts` (shadows `@types/uuid`), dead cache helpers in `veniceResponseCache.ts` / `toolResultCache.ts`.
- **Dead contracts**: `contracts/archive/SecureHealthProfile-legacy.sol`, `contracts/ProfileVerificationV2.sol` (zero references — the app still uses V1).

### 1d. Dead iOS / Breathe code

- iOS: `Components/Sparkline.swift`, `Components/NavigationHeader.swift`, `Tests/Helpers/MockURLSession.swift` (unusable — `AmachAPIClient` has a private init), `Services/MerkleTreeBuilder.swift` (pipeline moved server-side), `Services/ChatService+Testing.swift`.
- iOS `App/AppState.swift`: written at launch but **read by no view**. Either delete it (+ its tests) or make it the real source of truth — don't leave it half-wired.
- Breathe: `watchOS/Sources/App/WatchContentView.swift` (SessionView is the actual root).

## Phase 2 — Deduplicate live twins (bugs waiting to diverge)

| Duplication                                                                                                                                                                                                                              | Canonical                              | Action                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `gutHealthLlmExtractor.ts` vs `registry/reportTypes/gutHealth.ts` — **both wired into live upload routes**, legacy path lacks vision passes → inconsistent extraction quality                                                            | registry version                       | Point the upload route at the registry pipeline, delete the extractor                                                                 |
| `mapDexaLlmResult` (registry/dexa.ts) line-for-line copy of `parseDexaReportWithAI`                                                                                                                                                      | registry                               | Delete `aiDexaParser.ts` (see 1c)                                                                                                     |
| Bloodwork sanitizers copied verbatim between `aiBloodworkParser.ts` and registry                                                                                                                                                         | registry                               | Same                                                                                                                                  |
| 3 cache implementations (`veniceResponseCache`, `coordinatorSummaryCache`, `toolResultCache`) — same hash/TTL/eviction pattern                                                                                                           | one shared `ttlCache.ts`               | Extract, delete dead halves                                                                                                           |
| 4 day-bucketing/dedup implementations (`HealthDataProcessor`, `tieredDataAggregation`, `dataDeduplicator`, `agents/utils/dataAggregation`)                                                                                               | `tieredDataAggregation`                | Reconcile — these can silently disagree on the same data                                                                              |
| Venice transport forked between `VeniceApiService.ts` (axios) and `useVeniceAI.ts` (fetch) with divergent retry/parsing                                                                                                                  | `VeniceApiService`                     | Make the hook consume the service                                                                                                     |
| Contract addresses duplicated: `contractConfig.ts` vs `networkConfig.ts` (web), plus **hardcoded addresses/RPCs in iOS** `ZKSyncAttestationService`, `StorjTimelineService`, `SpringPushContestService`, `LeafHashingService`            | one config per platform, cross-checked | Single address table; iOS reads a central `NetworkConfig`                                                                             |
| DS token objects copy-pasted across 8 chart files; `DistanceChart` reimplements `useChartZoom`                                                                                                                                           | shared `ChartContainer` + tokens       | Extract once                                                                                                                          |
| iOS tier-color switch duplicated in `AppState`, `DashboardView`, `HealthComponents` (+ design system)                                                                                                                                    | `AmachDesignSystem`                    | One token function                                                                                                                    |
| Luma gradient `#4338CA` hardcoded ×3 (LumaComponents ×2, ChatView)                                                                                                                                                                       | design-system token                    | Tokenize                                                                                                                              |
| Nav/footer markup duplicated across 7 website pages; `IconLock` duplicated verbatim                                                                                                                                                      | shared `SiteNav`/`SiteFooter`          | Extract                                                                                                                               |
| **Breathe ↔ iOS fork-and-drift**: design system (598 vs 1162 lines, 21 identical type names, zero identical color literals), `WalletService` PBKDF2 crypto, hand-copied timeline schema                                                  | new shared Swift package               | Extract `AmachDesignSystemKit` (+ optionally wallet-crypto core) consumed by both apps; until then, treat Breathe copies as read-only |
| **Three parallel iOS sync pipelines run simultaneously** — `HealthDataSyncService` (legacy 1-year flow), `MerkleGenesisService` (90-day genesis), `SpringPushLeavesService` (90-day contest) — with no indication which supersedes which | decide one                             | Document the intended lifecycle, then retire or merge the others                                                                      |
| **PBKDF2 wallet-key derivation hand-implemented 3×** (`walletEncryption.ts`, iOS `WalletService`, Breathe `WalletService`) with zero shared test vectors — one drift silently breaks cross-platform Storj decryption                     | web version                            | Add a shared cross-repo test-vector file (fixed passphrase → expected key) run by all three test suites                               |

## Phase 3 — Security & correctness hotspots (fix independently, high value)

1. **`contracts/CoverageRegistry.sol`** — `submitProof` doesn't bind the proof to `msg.sender`: anyone can replay another user's valid proof as their own; the Merkle-root public signal is never validated or stored.
2. **`contracts/ProfileVerification.sol` (V1, the live one)** — owner-settable `delegatecall` in `generateMigrationProof`; `verifyProfileZKsync` bypasses whitelist/signature checks; plaintext emails on-chain.
3. **`src/app/api/fund-new-wallet/route.ts`** — deployer-key nonce race on concurrent requests; 75+ permanent console logs.
4. **`src/utils/sleepDataProcessor.ts`** — `avgCoreSleep` and `avgAwake` both computed from `totalSleepDuration` instead of their own totals (wrong stats shipped to UI/agents).
5. **iOS `ProofDetailView.swift`** — debug bucket fields rendered without `#if DEBUG` (production leak).
6. **`src/data/sources/StorjDataSource.ts`** — all query methods are TODO stubs returning empty, yet it's wired in: silent data loss path.
7. **PII logging** — unconditional `console.log` of health content in `BaseHealthAgent`, `LumaAiService`, `aiStore`, `VeniceApiService`, `sharedDatabase` (+ 18–22 logs each in `secureHealthEncryption`, `pdfParser`). Add a gated logger and sweep.
8. **iOS `AmachAPIClient.listTimelineEvents`** — serial N+1 Storj fetches; and `HealthEventService.ts` (web) makes ~200 RPC round-trips per 50-event timeline. Batch both.

## Phase 4 — Structural refactors (the god-files)

Priority order (impact × risk):

1. **`AmachAPIClient.swift` (1,698 lines)** → split into `StorjAPI` / `TimelineAPI` / `ChatAPI` / `ProofsAPI` with per-domain DTO files; delete dead types (`TimelineRequest`, `VeniceChatRequest`, `SSEChunk`); widen the protocol so services become mockable; replace fake word-split streaming with real SSE.
2. **`CosaintChatUI.tsx` (3,045 lines)** → extract file-upload, Storj import/export, attestation, and debug panel into components; **rename to `LumaChatUI.tsx`** (last Cosaint-named artifact; also fix the stale `CosaintAiService` reference in CLAUDE.md).
3. **`StorageManagementSection.tsx` (2,413)** and **`WalletSetupWizard.tsx` (2,007)** → sub-component extraction; replace querySelector-polling Privy detection with SDK events.
4. **`usePrivyWalletService.ts` (1,673)** → split auth / encryption / chain-ops / funding concerns; kill the 100 ms polling loop and duplicated gas logic.
5. **`LumaAiService.ts` (1,683)** → fix double tool-prompt append, remove dead `generateResponse` path, then split context-assembly from transport.
6. iOS **`HealthSyncView` (1,089)** / **`ProfileView` (933)** → extract sections; implement or remove the placeholder delete-account button.
7. **iOS build definition** — the xcodeproj lists every file manually _and_ `Package.swift` declares a parallel target (privy-ios declared twice). Pick one: consume `AmachHealth/` as a local Swift package, or delete the SPM manifest.

## Phase 5 — Keep it consolidated

- **One checkout per repo**: `~/Amach-Website`, `~/amach-workspace/AmachHealth-iOS`, `~/AmachHealthBreathe`. Never Finder-copy a source tree (that's where `src 2/` came from) — use git branches/worktrees, and prune worktrees when done.
- **Config single-source rule**: no contract address, RPC URL, or chain ID outside `networkConfig`/`contractConfig` (web) and one `NetworkConfig` (iOS). The audit found addresses hardcoded in 10+ files.
- **Update CLAUDE.md** after Phase 1 (it still documents `CosaintAiService.ts` and other removed files) and keep `docs/architecture/` current — chapter docs list per-file verdicts to refresh as files change.
- Tests that copy production logic inline (`endpoints.test.ts`, `storageService.test.ts`, `contextPreprocessor.test.ts`) should import the real functions — today they can't catch regressions.

---

## Suggested order of execution

| #   | Work                                                            | Effort              | Risk                                                 |
| --- | --------------------------------------------------------------- | ------------------- | ---------------------------------------------------- |
| 1   | Phase 0 salvage (push commits, triage stashes, commit verifier) | ~1 hr               | none — purely additive                               |
| 2   | Phase 1a/1b tree + stray deletions                              | ~30 min             | none after Phase 0                                   |
| 3   | Phase 1c/1d dead-code deletions (one PR per repo)               | ~2 hrs              | low — all grep-verified; type-check + build confirms |
| 4   | Phase 3 security fixes (contracts first)                        | days, itemized      | independent, high value                              |
| 5   | Phase 2 dedups (one PR per row)                                 | 1–2 wks incremental | medium — behavior-preserving refactors               |
| 6   | Phase 4 god-file splits                                         | ongoing             | do opportunistically, when touching each area        |

_Everything in this plan is a recommendation — no deletions have been performed. Phase 1 items can be executed on request; Phase 0 should happen first regardless._
