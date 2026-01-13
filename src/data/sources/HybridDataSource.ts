/**
 * Hybrid data source that combines IndexedDB (fast, recent) with Storj (complete, historical)
 * Automatically routes queries to the most efficient source
 */

import { DataSource, QueryParams, QueryResult } from "./DataSourceInterface";
import { IndexedDBDataSource } from "./IndexedDBDataSource";
import { StorjDataSource } from "./StorjDataSource";

export class HybridDataSource implements DataSource {
  name = "hybrid";

  constructor(
    private indexedDB: IndexedDBDataSource,
    private storj: StorjDataSource,
    private preferLocalThresholdDays = 90, // Use IndexedDB for data within 90 days
  ) {}

  async query(params: QueryParams): Promise<QueryResult> {
    console.log("[HybridDataSource] Routing query:", params);

    // Determine which source to use
    const useIndexedDB = await this.shouldUseIndexedDB(params);

    if (useIndexedDB) {
      console.log("[HybridDataSource] → Routing to IndexedDB");
      return this.indexedDB.query(params);
    }

    // Check if IndexedDB has partial data
    const indexedDBHasData = await this.indexedDB.hasData(params);

    if (indexedDBHasData && params.dateRange) {
      // Split query: recent from IndexedDB, historical from Storj
      console.log(
        "[HybridDataSource] → Splitting query between IndexedDB and Storj",
      );
      return this.splitQuery(params);
    }

    // Fall back to Storj for historical data
    console.log("[HybridDataSource] → Routing to Storj");
    return this.storj.query(params);
  }

  private async shouldUseIndexedDB(params: QueryParams): Promise<boolean> {
    // If no date range specified, prefer IndexedDB (recent data)
    if (!params.dateRange) return true;

    // If querying very recent data, use IndexedDB
    const daysSinceEnd =
      (Date.now() - params.dateRange.end.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceEnd < this.preferLocalThresholdDays) {
      return await this.indexedDB.hasData(params);
    }

    return false;
  }

  private async splitQuery(params: QueryParams): Promise<QueryResult> {
    // Calculate split date
    const splitDate = new Date();
    splitDate.setDate(splitDate.getDate() - this.preferLocalThresholdDays);

    // Query IndexedDB for recent data
    const recentResult = await this.indexedDB.query({
      ...params,
      dateRange: {
        start: splitDate,
        end: params.dateRange?.end || new Date(),
      },
    });

    // Query Storj for historical data
    const historicalResult = await this.storj.query({
      ...params,
      dateRange: {
        start: params.dateRange?.start || new Date(0),
        end: splitDate,
      },
    });

    // Combine results - ensure same data type
    const combinedData = [...historicalResult.data, ...recentResult.data];

    return {
      data: combinedData as typeof recentResult.data,
      metadata: {
        source: "hybrid",
        queriedAt: new Date(),
        dateRange: {
          start: params.dateRange?.start || new Date(0),
          end: params.dateRange?.end || new Date(),
        },
        totalRecords:
          historicalResult.metadata.totalRecords +
          recentResult.metadata.totalRecords,
        returnedRecords:
          historicalResult.metadata.returnedRecords +
          recentResult.metadata.returnedRecords,
      },
    };
  }

  async getDateRange(
    dataType: string,
  ): Promise<{ start: Date; end: Date } | null> {
    // Get range from both sources and merge
    const indexedDBRange = await this.indexedDB.getDateRange(dataType);
    const storjRange = await this.storj.getDateRange(dataType);

    if (!indexedDBRange && !storjRange) return null;
    if (!indexedDBRange) return storjRange;
    if (!storjRange) return indexedDBRange;

    return {
      start: new Date(
        Math.min(indexedDBRange.start.getTime(), storjRange.start.getTime()),
      ),
      end: new Date(
        Math.max(indexedDBRange.end.getTime(), storjRange.end.getTime()),
      ),
    };
  }

  async getAvailableMetrics(dataType: string): Promise<string[]> {
    // Combine metrics from both sources
    const indexedDBMetrics = await this.indexedDB.getAvailableMetrics(dataType);
    const storjMetrics = await this.storj.getAvailableMetrics(dataType);

    return [...new Set([...indexedDBMetrics, ...storjMetrics])];
  }

  async hasData(params: Partial<QueryParams>): Promise<boolean> {
    return (
      (await this.indexedDB.hasData(params)) ||
      (await this.storj.hasData(params))
    );
  }
}
