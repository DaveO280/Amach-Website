/**
 * Storj implementation of DataSource interface
 * Encrypted cloud storage for historical data
 *
 * NOTE: When storing data to Storj, use normalizeHealthDataForStorage()
 * from src/data/utils/metricNameMapping.ts to convert Apple Health IDs
 * to generic metric names for better AI digestibility and platform independence.
 */

import { DataSource, QueryParams, QueryResult } from "./DataSourceInterface";
import { StorageService } from "../../storage/StorageService";
import type { WalletEncryptionKey } from "../../utils/walletEncryption";
// Imported for Phase 5 implementation - will normalize metric names when querying Storj
// import { normalizeToAppleId, toMetricName } from '../utils/metricNameMapping';

export class StorjDataSource implements DataSource {
  name = "storj";
  // @ts-expect-error - Will be used in Phase 5
  private storageService: StorageService;
  // @ts-expect-error - Will be used in Phase 5
  private userAddress: string;
  // @ts-expect-error - Will be used in Phase 5
  private encryptionKey: WalletEncryptionKey;

  // These will be used in Phase 5 implementation
  constructor(
    storageService: StorageService,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
  ) {
    this.storageService = storageService;
    this.userAddress = userAddress;
    this.encryptionKey = encryptionKey;
  }

  async query(params: QueryParams): Promise<QueryResult> {
    console.log("[StorjDataSource] Querying:", params);

    // TODO: Phase 5 - Implement full Storj querying
    // For now, return empty result
    // List relevant files from Storj by date range and type
    const relevantFiles = await this.findRelevantFiles(params);

    // Download and decrypt files
    const data = await this.loadAndFilterData(relevantFiles, params);

    return {
      data,
      metadata: {
        source: "storj",
        queriedAt: new Date(),
        dateRange: params.dateRange || { start: new Date(0), end: new Date() },
        totalRecords: data.length,
        returnedRecords: data.length,
      },
    };
  }

  private async findRelevantFiles(_params: QueryParams): Promise<string[]> {
    // TODO: Phase 5 - Use StorjPruningService to list files
    // For now, return empty array
    return [];
  }

  private async loadAndFilterData(
    _files: string[],
    _params: QueryParams,
  ): Promise<
    | Array<import("./DataSourceInterface").TimeSeriesData>
    | Array<import("./DataSourceInterface").ReportData>
  > {
    // TODO: Phase 5 - Download, decrypt, and filter data from Storj files
    // For now, return empty array
    return [];
  }

  async getDateRange(
    _dataType: string,
  ): Promise<{ start: Date; end: Date } | null> {
    // TODO: Phase 5 - Query Storj metadata to get date range
    return null;
  }

  async getAvailableMetrics(_dataType: string): Promise<string[]> {
    // TODO: Phase 5 - Query Storj metadata for available metrics
    // Note: Storj stores normalized metric names (e.g., 'heartRate', 'steps')
    // not Apple Health IDs, so return them directly
    return [];
  }

  async hasData(_params: Partial<QueryParams>): Promise<boolean> {
    // TODO: Phase 5 - Check if Storj has data matching params
    return false;
  }
}
