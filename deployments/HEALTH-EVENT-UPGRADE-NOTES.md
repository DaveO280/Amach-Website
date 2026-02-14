# Health Event / Timeline Updates for Contract Version Upgrades

When upgrading the SecureHealthProfile contract (e.g. V4 → V5 or later), **always check whether health event (timeline / Storj) write paths still match the new implementation**. Reading usually keeps working; writes often depend on a specific function name and signature.

## Why this matters

- The **proxy** stays the same; the **implementation** changes. The implementation defines which functions exist.
- There are **two inheritance paths** in the codebase:
  - **V2 → V3 → V4** (current deployed chain): exposes **`addHealthEventV2(searchTag, storjUri, contentHash, eventHash)`**.
  - **V1 → V3_FromV1**: exposes **`addHealthEventWithStorj(encryptedData, searchTag, storjUri, contentHash)`** (different signature, no `eventHash`).
- If a future upgrade changes or replaces the timeline/Storj function (name or args), the frontend will break for **creating** new timeline events and **recording Storj uploads** until the app is updated to call the correct function.

## What to do on each upgrade

1. **Confirm which timeline/Storj function the new implementation exposes**
   - Check the new implementation contract (e.g. V5) and its parent chain (V2→V3→V4 or other).
   - Note the exact function name and argument order.

2. **Update the frontend to use that function**
   - **HealthEventService.ts** – timeline creation (`addHealthEventV2` flow).
   - **ReportParserViewer.tsx** – `recordReportUploadOnChain` (after saving a report to Storj).
   - **CosaintChatUI.tsx** – `recordReportUploadOnChain` (chat UI save to Storj).
   - **contractConfig.ts** – ABI and any helper (e.g. `computeStorjEventHash` for V2’s `eventHash`).

3. **If the new version uses a different signature**
   - Add or adjust a helper (e.g. for a new `eventHash` or payload format).
   - Change all `writeContract` / `simulateContract` call sites to use the new function name and args.
   - Keep read paths (`getHealthTimeline`, `getEventCount`, `getEventStorjUri`, etc.) in sync if the contract changes them.

## Current mapping (as of V4)

| Action             | Contract function     | Frontend usage                                        |
| ------------------ | --------------------- | ----------------------------------------------------- |
| Add timeline/Storj | `addHealthEventV2`    | HealthEventService, ReportParserViewer, CosaintChatUI |
| Event hash for V2  | N/A (client-computed) | `computeStorjEventHash()` in `contractConfig.ts`      |

Do **not** use `addHealthEventWithStorj` unless the deployed implementation is (or inherits from) **SecureHealthProfileV3_FromV1**; the current proxy uses the V2/V3/V4 chain, which does not include that function.
