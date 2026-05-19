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
