/**
 * storjToV2Leaf.ts
 *
 * Project an existing `apple-health-full-export` Storj object into the
 * v2 Merkle-leaf shape (`AmachLeafV2Fields[]`) used by the Spring Push
 * improvement proof. Lets a user who uploaded their Apple Health XML
 * through the website feed the same proof flow that iOS direct-sync
 * users hit.
 *
 * Spec: see `src/zk/LEAF_V2_CANONICAL_SPEC.md` (especially §12 for the
 * web Storj → v2 mapping). This module is the canonical implementation of
 * that section; the spec is authoritative — change it first, then mirror
 * here.
 *
 * Window semantics (Spring Push):
 *   - `baseline`: eligible days OLDER than 30 days (within the 12-month
 *     window). Represents pre-improvement state.
 *   - `finish`:   eligible days in the LAST 30 days. Represents
 *     during/post-improvement state.
 * The 30-day boundary is a pragmatic split that gives the
 * AverageImprovementProof picker (lowest-2-baseline, highest-2-finish)
 * room to find a meaningful gap for typical contest durations.
 */

import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import type {
  AppleHealthStorjPayload,
  DailySummary,
  DailySummaryValue,
  SleepSummary,
} from "@/storage/appleHealth/AppleHealthStorjService";
import type { AmachLeafV2Fields } from "@/zk/improvementWitnessBuilder";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STORJ_DATATYPE = "apple-health-full-export";

/** Days from "today" that separate baseline (older) from finish (newer). */
const FINISH_WINDOW_DAYS = 30;

/** 12-month recency filter — exclude days older than this many days from
 *  today. Spec §12.6 uses an exact-day cutoff (365), not a calendar-month
 *  diff, so the boundary is stable across leap years. */
const RECENCY_WINDOW_DAYS = 365;

/** 2024-01-01 epoch for dayId, matching `MerkleLeaf.dayId(for:in:)`. */
const EPOCH_YEAR = 2024;
const EPOCH_MONTH = 1; // 1-indexed
const EPOCH_DAY = 1;

/** AverageImprovementProof picks 2 from each window; below that, the proof
 *  can't be built — throw early with a clear error rather than ship an
 *  underpopulated bundle. */
const MIN_DAYS_PER_WINDOW = 2;

const U16_MAX = 0xffff;
const U32_MAX = 0xffffffff;

// Sanity-warning bounds (see §12.7 of the spec). Days outside still ship —
// these are guard-rails for parser bugs, not data validation.
const SANITY_RANGES = {
  steps: { min: 0, max: 100_000 },
  hrvMs: { min: 1, max: 300 },
  restingHRBpm: { min: 30, max: 200 },
  sleepMins: { min: 0, max: 1440 },
} as const;

export type WindowType = "baseline" | "finish";

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the user's `apple-health-full-export` from Storj, filter to the
 * requested window's date range, and project each surviving day into the
 * v2 leaf shape. Throws if the projection yields zero days — the caller
 * should surface that to the user rather than uploading an empty bundle.
 *
 * `encryptionKey` is the bare PBKDF2-derived key string (i.e.
 * `WalletEncryptionKey.key`) — the call site usually has the full
 * `WalletEncryptionKey` object on hand and should pass `.key` here. The full
 * object is reconstructed internally for the Storj API; only `key` is used
 * by the server-side crypto layer.
 */
export async function projectStorjHealthToV2Leaves(
  walletAddress: string,
  encryptionKey: string,
  windowType: WindowType,
): Promise<AmachLeafV2Fields[]> {
  if (!walletAddress) {
    throw new Error("projectStorjHealthToV2Leaves: walletAddress is required");
  }
  if (!encryptionKey) {
    throw new Error("projectStorjHealthToV2Leaves: encryptionKey is required");
  }
  if (windowType !== "baseline" && windowType !== "finish") {
    throw new Error(
      `projectStorjHealthToV2Leaves: invalid windowType "${windowType as string}"`,
    );
  }

  // The Storj API consumes a full `WalletEncryptionKey` shape but only
  // exercises the `key` field for encrypt/decrypt. `derivedAt` is metadata-
  // only on the wire, so a fresh stamp is safe here.
  const walletKey: WalletEncryptionKey = {
    key: encryptionKey,
    walletAddress,
    derivedAt: Date.now(),
  };

  const payload = await fetchLatestAppleHealthExport(walletAddress, walletKey);
  if (!payload) {
    throw new Error(
      "No apple-health-full-export found on Storj for this wallet. " +
        "Upload your Apple Health XML first, then try again.",
    );
  }

  const dailySummaries = payload.dailySummaries ?? {};
  const allDateKeys = Object.keys(dailySummaries).sort();
  if (allDateKeys.length === 0) {
    throw new Error(
      "apple-health-full-export contains no daily summaries to project.",
    );
  }

  const now = new Date();
  const todayLocal = startOfLocalDay(now);
  // Spec §12.6: exact-day cutoff (365 days from today), not a calendar-month
  // diff. Picked over `subMonths` because the latter shifts by one day across
  // leap-year boundaries, which silently changes which days are eligible
  // when the same export is re-projected on Feb 29 vs Mar 1.
  const recencyCutoff = subDaysLocal(todayLocal, RECENCY_WINDOW_DAYS);
  const finishCutoff = subDaysLocal(todayLocal, FINISH_WINDOW_DAYS);

  // 12-month recency: drop anything older than 365 days. Then split into
  // baseline (older than `finishCutoff`) and finish (within last 30 days).
  const eligibleKeys = allDateKeys.filter((key) => {
    const d = parseLocalDateKey(key);
    return d !== null && d.getTime() >= recencyCutoff.getTime();
  });
  if (eligibleKeys.length === 0) {
    throw new Error(
      "No Apple Health days in the last 12 months — Spring Push requires " +
        "recent data. Re-upload a fresher XML export.",
    );
  }

  const windowKeys = eligibleKeys.filter((key) => {
    const d = parseLocalDateKey(key);
    if (d === null) return false;
    const t = d.getTime();
    if (windowType === "finish") {
      return t >= finishCutoff.getTime();
    }
    // baseline: in [12mo ago, finishCutoff)
    return t < finishCutoff.getTime();
  });

  if (windowKeys.length === 0) {
    const msg =
      windowType === "finish"
        ? `No data in the last ${FINISH_WINDOW_DAYS} days for the finish window.`
        : `No data older than ${FINISH_WINDOW_DAYS} days (within the 12-month window) for the baseline window.`;
    throw new Error(msg);
  }
  if (windowKeys.length < MIN_DAYS_PER_WINDOW) {
    console.warn(
      `[storjToV2Leaf] ${windowType} window has only ${windowKeys.length} day(s); ` +
        `the improvement proof needs at least ${MIN_DAYS_PER_WINDOW}. Upload more data or wait.`,
    );
  }

  const tzOffset = browserTimezoneOffsetMinutes();

  const leaves: AmachLeafV2Fields[] = [];
  for (const dateKey of windowKeys) {
    const summary = dailySummaries[dateKey];
    if (!summary || typeof summary !== "object") continue;
    const dayDate = parseLocalDateKey(dateKey);
    if (dayDate === null) continue;
    const dayId = computeDayIdLocal(dayDate);
    const leaf = await projectDay({
      walletAddress,
      dayId,
      timezoneOffset: tzOffset,
      summary,
    });
    leaves.push(leaf);
  }

  if (leaves.length === 0) {
    throw new Error(
      `Projection produced zero leaves for the ${windowType} window — ` +
        `every candidate day had unreadable data.`,
    );
  }

  // Deterministic ordering (ascending by dayId) so re-uploads of the same
  // underlying data produce byte-equal bundles.
  leaves.sort((a, b) => a.dayId - b.dayId);
  return leaves;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-day projection
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectDayArgs {
  walletAddress: string;
  dayId: number;
  timezoneOffset: number;
  summary: DailySummary;
}

async function projectDay(args: ProjectDayArgs): Promise<AmachLeafV2Fields> {
  const { walletAddress, dayId, timezoneOffset, summary } = args;

  // ── v1 metrics ──────────────────────────────────────────────────────────
  const stepsRaw = readTotal(summary.stepCount);
  const steps = clampU32(Math.round(stepsRaw));

  const activeEnergyKcal = readTotal(summary.activeEnergyBurned);
  const activeEnergy = clampU32(roundHalfUp(activeEnergyKcal * 100));

  const exerciseMinsRaw = readTotal(summary.appleExerciseTime);
  const exerciseMins = clampU16(Math.round(exerciseMinsRaw));

  const hrvAvgMs = readAvg(summary.heartRateVariabilitySDNN);
  const hrvPresent =
    summary.heartRateVariabilitySDNN !== undefined && hrvAvgMs > 0;
  const hrv = hrvPresent ? clampU16(roundHalfUp(hrvAvgMs * 10)) : 0;

  // restingHeartRate is stored with `latest` strategy → bare number.
  const restingHRPresent = summary.restingHeartRate !== undefined;
  const restingHRBpm = readScalar(summary.restingHeartRate);
  const restingHR = restingHRPresent
    ? clampU16(roundHalfUp(restingHRBpm * 10))
    : 0;

  // Sleep aggregate has its own shape — defined as `SleepSummary` in the
  // Storj service. Other metrics never resolve to the sleep shape so we
  // narrow conservatively.
  const sleep = readSleep(summary.sleep);
  const sleepMins = sleep ? clampU16(Math.round(sleep.total)) : 0;

  // No per-day workout list in the Storj export — bit 6 stays off.
  const workoutCount = 0;

  // No per-day source bundle list either — bit 8 stays off, and per task
  // spec we encode sourceCount as 0 (the aggregate strips per-day source
  // info, so reporting any positive count would be a lie).
  const sourceCount = 0;

  const bloodOxygenPresent = summary.oxygenSaturation !== undefined;

  // ── v2-only metrics ─────────────────────────────────────────────────────
  const vo2maxRaw = readScalar(summary.vO2Max);
  const vo2max =
    summary.vO2Max !== undefined ? clampU16(roundHalfUp(vo2maxRaw * 10)) : 0;

  const weightKg = readScalar(summary.bodyMass);
  const weight =
    summary.bodyMass !== undefined ? clampU16(roundHalfUp(weightKg * 100)) : 0;

  // See §12.4 of the spec: web XML export carries body-fat as a PERCENTAGE
  // (18.5) — multiply by 100 to land on basis points (1850). iOS multiplies
  // by 10000 because HK returns a fraction (0.185). If the underlying parser
  // ever changes to a fraction, this multiplier must move to 10000.
  const bodyFatPctRaw = readScalar(summary.bodyFatPercentage);
  const bodyFatPct =
    summary.bodyFatPercentage !== undefined
      ? clampU16(roundHalfUp(bodyFatPctRaw * 100))
      : 0;

  const leanMassKg = readScalar(summary.leanBodyMass);
  const leanMass =
    summary.leanBodyMass !== undefined
      ? clampU16(roundHalfUp(leanMassKg * 100))
      : 0;

  const deepSleepMins = sleep ? clampU16(Math.round(sleep.deep)) : 0;
  const remSleepMins = sleep ? clampU16(Math.round(sleep.rem)) : 0;
  const lightSleepMins = sleep ? clampU16(Math.round(sleep.core)) : 0;
  const awakeMins = sleep ? clampU16(Math.round(sleep.awake)) : 0;

  // ── dataFlags ───────────────────────────────────────────────────────────
  let dataFlags = 0;
  if (steps > 0) dataFlags |= 0x0000_0001; // stepsPresent
  if (activeEnergy > 0) dataFlags |= 0x0000_0002; // activeEnergyPresent
  if (exerciseMins > 0) dataFlags |= 0x0000_0004; // exerciseMinsPresent
  if (hrvPresent) dataFlags |= 0x0000_0008; // hrvPresent
  if (restingHRPresent) dataFlags |= 0x0000_0010; // restingHRPresent
  if (sleepMins > 0) dataFlags |= 0x0000_0020; // sleepPresent
  // bit 6 (workoutLogged): always 0 from Storj projection
  if (bloodOxygenPresent) dataFlags |= 0x0000_0080; // bloodOxygenPresent
  // bit 8 (multiSourceDay): always 0 from Storj projection
  dataFlags = clampU32(dataFlags);

  // ── sanity warnings (don't drop) ────────────────────────────────────────
  warnIfOutOfRange("steps", stepsRaw, SANITY_RANGES.steps, dayId);
  if (hrvPresent) {
    warnIfOutOfRange("hrv (ms)", hrvAvgMs, SANITY_RANGES.hrvMs, dayId);
  }
  if (restingHRPresent) {
    warnIfOutOfRange(
      "restingHR (bpm)",
      restingHRBpm,
      SANITY_RANGES.restingHRBpm,
      dayId,
    );
  }
  if (sleep && sleep.total > 0) {
    warnIfOutOfRange("sleepMins", sleep.total, SANITY_RANGES.sleepMins, dayId);
  }

  // ── sourceHash substitute (see §12.5 of the spec) ───────────────────────
  const sourceHashHex = await deterministicSourceHashHex(walletAddress, dayId);

  return {
    wallet: walletAddress,
    dayId,
    timezoneOffset,
    steps,
    activeEnergy,
    exerciseMins,
    hrv,
    restingHR,
    sleepMins,
    workoutCount,
    sourceCount,
    dataFlags,
    vo2max,
    weight,
    bodyFatPct,
    leanMass,
    deepSleepMins,
    remSleepMins,
    lightSleepMins,
    awakeMins,
    sourceHash: sourceHashHex,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Storj fetch
// ─────────────────────────────────────────────────────────────────────────────

async function fetchLatestAppleHealthExport(
  walletAddress: string,
  encryptionKey: WalletEncryptionKey,
): Promise<AppleHealthStorjPayload | null> {
  const listRes = await fetch("/api/storj", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "storage/list",
      userAddress: walletAddress,
      encryptionKey,
      dataType: STORJ_DATATYPE,
    }),
  });
  if (!listRes.ok) {
    throw new Error(
      `Storj list failed (${listRes.status}): ${await safeErrText(listRes)}`,
    );
  }
  const listJson = (await listRes.json()) as {
    result?: Array<{ uri: string; uploadedAt?: number }>;
  };
  const items = listJson?.result;
  if (!items || items.length === 0) return null;

  const latest = items.reduce((a, b) =>
    (a.uploadedAt ?? 0) > (b.uploadedAt ?? 0) ? a : b,
  );

  const retrieveRes = await fetch("/api/storj", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "storage/retrieve",
      userAddress: walletAddress,
      encryptionKey,
      storjUri: latest.uri,
    }),
  });
  if (!retrieveRes.ok) {
    throw new Error(
      `Storj retrieve failed (${retrieveRes.status}): ${await safeErrText(retrieveRes)}`,
    );
  }
  const retrieveJson = (await retrieveRes.json()) as {
    result?: { data?: AppleHealthStorjPayload };
  };
  const data = retrieveJson?.result?.data;
  if (!data || typeof data !== "object" || !data.dailySummaries) return null;
  return data;
}

async function safeErrText(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j?.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Storj value readers
// ─────────────────────────────────────────────────────────────────────────────

/** Read `{ total, count }`-shaped aggregates. Returns 0 if absent or wrong shape. */
function readTotal(
  v: DailySummaryValue | SleepSummary | number | undefined,
): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "object" && "total" in v && typeof v.total === "number") {
    return Number.isFinite(v.total) ? v.total : 0;
  }
  return 0;
}

/** Read `{ avg, count }`-shaped aggregates. Returns 0 if absent or wrong shape. */
function readAvg(
  v: DailySummaryValue | SleepSummary | number | undefined,
): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "object" && "avg" in v && typeof v.avg === "number") {
    return Number.isFinite(v.avg) ? v.avg : 0;
  }
  return 0;
}

/** Read a `latest`-strategy bare number. Falls back to `avg`/`total` if the
 *  stored shape is an object (defensive — shouldn't happen, but cheap). */
function readScalar(
  v: DailySummaryValue | SleepSummary | number | undefined,
): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "object") {
    if ("avg" in v && typeof v.avg === "number" && Number.isFinite(v.avg)) {
      return v.avg;
    }
    if (
      "total" in v &&
      typeof v.total === "number" &&
      Number.isFinite(v.total)
    ) {
      return v.total;
    }
  }
  return 0;
}

function readSleep(
  v: DailySummaryValue | SleepSummary | number | undefined,
): SleepSummary | null {
  if (!v || typeof v !== "object") return null;
  if (
    "total" in v &&
    "deep" in v &&
    "rem" in v &&
    "core" in v &&
    "awake" in v
  ) {
    return v as SleepSummary;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date / dayId helpers (local timezone)
// ─────────────────────────────────────────────────────────────────────────────

/** Parse "YYYY-MM-DD" into a Date pinned to local midnight. Returns null
 *  for unparseable input. */
function parseLocalDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function startOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
}

function subDaysLocal(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() - days);
  return d;
}

/** Days since 2024-01-01 (local-tz Gregorian day-diff). Mirrors
 *  `MerkleLeaf.dayId(for:in:)` in Swift. Pre-epoch dates clamp to 0. */
function computeDayIdLocal(date: Date): number {
  const epoch = new Date(EPOCH_YEAR, EPOCH_MONTH - 1, EPOCH_DAY, 0, 0, 0, 0);
  const day = startOfLocalDay(date);
  const diffMs = day.getTime() - epoch.getTime();
  if (diffMs <= 0) return 0;
  // Use round (not floor) to absorb DST-induced ±1h drift in the local diff.
  // 24h × 3600s × 1000ms = 86_400_000.
  return Math.max(0, Math.round(diffMs / 86_400_000));
}

/** Browser local timezone offset in MINUTES east of UTC. JS
 *  `getTimezoneOffset()` returns minutes WEST of UTC, so we negate it to
 *  match Swift's `secondsFromGMT() / 60` convention. */
function browserTimezoneOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

// ─────────────────────────────────────────────────────────────────────────────
// Encoding helpers
// ─────────────────────────────────────────────────────────────────────────────

function clampU16(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  if (v > U16_MAX) return U16_MAX;
  return v | 0;
}

function clampU32(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  if (v > U32_MAX) return U32_MAX;
  return v >>> 0;
}

/** Round-half-up (matches iOS `Foundation.floor(x + 0.5)`). For non-negative
 *  inputs this is identical to JS `Math.round`; we keep the explicit helper
 *  so the convention is documented at every call site. */
function roundHalfUp(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.floor(v + 0.5);
}

function warnIfOutOfRange(
  label: string,
  value: number,
  range: { min: number; max: number },
  dayId: number,
): void {
  if (value < range.min || value > range.max) {
    console.warn(
      `[storjToV2Leaf] dayId=${dayId} ${label}=${value} outside ${range.min}..${range.max} — shipping anyway`,
    );
  }
}

/** Deterministic 32-byte hex digest used in place of the iOS-canonical
 *  `SHA256(sorted source-bundle-IDs)` when projecting from a Storj XML
 *  export. See §12.5 of the spec — this is stable per (wallet, dayId) so
 *  re-projections of the same data produce byte-equal leaves, but it will
 *  NOT match an iOS-direct-sync `sourceHash` for the same day.
 *
 *  Input string: `web-export:${walletAddress.toLowerCase()}:${dayId}`.
 *  The `web-export:` prefix is load-bearing — domain-separates the substitute
 *  from any future origin (e.g. `csv-import:`) that wants to use the same
 *  pattern. Wallet is lowercased so checksum-cased vs lowercase inputs
 *  produce the same hash; dayId is decimal so leading-zero variants can't
 *  exist.
 */
async function deterministicSourceHashHex(
  walletAddress: string,
  dayId: number,
): Promise<string> {
  const input = `web-export:${walletAddress.toLowerCase()}:${dayId.toString(10)}`;
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return uint8ArrayToHex(new Uint8Array(digest));
}

function uint8ArrayToHex(buf: Uint8Array): string {
  let out = "";
  for (let i = 0; i < buf.length; i += 1) {
    out += buf[i].toString(16).padStart(2, "0");
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test exports (do not import in production code)
// ─────────────────────────────────────────────────────────────────────────────

export const __internal = {
  computeDayIdLocal,
  parseLocalDateKey,
  browserTimezoneOffsetMinutes,
  deterministicSourceHashHex,
  roundHalfUp,
  clampU16,
  clampU32,
  FINISH_WINDOW_DAYS,
};
