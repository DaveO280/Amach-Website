import type { LegitimacyReport } from "../types";

/**
 * Stable, machine-readable JSON output. Pretty-printed with two-space
 * indents so diffs of generated reports are reviewable in Git.
 */
export function formatJson(report: LegitimacyReport): string {
  return JSON.stringify(report, null, 2);
}
