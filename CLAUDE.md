# CLAUDE.md - AI Assistant Guide for Amach Health

This document provides essential context for AI assistants working on the Amach Health codebase.

## Project Overview

Amach Health is a **decentralized health data platform** that combines:
- Encrypted health data storage (Storj)
- Blockchain-verified profiles (ZKsync Era)
- AI-powered health insights (multi-agent system)
- Wallet-based authentication (Privy)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 (strict mode) |
| Styling | Tailwind CSS 3.3 + shadcn/ui |
| State | React Context + custom stores |
| Blockchain | ZKsync Era (testnet), viem, Privy |
| Storage | Storj (S3-compatible), IndexedDB |
| AI | Venice AI API, 6 specialized agents |
| Encryption | CryptoJS (AES-256-CBC), Web Crypto API |
| Package Manager | pnpm (required) |
| Smart Contracts | Solidity 0.8.20/0.8.22, Hardhat |

## Quick Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server (HTTPS)
pnpm dev:http         # Start dev server (HTTP)
pnpm build            # Lint + type-check + build
pnpm type-check       # TypeScript validation only
pnpm lint             # ESLint check
pnpm test             # Run Jest tests
pnpm validate-docs    # Check for stale documentation
pnpm clean-docs       # Auto-remove stale docs
```

## Directory Structure

```
src/
├── agents/           # 6 health AI agents + coordinator
│   ├── ActivityEnergyAgent.ts
│   ├── BloodworkAgent.ts
│   ├── CardiovascularAgent.ts
│   ├── CoordinatorAgent.ts
│   ├── DexaAgent.ts
│   ├── RecoveryStressAgent.ts
│   ├── SleepAgent.ts
│   └── BaseHealthAgent.ts    # Abstract base class
├── ai/               # AI preprocessing and relevance scoring
│   ├── ContextPreprocessor.ts
│   ├── RelevanceScorer.ts
│   └── tools/        # AI tool implementations
├── api/              # API service clients
│   └── venice/       # Venice AI API client
├── app/              # Next.js App Router pages
│   ├── api/          # API routes
│   │   ├── health/   # Health data endpoints
│   │   ├── storj/    # Storj storage endpoints
│   │   ├── venice/   # AI chat endpoint
│   │   └── wallet/   # Wallet operations
│   ├── dashboard/    # Main dashboard page
│   ├── wallet/       # Wallet connection page
│   └── page.tsx      # Landing page
├── components/       # React components
│   ├── ai/           # AI chat UI (CosaintChatUI.tsx)
│   ├── ui/           # shadcn/ui primitives
│   ├── health/       # Health-specific components
│   └── *.tsx         # Feature components
├── hooks/            # React hooks
│   ├── usePrivyWalletService.ts  # Main wallet service (58K+ lines)
│   ├── useOnChainProfile.ts
│   └── useStorjPruning.ts
├── lib/              # Configuration
│   ├── contractConfig.ts   # Smart contract ABIs
│   └── networkConfig.ts    # Chain/RPC settings
├── services/         # Business logic
│   ├── CosaintAiService.ts      # AI coordinator
│   ├── HealthEventService.ts    # Timeline CRUD
│   ├── PrivyWalletService.ts    # Wallet operations
│   └── SecureHealthProfileService.ts
├── storage/          # Storj integration
│   ├── StorjClient.ts
│   ├── StorjTimelineService.ts
│   ├── StorjConversationService.ts
│   └── StorjReportService.ts
├── store/            # State management
│   ├── aiStore.tsx   # AI chat state
│   └── healthDataStore/
├── types/            # TypeScript definitions
│   └── healthEventTypes.ts  # Health event enums/types
└── utils/            # Utilities
    ├── walletEncryption.ts      # Primary encryption (signature-based)
    ├── secureHealthEncryption.ts # Profile encryption (address-based)
    ├── dailyHealthScoreCalculator.ts
    └── pdfParser.ts

contracts/            # Solidity smart contracts
├── SecureHealthProfileV3.sol   # Current production contract
├── ProfileVerificationV2.sol
└── HealthToken.sol

scripts/              # Deployment/utility scripts
├── deploy-*.js       # Contract deployment
├── upgrade-*.js      # Contract upgrades
└── check-*.js        # Diagnostic scripts

tests/                # Test files
└── agents/           # Agent quality tests
```

## Key Files to Understand

| File | Purpose |
|------|---------|
| `src/hooks/usePrivyWalletService.ts` | Central wallet service - handles auth, encryption, blockchain ops |
| `src/services/CosaintAiService.ts` | AI coordinator - orchestrates multi-agent analysis |
| `src/services/HealthEventService.ts` | Timeline CRUD - manages health events |
| `src/storage/StorjClient.ts` | Storj S3 client - encrypted data storage |
| `src/utils/walletEncryption.ts` | Primary encryption - signature-based for Storj |
| `src/lib/contractConfig.ts` | Contract ABIs and addresses |
| `src/components/ai/CosaintChatUI.tsx` | Main AI chat interface (88K+ lines) |
| `src/components/WalletSetupWizard.tsx` | Onboarding flow (70K+ lines) |

## Code Conventions

### TypeScript
- **Strict mode enabled** - no implicit any
- **Path aliases**: `@/*` maps to `src/*`
- **Unused vars**: Prefix with `_` (e.g., `_unused`)
- **Explicit return types**: Required (warning level)
- **No unused locals/params**: Enforced

### React/Next.js
- **App Router**: All pages in `src/app/`
- **API routes**: `src/app/api/*/route.ts`
- **Client components**: Add `"use client"` directive
- **Server components**: Default (no directive needed)

### ESLint Rules
```javascript
"@typescript-eslint/no-explicit-any": "error"
"@typescript-eslint/explicit-function-return-type": "warn"
"react-hooks/rules-of-hooks": "error"
"react-hooks/exhaustive-deps": "warn"
```

### Prettier
- Semicolons: Yes
- Single quotes: No (double quotes)
- Tab width: 2 spaces

### Pre-commit Hooks
- Runs `lint-staged` on staged files
- Runs `type-check` on entire project
- Runs `validate-docs` to catch stale documentation

## Dual Encryption System

The project uses two encryption approaches:

### 1. Wallet Encryption (`walletEncryption.ts`)
- **For**: Timeline events, chat history, Storj data
- **Method**: Signature-based key derivation
- **Security**: High (requires wallet signature)
- **Use when**: Storing sensitive health data

### 2. Secure Health Encryption (`secureHealthEncryption.ts`)
- **For**: On-chain profile data
- **Method**: Address-based key derivation
- **Security**: UX-friendly (no signature popups)
- **Use when**: Quick profile access needed

## AI Agent Architecture

The system uses 6 specialized health agents coordinated by a central service:

1. **ActivityEnergyAgent** - Exercise, steps, calories
2. **BloodworkAgent** - Lab results, biomarkers
3. **CardiovascularAgent** - Heart rate, HRV, BP
4. **DexaAgent** - Body composition
5. **RecoveryStressAgent** - Recovery metrics, stress
6. **SleepAgent** - Sleep patterns, quality

All agents extend `BaseHealthAgent` and implement:
- `assessRelevance()` - Score query relevance (0-1)
- `execute()` - Generate analysis

The `CoordinatorAgent` orchestrates multi-agent responses based on relevance scores.

## Smart Contract Architecture

### Current Production Contract
- **SecureHealthProfileV3** on ZKsync Era Sepolia
- UUPS upgradeable proxy pattern
- Functions: `createProfileWithWeight`, `updateProfileWithWeight`, `getProfile`

### Contract Deployment
```bash
npx hardhat compile
node scripts/deploy-v3-with-correct-proxy.js
```

### Contract Verification
Deployment info stored in `deployments/*.json`

## Environment Variables

Required in `.env.local`:
```env
NEXT_PUBLIC_PRIVY_APP_ID=        # Privy app ID
NEXT_PUBLIC_ZKSYNC_RPC_URL=      # ZKsync RPC endpoint
STORJ_ACCESS_KEY=                 # Storj S3 access key
STORJ_SECRET_KEY=                 # Storj S3 secret key
STORJ_ENDPOINT=                   # Storj S3 endpoint
STORJ_BUCKET_NAME=                # Storj bucket name
NEXT_PUBLIC_VENICE_API_KEY=       # Venice AI API key
PRIVATE_KEY=                      # Deployer private key (for scripts)
```

## Testing

### Jest Configuration
- Test environment: Node (default)
- Test pattern: `**/__tests__/**/*.test.ts`
- Path alias support: `@/*` mapped

### Running Tests
```bash
pnpm test                    # Run all tests
pnpm agent:test             # Run agent quality tests
```

### Agent Tests
Located in `tests/agents/agentQualityTest.ts` - validates agent response quality.

## Documentation Philosophy

This project uses **living documentation**:
- **4 core docs only**: README, CONTRIBUTING, CODE_OF_CONDUCT, DEPLOYMENT
- **Stale docs auto-purged**: DEBUG_*, FIX_*, MIGRATION_*, etc.
- **Inline docs preferred**: JSDoc in code over separate markdown

Configure patterns in `.docs-config.json`.

## Common Tasks

### Adding a New Health Event Type
1. Add enum value in `src/types/healthEventTypes.ts`
2. Add definition in `EVENT_TYPE_DEFINITIONS`
3. Update `HealthEventService.ts` if needed

### Adding a New API Route
1. Create folder in `src/app/api/`
2. Add `route.ts` with HTTP method handlers
3. Follow existing patterns (see `src/app/api/venice/route.ts`)

### Modifying Smart Contract
1. Update contract in `contracts/`
2. Compile: `npx hardhat compile`
3. Update ABI in `src/lib/contractConfig.ts`
4. Deploy/upgrade via scripts

### Adding UI Component
1. Check if shadcn/ui has it (`src/components/ui/`)
2. If custom, add to appropriate folder in `src/components/`
3. Use Tailwind CSS for styling

## Things to Avoid

- **Don't use `npm` or `yarn`** - This project uses `pnpm`
- **Don't add `any` types** - ESLint will error
- **Don't skip type-check** - Build requires it
- **Don't create debug markdown files** - They'll be auto-deleted
- **Don't commit .env files** - They're gitignored
- **Don't use `@ts-ignore`** - Fix the types properly
- **Don't modify contract ABIs directly** - Update contracts first

## Webpack Considerations

The project has complex webpack config in `next.config.js` to handle:
- viem test file exclusions (multiple IgnorePlugin rules)
- AWS SDK externalization (for proper S3 signing)
- Module replacement for test stubs

If you see viem/test-related build errors, check `next.config.js` webpack plugins.

## Useful Diagnostic Scripts

```bash
node check-blockchain-state.js        # Check on-chain state
node check-reentrancy-status.js      # Check contract reentrancy
node scripts/check-contract-version.js # Verify contract version
node scripts/check-user-profile.js   # Debug user profile
```

## Network Configuration

- **Chain**: ZKsync Era Sepolia (Chain ID: 300)
- **RPC**: https://sepolia.era.zksync.dev
- **Explorer**: https://explorer.sepolia.era.zksync.dev

## File Size Considerations

Some files are intentionally large due to complexity:
- `CosaintChatUI.tsx` (~88K) - Full chat UI with history
- `WalletSetupWizard.tsx` (~70K) - Complete onboarding flow
- `usePrivyWalletService.ts` (~58K) - Central wallet orchestration

Consider these as integration points rather than refactoring targets.

## Session Link Format

When creating git commits, include the Claude session link:
```
https://claude.ai/code/session_<SESSION_ID>
```
