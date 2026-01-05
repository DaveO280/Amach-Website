# Amach Health

Decentralized health data platform with encrypted storage, AI-powered health insights, and blockchain-verified profiles.

## Quick Start

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Add your Privy, Storj, and blockchain RPC credentials

# Run development server
pnpm dev

# Build for production
pnpm build
```

Visit `http://localhost:3000` to see the app.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Amach Health                        │
├─────────────────────────────────────────────────────────┤
│  Wallet (Privy)  │  Profile (On-Chain)  │  AI Companion│
│  ↓               │  ↓                    │  ↓           │
│  Timeline Events → Storj (Encrypted)    → AI Analysis  │
│  ↓                                       ↓              │
│  Health Scores ← Daily Calculations ←  Timeline Data   │
└─────────────────────────────────────────────────────────┘
```

**Core Components:**

- **Wallet**: Privy integration for wallet management (embedded + external)
- **Storage**: Storj for encrypted off-chain data (timeline, chat)
- **Blockchain**: ZKsync testnet for profile data and event references
- **AI**: 6 specialized health agents + coordinator for analysis
- **Encryption**: Dual system (signature-based for Storj, address-based for profiles)

## Key Features

### 🔐 Dual Encryption System

- **walletEncryption.ts**: Signature-based, for timeline/chat/Storj (high security)
- **secureHealthEncryption.ts**: Address-based, for on-chain profiles (UX-friendly)

### ⏱️ Health Timeline

- Add/edit/delete health events with custom dates
- Encrypted storage in Storj with blockchain references
- Visual timeline with filtering by category and date range

### 🤖 AI Companion (Cosaint)

- 6 specialized agents: Activity, Bloodwork, Cardiovascular, DEXA, Recovery, Sleep
- Coordinator orchestrates multi-agent analysis
- Context-aware health insights based on your data

### 📊 Daily Health Scores

- Automatic calculation from timeline data
- Trend analysis and visualization
- Stored in IndexedDB for fast access

### 👤 On-Chain Profile

- Encrypted birth date, sex, height, weight, email
- Stored on ZKsync testnet with verification system
- No signatures required for profile access

## Project Structure

```
src/
├── agents/           # 6 specialized health AI agents + coordinator
├── ai/               # AI preprocessing and relevance scoring
├── app/              # Next.js pages and API routes
├── components/       # React components (wallet, timeline, AI, etc.)
├── hooks/            # React hooks (usePrivyWalletService, etc.)
├── services/         # Business logic (health events, AI, etc.)
├── storage/          # Storj client and services
├── types/            # TypeScript type definitions
└── utils/            # Utilities (encryption, scoring, etc.)
```

### Key Files

- `hooks/usePrivyWalletService.ts` - Main wallet service (1500+ lines)
- `services/HealthEventService.ts` - Timeline CRUD operations
- `services/CosaintAiService.ts` - AI coordinator and analysis
- `utils/walletEncryption.ts` - Primary encryption system
- `utils/secureHealthEncryption.ts` - Profile encryption (deprecated for new features)

## Development

### Common Commands

```bash
pnpm dev              # Start dev server
pnpm build            # Build for production
pnpm type-check       # Run TypeScript checks
pnpm lint             # Run ESLint
pnpm test             # Run tests (when available)
```

### Environment Variables

Required in `.env.local`:

- `NEXT_PUBLIC_PRIVY_APP_ID` - Privy app ID
- `NEXT_PUBLIC_ZKSYNC_RPC_URL` - ZKsync testnet RPC
- `STORJ_ACCESS_KEY` / `STORJ_SECRET_KEY` - Storj credentials
- `NEXT_PUBLIC_VENICE_API_KEY` - Venice AI API key

### Testing Features

1. **Wallet**: Connect with Privy (email/social/external wallet)
2. **Profile**: Create/update profile in wallet wizard
3. **Timeline**: Add health events with custom dates
4. **AI**: Chat with Cosaint, view health scores
5. **Encryption**: All data encrypted before storage

## Tech Stack

**Frontend:**

- Next.js 16 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS + shadcn/ui

**Blockchain:**

- ZKsync Era (testnet)
- viem (Ethereum interactions)
- Privy (wallet management)

**Storage:**

- Storj (decentralized object storage)
- IndexedDB (local health scores cache)

**AI:**

- Venice AI API (LLM backend)
- Custom multi-agent system

**Encryption:**

- CryptoJS (AES-256-CBC) for Storj data
- Web Crypto API (AES-256-GCM) for profiles

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment instructions.

**Quick deploy to Vercel:**

```bash
vercel --prod
```

Make sure to set all environment variables in Vercel dashboard.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Before contributing:**

1. Read the architecture overview above
2. Check existing issues/PRs
3. Follow TypeScript and React best practices
4. Write clear commit messages
5. Test your changes thoroughly

## Code of Conduct

This project adheres to our [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful and professional.

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Need help?** Open an issue or reach out to the team.

**Found a bug?** Please report it with steps to reproduce.

**Have an idea?** We'd love to hear it - open a discussion!
