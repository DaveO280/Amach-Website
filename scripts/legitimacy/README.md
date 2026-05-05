# @amach/legitimacy

Open-source legitimacy verification for Amach Health committed v2 leaves.

Takes a participant's daily health data plus the on-chain committed Merkle
root and produces a structured legitimacy report. The script reconstructs
the Merkle tree from the supplied leaves, verifies it matches the on-chain
root, and runs a battery of statistical, correlation, temporal, and
continuity checks against the data — every threshold is documented and
configurable.

This package is part of the Amach verification factory. It is the
off-chain implementation of the LegitimacyAttestation claim type for
Spring Push Season One. See
`/Users/dave/Documents/Claude/Projects/Amach Health/VERIFICATION_FACTORY.md`
for the long-term architectural context.

## Install

```bash
npm install
npm test         # 133 tests, ~3 seconds
npm run build    # outputs dist/
```

Node 20+ required. Dependencies kept minimal: `poseidon-lite` (matches the
v2 leaf hash function used by iOS) and `simple-statistics` for stats.

## CLI usage

```bash
npx amach-legitimacy-check \
  --data ./participant-data.json \
  --root 0xabc... \
  --network zksync-sepolia \
  --output ./report.md \
  --format markdown \
  --leaf-version 2
```

| Flag             | Purpose                                                  |
| ---------------- | -------------------------------------------------------- |
| `--data`         | Path to the participant's input JSON (required)          |
| `--root`         | Override the `expectedRoot` field in the input file      |
| `--network`      | Network label to embed in the report                     |
| `--output`       | Output destination (default: stdout)                     |
| `--format`       | `json` / `markdown` / `both` (default: markdown)         |
| `--leaf-version` | `1` or `2` (Spring Push uses `2`; v1 path is unsupported)|
| `--verbose`      | Log additional diagnostic info to stderr                 |

The CLI exits 0 when the recommendation is `pass`, 1 when it's `fail`,
and 2 on input or argument errors.

### Input shape

```json
{
  "walletAddress": "0x…",
  "expectedRoot": "0x…",
  "expectedLeafCount": 90,
  "expectedStartDayId": 19000,
  "expectedEndDayId": 19089,
  "leaves": ["<248-hex-chars>", "..."],
  "commitTimestamps": [1716_000_000, 1716_604_800, ...]
}
```

Each entry in `leaves` is either the 124-byte v2 wire form encoded as 248
hex characters, or a structured `AmachLeafV2` JSON object (the script
rehydrates `Buffer` fields automatically).

## Programmatic usage

```ts
import {
  runLegitimacyPipeline,
  formatMarkdown,
  generateSeries,
  serializeLeafV2,
  buildMerkleTree
} from "@amach/legitimacy";

const out = generateSeries({ seed: "demo", days: 90, vo2maxStart: 32, vo2maxEnd: 38 });
const sorted = out.leaves.slice().sort((a, b) => a.dayId - b.dayId);
const root = buildMerkleTree(sorted.map(l => serializeLeafV2(l))).root;

const report = runLegitimacyPipeline({
  walletAddress: "0x" + sorted[0].wallet.toString("hex").slice(0, 40),
  expectedRoot: "0x" + root.toString(16),
  leaves: sorted
});
console.log(formatMarkdown(report));
```

## What the script checks

### Category A — cryptographic anchoring (gating)

If A fails, the script halts and the score is forced to 0.

| ID  | Check                                                         |
| --- | ------------------------------------------------------------- |
| A.1 | Merkle root match (Poseidon4 over four 31-byte chunks of v2)  |
| A.2 | Day count matches the on-chain commitment                     |
| A.3 | Date range (`startDayId` / `endDayId`) matches                |
| A.4 | Every leaf has version 0x02, leafType 0x00, schemaVersion 0x01|

### Category B — statistical bounds per metric

For each of 14 metrics (steps, activeEnergy, exerciseMins, hrv, restingHR,
sleepMins, vo2max, weight, bodyFatPct, leanMass, deepSleepMins, remSleepMins,
lightSleepMins, awakeMins):

| ID  | Check                                                    |
| --- | -------------------------------------------------------- |
| B.1 | Mean within physiologically plausible range              |
| B.2 | Coefficient of variation within bounds                   |
| B.3 | No degenerate distributions (≤ 30 % identical values)    |
| B.4 | No suspicious day-over-day step changes                  |
| B.5 | Range coherence over the window                          |

Body composition metrics (weight, bodyFatPct, leanMass) skip B.3 because
they legitimately have low cardinality (people don't weigh themselves
every day).

### Category C — multi-metric correlations

| ID  | Check                                                         |
| --- | ------------------------------------------------------------- |
| C.1 | RHR ↔ HRV inverse correlation (per-day pairing)               |
| C.2 | VO2 max ↔ RHR over time (long-window inverse)                 |
| C.3 | VO2 max ↔ HRV over time (long-window positive)                |
| C.4 | Active energy ↔ exercise minutes (mechanical link)            |
| C.5 | Sleep stage internal consistency (Ohayon proportions + sums)  |
| C.6 | Body weight ≈ lean + fat mass coherence                       |
| C.7 | Workout signature plausibility (workout > rest exercise mins) |

### Category D — temporal patterns

| ID  | Check                                                         |
| --- | ------------------------------------------------------------- |
| D.1 | Diurnal HR rhythm proxy (RHR vs sleep)                        |
| D.2 | Weekday / weekend variation in activity                       |
| D.3 | Sleep timing consistency (CV of sleep duration)               |
| D.4 | Commit timestamp distribution (≤ 50 % in final week)          |
| D.5 | Temporal coherence via lag-1 autocorrelation                  |

### Category E — continuity

| ID    | Check                                                 |
| ----- | ----------------------------------------------------- |
| E.1   | No gaps exceeding 48 hours                            |
| E.2.* | Per-metric data density (presence rate ≥ floor)       |
| E.3   | Device source consistency (one primary source ≥ 95 %) |

### Category F — score and recommendation

```
score = (0.20·B + 0.35·C + 0.25·D + 0.20·E) × 0.6^N
```

where each category contributes its weighted internal pass rate and `N`
is the number of "primary diagnostic" failures (C.1–C.5, D.2, D.4, D.5,
E.1, E.3). Two diagnostic failures push the score below the 0.7 threshold
even if every other check passes.

## Threshold sources

| Source                                    | Used for                          |
| ----------------------------------------- | --------------------------------- |
| CDC NHANES 2017–2020                      | population means, body comp       |
| ACSM Guidelines for Exercise Testing 11e  | VO2 max, RHR, exercise norms      |
| Schmitt et al. 2013, Eur J Appl Physiol   | HRV norms by age                  |
| Ohayon et al. 2004, Sleep                 | sleep stage proportions           |
| Buchheit 2014, Sport Med                  | VO2 ↔ HRV training response       |
| Stamatakis & Punjabi 2010                 | sleep / RHR autocorrelation norms |
| Tudor-Locke et al. 2011                   | weekday / weekend step deltas     |

All thresholds live in `src/config.ts` and are tuned for the Spring Push
audience (fitness-focused 25–45). Pass a custom `LegitimacyConfig` to
`runLegitimacyPipeline` for demographic-specific runs.

## Cross-platform parity

The Poseidon4 hashing in `src/leaf.ts` is verified against five fixed
test vectors that the iOS Swift implementation
(`AmachLeafV2Tests.swift`) and the canonical JS implementation
(`zk/scripts/hash_leaf.js`) also assert against. See
`__tests__/fixtures/crossPlatformVectors.ts`.

If you regenerate the vectors on the iOS side, paste the new pairs into
the fixture file verbatim — do not hand-edit them.

## Synthetic data

`src/generator/synthetic.ts` produces realistic synthetic Apple Health
data for testing. Configurable: starting fitness level, age, sex, target
improvement trajectory, device profile, noise profile.

`src/generator/datasets.ts` defines 16 named test datasets:

- L1–L5 — legitimate, must score > 0.85
- A1–A8 — adversarial (random, smoothed, single-metric, cherry-picked,
  copy-paste week, friend's-data, device-switch, backloaded commits) —
  must fail at least one C/D/E check, score < 0.70
- E1–E3 — edge cases (sparse but real, night-shift schedule, elite athlete) —
  must score > 0.70 with warnings allowed

`__tests__/datasets.test.ts` is the single source of truth for whether
the implementation meets the brief's acceptance criteria.

## Performance

365-day datasets run in well under 1 second on a 2024 MacBook (the brief
budgets 10 s).

## Future work

- Demographic-specific threshold sets (Season Two)
- Tier 2 on-chain `LegitimacyAttestationProof` circuit (Season Two+) —
  this script is the off-chain implementation of the same claim type
- Real-data calibration once Season One participants opt in
