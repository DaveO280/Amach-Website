/**
 * Interface Implementation Tests
 *
 * These tests verify that the service interfaces can be properly
 * implemented with mock classes for testing purposes.
 */

import type {
  IStorageService,
  StorageReference,
  StoredData,
  StoreOptions,
  ListOptions,
} from "../IStorageService";

import type {
  IAuthService,
  UserIdentity,
  SignatureResult,
  EncryptionKey,
  AuthState,
  AuthEventHandlers,
} from "../IAuthService";

// ============ Mock Storage Service ============

class MockStorageService implements IStorageService {
  private storage = new Map<string, { data: unknown; ref: StorageReference }>();

  async store<T>(
    data: T,
    userId: string,
    options: StoreOptions,
  ): Promise<StorageReference> {
    const uri = `mock://${userId}/${options.dataType}/${Date.now()}`;
    const ref: StorageReference = {
      uri,
      contentHash: `hash-${Math.random().toString(36).slice(2)}`,
      size: JSON.stringify(data).length,
      uploadedAt: Date.now(),
      dataType: options.dataType,
      metadata: options.metadata,
    };
    this.storage.set(uri, { data, ref });
    return ref;
  }

  async retrieve<T>(
    uri: string,
    expectedHash?: string,
  ): Promise<StoredData<T>> {
    const item = this.storage.get(uri);
    if (!item) {
      throw new Error(`Not found: ${uri}`);
    }
    return {
      data: item.data as T,
      uri,
      contentHash: item.ref.contentHash,
      verified: !expectedHash || expectedHash === item.ref.contentHash,
    };
  }

  async update<T>(
    uri: string,
    data: T,
    _userId: string,
    _options: StoreOptions,
  ): Promise<StorageReference> {
    const existing = this.storage.get(uri);
    if (!existing) {
      throw new Error(`Not found: ${uri}`);
    }
    const ref: StorageReference = {
      ...existing.ref,
      contentHash: `hash-${Math.random().toString(36).slice(2)}`,
      size: JSON.stringify(data).length,
      uploadedAt: Date.now(),
    };
    this.storage.set(uri, { data, ref });
    return ref;
  }

  async delete(uri: string): Promise<void> {
    this.storage.delete(uri);
  }

  async list(
    userId: string,
    options?: ListOptions,
  ): Promise<StorageReference[]> {
    const refs: StorageReference[] = [];
    for (const [uri, item] of this.storage) {
      if (uri.startsWith(`mock://${userId}/`)) {
        if (!options?.dataType || item.ref.dataType === options.dataType) {
          refs.push(item.ref);
        }
      }
    }
    return refs.slice(
      options?.offset ?? 0,
      (options?.offset ?? 0) + (options?.limit ?? 100),
    );
  }

  async exists(uri: string): Promise<boolean> {
    return this.storage.has(uri);
  }

  async verifyIntegrity(uri: string, expectedHash: string): Promise<boolean> {
    const item = this.storage.get(uri);
    return item?.ref.contentHash === expectedHash;
  }
}

// ============ Mock Auth Service ============

class MockAuthService implements IAuthService {
  private state: AuthState = {
    isReady: true,
    isAuthenticated: false,
    user: null,
    isLoading: false,
  };
  private encryptionKey: EncryptionKey | null = null;
  private handlers: AuthEventHandlers[] = [];

  getState(): AuthState {
    return { ...this.state };
  }

  subscribe(handlers: AuthEventHandlers): () => void {
    this.handlers.push(handlers);
    return () => {
      const idx = this.handlers.indexOf(handlers);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  async initialize(): Promise<void> {
    this.state.isReady = true;
    this.notifyHandlers();
  }

  async connect(): Promise<UserIdentity> {
    this.state.isLoading = true;
    this.notifyHandlers();

    const user: UserIdentity = {
      address: "0x1234567890123456789012345678901234567890",
      chainId: 1,
      displayName: "Test User",
    };

    this.state = {
      isReady: true,
      isAuthenticated: true,
      user,
      isLoading: false,
    };
    this.notifyHandlers();
    this.handlers.forEach((h) => h.onConnect?.(user));
    return user;
  }

  async disconnect(): Promise<void> {
    this.state = {
      isReady: true,
      isAuthenticated: false,
      user: null,
      isLoading: false,
    };
    this.encryptionKey = null;
    this.notifyHandlers();
    this.handlers.forEach((h) => h.onDisconnect?.());
  }

  isAuthenticated(): boolean {
    return this.state.isAuthenticated;
  }

  getUser(): UserIdentity {
    if (!this.state.user) {
      throw new Error("Not authenticated");
    }
    return this.state.user;
  }

  async signMessage(message: string): Promise<SignatureResult> {
    if (!this.state.user) {
      throw new Error("Not authenticated");
    }
    return {
      signature: `0xmocksig_${Buffer.from(message).toString("base64")}`,
      message,
      address: this.state.user.address,
    };
  }

  async signTypedData(
    _domain: Record<string, unknown>,
    _types: Record<string, unknown>,
    _value: Record<string, unknown>,
  ): Promise<string> {
    if (!this.state.user) {
      throw new Error("Not authenticated");
    }
    return "0xmocktypedsig";
  }

  async deriveEncryptionKey(): Promise<EncryptionKey> {
    if (!this.state.user) {
      throw new Error("Not authenticated");
    }
    this.encryptionKey = {
      key: new Uint8Array(32).fill(1),
      salt: new Uint8Array(16).fill(2),
      version: 1,
    };
    return this.encryptionKey;
  }

  getCachedEncryptionKey(): EncryptionKey | null {
    return this.encryptionKey;
  }

  clearEncryptionKey(): void {
    this.encryptionKey = null;
  }

  async verifySignature(
    _message: string,
    signature: string,
    _address: string,
  ): Promise<boolean> {
    return signature.startsWith("0xmocksig_");
  }

  private notifyHandlers(): void {
    this.handlers.forEach((h) => h.onStateChange?.(this.state));
  }
}

// ============ Tests ============

describe("Interface Implementation Tests", () => {
  describe("MockStorageService", () => {
    let storage: IStorageService;

    beforeEach(() => {
      storage = new MockStorageService();
    });

    it("implements IStorageService correctly", async () => {
      const testData = { heart_rate: [{ value: 72, date: "2024-01-01" }] };
      const userId = "0x123";

      // Store
      const ref = await storage.store(testData, userId, {
        dataType: "apple-health",
      });
      expect(ref.uri).toContain(userId);
      expect(ref.dataType).toBe("apple-health");

      // Exists
      expect(await storage.exists(ref.uri)).toBe(true);

      // Retrieve
      const retrieved = await storage.retrieve<typeof testData>(ref.uri);
      expect(retrieved.data).toEqual(testData);
      expect(retrieved.verified).toBe(true);

      // List
      const list = await storage.list(userId);
      expect(list).toHaveLength(1);

      // Update
      const updated = await storage.update(
        ref.uri,
        { heart_rate: [{ value: 75, date: "2024-01-02" }] },
        userId,
        { dataType: "apple-health" },
      );
      expect(updated.contentHash).not.toBe(ref.contentHash);

      // Delete
      await storage.delete(ref.uri);
      expect(await storage.exists(ref.uri)).toBe(false);
    });

    it("verifies data integrity", async () => {
      const ref = await storage.store({ test: 1 }, "user1", {
        dataType: "test",
      });
      expect(await storage.verifyIntegrity(ref.uri, ref.contentHash)).toBe(
        true,
      );
      expect(await storage.verifyIntegrity(ref.uri, "wrong-hash")).toBe(false);
    });
  });

  describe("MockAuthService", () => {
    let auth: IAuthService;

    beforeEach(() => {
      auth = new MockAuthService();
    });

    it("implements IAuthService correctly", async () => {
      // Initial state
      expect(auth.isAuthenticated()).toBe(false);
      expect(auth.getState().isReady).toBe(true);

      // Connect
      const user = await auth.connect();
      expect(user.address).toMatch(/^0x/);
      expect(auth.isAuthenticated()).toBe(true);
      expect(auth.getUser()).toEqual(user);

      // Sign message
      const sig = await auth.signMessage("Hello");
      expect(sig.signature).toContain("0xmocksig_");
      expect(sig.address).toBe(user.address);

      // Verify signature
      expect(
        await auth.verifySignature("Hello", sig.signature, user.address),
      ).toBe(true);

      // Derive encryption key
      const key = await auth.deriveEncryptionKey();
      expect(key.key.length).toBe(32);
      expect(auth.getCachedEncryptionKey()).toEqual(key);

      // Clear key
      auth.clearEncryptionKey();
      expect(auth.getCachedEncryptionKey()).toBeNull();

      // Disconnect
      await auth.disconnect();
      expect(auth.isAuthenticated()).toBe(false);
    });

    it("notifies subscribers of state changes", async () => {
      const stateChanges: AuthState[] = [];
      auth.subscribe({
        onStateChange: (state) => stateChanges.push({ ...state }),
      });

      await auth.connect();
      await auth.disconnect();

      expect(stateChanges.length).toBeGreaterThan(0);
      expect(stateChanges[stateChanges.length - 1].isAuthenticated).toBe(false);
    });
  });
});
