/**
 * Minimal, dependency-free parser for the Apple Health "Process Data" CSV export.
 *
 * Columns: Start Date,End Date,Metric,Value,Unit,Source,Device
 * The Device field can contain commas and is double-quoted; nothing else is.
 *
 * This is REFERENCE code for the data-integrity harness — deliberately simple
 * and independent of the production parsing pipeline, so it can serve as an
 * external source of truth. See docs/architecture/13-data-integrity-harness.md.
 */

import { readFileSync } from "fs";

export interface HealthRecord {
  start: string; // raw "YYYY-MM-DD HH:MM:SS -0400"
  end: string;
  metric: string;
  value: string; // numeric metrics parse to Number; sleep stages stay as text
  unit: string;
  source: string;
  device: string;
}

/** Split one CSV line, honoring double-quoted fields (only Device is quoted). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Parse the CSV text into typed records. */
export function parseHealthCsvText(text: string): HealthRecord[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const records: HealthRecord[] = [];
  // skip header (line 0)
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 5) continue;
    records.push({
      start: cols[0],
      end: cols[1],
      metric: cols[2],
      value: cols[3],
      unit: cols[4],
      source: cols[5] ?? "",
      device: cols[6] ?? "",
    });
  }
  return records;
}

/** Parse a CSV file at `path`. */
export function parseHealthCsvFile(path: string): HealthRecord[] {
  return parseHealthCsvText(readFileSync(path, "utf8"));
}

/** Calendar date (YYYY-MM-DD) of a record's start, as recorded in the export. */
export function recordDay(rec: HealthRecord): string {
  return rec.start.slice(0, 10);
}

/** Which device produced a record — for the "no records dropped" invariant. */
export function recordDevice(rec: HealthRecord): "iphone" | "watch" | "other" {
  if (rec.device.includes("name:iPhone")) return "iphone";
  if (rec.device.includes("name:Apple Watch")) return "watch";
  return "other";
}
