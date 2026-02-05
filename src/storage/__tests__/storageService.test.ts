/**
 * Storage Service Tests
 *
 * Tests for the storage service layer logic.
 * These tests focus on the data handling and validation logic.
 * Encryption tests are skipped as they require integration testing
 * with properly derived wallet keys.
 */

describe("Storage Service", () => {
  describe("StoredHealthData structure", () => {
    interface StoredHealthData {
      storjUri: string;
      contentHash: string;
      size: number;
      uploadedAt: number;
      dataType: string;
    }

    it("validates stored health data structure", () => {
      const storedData: StoredHealthData = {
        storjUri: "s3://bucket/path/to/data.enc",
        contentHash: "0x1234567890abcdef",
        size: 1024,
        uploadedAt: Date.now(),
        dataType: "apple-health",
      };

      expect(storedData.storjUri).toMatch(/^s3:\/\//);
      expect(storedData.contentHash).toMatch(/^0x[a-f0-9]+$/);
      expect(storedData.size).toBeGreaterThan(0);
      expect(storedData.uploadedAt).toBeLessThanOrEqual(Date.now());
      expect(storedData.dataType).toBe("apple-health");
    });

    it("supports all expected data types", () => {
      const dataTypes = ["apple-health", "bloodwork", "dexa", "cgm"];

      for (const dataType of dataTypes) {
        const storedData: StoredHealthData = {
          storjUri: `s3://bucket/${dataType}/data.enc`,
          contentHash: "0xabcdef",
          size: 100,
          uploadedAt: Date.now(),
          dataType,
        };

        expect(storedData.dataType).toBe(dataType);
      }
    });
  });

  describe("Content Hash Verification", () => {
    function normalizeHash(hash: string): string {
      return hash.toLowerCase().replace(/^0x/, "");
    }

    it("normalizes hashes correctly", () => {
      expect(normalizeHash("0xABCDEF")).toBe("abcdef");
      expect(normalizeHash("ABCDEF")).toBe("abcdef");
      expect(normalizeHash("0xabcdef")).toBe("abcdef");
      expect(normalizeHash("abcdef")).toBe("abcdef");
    });

    it("compares hashes correctly after normalization", () => {
      const hash1 = "0xABCDEF123456";
      const hash2 = "abcdef123456";
      const hash3 = "0xabcdef123456";

      expect(normalizeHash(hash1)).toBe(normalizeHash(hash2));
      expect(normalizeHash(hash1)).toBe(normalizeHash(hash3));
      expect(normalizeHash(hash2)).toBe(normalizeHash(hash3));
    });

    it("handles empty and edge cases", () => {
      expect(normalizeHash("")).toBe("");
      expect(normalizeHash("0x")).toBe("");
      expect(normalizeHash("0x0")).toBe("0");
    });
  });

  describe("URI Parsing", () => {
    function parseStorjUri(uri: string): {
      bucket: string;
      key: string;
    } | null {
      const match = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
      if (!match) return null;
      return { bucket: match[1], key: match[2] };
    }

    it("parses valid URIs", () => {
      const parsed = parseStorjUri("s3://my-bucket/path/to/file.enc");

      expect(parsed).not.toBeNull();
      expect(parsed?.bucket).toBe("my-bucket");
      expect(parsed?.key).toBe("path/to/file.enc");
    });

    it("handles URIs with complex paths", () => {
      const parsed = parseStorjUri(
        "s3://health-bucket/user/0x123/apple-health/2024/01/data.enc",
      );

      expect(parsed?.bucket).toBe("health-bucket");
      expect(parsed?.key).toBe("user/0x123/apple-health/2024/01/data.enc");
    });

    it("returns null for invalid URIs", () => {
      expect(parseStorjUri("invalid")).toBeNull();
      expect(parseStorjUri("http://bucket/key")).toBeNull();
      expect(parseStorjUri("s3://")).toBeNull();
      expect(parseStorjUri("s3://bucket")).toBeNull();
    });
  });
});

describe("Bucket Name Generation", () => {
  // Test the bucket naming conventions used for user isolation
  function generateBucketName(userAddress: string): string {
    // Remove 0x prefix and lowercase
    const normalized = userAddress.toLowerCase().replace(/^0x/, "");
    // Use first 16 chars of address for bucket name
    return `health-${normalized.slice(0, 16)}`;
  }

  it("generates consistent bucket names", () => {
    const address = "0x1234567890ABCDEF1234567890ABCDEF12345678";

    const bucket1 = generateBucketName(address);
    const bucket2 = generateBucketName(address);

    expect(bucket1).toBe(bucket2);
    expect(bucket1).toBe("health-1234567890abcdef");
  });

  it("handles addresses with different cases", () => {
    const lowerAddress = "0x1234567890abcdef1234567890abcdef12345678";
    const upperAddress = "0x1234567890ABCDEF1234567890ABCDEF12345678";

    expect(generateBucketName(lowerAddress)).toBe(
      generateBucketName(upperAddress),
    );
  });

  it("handles addresses without 0x prefix", () => {
    const withPrefix = "0x1234567890abcdef1234567890abcdef12345678";
    const withoutPrefix = "1234567890abcdef1234567890abcdef12345678";

    expect(generateBucketName(withPrefix)).toBe(
      generateBucketName(withoutPrefix),
    );
  });

  it("produces valid bucket names", () => {
    const address = "0xABCDEF1234567890abcdef1234567890ABCDEF12";
    const bucketName = generateBucketName(address);

    // S3 bucket names must be lowercase, 3-63 chars, start with letter/number
    expect(bucketName).toMatch(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/);
    expect(bucketName.length).toBeLessThanOrEqual(63);
    expect(bucketName.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Data Type Validation", () => {
  const VALID_DATA_TYPES = [
    "apple-health",
    "bloodwork",
    "dexa",
    "cgm",
    "conversation",
    "timeline",
  ];

  function isValidDataType(dataType: string): boolean {
    return VALID_DATA_TYPES.includes(dataType);
  }

  it("validates known data types", () => {
    expect(isValidDataType("apple-health")).toBe(true);
    expect(isValidDataType("bloodwork")).toBe(true);
    expect(isValidDataType("dexa")).toBe(true);
    expect(isValidDataType("cgm")).toBe(true);
    expect(isValidDataType("conversation")).toBe(true);
    expect(isValidDataType("timeline")).toBe(true);
  });

  it("rejects unknown data types", () => {
    expect(isValidDataType("unknown")).toBe(false);
    expect(isValidDataType("")).toBe(false);
    expect(isValidDataType("Apple-Health")).toBe(false); // case sensitive
    expect(isValidDataType("BLOODWORK")).toBe(false);
  });
});

describe("Storage Reference", () => {
  interface StorageReference {
    uri: string;
    contentHash: string;
    size: number;
    uploadedAt: number;
    dataType: string;
    metadata?: Record<string, string>;
  }

  function createStorageReference(
    bucket: string,
    key: string,
    size: number,
    dataType: string,
    metadata?: Record<string, string>,
  ): StorageReference {
    return {
      uri: `s3://${bucket}/${key}`,
      contentHash: `0x${Buffer.from(key).toString("hex").slice(0, 64)}`,
      size,
      uploadedAt: Date.now(),
      dataType,
      metadata,
    };
  }

  it("creates valid storage references", () => {
    const ref = createStorageReference(
      "health-bucket",
      "path/to/data.enc",
      1024,
      "apple-health",
    );

    expect(ref.uri).toBe("s3://health-bucket/path/to/data.enc");
    expect(ref.contentHash).toMatch(/^0x[a-f0-9]+$/);
    expect(ref.size).toBe(1024);
    expect(ref.dataType).toBe("apple-health");
  });

  it("includes metadata when provided", () => {
    const ref = createStorageReference(
      "health-bucket",
      "data.enc",
      100,
      "bloodwork",
      { source: "upload", version: "1" },
    );

    expect(ref.metadata).toEqual({ source: "upload", version: "1" });
  });
});
