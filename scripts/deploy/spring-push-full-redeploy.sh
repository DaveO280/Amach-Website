#!/usr/bin/env bash
# spring-push-full-redeploy.sh
# Deploys a fresh SpringPushEscrowV1 (SPEED_RUN) to zkSync Sepolia,
# opens registration (no contest-wide baseline — each participant commits
# their own baseline root at register() time), updates networkConfig.ts,
# updates the iOS Swift file, then commits + pushes on vibrant-hawking-316975.
#
# Usage:  bash scripts/deploy/spring-push-full-redeploy.sh
# Must be run from the vibrant-hawking-316975 worktree root.

set -euo pipefail

SEED_ETH="0.01"
NETWORK="zksyncSepolia"
IOS_SERVICE_PATH="/Users/dave/AmachHealth-iOS"
OLD_ESCROW="0x99A695c61fC6775C03e3359D50613A2c8bc90806"
NETWORK_CONFIG="src/lib/networkConfig.ts"

echo ""
echo "══════════════════════════════════════════════════════"
echo "  SpringPushEscrowV1 — full redeploy (SPEED_RUN)"
echo "══════════════════════════════════════════════════════"
echo "  Prize seed    : $SEED_ETH ETH"
echo "  Network       : $NETWORK (chainId 300)"
echo "  Baseline root : per-participant (committed at register())"
echo ""

# ── 1. Deploy ──────────────────────────────────────────────────────────────
echo "▶ Step 1/4  Deploying SpringPushEscrowV1..."
DEPLOY_OUTPUT=$(SPEED_RUN=true pnpm exec hardhat run \
  scripts/deploy/spring-push-escrow.js \
  --network "$NETWORK" \
  --no-compile 2>&1)

echo "$DEPLOY_OUTPUT"

NEW_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "SpringPushEscrowV1 deployed at:" | awk '{print $NF}')
if [[ -z "$NEW_ADDRESS" ]]; then
  echo "❌  Could not parse deployed address from output above."
  exit 1
fi
echo ""
echo "✅  New contract address: $NEW_ADDRESS"

# ── 2. Open registration ───────────────────────────────────────────────────
echo ""
echo "▶ Step 2/4  Opening registration (seed $SEED_ETH ETH)..."
ESCROW_ADDRESS="$NEW_ADDRESS" \
  SEED_ETH="$SEED_ETH" \
  pnpm exec hardhat run \
    scripts/deploy/spring-push-open-registration.js \
    --network "$NETWORK" \
    --no-compile 2>&1

echo ""
echo "✅  Registration open. Each participant will commit their own baselineRoot at register()."

# ── 3. Update networkConfig.ts ─────────────────────────────────────────────
echo ""
echo "▶ Step 3/4  Patching $NETWORK_CONFIG..."
# Replace the old testnet escrow address with the new one
sed -i.bak \
  "s|SPRING_PUSH_ESCROW_CONTRACT: \"${OLD_ESCROW}\"|SPRING_PUSH_ESCROW_CONTRACT: \"${NEW_ADDRESS}\"|g" \
  "$NETWORK_CONFIG"
rm -f "${NETWORK_CONFIG}.bak"

if grep -q "$NEW_ADDRESS" "$NETWORK_CONFIG"; then
  echo "✅  networkConfig.ts updated: $NEW_ADDRESS"
else
  echo "❌  sed replacement failed — update networkConfig.ts manually."
  echo "    Replace: $OLD_ESCROW"
  echo "    With:    $NEW_ADDRESS"
fi

# ── 4. iOS: find and patch SpringPushContestService.swift ─────────────────
echo ""
echo "▶ Step 4/4  Looking for SpringPushContestService.swift in $IOS_SERVICE_PATH..."
SWIFT_FILE=$(find "$IOS_SERVICE_PATH" -name "SpringPushContestService.swift" 2>/dev/null | head -1)

if [[ -n "$SWIFT_FILE" ]]; then
  # Try both known old addresses
  OLD_IOS_1="0xEB4e6395D97158AbFC05c7bD02A6450b40eE8705"
  OLD_IOS_2="$OLD_ESCROW"

  for OLD_ADDR in "$OLD_IOS_1" "$OLD_IOS_2"; do
    if grep -q "$OLD_ADDR" "$SWIFT_FILE" 2>/dev/null; then
      sed -i.bak "s|${OLD_ADDR}|${NEW_ADDRESS}|g" "$SWIFT_FILE"
      rm -f "${SWIFT_FILE}.bak"
      echo "✅  iOS Swift file patched ($OLD_ADDR → $NEW_ADDRESS)"
      echo "    File: $SWIFT_FILE"
    fi
  done

  if ! grep -q "$NEW_ADDRESS" "$SWIFT_FILE" 2>/dev/null; then
    echo "⚠️   Could not find old address in $SWIFT_FILE"
    echo "    Please manually update the contract address to: $NEW_ADDRESS"
  fi
else
  echo "⚠️   SpringPushContestService.swift not found under $IOS_SERVICE_PATH"
  echo "    Please manually update the contract address to: $NEW_ADDRESS"
fi

# ── Commit & push ──────────────────────────────────────────────────────────
echo ""
echo "▶ Committing changes on claude/vibrant-hawking-316975..."
git add "$NETWORK_CONFIG"
if [[ -n "${SWIFT_FILE:-}" ]]; then
  # iOS is a separate repo — commit there first if it's on the right branch
  IOS_BRANCH=$(git -C "$IOS_SERVICE_PATH" branch --show-current 2>/dev/null || echo "")
  if [[ "$IOS_BRANCH" == "claude/vibrant-hawking-316975" ]]; then
    git -C "$IOS_SERVICE_PATH" add "$SWIFT_FILE"
    git -C "$IOS_SERVICE_PATH" commit -m "chore(escrow): update SpringPushEscrowV1 address → $NEW_ADDRESS"
    git -C "$IOS_SERVICE_PATH" push origin claude/vibrant-hawking-316975
    echo "✅  iOS repo committed and pushed."
  else
    echo "⚠️   iOS repo is on branch '$IOS_BRANCH', not vibrant-hawking-316975."
    echo "    Switch branches and commit the Swift file manually."
  fi
fi

git commit -m "chore(escrow): redeploy SpringPushEscrowV1 → $NEW_ADDRESS

- SPEED_RUN mode (contest=300s, claim=180s, max=5, min=2, prize=0.01 ETH)
- Registration opened, prize pool seeded
- Per-participant baseline roots — committed at register() time"

git push origin claude/vibrant-hawking-316975

echo ""
echo "══════════════════════════════════════════════════════"
echo "  DONE"
echo "  New escrow  : $NEW_ADDRESS"
echo "  State       : REGISTRATION_OPEN"
echo "  Baseline    : per-participant (committed at register())"
echo "══════════════════════════════════════════════════════"
