# Amach v2 Daily-Summary Leaf — Canonical 124-byte Spec

Cross-platform source of truth for the v2 Merkle leaf serialized by
[`serializeLeafV2`](improvementWitnessBuilder.ts) on the website and
mirrored by `MerkleLeafV2Fields` / `MerkleNormalizationService` on iOS.

This is a **wire-format and circuit spec, not an implementation guide**. Any
drift between the byte layout, dataFlags bitmask, sourceHash computation, or
timezone derivation breaks every proof built against an existing tree. Treat
this document as authoritative.

- Total size: **124 bytes**, big-endian throughout, no padding between fields.
- Hashed by Poseidon4 over four 31-byte chunks (see [Chunking](#chunking-for-poseidon4)).
- Tree: depth-7 binary Merkle (128 leaves), Poseidon2 internal nodes, unused
  slots padded with a fixed envelope-only dummy leaf.

## 1. Envelope (bytes 0–3)

| Offset | Size | Field              | Default | Notes                                             |
| ------ | ---- | ------------------ | ------- | ------------------------------------------------- |
| 0      | u8   | `version`          | `0x02`  | Protocol major version. v2 = `0x02`.              |
| 1      | u8   | `leafType`         | `0x00`  | `0x00` = `daily_summary`. Other types reserved.   |
| 2      | u8   | `schemaVersion`    | `0x01`  | Schema iteration within (version, leafType).      |
| 3      | u8   | `reservedEnvelope` | `0x00`  | Reserved for future envelope flags. Must be zero. |

Envelope defaults are pinned in
[`improvementWitnessBuilder.ts`](improvementWitnessBuilder.ts) as
`V2_VERSION_BYTE`, `V2_LEAF_TYPE_DAILY_SUMMARY`, `V2_SCHEMA_VERSION_DAILY_SUMMARY`.
iOS leaves them `nil` on `MerkleLeafV2Fields`; the server fills the defaults
during `wireLeafToFields → serializeLeafV2`. Overriding any of these is only
correct when deliberately producing malformed leaves for validator tests.

The chunk-1 decoder (`chunksV2`) **enforces** `version === 0x02` — a wrong
version byte fails proof construction before hashing.

## 2. Body (bytes 4–123)

| Offset     | Size | Field             | Type    | Unit / Encoding                                                                                                                                   |
| ---------- | ---- | ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4..35      | 32   | `wallet`          | bytes32 | Wallet address, **right-aligned** into 32 bytes. 20-byte EVM addr → 12 zero bytes + 20 wallet bytes.                                              |
| 36..39     | 4    | `dayId`           | u32 BE  | Days since 2024-01-01 in the leaf's local timezone. See §4.                                                                                       |
| 40..41     | 2    | `timezoneOffset`  | i16 BE  | Minutes from UTC. e.g. EST = −300, IST = +330. See §5.                                                                                            |
| 42..45     | 4    | `steps`           | u32 BE  | Integer step count (sum of `HKQuantityTypeIdentifierStepCount` samples ending in the day, rounded).                                               |
| 46..49     | 4    | `activeEnergy`    | u32 BE  | kcal × 100. Sum of `HKQuantityTypeIdentifierActiveEnergyBurned`, half-up rounded.                                                                 |
| 50..51     | 2    | `exerciseMins`    | u16 BE  | Sum of `HKWorkout.duration` seconds for workouts starting in the day, ÷60, rounded.                                                               |
| 52..53     | 2    | `hrv`             | u16 BE  | ms × 10. Mean of `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` samples (≥2 required, else `0`).                                              |
| 54..55     | 2    | `restingHR`       | u16 BE  | bpm × 10. First `HKQuantityTypeIdentifierRestingHeartRate` of the day; `0` if absent.                                                             |
| 56..57     | 2    | `sleepMins`       | u16 BE  | Total minutes from `HKCategoryTypeIdentifierSleepAnalysis` whose `sourceBundleID` contains `"com.apple.health"`, summed by `endDate − startDate`. |
| 58         | 1    | `workoutCount`    | u8      | Distinct `HKWorkout` sessions starting in the day. Capped at 255.                                                                                 |
| 59         | 1    | `sourceCount`     | u8      | Distinct `sourceBundleID` strings across samples + workouts. Capped at 255.                                                                       |
| 60..63     | 4    | `dataFlags`       | u32 BE  | Bitmask — see §3. **Widened from v1's u16** to leave room for v2-only presence bits.                                                              |
| **64..65** | 2    | `vo2max`          | u16 BE  | ml/(kg·min) × 10. Mean of `HKQuantityTypeIdentifierVO2Max` for the day; `0` absent. **Circuit metric pointer lands here** (see §6).               |
| 66..67     | 2    | `weight`          | u16 BE  | kg × 100. Most recent `HKQuantityTypeIdentifierBodyMass` (by `endDate`); `0` absent.                                                              |
| 68..69     | 2    | `bodyFatPct`      | u16 BE  | Fraction × 10000 (basis points). Most recent `HKQuantityTypeIdentifierBodyFatPercentage`; HK returns body fat as a fraction, so 0.185 → 1850.     |
| 70..71     | 2    | `leanMass`        | u16 BE  | kg × 100. Most recent `HKQuantityTypeIdentifierLeanBodyMass`; `0` absent.                                                                         |
| 72..73     | 2    | `deepSleepMins`   | u16 BE  | Minutes bucketed from sleep samples with `HKCategoryValueSleepAnalysis = 4` (deep).                                                               |
| 74..75     | 2    | `remSleepMins`    | u16 BE  | Minutes bucketed with value `5` (REM).                                                                                                            |
| 76..77     | 2    | `lightSleepMins`  | u16 BE  | Minutes bucketed with value `3` (`core`, a.k.a. "light").                                                                                         |
| 78..79     | 2    | `awakeMins`       | u16 BE  | Minutes bucketed with value `2` (awake-during-sleep).                                                                                             |
| 80..91     | 12   | `reservedPayload` | bytes12 | Reserved for future metrics. Defaults to 12 zero bytes when iOS sends `nil`.                                                                      |
| 92..123    | 32   | `sourceHash`      | bytes32 | SHA-256 of sorted source bundle IDs — see §7.                                                                                                     |

### Notes on aggregation choices

- **Day attribution**: a sample belongs to a day if its `endDate` falls in
  `[dayStart, dayStart + 1 day)` for the leaf's local timezone.
  **Workouts** use `startDate`, not `endDate`. **Resting HR** uses `startDate`.
- **HRV requires ≥ 2 samples** to count as present — a single SDNN reading is
  noisy and is treated as absent (`hrvPresent = false`, value `0`).
- **Body composition** uses `mostRecent(endDate)` — multiple readings on one
  day usually come from a single scale measurement broken into components,
  and "most recent" matches Apple Health's display.
- **Sleep stages** skip `HKCategoryValueSleepAnalysis = 0` (`inBed`, would
  double-count) and `= 1` (`asleepUnspecified`, can't be attributed to a
  stage). Stage minutes are **not required to sum to `sleepMins`** — older
  trackers report only unspecified asleep.
- **Half-up rounding** (`floor(x + 0.5)`) is used for every integer encoding
  — not banker's rounding — so iOS, Node, and the circuit pre-image stay
  bit-identical.
- **Empty-day skip**: a normalized day is dropped if `dataFlags == 0 &&
workoutCount == 0 && sleepMins == 0 && no v2 metric is present`. A
  workout-derived `vo2max` is enough to keep a day on its own.

## 3. dataFlags — full bitfield (u32 BE at bytes 60–63)

Stored big-endian; v1 used a u16, v2 widens to u32 to leave room for future
presence bits without re-versioning the leaf envelope.

| Bit   | Mask         | Flag                  | Set when                                                                  |
| ----- | ------------ | --------------------- | ------------------------------------------------------------------------- |
| 0     | `0x00000001` | `stepsPresent`        | `steps > 0`                                                               |
| 1     | `0x00000002` | `activeEnergyPresent` | `activeEnergy > 0`                                                        |
| 2     | `0x00000004` | `exerciseMinsPresent` | `exerciseMins > 0`                                                        |
| 3     | `0x00000008` | `hrvPresent`          | ≥ 2 SDNN samples in the day (not "value > 0")                             |
| 4     | `0x00000010` | `restingHRPresent`    | At least one RHR sample (not "value > 0")                                 |
| 5     | `0x00000020` | `sleepPresent`        | `sleepMins > 0`                                                           |
| 6     | `0x00000040` | `workoutLogged`       | `workoutCount > 0`                                                        |
| 7     | `0x00000080` | `bloodOxygenPresent`  | Any `HKQuantityTypeIdentifierOxygenSaturation` sample in the day          |
| 8     | `0x00000100` | `multiSourceDay`      | `sourceCount > 1`                                                         |
| 9–15  | —            | _v1 reserved_         | Must be zero in v2 until allocated.                                       |
| 16–31 | —            | _v2 reserved_         | Reserved for sleep-stage presence, body-comp presence, etc. Must be zero. |

iOS computes the low 16 bits in
[`computeDataFlags`](#) (in `MerkleLeaf.swift`); `MerkleLeafV2Fields.init`
widens to u32 by zero-extension. Presence semantics for **HRV** and **RHR**
are deliberately decoupled from "value > 0" — both metrics are valid at 0
encoded, so a separate `*Present` flag is required.

Two-step rule for readers:

1. **If a presence bit is 0**, treat the corresponding numeric field as
   "metric not recorded today" regardless of its byte value.
2. **If a presence bit is 1**, the numeric field is the canonical reading
   (0 is a meaningful value).

## 4. dayId

```
epoch = 2024-01-01 (UTC midnight)
dayId = max(0, gregorianCalendar(tz).dateComponents([.day], from: epoch, to: date).day)
```

- Epoch is **2024-01-01 UTC**, but the diff is taken in the leaf's local
  **timezone** using a Gregorian calendar (`MerkleLeaf.dayId(for:in:)`). This
  means a tz boundary right around the epoch can produce a day-shift on
  exotic timezones; v1 launched with this behavior and v2 preserves it.
- Result clamps to 0 — pre-epoch dates encode as `dayId = 0`.
- Encoded as u32 BE at bytes 36–39.

## 5. timezoneOffset

```swift
timezoneOffset = Int16(leaf.timezone.secondsFromGMT() / 60)
```

- Minutes from UTC, signed (i16). Range covers any real-world offset
  (±840 minutes ≪ ±32767).
- DST: `secondsFromGMT()` is evaluated at the leaf's `date` (midnight local
  of that day), so the offset reflects the rules **in effect on that day**.
  Two adjacent leaves can have different `timezoneOffset` values across a
  DST transition.

### What determines the timezone

`MerkleNormalizationService.dominantTimezone(from:)` is documented as
"timezone of the majority of sample source apps", but HealthKit samples do
not expose a timezone field, so the current implementation **falls back to
`TimeZone.current`** — the device's timezone at normalization time. This is
the same convention Apple Health uses for its own UI.

Practical implications:

- The normalization run that produces a v2 leaf brands every day in that
  run with `TimeZone.current` at that moment.
- If a user travels, re-normalizing the same HealthKit samples in a new
  timezone can produce **different `dayId` and `timezoneOffset` values**
  and thus a different leaf hash. Trees uploaded under the old timezone
  remain valid; they're just not byte-equal to a fresh normalization done
  abroad.
- Day boundaries used for sample bucketing (`calendar.startOfDay`) use the
  **same** timezone, so the local-day attribution stays consistent within
  a single normalization run.

## 6. Circuit metric pointer

The improvement circuit reads its metric as a u16 BE at a fixed byte offset:

```
METRIC_CHUNK_IDX            = 2          // 0-indexed chunk
METRIC_BYTE_OFFSET_IN_CHUNK = 2
METRIC_POINTER              = 2 * 31 + 2 = 64
```

Byte 64 is the first byte of `vo2max` (table §2). The circuit therefore proves
improvement **on `vo2max`** by default. Any future metric change requires
re-deploying the circuit with new constants; the leaf layout itself need not
change.

## 7. sourceHash

```swift
func computeSourceHash(sourceBundleIDs: [String]) -> Data {
    let sorted = sourceBundleIDs.sorted()      // String.<, Swift default (Unicode codepoint order)
    let concatenated = sorted.joined()         // no separator
    let bytes = concatenated.data(using: .utf8) // 32 zero bytes on failure
    return SHA256.hash(data: bytes)            // 32 bytes
}
```

Steps:

1. Collect every `sourceBundleID` seen on the day across both quantity/
   category samples **and** workouts. Deduplicated via `Set<String>` before
   hashing.
2. Sort the **unique** strings alphabetically (Swift `String.sorted()` —
   Unicode-scalar lexicographic order; ASCII bundle IDs sort the obvious
   way, e.g. `"com.apple.health" < "com.apple.health.watchOS" < "com.whoop.WhoopHealth"`).
3. Concatenate UTF-8 bytes with **no separator** (`[].joined()` with no
   argument). Example: `"com.apple.healthcom.apple.health.watchOS"`.
4. SHA-256 the resulting byte sequence → 32-byte digest.
5. On UTF-8 encoding failure (cannot happen for valid `String` but the path
   exists), return **32 zero bytes**.

Wire conventions:

- iOS sends `sourceHash` as a lowercase hex string (no `0x` prefix) of
  exactly 64 chars in `MerkleLeafV2Fields`.
- `serializeLeafV2` accepts `string | Uint8Array | undefined`. `undefined` →
  32 zero bytes. Hex strings are `strip0x`'d, **left-padded** to 64 chars
  with `'0'`, then truncated to 64 chars before decoding.
- Sorting and the no-separator concatenation are both load-bearing: a
  proof built from one ordering will not verify against another.

## 8. Chunking for Poseidon4

```
chunk1 = bytes  0..30   (31 bytes)   — envelope + wallet head
chunk2 = bytes 31..61   (31 bytes)   — wallet tail + day/tz/metrics through dataFlags
chunk3 = bytes 62..92   (31 bytes)   — vo2max + body comp + sleep stages + reservedPayload head
chunk4 = bytes 93..123  (31 bytes)   — reservedPayload tail + sourceHash
```

Each chunk is interpreted as a big-endian bigint < BN254 scalar field
(`21888242871839275222246405745257275088548364400416034343698204186575808495617`).
Top byte of each chunk is the high byte, so even a `0xff…ff` 31-byte chunk
stays well under the field size. Leaf hash = `poseidon4(chunk1, chunk2, chunk3, chunk4)`.

The vo2max metric at bytes 64–65 lives at offset 2..3 of **chunk3** (the
"third" chunk in 1-indexed counting, or `chunk[2]` in 0-indexed; the iOS
hash_leaf.js code names this "chunk 2" because it counts from zero).

## 9. Padding & dummy leaves

- Trees are padded to **128 leaves** (depth-7 binary).
- Unused slots use a fixed **envelope-only dummy v2 leaf**: envelope set
  (`0x02 0x00 0x01 0x00`), all other 120 bytes zero. This passes the
  `chunksV2` version-byte check and produces a deterministic dummy hash so
  unused slots are not attacker-controlled.

## 10. Versioning rules

- The envelope (`version`, `leafType`, `schemaVersion`) is the **only**
  permitted way to introduce breaking changes. Bumping `schemaVersion` lets
  the same byte budget be reinterpreted (e.g. allocating a `reserved*` byte
  range); bumping `leafType` allows a different per-domain leaf; bumping
  `version` is reserved for full re-architecture.
- Once a tree is uploaded, its leaf layout is **immutable** for the lifetime
  of any proof anchored to it. Add fields by widening `reservedPayload`
  bytes within a new `schemaVersion`, never by reordering existing fields.
- Adding a presence bit in `dataFlags` is non-breaking as long as the bit
  was previously zero — readers MUST tolerate unknown high bits.

## 11. References

- iOS wire shape: `AmachHealth/Sources/Models/MerkleLeafV2Fields.swift`
- iOS normalization (HealthKit → fields): `AmachHealth/Sources/Services/MerkleNormalizationService.swift`
- iOS v1 spec / shared helpers (`computeDataFlags`, `computeSourceHash`,
  `MerkleLeaf.dayId`): `AmachHealth/Sources/Models/MerkleLeaf.swift`
- Website serializer & circuit pointer: [`improvementWitnessBuilder.ts`](improvementWitnessBuilder.ts)
- Circuit constants: `AverageImprovementProof(N=2, M=2, depth=7, metricChunkIdx=2, metricByteOffsetInChunk=2)`

## 12. Web Storj projection (Storj → v2 leaf)

This section is **canonical for the web projection path** in
[`storjToV2Leaf.ts`](storjToV2Leaf.ts) — the module that turns an existing
`apple-health-full-export` Storj object into the same `AmachLeafV2Fields[]`
that iOS direct-sync produces. §§ 1–11 define the wire format; this section
defines how Storj-stored aggregates are mapped into it so that iOS direct-sync
and web XML-export-derived leaves can coexist (and, where possible, agree
byte-for-byte) for the same underlying day.

### 12.1 Storj payload shape (recap)

The `apple-health-full-export` payload (see
`src/storage/appleHealth/AppleHealthStorjService.ts`) is keyed by local
calendar date (`YYYY-MM-DD`) and stores per-metric aggregates whose shape
depends on the metric's aggregation strategy
(`metricAggregationStrategies.ts`):

```ts
type DailySummaryValue =
  | { total: number; count: number } // sum, count, duration
  | { avg: number; count: number } // avg
  | { avg: number; min: number; max: number; count: number } // avg_min_max
  | number; // latest

type SleepSummary = {
  total: number;
  inBed: number;
  awake: number;
  core: number;
  deep: number;
  rem: number;
  efficiency?: number;
};

type DailySummary = {
  [metricKey: string]: DailySummaryValue | SleepSummary | number;
};
```

Metric keys are camelCased HK identifiers via
`normalizeMetricKey('HKQuantityTypeIdentifierStepCount') === 'stepCount'`.

### 12.2 Field mapping

| v2 field          | Storj reader                        | Notes                                       |
| ----------------- | ----------------------------------- | ------------------------------------------- |
| `wallet`          | caller-supplied                     | same convention as §2 (right-aligned)       |
| `dayId`           | parse the `YYYY-MM-DD` key          | see §4 — Gregorian day diff vs. 2024-01-01  |
| `timezoneOffset`  | `-(new Date().getTimezoneOffset())` | browser local tz at projection time         |
| `steps`           | `stepCount.total`                   | rounded                                     |
| `activeEnergy`    | `activeEnergyBurned.total * 100`    | half-up round                               |
| `exerciseMins`    | `appleExerciseTime.total`           | rounded                                     |
| `hrv`             | `heartRateVariabilitySDNN.avg * 10` | iOS ≥2-sample rule not enforceable from agg |
| `restingHR`       | `restingHeartRate * 10`             | `latest` → bare number                      |
| `sleepMins`       | `sleep.total`                       | rounded                                     |
| `workoutCount`    | `0`                                 | no per-day workout list in export           |
| `sourceCount`     | `0`                                 | per-day source set not preserved            |
| `dataFlags`       | derived presence bits, see §12.3    |                                             |
| `vo2max`          | `vO2Max * 10`                       | `latest`; **the circuit's metric byte**     |
| `weight`          | `bodyMass * 100`                    | `latest`, kg                                |
| `bodyFatPct`      | `bodyFatPercentage * 100`           | **see §12.4 — units differ from iOS**       |
| `leanMass`        | `leanBodyMass * 100`                | `latest`, kg                                |
| `deepSleepMins`   | `sleep.deep`                        | already in minutes                          |
| `remSleepMins`    | `sleep.rem`                         |                                             |
| `lightSleepMins`  | `sleep.core`                        | "core" is HealthKit's term for "light"      |
| `awakeMins`       | `sleep.awake`                       | only the awake-during-sleep portion         |
| `reservedPayload` | `undefined`                         | server defaults to 12 zero bytes            |
| `sourceHash`      | deterministic substitute, see §12.5 |                                             |

All u16/u32 outputs are explicitly clamped (`Math.min(v, MAX)`) before
serialization — JS bitwise `& 0xffff` in the underlying writer silently
wraps, which would corrupt a leaf rather than saturate it.

### 12.3 dataFlags from Storj data

Same bit positions as §3; presence rules are adapted to what the aggregate
preserves:

| Bit | Set when                                                |
| --: | ------------------------------------------------------- |
|   0 | `stepCount.total > 0`                                   |
|   1 | `activeEnergyBurned.total > 0`                          |
|   2 | `appleExerciseTime.total > 0`                           |
|   3 | `heartRateVariabilitySDNN` key present and `avg > 0`    |
|   4 | `restingHeartRate` key present (any value, including 0) |
|   5 | `sleep.total > 0`                                       |
|   6 | always `0` (no per-day workout list)                    |
|   7 | `oxygenSaturation` key present for the day              |
|   8 | always `0` (no per-day source count)                    |

This deviates from iOS in two places:

- **HRV (bit 3)** uses `avg > 0` rather than ≥ 2 raw samples — the Storj
  aggregate already collapses to an average and `count`. In practice
  `count >= 2` is almost always true when the metric is present at all
  on a day, so the resulting bit matches iOS in the common case. When
  `count === 1` the web projection will mark HRV present but iOS would
  not. This is a known minor divergence; it does not affect the circuit
  metric (vo2max) and so does not block proof generation.
- **`multiSourceDay` (bit 8)** is always 0 from a Storj projection.

### 12.4 Body-fat unit caveat

`HKQuantityTypeIdentifierBodyFatPercentage` is returned by HealthKit as a
**fraction** (0.185 = 18.5%). iOS multiplies by 10000 to produce basis points
(1850).

The Apple Health XML export — the source of the web Storj payload — stores
body fat as a **percentage value** (18.5, not 0.185). Whatever parser
populates `dailySummaries.bodyFatPercentage` therefore yields a number in the
0–100 range. The web projection multiplies that value by **100** (not 10000)
to land on the same basis-points integer iOS produces.

If the underlying parser is ever changed to normalize bodyFat to a fraction,
this multiplier MUST change to 10000 to stay byte-equal with iOS.

### 12.5 sourceHash substitute

The Storj `apple-health-full-export` payload does not preserve per-day source
bundle IDs (only an export-wide watch/phone/other percentage split on the
manifest). The web projection therefore cannot reproduce iOS's
`SHA256(sorted-bundle-ids)` directly.

Instead, it uses a deterministic substitute that is byte-stable per
(wallet, day) so the same XML upload produces the same `sourceHash` on every
re-projection:

```
sourceHash_web = SHA256( utf8(
  "web-export:"
    + walletAddress.toLowerCase()
    + ":"
    + dayId.toString(10)
) )
```

- 32 bytes, lowercase wallet, decimal `dayId`, ASCII-only.
- The `web-export:` prefix is domain-separation, not a comment — future
  origins (e.g. `csv-import:`, `garmin-fit:`) get their own prefixes so a
  collision across substitute hashes is impossible.
- Will **not** match an iOS-direct-sync `sourceHash` for the same wallet+day.
  That mismatch is contained to chunk4 of the leaf — chunk2 (which contains
  the `vo2max` metric byte at 64–65) is unaffected, so the improvement proof
  still validates against either origin's tree.
- iOS can optionally adopt the same substitute if/when it grows an "import
  Apple Health XML export" path, by passing the substitute string when the
  origin is a generic XML rather than HealthKit-direct samples.

### 12.6 12-month recency check

The contest only accepts data from the last 12 months (rolling). The
projection layer enforces this with an **exact-day cutoff (365 days)** —
chosen over `subMonths(today, 12)` because the calendar-month form silently
shifts by one day across leap-year boundaries (Feb 29 vs Mar 1 re-projection
of the same export would change which days are eligible). A fixed 365-day
window keeps the cutoff stable.

```
cutoff = subDays(localMidnightToday, 365)
include day iff parseLocalDate(dayKey) >= cutoff
```

Zero remaining days is a **hard error** — the projection throws rather than
returning an empty array, so the UI can surface "no recent data" instead of
producing a tree with only padding leaves.

### 12.7 Sanity ranges (warn-only)

Days outside these ranges still ship (partial/unusual data is still data),
but the projection emits `console.warn` so we can spot pathological exports:

- `steps`: 0..100,000
- `hrv` (ms, post divide-by-10): 1..300
- `restingHR` (bpm, post divide-by-10): 30..200
- `sleepMins`: 0..1440

These bounds intentionally match the spec the iOS team uses for their own
sanity checks; they're guard-rails against parser bugs, not validation
constraints on the user.
