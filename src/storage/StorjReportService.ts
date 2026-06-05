/**
 * Service for managing health reports (DEXA, Bloodwork) on Storj
 * Stores reports in FHIR format for interoperability
 */

import type {
  BloodworkReportData,
  DexaReportData,
  GutHealthReportData,
  GutHealthSpeciesEntry,
  ParsedReportSummary,
} from "@/types/reportData";
import {
  convertBloodworkToFhir,
  convertFhirToBloodwork,
} from "@/utils/fhir/bloodworkToFhir";
import type { FhirDiagnosticReport } from "@/utils/fhir/dexaToFhir";
import { convertDexaToFhir, convertFhirToDexa } from "@/utils/fhir/dexaToFhir";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import { createHash } from "crypto";
import type {
  AttestationResult,
  AttestationService,
} from "./AttestationService";
import { StorageService } from "./StorageService";

export interface ReportStorageResult {
  success: boolean;
  storjUri?: string;
  contentHash?: string;
  reportId?: string;
  duplicate?: boolean;
  verifiedDecrypt?: boolean;
  error?: string;
  attestation?: AttestationResult;
}

export interface ReportStorageOptions {
  patientId?: string;
  practitionerId?: string;
  metadata?: Record<string, string>;
  onProgress?: (progress: number) => void;
  /** Optional attestation service for creating on-chain attestations */
  attestationService?: AttestationService;
  /** Whether to create an on-chain attestation (requires attestationService) */
  createAttestation?: boolean;
}

/**
 * Service for managing health reports on Storj
 */
export class StorjReportService {
  private storageService: StorageService;

  constructor(storageService?: StorageService) {
    this.storageService = storageService || new StorageService();
  }

  private stableStringify(value: unknown): string {
    const seen = new WeakSet<object>();
    const normalize = (v: unknown): unknown => {
      if (v === null) return null;
      if (typeof v !== "object") return v;
      if (seen.has(v as object)) return "[Circular]";
      seen.add(v as object);

      if (Array.isArray(v)) return v.map((x) => normalize(x));

      const obj = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(obj).sort()) {
        out[key] = normalize(obj[key]);
      }
      return out;
    };
    return JSON.stringify(normalize(value));
  }

  private hashString(input: string): string {
    return createHash("sha256").update(input).digest("hex");
  }

  private fingerprintDexa(report: DexaReportData): string {
    const normalized = {
      type: "dexa",
      scanDate: report.scanDate || "",
      source: report.source || "",
      totalBodyFatPercent: report.totalBodyFatPercent ?? null,
      totalLeanMassKg: report.totalLeanMassKg ?? null,
      visceralFatRating: report.visceralFatRating ?? null,
      visceralFatAreaCm2: report.visceralFatAreaCm2 ?? null,
      visceralFatVolumeCm3: report.visceralFatVolumeCm3 ?? null,
      boneDensityTotal: report.boneDensityTotal ?? null,
      androidGynoidRatio: report.androidGynoidRatio ?? null,
      regions: [...(report.regions || [])]
        .map((r) => ({
          region: r.region,
          bodyFatPercent: r.bodyFatPercent ?? null,
          leanMassKg: r.leanMassKg ?? null,
          fatMassKg: r.fatMassKg ?? null,
          boneDensityGPerCm2: r.boneDensityGPerCm2 ?? null,
          tScore: r.tScore ?? null,
          zScore: r.zScore ?? null,
        }))
        .sort((a, b) => a.region.localeCompare(b.region)),
    };
    return this.hashString(this.stableStringify(normalized));
  }

  private fingerprintBloodwork(report: BloodworkReportData): string {
    const normalizedMetrics = [...(report.metrics || [])]
      .map((m) => ({
        name: m.name,
        value: m.value ?? null,
        valueText: m.valueText ?? null,
        unit: m.unit ?? null,
        referenceRange: m.referenceRange ?? null,
        flag: m.flag ?? null,
        panel: m.panel ?? null,
      }))
      .sort((a, b) => {
        const ak = `${a.panel ?? ""}|${a.name}|${a.unit ?? ""}|${a.value ?? ""}|${a.referenceRange ?? ""}|${a.flag ?? ""}`;
        const bk = `${b.panel ?? ""}|${b.name}|${b.unit ?? ""}|${b.value ?? ""}|${b.referenceRange ?? ""}|${b.flag ?? ""}`;
        return ak.localeCompare(bk);
      });

    const normalized = {
      type: "bloodwork",
      reportDate: report.reportDate || "",
      laboratory: report.laboratory || "",
      source: report.source || "",
      metrics: normalizedMetrics,
    };
    return this.hashString(this.stableStringify(normalized));
  }

  private getFingerprint(report: DexaReportData | BloodworkReportData): string {
    return report.type === "dexa"
      ? this.fingerprintDexa(report)
      : this.fingerprintBloodwork(report);
  }

  private async findDuplicate(
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    dataType: string,
    fingerprint: string,
  ): Promise<{
    storjUri: string;
    contentHash: string;
    reportId?: string;
  } | null> {
    const existing = await this.storageService.listUserData(
      userAddress,
      encryptionKey,
      dataType,
    );

    for (const ref of existing) {
      const md = ref.metadata || {};
      const fp =
        md.reportfingerprint ||
        md.reportFingerprint ||
        md.report_fingerprint ||
        "";
      if (fp && fp === fingerprint) {
        const rid = md.reportid || md.reportId;
        return {
          storjUri: ref.uri,
          contentHash: ref.contentHash,
          reportId: rid,
        };
      }
    }
    return null;
  }

  /**
   * Store a DEXA report to Storj in FHIR format
   *
   * @param report - DEXA report to store
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key
   * @param options - Storage options
   * @returns Storage result with URI and content hash
   */
  async storeDexaReport(
    report: DexaReportData,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    options?: ReportStorageOptions,
  ): Promise<ReportStorageResult> {
    try {
      console.log(`💾 Storing DEXA report to Storj (FHIR format)...`);

      const fingerprint = this.getFingerprint(report);
      const duplicate = await this.findDuplicate(
        userAddress,
        encryptionKey,
        "dexa-report-fhir",
        fingerprint,
      );
      if (duplicate) {
        console.log(
          `♻️ Duplicate DEXA report detected, reusing: ${duplicate.storjUri}`,
        );
        return {
          success: true,
          storjUri: duplicate.storjUri,
          contentHash: duplicate.contentHash,
          reportId: duplicate.reportId,
          duplicate: true,
        };
      }

      // Convert to FHIR format
      const fhirReport = convertDexaToFhir(
        report,
        options?.patientId,
        options?.practitionerId,
      );

      // Generate a unique report ID
      const reportId = `dexa-${report.scanDate || Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Store the FHIR report
      const stored =
        await this.storageService.storeHealthData<FhirDiagnosticReport>(
          fhirReport,
          userAddress,
          encryptionKey,
          {
            dataType: "dexa-report-fhir",
            metadata: {
              reportid: reportId,
              reporttype: "dexa",
              format: "fhir-r4",
              reportfingerprint: fingerprint,
              scandate: report.scanDate || "",
              source: report.source || "",
              confidence: report.confidence.toString(),
              regioncount: report.regions?.length?.toString() || "0",
              ...options?.metadata,
            },
            onProgress: options?.onProgress,
          },
        );

      console.log(`✅ DEXA report stored to Storj: ${stored.storjUri}`);

      // Optionally create on-chain attestation
      let attestation: AttestationResult | undefined;
      if (
        options?.createAttestation &&
        options.attestationService &&
        stored.contentHash
      ) {
        console.log(`🔗 Creating on-chain attestation for DEXA report...`);
        attestation = await options.attestationService.attestDexaReport(
          report,
          stored.contentHash,
        );
        if (attestation.success) {
          console.log(`✅ Attestation created: ${attestation.tier} tier`);
          const { notifyAttestationCreated } =
            await import("../utils/attestationEvents");
          notifyAttestationCreated();
        } else {
          console.warn(`⚠️ Attestation failed: ${attestation.error}`);
        }
      }

      return {
        success: true,
        storjUri: stored.storjUri,
        contentHash: stored.contentHash,
        reportId,
        attestation,
      };
    } catch (error) {
      console.error("❌ Failed to store DEXA report:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Store a Bloodwork report to Storj in FHIR format
   */
  async storeBloodworkReport(
    report: BloodworkReportData,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    options?: ReportStorageOptions,
  ): Promise<ReportStorageResult> {
    try {
      console.log(`💾 Storing Bloodwork report to Storj (FHIR format)...`);

      const fingerprint = this.getFingerprint(report);
      const duplicate = await this.findDuplicate(
        userAddress,
        encryptionKey,
        "bloodwork-report-fhir",
        fingerprint,
      );
      if (duplicate) {
        console.log(
          `♻️ Duplicate bloodwork report detected, reusing: ${duplicate.storjUri}`,
        );
        return {
          success: true,
          storjUri: duplicate.storjUri,
          contentHash: duplicate.contentHash,
          reportId: duplicate.reportId,
          duplicate: true,
        };
      }

      const fhirReport = convertBloodworkToFhir(
        report,
        options?.patientId,
        options?.practitionerId,
      );

      const reportId = `bloodwork-${report.reportDate || Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const stored =
        await this.storageService.storeHealthData<FhirDiagnosticReport>(
          fhirReport,
          userAddress,
          encryptionKey,
          {
            dataType: "bloodwork-report-fhir",
            metadata: {
              reportid: reportId,
              reporttype: "bloodwork",
              format: "fhir-r4",
              reportfingerprint: fingerprint,
              reportdate: report.reportDate || "",
              source: report.source || "",
              confidence: report.confidence.toString(),
              metriccount: report.metrics?.length?.toString() || "0",
              ...options?.metadata,
            },
            onProgress: options?.onProgress,
          },
        );

      console.log(`✅ Bloodwork report stored to Storj: ${stored.storjUri}`);

      // Optionally create on-chain attestation
      let attestation: AttestationResult | undefined;
      if (
        options?.createAttestation &&
        options.attestationService &&
        stored.contentHash
      ) {
        console.log(`🔗 Creating on-chain attestation for Bloodwork report...`);
        attestation = await options.attestationService.attestBloodworkReport(
          report,
          stored.contentHash,
        );
        if (attestation.success) {
          console.log(`✅ Attestation created: ${attestation.tier} tier`);
          const { notifyAttestationCreated } =
            await import("../utils/attestationEvents");
          notifyAttestationCreated();
        } else {
          console.warn(`⚠️ Attestation failed: ${attestation.error}`);
        }
      }

      return {
        success: true,
        storjUri: stored.storjUri,
        contentHash: stored.contentHash,
        reportId,
        attestation,
      };
    } catch (error) {
      console.error("❌ Failed to store Bloodwork report:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private fingerprintGutHealth(report: GutHealthReportData): string {
    const normalized = {
      type: "gut-health",
      provider: report.provider,
      kit_id: report.kit_id ?? null,
      collection_date: report.collection_date ?? null,
      microbiome_score: report.summary.microbiome_score ?? null,
      gut_type: report.summary.gut_type ?? null,
    };
    return this.hashString(this.stableStringify(normalized));
  }

  /**
   * Store a gut health report (Layer 1 — structured metrics) to Storj.
   * The species list (Layer 2) is stored separately via storeGutHealthSpecies.
   */
  async storeGutHealthReport(
    report: GutHealthReportData,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    options?: ReportStorageOptions,
  ): Promise<ReportStorageResult> {
    try {
      console.log(`💾 Storing gut health report (Layer 1) to Storj...`);

      const fingerprint = this.fingerprintGutHealth(report);
      const duplicate = await this.findDuplicate(
        userAddress,
        encryptionKey,
        "gut-health-report",
        fingerprint,
      );
      if (duplicate) {
        console.log(
          `♻️ Duplicate gut health report detected, reusing: ${duplicate.storjUri}`,
        );
        return {
          success: true,
          storjUri: duplicate.storjUri,
          contentHash: duplicate.contentHash,
          reportId: duplicate.reportId,
          duplicate: true,
        };
      }

      // Store without rawText to keep the Layer 1 object lean
      const { rawText: _rawText, species: _species, ...payload } = report;

      const reportId = `gut-${report.collection_date ?? Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const stored = await this.storageService.storeHealthData<
        Omit<GutHealthReportData, "rawText" | "species">
      >(payload, userAddress, encryptionKey, {
        dataType: "gut-health-report",
        metadata: {
          reportid: reportId,
          reporttype: "gut-health",
          provider: report.provider,
          reportfingerprint: fingerprint,
          collectiondate: report.collection_date ?? "",
          microbiomescore: String(report.summary.microbiome_score ?? ""),
          confidence: String(report.confidence),
          ...options?.metadata,
        },
        onProgress: options?.onProgress,
      });

      console.log(`✅ Gut health report stored: ${stored.storjUri}`);

      return {
        success: true,
        storjUri: stored.storjUri,
        contentHash: stored.contentHash,
        reportId,
      };
    } catch (error) {
      console.error("❌ Failed to store gut health report:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Store the species list (Layer 2) separately so ZK proofs can target it
   * independently of the structured metrics.
   */
  async storeGutHealthSpecies(
    species: GutHealthSpeciesEntry[],
    reportId: string,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    options?: ReportStorageOptions,
  ): Promise<ReportStorageResult> {
    try {
      console.log(
        `💾 Storing gut health species list (Layer 2, ${species.length} entries) to Storj...`,
      );

      const stored = await this.storageService.storeHealthData<
        GutHealthSpeciesEntry[]
      >(species, userAddress, encryptionKey, {
        dataType: "gut-health-species",
        metadata: {
          reportid: reportId,
          speciescount: String(species.length),
          ...options?.metadata,
        },
        onProgress: options?.onProgress,
      });

      console.log(`✅ Gut health species stored: ${stored.storjUri}`);

      return {
        success: true,
        storjUri: stored.storjUri,
        contentHash: stored.contentHash,
        reportId,
      };
    } catch (error) {
      console.error("❌ Failed to store gut health species:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async retrieveGutHealthReport(
    storjUri: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<Omit<GutHealthReportData, "rawText" | "species"> | null> {
    try {
      console.log(`📥 Retrieving gut health report from Storj: ${storjUri}`);
      const retrieved = await this.storageService.retrieveHealthData<
        Omit<GutHealthReportData, "rawText" | "species">
      >(storjUri, encryptionKey);
      return retrieved.data ?? null;
    } catch (error) {
      console.error("❌ Failed to retrieve gut health report:", error);
      return null;
    }
  }

  async retrieveGutHealthSpecies(
    storjUri: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<GutHealthSpeciesEntry[] | null> {
    try {
      console.log(`📥 Retrieving gut health species from Storj: ${storjUri}`);
      const retrieved = await this.storageService.retrieveHealthData<
        GutHealthSpeciesEntry[]
      >(storjUri, encryptionKey);
      return retrieved.data ?? null;
    } catch (error) {
      console.error("❌ Failed to retrieve gut health species:", error);
      return null;
    }
  }

  /**
   * Store a parsed report summary (handles DEXA, Bloodwork, and Gut Health)
   *
   * @param reportSummary - Parsed report summary
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key
   * @param options - Storage options
   * @returns Storage result
   */
  async storeReport(
    reportSummary: ParsedReportSummary,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    options?: ReportStorageOptions,
  ): Promise<ReportStorageResult> {
    if (reportSummary.report.type === "dexa") {
      return this.storeDexaReport(
        reportSummary.report,
        userAddress,
        encryptionKey,
        options,
      );
    } else if (reportSummary.report.type === "bloodwork") {
      return this.storeBloodworkReport(
        reportSummary.report,
        userAddress,
        encryptionKey,
        options,
      );
    } else if (reportSummary.report.type === "gut-health") {
      return this.storeGutHealthReport(
        reportSummary.report,
        userAddress,
        encryptionKey,
        options,
      );
    }

    return {
      success: false,
      error: "Unknown report type",
    };
  }

  /**
   * Retrieve a DEXA report from Storj and convert back from FHIR
   *
   * @param storjUri - Storj URI of the report
   * @param encryptionKey - Wallet-derived encryption key
   * @param rawText - Optional raw text to include in the report
   * @returns DEXA report data or null if not found
   */
  async retrieveDexaReport(
    storjUri: string,
    encryptionKey: WalletEncryptionKey,
    rawText?: string,
  ): Promise<DexaReportData | null> {
    try {
      console.log(`📥 Retrieving DEXA report from Storj: ${storjUri}`);

      // Retrieve from Storj
      const retrieved =
        await this.storageService.retrieveHealthData<FhirDiagnosticReport>(
          storjUri,
          encryptionKey,
        );

      if (!retrieved.data) {
        console.error("❌ No data retrieved from Storj");
        return null;
      }

      // Extract source from FHIR conclusion or use default
      const sourceMatch =
        retrieved.data.conclusion?.match(/from (.+?)(?:\.|$)/);
      const source = sourceMatch ? sourceMatch[1] : undefined;

      // Convert FHIR back to DexaReportData
      const dexaReport = convertFhirToDexa(retrieved.data, rawText, source);

      if (!dexaReport) {
        console.error("❌ Failed to convert FHIR to DEXA format");
        return null;
      }

      console.log(`✅ DEXA report retrieved and converted from FHIR`);
      return dexaReport;
    } catch (error) {
      console.error("❌ Failed to retrieve DEXA report:", error);
      return null;
    }
  }

  /**
   * Store multiple reports at once
   *
   * @param reports - Array of parsed report summaries
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key
   * @param options - Storage options
   * @returns Array of storage results
   */
  async storeReports(
    reports: ParsedReportSummary[],
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    options?: ReportStorageOptions,
  ): Promise<ReportStorageResult[]> {
    const results: ReportStorageResult[] = [];

    for (const report of reports) {
      const result = await this.storeReport(
        report,
        userAddress,
        encryptionKey,
        options,
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Retrieve a Bloodwork report from Storj and convert back from FHIR
   */
  async retrieveBloodworkReport(
    storjUri: string,
    encryptionKey: WalletEncryptionKey,
    rawText?: string,
  ): Promise<BloodworkReportData | null> {
    try {
      console.log(`📥 Retrieving Bloodwork report from Storj: ${storjUri}`);

      const retrieved =
        await this.storageService.retrieveHealthData<FhirDiagnosticReport>(
          storjUri,
          encryptionKey,
        );

      if (!retrieved.data) {
        console.error("❌ No data retrieved from Storj");
        return null;
      }

      const sourceMatch =
        retrieved.data.conclusion?.match(/from (.+?)(?:\.|$)/);
      const source = sourceMatch ? sourceMatch[1] : undefined;

      const bloodwork = convertFhirToBloodwork(retrieved.data, rawText, source);
      if (!bloodwork) {
        console.error("❌ Failed to convert FHIR to Bloodwork format");
        return null;
      }

      console.log(`✅ Bloodwork report retrieved and converted from FHIR`);
      return bloodwork;
    } catch (error) {
      console.error("❌ Failed to retrieve Bloodwork report:", error);
      return null;
    }
  }
}

// Singleton instance
let storjReportServiceInstance: StorjReportService | null = null;

/**
 * Get or create the StorjReportService singleton
 */
export function getStorjReportService(): StorjReportService {
  if (!storjReportServiceInstance) {
    storjReportServiceInstance = new StorjReportService();
  }
  return storjReportServiceInstance;
}
