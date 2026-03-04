# February 2026 Website Progress

## Completed

- Rebranded the AI companion from **Cosaint** to **Luma** across the web app (services, prompts, store wiring, agents, and tests).
- Cleared active npm security issues in production dependencies and lockfile updates (including `axios`, `fast-xml-parser`, `bn.js`, `qs`, `hono`, and `tar` paths), and validated with `pnpm audit --prod` (no known vulnerabilities).
- Expanded on-chain health attestation functionality (wallet badge display, auto/manual attestation flow, and improved revert/error handling).
- Improved Storj reliability and flow (sequential report saves, reduced signature-request crashes, incremental Apple Health backup behavior).
- Fixed Apple Health duplicate ingestion issues and tightened verified-data scoring/tier logic and badge behavior.
- Advanced AI memory capabilities (Phase D memory work and dev inspection tooling).
- Improved parser/data handling reliability (DEXA/BMD extraction updates and XML/date normalization fixes for iOS Safari compatibility).
- Added/expanded tests and verification scripts for attestation, parser, and deployment-related workflows.
- Reduced repository maintenance overhead by removing unused scripts/backups and stabilizing build config wiring where needed.

## Validation Snapshot

- Type check passes (`pnpm type-check`)
- Lint passes with warnings only (`pnpm lint`)
- Tests pass (`pnpm test`: 14 suites, 179 tests)

## AmachHealth-iOS Initial Progress (as of 3/1)

- Established the iOS project foundation with Xcode project/scheme setup, source wiring, and `.gitignore` cleanup for shared collaboration.
- Delivered a full architecture baseline (AppState, SSE chat streaming, navigation, chart/chat components) with reusable UI component sets.
- Implemented Luma proactive intelligence end-to-end, including anomaly detection, profile settings controls, and chat integration.
- Resolved major compile and Swift 6/concurrency issues across the app to restore stable local builds.
- Built a complete preview catalog and design/brand implementation pass, including updated wordmark/shimmer styling and consistency refinements.
- Added a comprehensive unit test suite that runs without Simulator to support regression checks early in development.
- Updated default backend base URL to production (`amachhealth.com`) and aligned app branding treatment in dashboard/onboarding surfaces.
