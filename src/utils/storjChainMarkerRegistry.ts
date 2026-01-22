/**
 * Central registry for mapping Storj-stored artifacts to on-chain marker types.
 *
 * Goal: when you add a new report/artifact type that must be verifiable,
 * you only update this file (and ensure the save/delete flows call chain markers).
 */

export type ChainMarkerKind = "upload" | "delete";

// These strings become the "eventType" input to searchable encryption tag generation.
// Keep them stable once data is live.
export type ChainEventType = "TEST_REPORT_BLOODWORK" | "TEST_REPORT_DEXA";

/**
 * Map Storj `dataType` values to the chain "eventType" used in searchable encryption tags.
 */
export const STORJ_DATA_TYPE_TO_CHAIN_EVENT_TYPE: Record<
  string,
  ChainEventType
> = {
  "bloodwork-report-fhir": "TEST_REPORT_BLOODWORK",
  "dexa-report-fhir": "TEST_REPORT_DEXA",
};

/**
 * Map parsed report type discriminants to chain event type.
 * (Used by the ReportParserViewer save flow.)
 */
export const REPORT_TYPE_TO_CHAIN_EVENT_TYPE: Record<string, ChainEventType> = {
  bloodwork: "TEST_REPORT_BLOODWORK",
  dexa: "TEST_REPORT_DEXA",
};

export function isChainTrackedStorjDataType(dataType: string): boolean {
  return Boolean(STORJ_DATA_TYPE_TO_CHAIN_EVENT_TYPE[dataType]);
}

export function getChainEventTypeForStorjDataType(
  dataType: string,
): ChainEventType | null {
  return STORJ_DATA_TYPE_TO_CHAIN_EVENT_TYPE[dataType] ?? null;
}

export function getChainEventTypeForReportType(
  reportType: string,
): ChainEventType | null {
  return REPORT_TYPE_TO_CHAIN_EVENT_TYPE[reportType] ?? null;
}
