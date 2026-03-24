# Computer Use Skill — Amach Health Web App

Use Claude's computer use capabilities to visually interact with, test, and debug the Amach Health Next.js dashboard.

## Prerequisites

Ensure the development server is running before starting:

```bash
pnpm dev
# App is available at http://localhost:3000
```

## What This Skill Does

This skill enables Claude to:
- Take screenshots of the running web app
- Navigate between pages and interact with UI elements
- Visually verify features, layouts, and AI chat interactions
- Identify UI bugs or regressions

## Key Routes to Test

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/dashboard` | Main health dashboard — health score ring, metrics grid |
| `/wallet` | Privy wallet connection flow |

## Common Tasks

### Visual snapshot of current state
Take a screenshot of the currently visible page and describe what you see.

### Navigate the dashboard
1. Open `http://localhost:3000/dashboard`
2. Screenshot the health score ring and metrics grid
3. Verify the layout is correct at 1440px and 375px viewport widths

### Test Luma AI chat (CosaintChatUI)
1. Navigate to `/dashboard`
2. Open the chat panel
3. Type a sample health question (e.g. "How is my sleep trending?")
4. Screenshot the response to verify the chat UI renders correctly

### Verify wallet connection flow
1. Navigate to `/wallet`
2. Screenshot the Privy connection modal
3. Do **not** connect a real wallet — verify the UI state only

### Check responsive layout
Resize the viewport to mobile (375px wide) and desktop (1440px wide). Screenshot each and note any layout issues.

## Tech Context

- **Framework:** Next.js 16 (App Router), TypeScript 5, Tailwind CSS
- **AI:** Venice AI multi-agent system with 6 health agents + CoordinatorAgent
- **Auth:** Privy (wallet-based — do not use real wallets during testing)
- **Styling:** shadcn/ui components, Framer Motion animations
- **Package manager:** pnpm (use `pnpm dev` not `npm run dev`)

## Safety Guidelines

- Do **not** connect real wallets or sign transactions
- Do **not** upload real health data
- Use the ZKsync Era Sepolia **testnet** only if blockchain interactions are needed
- Avoid triggering encrypted Storj uploads during visual testing
- Treat screenshots as potentially sensitive — do not share outside the dev team

## Reporting Issues

When you identify a visual bug or unexpected behaviour:
1. Take a screenshot showing the issue
2. Note the route, viewport size, and browser
3. Describe the expected vs actual appearance
4. Check `src/components/` for the relevant component and suggest a fix
