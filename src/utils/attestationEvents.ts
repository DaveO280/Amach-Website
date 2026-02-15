/**
 * Attestation-created event: dispatch from anywhere (including server-side code
 * that runs in API routes). Client components listen via useAttestations.
 * Kept in utils so API route → StorjReportService never imports React hooks.
 */

export const ATTESTATION_CREATED_EVENT = "attestation-created";

export function notifyAttestationCreated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ATTESTATION_CREATED_EVENT));
  }
}
