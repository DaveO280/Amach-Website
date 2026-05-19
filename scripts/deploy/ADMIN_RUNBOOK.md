# Spring Push Admin Runbook

The exact commands an admin runs to take a Spring Push contest from "fresh
deploy" through to "founder reclaim". Each step references the script that
implements it under `scripts/deploy/`.

All commands assume:

- You are in the website repo root.
- You have `hardhat` configured and the deployer private key wired into
  `hardhat.config.js` (`accounts: [process.env.PRIVATE_KEY]`).
- The network is `zksyncSepolia` (chainId 300) unless noted.
- You are the contract `ADMIN`. The `register()`, `closeRegistration()`,
  `openRegistration()`, `finalize()`, and `founderReclaim()` calls all gate
  on this — non-admin signers will revert.

The contract state machine, for reference:

```
0 UNINITIALIZED → 1 REGISTRATION_OPEN → 2 ACTIVE → 3 CLAIMING → 4 FINISHED
                                                        ↘ 5 FAILED
```

---

## 1. Deploy a fresh escrow

Deploys `SpringPushEscrowV1` and writes a deployment record to
`deployments/spring-push-escrow-<timestamp>.json`.

```bash
SPEED_RUN=true pnpm exec hardhat run \
  scripts/deploy/spring-push-escrow.js \
  --network zksyncSepolia
```

- `SPEED_RUN=true` uses the short-window contest constants (for testing).
  Leave it unset to use mainnet 90-day durations.
- Note the deployed address — every later step needs it as `ESCROW_ADDRESS`.

**Full automated path:** `bash scripts/deploy/spring-push-full-redeploy.sh`
runs steps 1 + 2 + updates `src/lib/networkConfig.ts` and the iOS Swift
file with the new address. Use this for testnet redeploys. Edit the
constants at the top of the script first (`BASELINE_ROOT`, `SEED_ETH`,
`NETWORK`, `IOS_SERVICE_PATH`, `OLD_ESCROW`).

---

## 2. Open registration

Transitions UNINITIALIZED → REGISTRATION_OPEN and seeds the prize pool.

```bash
ESCROW_ADDRESS=0x... \
BASELINE_ROOT=0x...   # 32-byte hex (the depth-7 Merkle root of the baseline window) \
SEED_ETH=0.01 \
pnpm exec hardhat run \
  scripts/deploy/spring-push-open-registration.js \
  --network zksyncSepolia
```

- `BASELINE_ROOT` must match the root the participants' iOS app will commit
  against. For dev runs, the Web `Seed Test Leaves (dev only)` button prints
  this root in the UI.
- `SEED_ETH` is sent as `msg.value` and becomes `prizePool`.

---

## 3. Close registration

Manually closes registration before the on-chain `REGISTRATION_DURATION`
expires, if minimum participants is already met. Transitions
REGISTRATION_OPEN → ACTIVE.

```bash
ESCROW_ADDRESS=0x... \
pnpm exec hardhat run \
  scripts/deploy/spring-push-close-only.js \
  --network zksyncSepolia
```

- Reverts if `participantCount < MIN_PARTICIPANTS`. If the contest fails to
  hit the minimum, the contract auto-transitions to FAILED on the next
  state read; skip ahead to `founderReclaim` to recover the seed.
- The contract auto-advances to ACTIVE on its own once the registration
  duration elapses, so this script is only needed when you want to close
  early.

For testnet smoke runs there's also `spring-push-register-and-close.js`,
which `register()`s the deployer wallet first and then closes — useful when
the deployer is the only participant and you need to skip past the gate.

---

## 4. Contest period (ACTIVE → CLAIMING)

No admin action required. Participants `register()`, then `submitProof()`
through the website / iOS app. The contract auto-advances ACTIVE → CLAIMING
once `contestCloseTime` elapses (any on-chain read can trigger the
advancement via `_advanceFromActiveIfElapsed`).

Use this to inspect state at any point:

```bash
ESCROW_ADDRESS=0x... \
pnpm exec hardhat run \
  scripts/deploy/spring-push-read-state.js \
  --network zksyncSepolia
```

---

## 5. Finalize

After the claim window opens (state == CLAIMING) and proof submissions are
closed, finalize ranks the qualifiers and locks the prize tiers. Transitions
CLAIMING → FINISHED.

```bash
ESCROW_ADDRESS=0x... \
pnpm exec hardhat run \
  scripts/deploy/spring-push-finalize.js \
  --network zksyncSepolia
```

The script reads every participant, filters to those with `improvementBp > 0`,
sorts descending, and submits the sorted address array to `finalize()`. It
also validates the caller is `ADMIN` before sending the tx.

> If finalize hasn't been called within ~2 hours of `claimWindowEndTime`,
> the website UI surfaces a "Finalization pending — check back soon or
> contact support." message to participants. Run this step promptly to
> avoid that copy showing up in front of real users.

---

## 6. Participants claim (no admin action)

Once FINISHED, qualifying participants call `claimPrize()` through the
website / iOS app. The contract pays out their tier amount and marks them
`claimed`.

---

## 7. Founder reclaim

After the claim period, sweep any unclaimed prize (or the full pool, if the
contest landed in FAILED) back to a recipient address. Admin-only.

```bash
ESCROW_ADDRESS=0x... \
RECIPIENT=0x...      # any payable address \
# No dedicated script — call directly via hardhat console:
pnpm exec hardhat console --network zksyncSepolia
```

Inside the console:

```js
const e = await ethers.getContractAt(
  "SpringPushEscrowV1",
  process.env.ESCROW_ADDRESS,
);
await (await e.founderReclaim(process.env.RECIPIENT)).wait();
```

The contract enforces "claim window over, all qualifiers paid OR contest
FAILED" before allowing the sweep; the call will revert otherwise.

---

## Quick reference

| Step | Script                                        | State pre → post                  |
| ---- | --------------------------------------------- | --------------------------------- |
| 1    | `spring-push-escrow.js`                       | (none) → UNINITIALIZED            |
| 2    | `spring-push-open-registration.js`            | UNINITIALIZED → REGISTRATION_OPEN |
| 3    | `spring-push-close-only.js`                   | REGISTRATION_OPEN → ACTIVE        |
| 5    | `spring-push-finalize.js`                     | CLAIMING → FINISHED               |
| 7    | `founderReclaim(address)` via hardhat console | (post-claim) → funds swept        |

All scripts require `ESCROW_ADDRESS` in the environment. `spring-push-escrow.js`
also honors `SPEED_RUN=true` for shortened durations on testnet.
