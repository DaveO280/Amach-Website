/**
 * Searchable Encryption Utilities
 *
 * Implements privacy-preserving search tags for health events
 * - Event types hidden from blockchain observers
 * - Efficient on-chain filtering
 * - Selective access control
 */

import { ethers } from "ethers";

/**
 * Health event types (stored encrypted on-chain)
 */
export enum HealthEventType {
  MEDICATION_STARTED = "MEDICATION_STARTED",
  MEDICATION_STOPPED = "MEDICATION_STOPPED",
  CONDITION_DIAGNOSED = "CONDITION_DIAGNOSED",
  CONDITION_RESOLVED = "CONDITION_RESOLVED",
  SURGERY_COMPLETED = "SURGERY_COMPLETED",
  ALLERGY_ADDED = "ALLERGY_ADDED",
  WEIGHT_RECORDED = "WEIGHT_RECORDED",
  HEIGHT_RECORDED = "HEIGHT_RECORDED",
  METRIC_SNAPSHOT = "METRIC_SNAPSHOT",
  GENERAL_NOTE = "GENERAL_NOTE",
}

interface SignerLike {
  address?: string;
  getAddress?: () => Promise<string>;
  signMessage?: (message: string) => Promise<string>;
}

/**
 * Generate or retrieve the user's deterministic secret for search tags
 * @param signer Ethereum signer (wallet) OR account object with address
 * @returns User secret (keccak256 of wallet signature or derived from address)
 */
export async function getUserSecret(signer: SignerLike): Promise<string> {
  const STORAGE_KEY = "healthTimeline_userSecret";

  // Get wallet address
  const address =
    signer.address ||
    (typeof signer.getAddress === "function"
      ? await signer.getAddress()
      : null);
  if (!address) {
    throw new Error("Unable to get wallet address from signer");
  }

  // Check if we already have a cached secret for this address
  const cached = localStorage.getItem(`${STORAGE_KEY}_${address}`);
  if (cached) {
    return cached;
  }

  let userSecret: string;

  try {
    // Try signature-based derivation (works for standard wallets)
    if (typeof signer.signMessage === "function") {
      console.log("🔑 Using signature-based secret derivation");
      const message = "Generate Health Timeline Secret";
      const signature = await signer.signMessage(message);
      userSecret = ethers.utils.keccak256(signature);
    } else {
      throw new Error("signMessage not available");
    }
  } catch (error) {
    // Fallback: Use PBKDF2 derived from address (for SSO Session Clients)
    console.log("🔑 Using PBKDF2 fallback for SSO Session Client");

    const encoder = new TextEncoder();
    const salt = encoder.encode("amach-health-timeline-salt");
    const addressBytes = encoder.encode(address.toLowerCase());

    // Import key
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      addressBytes,
      { name: "PBKDF2" },
      false,
      ["deriveBits"],
    );

    // Derive 32 bytes using PBKDF2
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      256,
    );

    // Convert to hex string
    const derivedArray = new Uint8Array(derivedBits);
    userSecret =
      "0x" +
      Array.from(derivedArray)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    console.log("✅ User secret derived using PBKDF2");
  }

  // Cache for future use (per address)
  localStorage.setItem(`${STORAGE_KEY}_${address}`, userSecret);

  return userSecret;
}

/**
 * Generate a search tag for a specific event type
 * @param eventType The type of health event
 * @param userSecret User's deterministic secret
 * @returns Search tag (bytes32 hash)
 */
export function generateSearchTag(
  eventType: HealthEventType | string,
  userSecret: string,
): string {
  return ethers.utils.solidityKeccak256(
    ["string", "bytes32"],
    [eventType, userSecret],
  );
}

/**
 * Generate search tags for multiple event types at once
 * @param eventTypes Array of event types
 * @param userSecret User's deterministic secret
 * @returns Map of eventType -> searchTag
 */
export function generateSearchTags(
  eventTypes: (HealthEventType | string)[],
  userSecret: string,
): Record<string, string> {
  const tags: Record<string, string> = {};

  for (const eventType of eventTypes) {
    tags[eventType] = generateSearchTag(eventType, userSecret);
  }

  return tags;
}

/**
 * Generate all search tags for a user
 * @param signer Ethereum signer OR account object
 * @returns Map of eventType -> searchTag
 */
export async function getAllSearchTags(
  signer: SignerLike,
): Promise<Record<string, string>> {
  const userSecret = await getUserSecret(signer);
  const allEventTypes = Object.values(HealthEventType);
  return generateSearchTags(allEventTypes, userSecret);
}

/**
 * Revoke access by rotating the user secret
 * @param signer Ethereum signer OR account object
 * @param nonce Optional nonce for additional entropy
 * @returns New user secret
 */
export async function rotateUserSecret(
  signer: SignerLike,
  nonce?: string,
): Promise<string> {
  const STORAGE_KEY = "healthTimeline_userSecret";

  // Get wallet address
  const address =
    signer.address ||
    (typeof signer.getAddress === "function"
      ? await signer.getAddress()
      : null);
  if (!address) {
    throw new Error("Unable to get wallet address from signer");
  }

  const message = nonce
    ? `Generate Health Timeline Secret - ${nonce}`
    : `Generate Health Timeline Secret - ${Date.now()}`;

  let newUserSecret: string;

  try {
    // Try signature-based rotation
    if (typeof signer.signMessage === "function") {
      const signature = await signer.signMessage(message);
      newUserSecret = ethers.utils.keccak256(signature);
    } else {
      throw new Error("signMessage not available");
    }
  } catch (error) {
    // Fallback: Use PBKDF2 with nonce
    const encoder = new TextEncoder();
    const salt = encoder.encode(`amach-health-timeline-salt-${message}`);
    const addressBytes = encoder.encode(address.toLowerCase());

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      addressBytes,
      { name: "PBKDF2" },
      false,
      ["deriveBits"],
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      256,
    );

    const derivedArray = new Uint8Array(derivedBits);
    newUserSecret =
      "0x" +
      Array.from(derivedArray)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
  }

  // Update cached secret (per address)
  localStorage.setItem(`${STORAGE_KEY}_${address}`, newUserSecret);

  return newUserSecret;
}

/**
 * Share a search tag with another party (e.g., doctor)
 * @param eventType The event type to share access for
 * @param userSecret User's secret
 * @returns Shareable search tag (can be used to query events)
 */
export function shareSearchTag(
  eventType: HealthEventType | string,
  userSecret: string,
): {
  eventType: string;
  searchTag: string;
  instructions: string;
} {
  const searchTag = generateSearchTag(eventType, userSecret);

  return {
    eventType,
    searchTag,
    instructions: `Use this search tag to query ${eventType} events on-chain without revealing other event types. Call contract.getEventsByTag(userAddress, "${searchTag}")`,
  };
}

/**
 * Cache structure for client-side event filtering
 */
export interface EventCache {
  searchTag: string;
  eventType: string;
  eventIds: number[];
  lastSync: number;
}

/**
 * Initialize event cache in IndexedDB
 */
export async function initEventCache(): Promise<void> {
  // IndexedDB setup will be implemented when we build the timeline UI
  console.log("Event cache initialization (to be implemented)");
}

/**
 * Time-based tag rotation for additional privacy
 * Generates a tag that changes each month
 * @param eventType Event type
 * @param userSecret User secret
 * @param timestamp Optional timestamp (defaults to now)
 * @returns Time-bound search tag
 */
export function generateTimeBoundTag(
  eventType: HealthEventType | string,
  userSecret: string,
  timestamp: number = Date.now(),
): string {
  const date = new Date(timestamp);
  const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  return ethers.utils.solidityKeccak256(
    ["string", "bytes32", "string"],
    [eventType, userSecret, yearMonth],
  );
}
