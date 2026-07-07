# 13 — Data Integrity Harness

> Part of the [master architecture map](00-master-map.md). This is the build spec for a test harness that ends the "squeeze-the-balloon" fragility in the health-stats pipeline: change one thing, a number pops wrong somewhere else, and there's no fixed reference to return to. It exists because after the gut-health changes the displayed stats have been in constant flux with no concrete source of truth to test back against.

## The problem it solves

Health stats are computed through several stages (parse → dedup → daily buckets → window stats → health score) with, per the audit, **four parallel day-bucketing/dedup implementations** and **two UI surfaces** (dashboard charts vs. Luma stat cards) reading through different paths. With no pinned expected values, every change is verified by eyeballing the dashboard against memory. That is why fixes don't converge — a transient bug (e.g. the June parse pass that dropped Apple Watch records, yielding iPhone-only totals ~75% of truth) can contaminate a persistent store and keep resurfacing long after the code is fixed.

**Empirically observed (2026-07-07), verified against Apple Health:**

- 9/27/2025 true steps = **25,712** (all devices). A stale June export artifact showed **7,496** (iPhone-only).
- Production **chart** is correct (25,712; the tooltip's second value 12,019 is the 30-day average line, mislabeled "Step Count").
- Production **stat cards** read a staler/partial store: all-time high shows 22,664 (a different day) vs. true 25,712; all-time avg 10,367 vs. true 11,521. **This divergence is target #1.**

## Design principles

1. **The golden file is the truth, computed independently — NOT the pipeline's current output.** If we snapshot what the pipeline emits today, we freeze today's bugs (the stat cards are currently wrong). Instead the golden is derived from the raw export by a simple, auditable reference computation and hand-confirmed against the Apple Health app for sentinel dates. Tests assert the pipeline _converges to_ the golden. That is what puts a bug to bed: golden says 25,712, card says 22,664, test fails until fixed.
2. **Frozen is a feature, not a limitation.** The fixture input and golden outputs are a matched pair, frozen together. A future export with a 10th metric can't break the golden because its input never changes. New metrics get covered by _regenerating_ the golden — a deliberate, reviewed act — never by silent drift.
3. **Privacy integrity starts at source.** Real health data — and the golden file, which is aggregated but still PII — never enters git. Both live under `$AMACH_HEALTH_FIXTURE_DIR` outside the repo and are CI-injected. Only _code_ (the reference computation, the tests, the loader) is versioned. `.gitignore` enforces this defensively (`HealthData*.csv`, `*.golden.json`, `/.health-fixtures/`, …).

## The three layers

Each of the three worries about "is the data right" maps to a distinct layer, because they need different mechanisms.

### Layer 1 — Frozen golden (are the calculations right?)

Exact expected numbers on the frozen fixture. For each of the 9 metrics: daily values on ~10 sentinel dates (incl. the pathological ones — multi-device high 9/27, a near-zero day, a multi-night sleep-collision day, a DST boundary), plus 7d/30d/90d window avg/high/low, all-time avg/high/low, and the composite health score. Hand-verified against Apple Health for the sentinels. Catches: _the math changed._

### Layer 2 — Invariants (is the flow honest on any input?)

Structural laws asserted on _arbitrary_ input, including future exports with new metrics:

- Every distinct metric identifier present in the input appears in parsed output (would have caught the iPhone-only artifact at creation).
- Unknown/new metrics are explicitly logged or listed — never silently dropped.
- A day's total equals the sum of its (deduplicated) records.
- A window average is arithmetically consistent with the daily values it claims to average.
- **Cross-surface consistency: the chart store and the stat-card store report identical daily values for the same metric+date.** (Would have flagged the 22,664-vs-25,712 split.)
  Catches: _the flow silently lost or diverged data._ Needs no golden numbers — pure laws.

### Layer 3 — Merge / append correctness (does integrity hold as data grows?)

The contamination class. Properties over evolving data:

- `parse(A+B)` equals `merge(parse(A), parse(B))` over the overlapping domain.
- Merge is **idempotent**: merging the same data twice changes nothing.
  Catches: _stale/partial stores diverging from source_ — the actual root of the two-week loop. Needs no golden numbers.

## Layout

```
tests/health-pipeline/
  reference/                # committed CODE that computes truth from raw export
    computeReferenceStats.ts   # auditable spec: raw CSV -> daily/window/all-time
  loadFixture.ts            # reads $AMACH_HEALTH_FIXTURE_DIR; skips w/ clear msg if unset
  golden.layer1.test.ts     # frozen numbers (golden injected, not in git)
  invariants.layer2.test.ts # laws on any input
  merge.layer3.test.ts      # append/idempotence
tests/health-pipeline/README.md   # "fixtures are out-of-git; how to point at yours"
```

`$AMACH_HEALTH_FIXTURE_DIR` holds `export.csv` (the frozen fixture, full 2-yr span so all-time/90d windows are testable — the verified 2026-07-07 export) and `stats.golden.json` (regenerated by `computeReferenceStats` + hand-verified). CI injects both from a secret store. Locally, `AMACH_HEALTH_FIXTURE_DIR=/Users/dave/amach-agent` (or wherever) runs the suite; unset ⇒ tests skip with an explanatory message, never fail silently.

## Sentinels already established (Apple-Health-confirmed)

Steps: 9/27/2025 = 25,712 (all-time high) · trailing-30d @ 9/27 = 12,019 · all-time avg 11,521 · raw low 28 · as-of 2026-06-16: 7d 11,690, 30d 11,863, 90d 11,006. These seed `stats.golden.json`.

## Sequence

1. Loader + `computeReferenceStats` reference spec; generate `stats.golden.json`, hand-verify sentinels.
2. Layer 2 invariants + Layer 3 merge tests (no golden dependency — fastest ROI, catch the contamination class).
3. Layer 1 golden tests against the real pipeline modules.
4. **Put the stat-card divergence to bed:** pin the window / valid-day / full-dataset-vs-selected-window _policies_ as golden values (the recent commits #98–#101 thrashed precisely these), then reconcile the stat-card store/path to match — under test.
5. Wire into CI (fixture injected) so any number-moving change fails with a diff before it ships. A change that _should_ move numbers must regenerate the golden in the same PR — visible in CI logs.

## What this changes about how we work

- Verification stops running against the live wallet's mutable data. Previews and PRs are judged against the fixture; real data stays production-only.
- Merges that touch the data pipeline are held until the harness proves branch-vs-main parity on the fixture.
- No new copy of bucketing/dedup logic — consolidating the four implementations into one pure module (Phase 2) is a prerequisite for Layer 1 to have a single thing to test.
