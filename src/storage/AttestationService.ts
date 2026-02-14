/**
 * AttestationService - Creates on-chain attestations for uploaded health data
 * Proves data uploads without revealing content
 */

import {
  HealthDataType,
  calculateAppleHealthCompleteness,
  calculateDexaCompleteness,
  type AttestationTier,
} from "@/types/healthDataAttestation";
import type { BloodworkReportData, DexaReportData } from "@/types/reportData";
import { createHash } from "crypto";
import {
  decodeErrorResult,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from "viem";

// V4 custom errors (SecureHealthProfileV4.sol) for user-facing messages
const REVERT_MESSAGES: Record<string, string> = {
  E0: "Invalid content hash.",
  E1: "Invalid data type.",
  E2: "Invalid date range (start must be before end).",
  E3: "End date cannot be in the future.",
  E4: "Completeness score exceeds maximum.",
  E5: "This report was already attested (duplicate content hash).",
  E6: "Invalid batch size (must be 1–50).",
  E7: "Array length mismatch.",
};

// V4 Attestation ABI (subset needed for this service; includes errors for decodeErrorResult)
const attestationAbi = [
  { inputs: [], name: "E0", type: "error" },
  { inputs: [], name: "E1", type: "error" },
  { inputs: [], name: "E2", type: "error" },
  { inputs: [], name: "E3", type: "error" },
  { inputs: [], name: "E4", type: "error" },
  { inputs: [], name: "E5", type: "error" },
  { inputs: [], name: "E6", type: "error" },
  { inputs: [], name: "E7", type: "error" },
  {
    inputs: [
      { name: "contentHash", type: "bytes32" },
      { name: "dataType", type: "uint8" },
      { name: "startDate", type: "uint40" },
      { name: "endDate", type: "uint40" },
      { name: "completenessScore", type: "uint16" },
      { name: "recordCount", type: "uint16" },
      { name: "coreComplete", type: "bool" },
    ],
    name: "createAttestation",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "contentHashes", type: "bytes32[]" },
      { name: "dataTypes", type: "uint8[]" },
      { name: "startDates", type: "uint40[]" },
      { name: "endDates", type: "uint40[]" },
      { name: "completenessScores", type: "uint16[]" },
      { name: "recordCounts", type: "uint16[]" },
      { name: "coreCompletes", type: "bool[]" },
    ],
    name: "createAttestationBatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "user", type: "address" },
      { name: "contentHash", type: "bytes32" },
    ],
    name: "verifyAttestation",
    outputs: [
      { name: "exists", type: "bool" },
      {
        components: [
          { name: "contentHash", type: "bytes32" },
          { name: "dataType", type: "uint8" },
          { name: "startDate", type: "uint40" },
          { name: "endDate", type: "uint40" },
          { name: "completenessScore", type: "uint16" },
          { name: "recordCount", type: "uint16" },
          { name: "coreComplete", type: "bool" },
          { name: "timestamp", type: "uint40" },
        ],
        name: "attestation",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "contentHash", type: "bytes32" }],
    name: "isHashAttested",
    outputs: [
      { name: "attested", type: "bool" },
      { name: "attestor", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "user", type: "address" },
      { name: "dataType", type: "uint8" },
    ],
    name: "getAttestationCount",
    outputs: [{ name: "count", type: "uint16" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getUserAttestations",
    outputs: [
      {
        components: [
          { name: "contentHash", type: "bytes32" },
          { name: "dataType", type: "uint8" },
          { name: "startDate", type: "uint40" },
          { name: "endDate", type: "uint40" },
          { name: "completenessScore", type: "uint16" },
          { name: "recordCount", type: "uint16" },
          { name: "coreComplete", type: "bool" },
          { name: "timestamp", type: "uint40" },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "hasProfile",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "user", type: "address" },
      { name: "dataType", type: "uint8" },
    ],
    name: "getHighestTierAttestation",
    outputs: [
      { name: "tier", type: "uint8" },
      {
        components: [
          { name: "contentHash", type: "bytes32" },
          { name: "dataType", type: "uint8" },
          { name: "startDate", type: "uint40" },
          { name: "endDate", type: "uint40" },
          { name: "completenessScore", type: "uint16" },
          { name: "recordCount", type: "uint16" },
          { name: "coreComplete", type: "bool" },
          { name: "timestamp", type: "uint40" },
        ],
        name: "attestation",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** Try to get revert data from a viem/contract error for decoding */
function getRevertData(error: unknown): `0x${string}` | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as Record<string, unknown>;
  const data =
    e.data ??
    (e.cause as Record<string, unknown> | undefined)?.data ??
    (e.details as Record<string, unknown> | undefined)?.data;
  if (typeof data === "string" && data.startsWith("0x") && data.length >= 10)
    return data as `0x${string}`;
  return undefined;
}

/** Turn a contract revert into a user-facing message when possible. Export for use in UI catch blocks. */
export function getAttestationErrorMessage(error: unknown): string {
  const revertData = getRevertData(error);
  if (revertData) {
    try {
      const decoded = decodeErrorResult({
        abi: attestationAbi,
        data: revertData,
      });
      const friendly = REVERT_MESSAGES[decoded.errorName];
      if (friendly) return friendly;
    } catch {
      // ignore decode errors, fall back to generic message
    }
  }
  const msg = error instanceof Error ? error.message : "Unknown error";
  if (msg === "Transaction failed")
    return "Transaction reverted on-chain. The report may already be attested, or check dates and data.";
  return msg;
}

export interface AttestationInput {
  contentHash: string; // hex string (0x...)
  dataType: HealthDataType;
  startDate: Date;
  endDate: Date;
  completenessScore: number; // 0-100
  recordCount: number;
  coreComplete: boolean;
}

export interface AttestationResult {
  success: boolean;
  txHash?: Hash;
  tier?: AttestationTier;
  error?: string;
}

export interface OnChainAttestation {
  contentHash: string;
  dataType: number;
  startDate: number;
  endDate: number;
  completenessScore: number;
  recordCount: number;
  coreComplete: boolean;
  timestamp: number;
}

export interface AttestationVerification {
  exists: boolean;
  attestation?: OnChainAttestation;
  tier?: AttestationTier;
}

/**
 * Service for creating and verifying on-chain health data attestations
 */
export class AttestationService {
  private walletClient: WalletClient;
  private publicClient: PublicClient;
  private contractAddress: Address;

  constructor(
    walletClient: WalletClient,
    publicClient: PublicClient,
    contractAddress: Address,
  ) {
    this.walletClient = walletClient;
    this.publicClient = publicClient;
    this.contractAddress = contractAddress;
  }

  /**
   * Create attestation for a DEXA report
   */
  async attestDexaReport(
    report: DexaReportData,
    contentHash: string,
  ): Promise<AttestationResult> {
    // Calculate completeness
    const presentFields: string[] = [];

    if (report.totalBodyFatPercent !== undefined)
      presentFields.push("totalBodyFatPercent");
    if (report.totalLeanMassKg !== undefined)
      presentFields.push("totalLeanMassKg");
    if (report.boneDensityTotal?.bmd !== undefined)
      presentFields.push("boneDensityTotal.bmd");
    if (report.boneDensityTotal?.tScore !== undefined)
      presentFields.push("boneDensityTotal.tScore");
    if (report.boneDensityTotal?.zScore !== undefined)
      presentFields.push("boneDensityTotal.zScore");
    if (report.visceralFatRating !== undefined)
      presentFields.push("visceralFatRating");
    if (report.visceralFatVolumeCm3 !== undefined)
      presentFields.push("visceralFatVolumeCm3");
    if (report.visceralFatAreaCm2 !== undefined)
      presentFields.push("visceralFatAreaCm2");
    if (report.androidGynoidRatio !== undefined)
      presentFields.push("androidGynoidRatio");

    const completeness = calculateDexaCompleteness(presentFields);

    // Use scan date or today
    const scanDate = report.scanDate ? new Date(report.scanDate) : new Date();

    return this.createAttestation({
      contentHash,
      dataType: HealthDataType.DEXA,
      startDate: scanDate,
      endDate: scanDate,
      completenessScore: completeness.score,
      recordCount: 1,
      coreComplete: completeness.coreComplete,
    });
  }

  /**
   * Create attestation for a bloodwork report
   */
  async attestBloodworkReport(
    report: BloodworkReportData,
    contentHash: string,
  ): Promise<AttestationResult> {
    // For bloodwork, we consider core complete if we have at least 10 metrics
    const metricCount = report.metrics?.length || 0;
    const coreComplete = metricCount >= 10;

    // Score based on common panels
    // Basic Metabolic Panel (8), Lipid Panel (5), CBC (10), Liver Panel (6)
    const expectedMetrics = 29;
    const score = Math.min(
      100,
      Math.round((metricCount / expectedMetrics) * 100),
    );

    const reportDate = report.reportDate
      ? new Date(report.reportDate)
      : new Date();

    return this.createAttestation({
      contentHash,
      dataType: HealthDataType.BLOODWORK,
      startDate: reportDate,
      endDate: reportDate,
      completenessScore: score,
      recordCount: metricCount,
      coreComplete,
    });
  }

  /**
   * Create attestation for Apple Health data
   */
  async attestAppleHealthData(
    presentMetrics: string[],
    startDate: Date,
    endDate: Date,
    contentHash: string,
  ): Promise<AttestationResult> {
    const completeness = calculateAppleHealthCompleteness(
      presentMetrics,
      startDate,
      endDate,
    );

    return this.createAttestation({
      contentHash,
      dataType: HealthDataType.APPLE_HEALTH,
      startDate,
      endDate,
      completenessScore: completeness.score,
      recordCount: completeness.daysCovered,
      coreComplete: completeness.coreComplete,
    });
  }

  /**
   * Create attestation for CGM data
   */
  async attestCgmData(
    startDate: Date,
    endDate: Date,
    readingCount: number,
    contentHash: string,
  ): Promise<AttestationResult> {
    // CGM completeness based on readings per day (ideal: 288 readings/day for 5-min intervals)
    const daysCovered = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const expectedReadings = daysCovered * 288;
    const coverage = Math.min(
      100,
      Math.round((readingCount / expectedReadings) * 100),
    );

    // Core complete if we have at least 80% coverage
    const coreComplete = coverage >= 80;

    return this.createAttestation({
      contentHash,
      dataType: HealthDataType.CGM,
      startDate,
      endDate,
      completenessScore: coverage,
      recordCount: Math.min(readingCount, 65535), // uint16 max
      coreComplete,
    });
  }

  /**
   * Create a single attestation on-chain
   */
  async createAttestation(input: AttestationInput): Promise<AttestationResult> {
    try {
      const account = this.walletClient.account;
      if (!account) {
        return { success: false, error: "No wallet account connected" };
      }

      // Contract requires profileExists(msg.sender); check before sending tx
      const hasProfile = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: attestationAbi,
        functionName: "hasProfile",
        args: [account.address],
      });
      if (!hasProfile) {
        return {
          success: false,
          error:
            "You need an on-chain health profile before creating attestations. Create or update your profile in the Wallet first.",
        };
      }

      // Convert contentHash to bytes32 if needed
      const contentHashBytes = input.contentHash.startsWith("0x")
        ? input.contentHash
        : `0x${input.contentHash}`;

      // Date range is meaningful only for Apple Health / CGM. For DEXA/Bloodwork we just need a valid range (start < end).
      const startTimestamp = Math.floor(input.startDate.getTime() / 1000);
      let endTimestamp = Math.floor(input.endDate.getTime() / 1000);
      if (endTimestamp <= startTimestamp) {
        endTimestamp = startTimestamp + 1;
      }

      // Convert score to basis points (0-10000)
      const scoreBasisPoints = Math.round(input.completenessScore * 100);

      // Simulate the transaction first
      const { request } = await this.publicClient.simulateContract({
        address: this.contractAddress,
        abi: attestationAbi,
        functionName: "createAttestation",
        args: [
          contentHashBytes as `0x${string}`,
          input.dataType,
          startTimestamp,
          endTimestamp,
          scoreBasisPoints,
          Math.min(input.recordCount, 65535),
          input.coreComplete,
        ],
        account,
      });

      // Execute the transaction
      const txHash = await this.walletClient.writeContract(request);

      // Wait for confirmation
      await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      // Determine tier from score
      const tier = this.getTierFromScore(input.completenessScore);

      console.log(
        `✅ Attestation created: ${txHash} (${tier} tier, ${input.completenessScore}% complete)`,
      );

      return {
        success: true,
        txHash,
        tier,
      };
    } catch (error) {
      console.error("❌ Failed to create attestation:", error);
      return {
        success: false,
        error: getAttestationErrorMessage(error),
      };
    }
  }

  /**
   * Create multiple attestations in a batch (gas efficient)
   */
  async createAttestationBatch(
    inputs: AttestationInput[],
  ): Promise<AttestationResult> {
    try {
      if (inputs.length === 0) {
        return { success: false, error: "No attestations to create" };
      }

      if (inputs.length > 50) {
        return { success: false, error: "Batch size exceeds maximum (50)" };
      }

      const account = this.walletClient.account;
      if (!account) {
        return { success: false, error: "No wallet account connected" };
      }

      const hasProfile = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: attestationAbi,
        functionName: "hasProfile",
        args: [account.address],
      });
      if (!hasProfile) {
        return {
          success: false,
          error:
            "You need an on-chain health profile before creating attestations. Create or update your profile in the Wallet first.",
        };
      }

      // Prepare arrays
      const contentHashes = inputs.map(
        (i) =>
          (i.contentHash.startsWith("0x")
            ? i.contentHash
            : `0x${i.contentHash}`) as `0x${string}`,
      );
      const dataTypes = inputs.map((i) => i.dataType);
      const startDates = inputs.map((i) =>
        Math.floor(i.startDate.getTime() / 1000),
      );
      const endDates = inputs.map((i) => {
        const start = Math.floor(i.startDate.getTime() / 1000);
        const end = Math.floor(i.endDate.getTime() / 1000);
        return end > start ? end : start + 1;
      });
      const scores = inputs.map((i) => Math.round(i.completenessScore * 100));
      const recordCounts = inputs.map((i) => Math.min(i.recordCount, 65535));
      const coreCompletes = inputs.map((i) => i.coreComplete);

      const { request } = await this.publicClient.simulateContract({
        address: this.contractAddress,
        abi: attestationAbi,
        functionName: "createAttestationBatch",
        args: [
          contentHashes,
          dataTypes,
          startDates,
          endDates,
          scores,
          recordCounts,
          coreCompletes,
        ],
        account,
      });

      const txHash = await this.walletClient.writeContract(request);
      await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      console.log(
        `✅ Batch attestation created: ${txHash} (${inputs.length} attestations)`,
      );

      return {
        success: true,
        txHash,
      };
    } catch (error) {
      console.error("❌ Failed to create batch attestation:", error);
      return {
        success: false,
        error: getAttestationErrorMessage(error),
      };
    }
  }

  /**
   * Verify an attestation exists for a user
   */
  async verifyAttestation(
    userAddress: Address,
    contentHash: string,
  ): Promise<AttestationVerification> {
    try {
      const contentHashBytes = (
        contentHash.startsWith("0x") ? contentHash : `0x${contentHash}`
      ) as `0x${string}`;

      const [exists, attestation] = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: attestationAbi,
        functionName: "verifyAttestation",
        args: [userAddress, contentHashBytes],
      });

      if (!exists) {
        return { exists: false };
      }

      const onChainAttestation: OnChainAttestation = {
        contentHash: attestation.contentHash,
        dataType: attestation.dataType,
        startDate: attestation.startDate,
        endDate: attestation.endDate,
        completenessScore: attestation.completenessScore / 100, // Convert from basis points
        recordCount: attestation.recordCount,
        coreComplete: attestation.coreComplete,
        timestamp: attestation.timestamp,
      };

      return {
        exists: true,
        attestation: onChainAttestation,
        tier: this.getTierFromScore(onChainAttestation.completenessScore),
      };
    } catch (error) {
      console.error("❌ Failed to verify attestation:", error);
      return { exists: false };
    }
  }

  /**
   * Check if a content hash has been attested by anyone
   */
  async isHashAttested(
    contentHash: string,
  ): Promise<{ attested: boolean; attestor?: Address }> {
    try {
      const contentHashBytes = (
        contentHash.startsWith("0x") ? contentHash : `0x${contentHash}`
      ) as `0x${string}`;

      const [attested, attestor] = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: attestationAbi,
        functionName: "isHashAttested",
        args: [contentHashBytes],
      });

      return { attested, attestor: attested ? attestor : undefined };
    } catch (error) {
      console.error("❌ Failed to check hash attestation:", error);
      return { attested: false };
    }
  }

  /**
   * Get attestation count for a user by data type
   */
  async getAttestationCount(
    userAddress: Address,
    dataType: HealthDataType,
  ): Promise<number> {
    try {
      const count = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: attestationAbi,
        functionName: "getAttestationCount",
        args: [userAddress, dataType],
      });

      return count;
    } catch (error) {
      console.error("❌ Failed to get attestation count:", error);
      return 0;
    }
  }

  /**
   * Get all attestations for a user
   */
  async getUserAttestations(
    userAddress: Address,
  ): Promise<OnChainAttestation[]> {
    try {
      const attestations = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: attestationAbi,
        functionName: "getUserAttestations",
        args: [userAddress],
      });

      return attestations.map((a) => ({
        contentHash: a.contentHash,
        dataType: a.dataType,
        startDate: a.startDate,
        endDate: a.endDate,
        completenessScore: a.completenessScore / 100,
        recordCount: a.recordCount,
        coreComplete: a.coreComplete,
        timestamp: a.timestamp,
      }));
    } catch (error) {
      console.error("❌ Failed to get user attestations:", error);
      return [];
    }
  }

  /**
   * Get the highest tier attestation for a user and data type
   */
  async getHighestTierAttestation(
    userAddress: Address,
    dataType: HealthDataType,
  ): Promise<{
    tier: AttestationTier;
    attestation?: OnChainAttestation;
  }> {
    try {
      const [tierNum, attestation] = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: attestationAbi,
        functionName: "getHighestTierAttestation",
        args: [userAddress, dataType],
      });

      const tierMap: Record<number, AttestationTier> = {
        0: "none",
        1: "bronze",
        2: "silver",
        3: "gold",
      };

      const tier = tierMap[tierNum] || "none";

      if (tier === "none") {
        return { tier };
      }

      return {
        tier,
        attestation: {
          contentHash: attestation.contentHash,
          dataType: attestation.dataType,
          startDate: attestation.startDate,
          endDate: attestation.endDate,
          completenessScore: attestation.completenessScore / 100,
          recordCount: attestation.recordCount,
          coreComplete: attestation.coreComplete,
          timestamp: attestation.timestamp,
        },
      };
    } catch (error) {
      console.error("❌ Failed to get highest tier attestation:", error);
      return { tier: "none" };
    }
  }

  /**
   * Helper to compute content hash from data
   */
  static computeContentHash(data: unknown): string {
    const json = JSON.stringify(data);
    return `0x${createHash("sha256").update(json).digest("hex")}`;
  }

  /**
   * Helper to get tier from score
   */
  private getTierFromScore(score: number): AttestationTier {
    if (score >= 80) return "gold";
    if (score >= 60) return "silver";
    if (score >= 40) return "bronze";
    return "none";
  }
}

// Export the ABI for use in other modules
export { attestationAbi };
