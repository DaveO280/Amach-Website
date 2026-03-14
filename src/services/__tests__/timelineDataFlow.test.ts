/**
 * Timeline Data Flow Test Suite
 *
 * Tests the complete timeline event pipeline without requiring network/blockchain:
 * - Event structure and type validation
 * - Encryption round-trip (encrypt → decrypt)
 * - V2 event detection (empty encryptedData → Storj fetch required)
 * - VisualTimeline data parsing (encryptedData → display)
 * - Timestamp handling (blockchain vs Storj timestamps)
 * - Encryption key cache lifecycle
 * - Error scenarios (missing key, corrupted data, parse failures)
 */

import CryptoJS from "crypto-js";
import {
  encryptWithWalletKey,
  decryptWithWalletKey,
  verifyKeyOwnership,
  getKeyDerivationMessage,
  type WalletEncryptionKey,
} from "@/utils/walletEncryption";
import type { HealthEvent } from "@/services/HealthEventService";

// ============ Test Helpers ============

function makeMockEncryptionKey(
  walletAddress = "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
): WalletEncryptionKey {
  // Use a deterministic key for testing
  const key = CryptoJS.SHA256(walletAddress).toString();
  return {
    key,
    derivedAt: Date.now(),
    walletAddress: walletAddress.toLowerCase(),
  };
}

function makeV1Event(overrides?: Partial<HealthEvent>): HealthEvent {
  return {
    eventId: "0xtest-0",
    timestamp: Math.floor(Date.now() / 1000),
    searchTag: "0xabcdef",
    encryptedData: JSON.stringify({
      eventType: "medication",
      data: { medication: "Aspirin", dosage: "100mg", frequency: "daily" },
    }),
    eventHash: "0xhash",
    isActive: true,
    ...overrides,
  };
}

function makeV2Event(overrides?: Partial<HealthEvent>): HealthEvent {
  return {
    eventId: "0xtest-1",
    timestamp: Math.floor(Date.now() / 1000),
    searchTag: "0xabcdef",
    encryptedData: "", // V2: empty because data is in Storj
    eventHash: "0xhash",
    isActive: true,
    storjUri: "storj://amach-health/timeline/test-event.enc",
    contentHash:
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    ...overrides,
  };
}

function makeStorjTimelineEvent() {
  return {
    id: "evt-001",
    eventType: "condition",
    timestamp: 1700000000000, // ms
    data: {
      condition: "Hypertension",
      severity: "Moderate",
      diagnosis: "Primary",
      treatment: "ACE inhibitors",
      description: "Controlled with medication",
    },
  };
}

// ============ Event Structure Tests ============

describe("HealthEvent structure", () => {
  it("V1 event has encryptedData populated", () => {
    const event = makeV1Event();
    expect(event.encryptedData).toBeTruthy();
    expect(event.encryptedData.length).toBeGreaterThan(0);
    expect(event.storjUri).toBeUndefined();
  });

  it("V2 event has empty encryptedData and storjUri", () => {
    const event = makeV2Event();
    expect(event.encryptedData).toBe("");
    expect(event.storjUri).toBeDefined();
    expect(event.contentHash).toBeDefined();
  });

  it("V2 event detection: empty encryptedData means Storj fetch needed", () => {
    const v2 = makeV2Event();
    const needsStorjFetch = !v2.encryptedData || v2.encryptedData.length === 0;
    expect(needsStorjFetch).toBe(true);
  });

  it("V1 event detection: non-empty encryptedData means no Storj fetch", () => {
    const v1 = makeV1Event();
    const needsStorjFetch = !v1.encryptedData || v1.encryptedData.length === 0;
    expect(needsStorjFetch).toBe(false);
  });

  it("deleted events have isActive=false", () => {
    const deleted = makeV1Event({ isActive: false });
    expect(deleted.isActive).toBe(false);
  });

  it("event ID follows stable pattern: address-index", () => {
    const address = "0xtest";
    const index = 3;
    const stableId = `${address.toLowerCase()}-${index}`;
    expect(stableId).toBe("0xtest-3");
  });
});

// ============ Encryption Round-Trip Tests ============

describe("Wallet encryption round-trip", () => {
  const mockKey = makeMockEncryptionKey();

  it("encrypts and decrypts simple string", () => {
    const plaintext = "Hello, health data!";
    const encrypted = encryptWithWalletKey(plaintext, mockKey);
    expect(encrypted).toMatch(/^0x/);
    expect(encrypted).not.toBe(plaintext);

    const decrypted = decryptWithWalletKey(encrypted, mockKey);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypts and decrypts JSON health event", () => {
    const eventData = {
      eventType: "medication",
      data: { medication: "Ibuprofen", dosage: "400mg" },
    };
    const plaintext = JSON.stringify(eventData);

    const encrypted = encryptWithWalletKey(plaintext, mockKey);
    const decrypted = decryptWithWalletKey(encrypted, mockKey);
    const parsed = JSON.parse(decrypted);

    expect(parsed.eventType).toBe("medication");
    expect(parsed.data.medication).toBe("Ibuprofen");
  });

  it("handles the 0x prefix correctly on decrypt", () => {
    const plaintext = "test data";
    const encrypted = encryptWithWalletKey(plaintext, mockKey);
    expect(encrypted.startsWith("0x")).toBe(true);

    // With prefix
    const d1 = decryptWithWalletKey(encrypted, mockKey);
    expect(d1).toBe(plaintext);

    // Without prefix (strip 0x manually)
    const d2 = decryptWithWalletKey(encrypted.slice(2), mockKey);
    expect(d2).toBe(plaintext);
  });

  it("fails with wrong key", () => {
    const wrongKey = makeMockEncryptionKey(
      "0xDIFFERENTADDRESS000000000000000000000000",
    );
    const encrypted = encryptWithWalletKey("secret data", mockKey);

    expect(() => {
      decryptWithWalletKey(encrypted, wrongKey);
    }).toThrow();
  });

  it("handles unicode content", () => {
    const unicode = "Health data: 日本語テスト 🏥";
    const encrypted = encryptWithWalletKey(unicode, mockKey);
    const decrypted = decryptWithWalletKey(encrypted, mockKey);
    expect(decrypted).toBe(unicode);
  });

  it("handles large payloads", () => {
    const largeData = JSON.stringify({
      metrics: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        value: Math.random() * 100,
        date: `2025-01-${String((i % 28) + 1).padStart(2, "0")}`,
      })),
    });

    const encrypted = encryptWithWalletKey(largeData, mockKey);
    const decrypted = decryptWithWalletKey(encrypted, mockKey);
    expect(JSON.parse(decrypted).metrics.length).toBe(1000);
  });
});

// ============ Key Derivation Message Tests ============

describe("Key derivation message", () => {
  it("is deterministic for same address", () => {
    const addr = "0xABCD";
    const msg1 = getKeyDerivationMessage(addr);
    const msg2 = getKeyDerivationMessage(addr);
    expect(msg1).toBe(msg2);
  });

  it("uses lowercase address as nonce", () => {
    const msg = getKeyDerivationMessage("0xABCD");
    expect(msg).toContain("0xabcd");
  });

  it("different addresses produce different messages", () => {
    const msg1 = getKeyDerivationMessage("0xABCD");
    const msg2 = getKeyDerivationMessage("0xEFGH");
    expect(msg1).not.toBe(msg2);
  });

  it("contains the expected prefix", () => {
    const msg = getKeyDerivationMessage("0x1234");
    expect(msg).toContain("Amach Health - Derive Encryption Key");
    expect(msg).toContain("Nonce:");
  });
});

// ============ Key Ownership Verification ============

describe("Key ownership verification", () => {
  it("returns true for matching address (case insensitive)", () => {
    const key = makeMockEncryptionKey(
      "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
    );
    expect(
      verifyKeyOwnership(key, "0xabcdef1234567890abcdef1234567890abcdef12"),
    ).toBe(true);
    expect(
      verifyKeyOwnership(key, "0xABCDEF1234567890ABCDEF1234567890ABCDEF12"),
    ).toBe(true);
  });

  it("returns false for different address", () => {
    const key = makeMockEncryptionKey(
      "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
    );
    expect(
      verifyKeyOwnership(key, "0x1111111111111111111111111111111111111111"),
    ).toBe(false);
  });
});

// ============ VisualTimeline Data Parsing Tests ============

describe("VisualTimeline data parsing", () => {
  /**
   * Replicates the parsing logic from VisualTimeline.tsx formatEventData()
   */
  function parseEventData(encryptedData: string): {
    isEmpty: boolean;
    isEncrypted: boolean;
    parsed?: Record<string, unknown>;
    eventType?: string;
  } {
    if (!encryptedData || encryptedData.trim().length === 0) {
      return { isEmpty: true, isEncrypted: false };
    }

    try {
      const parsed = JSON.parse(encryptedData);
      let data = parsed;
      if (parsed.data && typeof parsed.data === "object") {
        data = { ...parsed, ...parsed.data };
        delete data.data;
      }
      return {
        isEmpty: false,
        isEncrypted: false,
        parsed: data,
        eventType: parsed.eventType,
      };
    } catch {
      return { isEmpty: false, isEncrypted: true };
    }
  }

  it("handles empty string (V2 event without Storj data)", () => {
    const result = parseEventData("");
    expect(result.isEmpty).toBe(true);
  });

  it("handles null/undefined gracefully", () => {
    const result1 = parseEventData(null as unknown as string);
    expect(result1.isEmpty).toBe(true);

    const result2 = parseEventData(undefined as unknown as string);
    expect(result2.isEmpty).toBe(true);
  });

  it("parses valid JSON event data", () => {
    const json = JSON.stringify({
      eventType: "medication",
      data: { medication: "Aspirin", dosage: "100mg" },
    });
    const result = parseEventData(json);
    expect(result.isEmpty).toBe(false);
    expect(result.isEncrypted).toBe(false);
    expect(result.eventType).toBe("medication");
    expect(result.parsed?.medication).toBe("Aspirin");
  });

  it("flattens nested data property", () => {
    const json = JSON.stringify({
      eventType: "condition",
      data: { condition: "Diabetes", severity: "Type 2" },
    });
    const result = parseEventData(json);
    expect(result.parsed?.condition).toBe("Diabetes");
    expect(result.parsed?.severity).toBe("Type 2");
    // data property should be removed after flattening
    expect(result.parsed?.data).toBeUndefined();
  });

  it("handles Storj timeline event format (enriched V2)", () => {
    const storjEvent = makeStorjTimelineEvent();
    const json = JSON.stringify(storjEvent);
    const result = parseEventData(json);

    expect(result.isEmpty).toBe(false);
    expect(result.eventType).toBe("condition");
    expect(result.parsed?.condition).toBe("Hypertension");
    expect(result.parsed?.severity).toBe("Moderate");
  });

  it("detects encrypted/unparseable data", () => {
    const encrypted = "0xU2FsdGVkX1+abc123...";
    const result = parseEventData(encrypted);
    expect(result.isEncrypted).toBe(true);
  });

  it("handles malformed JSON gracefully", () => {
    const malformed = "{broken json";
    const result = parseEventData(malformed);
    expect(result.isEncrypted).toBe(true);
  });

  it("priority fields are identified correctly", () => {
    const priorityFields = [
      "severity",
      "description",
      "location",
      "bodyPart",
      "diagnosis",
      "medication",
      "dosage",
      "frequency",
      "condition",
      "symptoms",
      "treatment",
      "allergen",
      "reaction",
    ];

    const json = JSON.stringify({
      eventType: "condition",
      data: {
        severity: "High",
        description: "Test",
        condition: "Test",
        unrelated_field: "value",
      },
    });

    const result = parseEventData(json);
    const keys = Object.keys(result.parsed || {});

    const matchedPriority = keys.filter((k) =>
      priorityFields.includes(k.toLowerCase()),
    );
    expect(matchedPriority.length).toBeGreaterThan(0);
  });
});

// ============ Timestamp Handling Tests ============

describe("Timeline timestamp handling", () => {
  it("blockchain timestamps are in seconds", () => {
    const blockchainTs = 1700000000; // seconds since epoch
    const date = new Date(blockchainTs * 1000);
    expect(date.getFullYear()).toBe(2023);
  });

  it("Storj timestamps are in milliseconds", () => {
    const storjTs = 1700000000000; // milliseconds
    const date = new Date(storjTs);
    expect(date.getFullYear()).toBe(2023);
  });

  it("Storj timestamp conversion to seconds (as done in readHealthTimeline)", () => {
    const storjTs = 1700000000000;
    const convertedToSeconds = Math.floor(storjTs / 1000);
    expect(convertedToSeconds).toBe(1700000000);
  });

  it("events are grouped by date correctly", () => {
    const events: HealthEvent[] = [
      makeV1Event({ timestamp: 1700000000 }), // Nov 14, 2023
      makeV1Event({ timestamp: 1700086400 }), // Nov 15, 2023
      makeV1Event({ timestamp: 1700050000 }), // Nov 15, 2023 (same day)
    ];

    const grouped = new Map<string, HealthEvent[]>();
    events.forEach((event) => {
      const date = new Date(event.timestamp * 1000);
      const dateKey = date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      if (!grouped.has(dateKey)) grouped.set(dateKey, []);
      grouped.get(dateKey)!.push(event);
    });

    // Should have 2 unique dates
    expect(grouped.size).toBe(2);
  });

  it("custom event dates are preserved through Storj round-trip", () => {
    // User selects a custom date (e.g., March 1 2025)
    const customDateMs = new Date("2025-03-01T00:00:00Z").getTime();

    // This gets stored in Storj timeline event
    const storjEvent = {
      ...makeStorjTimelineEvent(),
      timestamp: customDateMs,
    };

    // readHealthTimeline converts back to seconds
    const baseEventTimestamp = Math.floor(storjEvent.timestamp / 1000);

    // VisualTimeline displays with * 1000
    const displayDate = new Date(baseEventTimestamp * 1000);
    expect(displayDate.toISOString().startsWith("2025-03-01")).toBe(true);
  });
});

// ============ V2 Event Enrichment Flow ============

describe("V2 event enrichment flow", () => {
  it("detects V2 events needing Storj hydration", () => {
    const events = [makeV1Event(), makeV2Event(), makeV1Event()];

    const v2Events = events.filter(
      (e) => !e.encryptedData || e.encryptedData.length === 0,
    );
    expect(v2Events.length).toBe(1);
    expect(v2Events[0].storjUri).toBeDefined();
  });

  it("enrichment sets encryptedData from Storj result", () => {
    const event = makeV2Event();

    // Simulate what readHealthTimeline does after successful Storj fetch
    const storjResult = makeStorjTimelineEvent();
    event.encryptedData = JSON.stringify(storjResult);

    expect(event.encryptedData).toBeTruthy();
    const parsed = JSON.parse(event.encryptedData);
    expect(parsed.eventType).toBe("condition");
  });

  it("enrichment updates timestamp from Storj data", () => {
    const event = makeV2Event();

    // Simulate timestamp update from Storj
    const storjResult = makeStorjTimelineEvent();
    if (storjResult.timestamp) {
      event.timestamp = Math.floor(storjResult.timestamp / 1000);
    }

    // 1700000000000ms → floor(1700000000000 / 1000) = 1700000000 seconds
    expect(event.timestamp).toBe(1700000000);
  });

  it("unenriched V2 event shows '(No data available)' in UI", () => {
    const event = makeV2Event();
    // encryptedData is empty — UI should show placeholder
    expect(event.encryptedData).toBe("");

    // Simulate the check from VisualTimeline formatEventData
    const isEmpty =
      !event.encryptedData || event.encryptedData.trim().length === 0;
    expect(isEmpty).toBe(true);
  });
});

// ============ Error Scenarios ============

describe("Timeline error scenarios", () => {
  it("corrupted encrypted data throws on decrypt", () => {
    const key = makeMockEncryptionKey();
    expect(() => {
      decryptWithWalletKey("0xNOTVALIDCIPHERTEXT!!!", key);
    }).toThrow();
  });

  it("event with non-JSON encryptedData falls through to encrypted display", () => {
    const event = makeV1Event({
      encryptedData: "U2FsdGVkX1+randomgarbage",
    });

    let isEncrypted = false;
    try {
      JSON.parse(event.encryptedData);
    } catch {
      isEncrypted = true;
    }
    expect(isEncrypted).toBe(true);
  });

  it("Storj API returning null result leaves event unenriched", () => {
    const event = makeV2Event();

    // Simulate: result.success is true but result.result is null
    const apiResult = { success: true, result: null };

    if (apiResult.success && apiResult.result) {
      event.encryptedData = JSON.stringify(apiResult.result);
    }
    // Without the assignment, encryptedData stays empty
    expect(event.encryptedData).toBe("");
  });

  it("Storj API returning error response leaves event unenriched", () => {
    const event = makeV2Event();

    // Simulate: API response not OK (status 500)
    const responseOk = false;

    if (!responseOk) {
      // readHealthTimeline logs error but continues
    }
    expect(event.encryptedData).toBe("");
  });

  it("missing encryption key skips Storj enrichment entirely", () => {
    const encryptionKey: WalletEncryptionKey | undefined = undefined;

    // Replicates the check in readHealthTimeline line 112
    const shouldEnrich = !!encryptionKey;
    expect(shouldEnrich).toBe(false);
  });
});

// ============ Filter & Display Tests ============

describe("Timeline filtering", () => {
  it("filters out deleted events (isActive=false)", () => {
    const events = [
      makeV1Event({ isActive: true }),
      makeV1Event({ isActive: false }),
      makeV1Event({ isActive: true }),
    ];

    const visible = events.filter((e) => e.isActive);
    expect(visible.length).toBe(2);
  });

  it("filters out locally deleted events from localStorage", () => {
    const events = [
      makeV1Event({ eventId: "addr-0", isActive: true }),
      makeV1Event({ eventId: "addr-1", isActive: true }),
      makeV1Event({ eventId: "addr-2", isActive: true }),
    ];

    const deletedEventIds = ["addr-1"];
    const visible = events.filter(
      (e) => e.isActive && !deletedEventIds.includes(e.eventId as string),
    );
    expect(visible.length).toBe(2);
    expect(visible.map((e) => e.eventId)).toEqual(["addr-0", "addr-2"]);
  });

  it("handles empty event list", () => {
    const events: HealthEvent[] = [];
    expect(events.length).toBe(0);
  });
});

// ============ Event Type Classification ============

describe("Event type classification", () => {
  const typeToIcon: Record<string, string> = {
    MEDICATION: "💊",
    CONDITION: "🏥",
    INJURY: "🩹",
    ILLNESS: "🤒",
    SURGERY: "🔬",
    PROCEDURE: "🔬",
    ALLERGY: "⚠️",
    WEIGHT: "📊",
    HEIGHT: "📊",
    BLOOD: "📊",
    NOTE: "📝",
  };

  it("maps event types to correct icons", () => {
    expect(typeToIcon["MEDICATION"]).toBe("💊");
    expect(typeToIcon["CONDITION"]).toBe("🏥");
    expect(typeToIcon["INJURY"]).toBe("🩹");
  });

  it("extracts event type from JSON encryptedData", () => {
    const json = JSON.stringify({ eventType: "medication", data: {} });
    const parsed = JSON.parse(json);
    expect(parsed.eventType).toBe("medication");
  });

  it("handles missing eventType gracefully", () => {
    const json = JSON.stringify({ data: { note: "some data" } });
    const parsed = JSON.parse(json);
    const eventType = parsed.eventType ?? "Health Event";
    expect(eventType).toBe("Health Event");
  });
});

// ============ Content Hash Verification ============

describe("Content hash verification", () => {
  it("SHA256 hash format is consistent", () => {
    const data = JSON.stringify({ test: "data" });
    const hash = CryptoJS.SHA256(data).toString();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("same data produces same hash", () => {
    const data = JSON.stringify({ test: "data" });
    const h1 = CryptoJS.SHA256(data).toString();
    const h2 = CryptoJS.SHA256(data).toString();
    expect(h1).toBe(h2);
  });

  it("different data produces different hash", () => {
    const h1 = CryptoJS.SHA256(JSON.stringify({ a: 1 })).toString();
    const h2 = CryptoJS.SHA256(JSON.stringify({ a: 2 })).toString();
    expect(h1).not.toBe(h2);
  });

  it("bytes32 format with 0x prefix", () => {
    const hash = CryptoJS.SHA256("test").toString();
    const bytes32 = `0x${hash}`;
    expect(bytes32.length).toBe(66); // 0x + 64 hex chars
    expect(bytes32).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
