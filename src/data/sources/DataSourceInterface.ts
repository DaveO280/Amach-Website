/**
 * Unified interface for querying health data from any source
 * Implementations: IndexedDB, Storj, future (on-chain, IPFS, etc.)
 */

export interface QueryParams {
  // Data type
  dataType: "apple-health" | "dexa" | "bloodwork" | "cgm";

  // Time-series specific
  metrics?: string[]; // ['heartRate', 'steps', 'sleep']
  dateRange?: {
    start: Date;
    end: Date;
  };

  // Filtering
  filters?: QueryFilter[];

  // Aggregation
  groupBy?: "hour" | "day" | "week" | "month";
  aggregation?: "avg" | "min" | "max" | "sum" | "count";

  // Reports specific
  reportType?: "latest" | "all" | "within-range";
  reportFields?: string[];

  // Limit/offset for pagination
  limit?: number;
  offset?: number;
}

export interface QueryFilter {
  field: string; // 'heartRate', 'steps', 'value'
  operator: ">" | "<" | "=" | ">=" | "<=" | "!=" | "between";
  value: number | string | [number, number];
}

export interface QueryResult {
  data: TimeSeriesData[] | ReportData[];
  metadata: {
    source: "indexeddb" | "storj" | "hybrid";
    queriedAt: Date;
    dateRange: { start: Date; end: Date };
    totalRecords: number;
    returnedRecords: number;
  };
}

export interface TimeSeriesData {
  date: Date;
  metric: string;
  value: number;
  unit: string;
  aggregatedFrom?: number; // How many raw samples
}

export interface ReportData {
  reportType: "dexa" | "bloodwork";
  reportDate: Date;
  fields: Record<string, unknown>;
  rawData: unknown;
}

export interface DataSource {
  name: string;

  /**
   * Query health data with flexible filters
   */
  query(params: QueryParams): Promise<QueryResult>;

  /**
   * Get available date range for a data type
   */
  getDateRange(dataType: string): Promise<{ start: Date; end: Date } | null>;

  /**
   * Get available metrics for a data type
   */
  getAvailableMetrics(dataType: string): Promise<string[]>;

  /**
   * Check if data source has data for given parameters
   */
  hasData(params: Partial<QueryParams>): Promise<boolean>;
}
