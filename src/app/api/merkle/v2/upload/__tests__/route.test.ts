/**
 * Integration tests for POST /api/merkle/v2/upload
 *
 * Covers:
 *   - Auth layer: 401 on missing token, 401 on invalid token,
 *     500 on missing server env vars
 *   - Input validation: 400 on missing fields, bad window, empty leaves,
 *     leaves over capacity
 *   - Happy path: mock Privy + mock Storj → 200 with expected response shape
 *
 * All Privy and Storj calls are mocked so this runs in CI with no secrets.
 */

import { NextRequest } from "next/server";
import { POST } from "../route";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

// Mock jose so we never hit the live Privy JWKS endpoint.
// createRemoteJWKSet returns a mock key function; jwtVerify is controlled per test.
jest.mock("jose", () => ({
  createRemoteJWKSet: jest.fn().mockReturnValue(jest.fn()),
  jwtVerify: jest.fn(),
  errors: {
    JWTExpired: class JWTExpired extends Error {
      constructor() {
        super("jwt expired");
        this.name = "JWTExpired";
      }
    },
  },
}));

// Mock getStorageService so we never touch Storj
jest.mock("@/storage", () => ({
  getStorageService: jest.fn(),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks are registered)
// ─────────────────────────────────────────────────────────────────────────────

import { jwtVerify } from "jose";
import { getStorageService } from "@/storage";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TEST_ADDRESS =
  "0xabababababababababababababababababababababab".toLowerCase();
const TEST_TOKEN = "privy.test.jwt";
const TEST_APP_ID = "test-app-id";

const MOCK_ENCRYPTION_KEY = {
  key: "deadbeef".repeat(8),
  derivedAt: 1_700_000_000_000,
  walletAddress: TEST_ADDRESS,
};

// Minimal v2 wire leaf
const BASE_WIRE_LEAF = {
  wallet: TEST_ADDRESS,
  dayId: 42,
  timezoneOffset: -300,
  steps: 8000,
  activeEnergy: 35000,
  exerciseMins: 40,
  hrv: 42,
  restingHR: 58,
  sleepMins: 450,
  workoutCount: 1,
  sourceCount: 2,
  dataFlags: 0x0000_03ff,
  vo2max: 490,
  weight: 7800,
  bodyFatPct: 1850,
  leanMass: 6300,
  deepSleepMins: 75,
  remSleepMins: 95,
  lightSleepMins: 240,
  awakeMins: 20,
  sourceHash:
    "1111111111111111111111111111111111111111111111111111111111111111",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, token?: string): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token !== undefined) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return new NextRequest("http://localhost/api/merkle/v2/upload", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// jwtVerify returns { payload, protectedHeader }. We only need payload.sub.
function mockJwtPayload(userId = "privy:test-user-id") {
  return {
    payload: {
      sub: userId,
      aud: TEST_APP_ID,
      iss: "privy.io",
      iat: Math.floor(Date.now() / 1000) - 10,
      exp: Math.floor(Date.now() / 1000) + 300,
      sid: "sess:test",
    },
    protectedHeader: { alg: "ES256" },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

const mockVerify = jwtVerify as jest.MockedFunction<typeof jwtVerify>;
const mockGetStorage = getStorageService as jest.MockedFunction<
  typeof getStorageService
>;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_PRIVY_APP_ID = TEST_APP_ID;

  // Default happy-path storage mock
  mockGetStorage.mockReturnValue({
    storeHealthData: jest.fn().mockResolvedValue({
      storjUri: `sj://test-bucket/test-wallet/merkle-v2-baseline-leaves/1700000000.enc`,
      contentHash: "sha256-abc123",
      uploadedAt: 1_700_000_000_000,
    }),
  } as unknown as ReturnType<typeof getStorageService>);
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth layer tests
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/merkle/v2/upload — auth", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const req = makeRequest({
      walletAddress: TEST_ADDRESS,
      encryptionKey: MOCK_ENCRYPTION_KEY,
      window: "baseline",
      leaves: [BASE_WIRE_LEAF],
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/bearer/i);
  });

  it("returns 401 when token verification fails", async () => {
    mockVerify.mockRejectedValueOnce(new Error("invalid signature"));
    const req = makeRequest(
      {
        walletAddress: TEST_ADDRESS,
        encryptionKey: MOCK_ENCRYPTION_KEY,
        window: "baseline",
        leaves: [BASE_WIRE_LEAF],
      },
      TEST_TOKEN,
    );
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/invalid.*token|invalid.*access/i);
  });

  it("returns 500 when NEXT_PUBLIC_PRIVY_APP_ID is missing", async () => {
    delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const req = makeRequest(
      {
        walletAddress: TEST_ADDRESS,
        encryptionKey: MOCK_ENCRYPTION_KEY,
        window: "baseline",
        leaves: [BASE_WIRE_LEAF],
      },
      TEST_TOKEN,
    );
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/not configured/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Input validation tests
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/merkle/v2/upload — input validation", () => {
  beforeEach(() => {
    // Auth always passes for validation tests
    mockVerify.mockResolvedValue(
      mockJwtPayload() as unknown as Awaited<ReturnType<typeof jwtVerify>>,
    );
  });

  it("returns 400 when walletAddress is missing", async () => {
    const req = makeRequest(
      {
        encryptionKey: MOCK_ENCRYPTION_KEY,
        window: "baseline",
        leaves: [BASE_WIRE_LEAF],
      },
      TEST_TOKEN,
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when window is invalid", async () => {
    const req = makeRequest(
      {
        walletAddress: TEST_ADDRESS,
        encryptionKey: MOCK_ENCRYPTION_KEY,
        window: "invalid",
        leaves: [BASE_WIRE_LEAF],
      },
      TEST_TOKEN,
    );
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/window/i);
  });

  it("returns 400 when leaves is empty", async () => {
    const req = makeRequest(
      {
        walletAddress: TEST_ADDRESS,
        encryptionKey: MOCK_ENCRYPTION_KEY,
        window: "baseline",
        leaves: [],
      },
      TEST_TOKEN,
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when leaves exceeds MAX_LEAVES_PER_WINDOW (128)", async () => {
    const tooMany = Array.from({ length: 129 }, (_, i) => ({
      ...BASE_WIRE_LEAF,
      dayId: i,
    }));
    const req = makeRequest(
      {
        walletAddress: TEST_ADDRESS,
        encryptionKey: MOCK_ENCRYPTION_KEY,
        window: "baseline",
        leaves: tooMany,
      },
      TEST_TOKEN,
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Happy path
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/merkle/v2/upload — happy path", () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue(
      mockJwtPayload() as unknown as Awaited<ReturnType<typeof jwtVerify>>,
    );
  });

  it("returns 200 with storjUri, leafCount, and per-leaf hashes for baseline window", async () => {
    const req = makeRequest(
      {
        walletAddress: TEST_ADDRESS,
        encryptionKey: MOCK_ENCRYPTION_KEY,
        window: "baseline",
        leaves: [BASE_WIRE_LEAF, { ...BASE_WIRE_LEAF, dayId: 43 }],
      },
      TEST_TOKEN,
    );
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.window).toBe("baseline");
    expect(json.dataType).toBe("merkle-v2-baseline-leaves");
    expect(json.leafCount).toBe(2);
    expect(Array.isArray(json.hashes)).toBe(true);
    expect(json.hashes).toHaveLength(2);
    expect(typeof json.storjUri).toBe("string");
  });

  it("returns 200 for finish window", async () => {
    const req = makeRequest(
      {
        walletAddress: TEST_ADDRESS,
        encryptionKey: MOCK_ENCRYPTION_KEY,
        window: "finish",
        leaves: [{ ...BASE_WIRE_LEAF, vo2max: 620 }],
      },
      TEST_TOKEN,
    );
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.window).toBe("finish");
    expect(json.dataType).toBe("merkle-v2-finish-leaves");
  });

  it("calls storeHealthData with the right dataType and metadata", async () => {
    const mockStore = jest.fn().mockResolvedValue({
      storjUri: "sj://bucket/addr/type/ts.enc",
      contentHash: "sha256-xyz",
      uploadedAt: Date.now(),
    });
    mockGetStorage.mockReturnValue({
      storeHealthData: mockStore,
    } as unknown as ReturnType<typeof getStorageService>);

    const req = makeRequest(
      {
        walletAddress: TEST_ADDRESS,
        encryptionKey: MOCK_ENCRYPTION_KEY,
        window: "finish",
        leaves: [BASE_WIRE_LEAF],
      },
      TEST_TOKEN,
    );
    await POST(req);

    expect(mockStore).toHaveBeenCalledTimes(1);
    const [, , , opts] = mockStore.mock.calls[0];
    expect(opts.dataType).toBe("merkle-v2-finish-leaves");
    expect(opts.metadata.window).toBe("finish");
    expect(opts.metadata.platform).toBe("ios");
  });
});
