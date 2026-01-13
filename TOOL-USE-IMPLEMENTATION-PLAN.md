# Agentic Tool Use Implementation Plan

## Executive Summary

Transform Cosaint from a passive AI that receives pre-aggregated summaries into an **agentic AI** that actively queries health data on-demand. This enables natural queries like:

- "Show me my heart rate on days I exercised over 60 minutes in December"
- "Compare my visceral fat between my last two DEXA scans"
- "When my glucose goes above 140, how does it affect my sleep that night?"

**Core Concept:** The AI decides which tools to use based on user queries, executes them, and synthesizes results - all without hardcoding query patterns.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      User Query                             │
│          "Show me my HR when steps > 10k"                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  Cosaint AI Service                          │
│  • Receives query                                           │
│  • Sees available tools in system prompt                    │
│  • Decides which tool(s) to use                             │
│  • Returns tool call(s) in response                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│               Tool Execution Router                          │
│  • Parses tool call from AI response                        │
│  • Validates parameters                                     │
│  • Routes to appropriate tool handler                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴────────────┬───────────────┐
          ▼                        ▼               ▼
    ┌──────────┐           ┌──────────┐     ┌──────────┐
    │Time-Series│           │ Reports  │     │Correlation│
    │  Query    │           │  Query   │     │  Analysis │
    └─────┬─────┘           └─────┬────┘     └─────┬─────┘
          │                       │                 │
          ▼                       ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│            Unified Data Source Interface                     │
│  • Abstracts IndexedDB vs Storj                             │
│  • Handles encryption/decryption                            │
│  • Optimizes query routing                                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴────────────┐
          ▼                        ▼
    ┌──────────┐            ┌──────────┐
    │IndexedDB │            │  Storj   │
    │ (Recent) │            │(Historical)│
    └──────────┘            └──────────┘
```

---

## Phase 1: Foundation - Data Source Abstraction (Week 1)

### Goal

Create a unified interface for querying health data from multiple sources (IndexedDB, Storj, future sources).

### New Files to Create

#### 1. `src/data/sources/DataSourceInterface.ts`

```typescript
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
```

#### 2. `src/data/sources/IndexedDBDataSource.ts`

```typescript
/**
 * IndexedDB implementation of DataSource interface
 * Fast local queries for recent data
 */

import { DataSource, QueryParams, QueryResult } from "./DataSourceInterface";
import { healthDataProcessor } from "../processors/HealthDataProcessor";
import { healthDataStore } from "../store/healthDataStore";

export class IndexedDBDataSource implements DataSource {
  name = "indexeddb";

  async query(params: QueryParams): Promise<QueryResult> {
    const startTime = Date.now();
    console.log("[IndexedDBDataSource] Querying:", params);

    if (params.dataType === "apple-health") {
      return this.queryTimeSeries(params);
    } else if (params.dataType === "dexa" || params.dataType === "bloodwork") {
      return this.queryReports(params);
    }

    throw new Error(`Unsupported data type: ${params.dataType}`);
  }

  private async queryTimeSeries(params: QueryParams): Promise<QueryResult> {
    // Get data from HealthDataProcessor
    const rawData = healthDataProcessor.getDataForHealthScores({
      startDate: params.dateRange?.start,
      endDate: params.dateRange?.end,
    });

    // Filter by metrics if specified
    const relevantMetrics = params.metrics || Object.keys(rawData);

    const timeSeriesData: TimeSeriesData[] = [];

    for (const metricType of relevantMetrics) {
      if (!rawData[metricType]) continue;

      for (const point of rawData[metricType]) {
        const value = parseFloat(point.value);

        // Apply filters
        if (params.filters && !this.matchesFilters(value, params.filters)) {
          continue;
        }

        timeSeriesData.push({
          date: new Date(point.startDate),
          metric: metricType,
          value,
          unit: point.unit,
        });
      }
    }

    // Apply aggregation if requested
    const aggregatedData = params.groupBy
      ? this.aggregateData(
          timeSeriesData,
          params.groupBy,
          params.aggregation || "avg",
        )
      : timeSeriesData;

    // Apply limit/offset
    const paginatedData = aggregatedData.slice(
      params.offset || 0,
      (params.offset || 0) + (params.limit || aggregatedData.length),
    );

    return {
      data: paginatedData,
      metadata: {
        source: "indexeddb",
        queriedAt: new Date(),
        dateRange: {
          start: params.dateRange?.start || new Date(0),
          end: params.dateRange?.end || new Date(),
        },
        totalRecords: aggregatedData.length,
        returnedRecords: paginatedData.length,
      },
    };
  }

  private async queryReports(params: QueryParams): Promise<QueryResult> {
    // Get reports from IndexedDB
    const reports = await healthDataStore.getUploadedFiles();

    // Filter by report type
    const relevantReports = reports.filter((file) => {
      if (params.dataType === "dexa" && file.fileType !== "dexa") return false;
      if (params.dataType === "bloodwork" && file.fileType !== "bloodwork")
        return false;
      return true;
    });

    // Parse and structure report data
    const reportData: ReportData[] = relevantReports.map((report) => ({
      reportType: report.fileType as "dexa" | "bloodwork",
      reportDate: new Date(report.uploadedAt),
      fields: this.extractFields(report.parsedContent, params.reportFields),
      rawData: report.parsedContent,
    }));

    // Apply limit/offset
    const paginatedData = reportData.slice(
      params.offset || 0,
      (params.offset || 0) + (params.limit || reportData.length),
    );

    return {
      data: paginatedData,
      metadata: {
        source: "indexeddb",
        queriedAt: new Date(),
        dateRange: {
          start: new Date(0),
          end: new Date(),
        },
        totalRecords: reportData.length,
        returnedRecords: paginatedData.length,
      },
    };
  }

  private matchesFilters(value: number, filters: QueryFilter[]): boolean {
    return filters.every((filter) => {
      switch (filter.operator) {
        case ">":
          return value > (filter.value as number);
        case "<":
          return value < (filter.value as number);
        case "=":
          return value === (filter.value as number);
        case ">=":
          return value >= (filter.value as number);
        case "<=":
          return value <= (filter.value as number);
        case "!=":
          return value !== (filter.value as number);
        case "between":
          const [min, max] = filter.value as [number, number];
          return value >= min && value <= max;
        default:
          return true;
      }
    });
  }

  private aggregateData(
    data: TimeSeriesData[],
    groupBy: "hour" | "day" | "week" | "month",
    aggregation: "avg" | "min" | "max" | "sum" | "count",
  ): TimeSeriesData[] {
    // Group data by time period
    const groups = new Map<string, TimeSeriesData[]>();

    for (const point of data) {
      const key = this.getGroupKey(point.date, groupBy);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(point);
    }

    // Aggregate each group
    return Array.from(groups.entries()).map(([key, points]) => {
      const values = points.map((p) => p.value);
      let aggregatedValue: number;

      switch (aggregation) {
        case "avg":
          aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
          break;
        case "min":
          aggregatedValue = Math.min(...values);
          break;
        case "max":
          aggregatedValue = Math.max(...values);
          break;
        case "sum":
          aggregatedValue = values.reduce((a, b) => a + b, 0);
          break;
        case "count":
          aggregatedValue = values.length;
          break;
      }

      return {
        date: points[0].date,
        metric: points[0].metric,
        value: aggregatedValue,
        unit: points[0].unit,
        aggregatedFrom: points.length,
      };
    });
  }

  private getGroupKey(date: Date, groupBy: string): string {
    switch (groupBy) {
      case "hour":
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
      case "day":
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      case "week":
        const weekNum = Math.floor(date.getDate() / 7);
        return `${date.getFullYear()}-${date.getMonth()}-W${weekNum}`;
      case "month":
        return `${date.getFullYear()}-${date.getMonth()}`;
      default:
        return date.toISOString();
    }
  }

  private extractFields(
    parsedContent: string,
    fields?: string[],
  ): Record<string, unknown> {
    // Parse the content and extract requested fields
    // For now, return simplified version
    try {
      const parsed = JSON.parse(parsedContent);
      if (!fields) return parsed;

      const result: Record<string, unknown> = {};
      for (const field of fields) {
        if (field in parsed) {
          result[field] = parsed[field];
        }
      }
      return result;
    } catch {
      return {};
    }
  }

  async getDateRange(
    dataType: string,
  ): Promise<{ start: Date; end: Date } | null> {
    if (dataType === "apple-health") {
      return healthDataProcessor.getDateRange();
    }
    return null;
  }

  async getAvailableMetrics(dataType: string): Promise<string[]> {
    if (dataType === "apple-health") {
      const data = await healthDataStore.getHealthData();
      return Object.keys(data.metricsByType || {});
    }
    return [];
  }

  async hasData(params: Partial<QueryParams>): Promise<boolean> {
    if (params.dataType === "apple-health") {
      return healthDataProcessor.hasData();
    }
    return false;
  }
}
```

#### 3. `src/data/sources/StorjDataSource.ts`

```typescript
/**
 * Storj implementation of DataSource interface
 * Encrypted cloud storage for historical data
 */

import { DataSource, QueryParams, QueryResult } from "./DataSourceInterface";
import { StorageService } from "../../storage/StorageService";
import { WalletEncryptionKey } from "../../utils/walletEncryption";

export class StorjDataSource implements DataSource {
  name = "storj";

  constructor(
    private storageService: StorageService,
    private userAddress: string,
    private encryptionKey: WalletEncryptionKey,
  ) {}

  async query(params: QueryParams): Promise<QueryResult> {
    console.log("[StorjDataSource] Querying:", params);

    // List files matching criteria
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

  private async findRelevantFiles(params: QueryParams): Promise<string[]> {
    // Use StorjPruningService to list files
    // For now, return placeholder
    // TODO: Implement file listing by date range and data type
    return [];
  }

  private async loadAndFilterData(
    files: string[],
    params: QueryParams,
  ): Promise<any[]> {
    // Download, decrypt, and filter data from Storj files
    // TODO: Implement
    return [];
  }

  async getDateRange(
    dataType: string,
  ): Promise<{ start: Date; end: Date } | null> {
    // TODO: Query Storj metadata to get date range
    return null;
  }

  async getAvailableMetrics(dataType: string): Promise<string[]> {
    // TODO: Query Storj metadata for available metrics
    return [];
  }

  async hasData(params: Partial<QueryParams>): Promise<boolean> {
    // TODO: Check if Storj has data matching params
    return false;
  }
}
```

#### 4. `src/data/sources/HybridDataSource.ts`

```typescript
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

    // Combine results
    return {
      data: [...historicalResult.data, ...recentResult.data],
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
```

### Files to Modify

#### 1. `src/storage/StorjPruningService.ts`

Add method to list files by date range and data type:

```typescript
async listFilesByType(
  dataType: string,
  dateRange?: { start: Date; end: Date }
): Promise<StoredHealthData[]> {
  // Query S3 metadata to find matching files
  // Filter by data type and date range
}
```

#### 2. `src/data/store/healthDataStore.ts`

Add method to get uploaded files:

```typescript
async getUploadedFiles(): Promise<UploadedFileStore[]> {
  // Return list of uploaded report files
}
```

### Testing for Phase 1

Create `src/data/sources/__tests__/`:

#### 1. `IndexedDBDataSource.test.ts`

```typescript
describe("IndexedDBDataSource", () => {
  test("queries time-series data with date range", async () => {
    const source = new IndexedDBDataSource();
    const result = await source.query({
      dataType: "apple-health",
      metrics: ["heartRate"],
      dateRange: {
        start: new Date("2024-12-01"),
        end: new Date("2024-12-31"),
      },
    });

    expect(result.data.length).toBeGreaterThan(0);
    expect(result.metadata.source).toBe("indexeddb");
  });

  test("filters data by value", async () => {
    const source = new IndexedDBDataSource();
    const result = await source.query({
      dataType: "apple-health",
      metrics: ["heartRate"],
      filters: [{ field: "heartRate", operator: ">", value: 100 }],
    });

    expect(result.data.every((d) => d.value > 100)).toBe(true);
  });

  test("aggregates data by day", async () => {
    const source = new IndexedDBDataSource();
    const result = await source.query({
      dataType: "apple-health",
      metrics: ["steps"],
      groupBy: "day",
      aggregation: "sum",
    });

    expect(result.data[0].aggregatedFrom).toBeGreaterThan(1);
  });
});
```

#### 2. `HybridDataSource.test.ts`

```typescript
describe("HybridDataSource", () => {
  test("routes recent queries to IndexedDB", async () => {
    const indexedDB = new IndexedDBDataSource();
    const storj = new StorjDataSource(mockStorageService, "addr", mockKey);
    const hybrid = new HybridDataSource(indexedDB, storj);

    const result = await hybrid.query({
      dataType: "apple-health",
      metrics: ["heartRate"],
      dateRange: {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        end: new Date(),
      },
    });

    expect(result.metadata.source).toBe("indexeddb");
  });

  test("splits queries across IndexedDB and Storj", async () => {
    // Test split query logic
  });
});
```

---

## Phase 2: Tool Definitions (Week 2)

### Goal

Define core tools that the AI can use to query health data.

### New Files to Create

#### 1. `src/ai/tools/ToolDefinitions.ts`

````typescript
/**
 * Tool definitions for AI-driven health data queries
 * These tools are exposed to the AI in the system prompt
 */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ParameterSchema>;
    required: string[];
  };
}

export interface ParameterSchema {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: ParameterSchema;
  properties?: Record<string, ParameterSchema>;
}

export const HEALTH_QUERY_TOOLS: ToolDefinition[] = [
  {
    name: "query_timeseries_metrics",
    description: `Query time-series health metrics (Apple Health, CGM, etc.) with flexible filters and aggregations.

Use this tool when the user asks about:
- Specific date ranges ("show me my heart rate in December")
- Filtered values ("days when my steps were above 10,000")
- Comparisons ("compare my sleep this month vs last month")
- Trends over time ("how has my HRV changed over the past 3 months")

Examples:
- "Show me days when my heart rate was above 100" → filter heartRate > 100
- "What was my average sleep in December?" → dateRange Dec 1-31, metric sleep, groupBy month
- "Compare my steps this week vs last week" → Two queries with different dateRanges`,
    parameters: {
      type: "object",
      properties: {
        metrics: {
          type: "array",
          description:
            "Metrics to query. Common metrics: heartRate, restingHeartRate, steps, sleep, activeEnergyBurned, hrv, vo2max",
          items: { type: "string" },
        },
        dateRange: {
          type: "object",
          description:
            "Date range to query. If omitted, returns all available data.",
          properties: {
            start: {
              type: "string",
              description: "Start date in ISO format (YYYY-MM-DD)",
            },
            end: {
              type: "string",
              description: "End date in ISO format (YYYY-MM-DD)",
            },
          },
        },
        filters: {
          type: "array",
          description:
            'Filters to apply to the data. Use to find specific conditions like "heartRate > 100"',
          items: {
            type: "object",
            properties: {
              metric: { type: "string", description: "Metric to filter on" },
              operator: {
                type: "string",
                description: "Comparison operator",
                enum: [">", "<", "=", ">=", "<=", "!=", "between"],
              },
              value: {
                type: "number",
                description:
                  'Value to compare against. For "between", use array [min, max]',
              },
            },
          },
        },
        groupBy: {
          type: "string",
          description:
            'Group results by time period. Use "day" for daily summaries, "week" for weekly, etc.',
          enum: ["hour", "day", "week", "month"],
        },
        aggregation: {
          type: "string",
          description:
            'How to aggregate grouped data. "avg" for averages, "sum" for totals (steps, calories), "min"/"max" for extremes',
          enum: ["avg", "min", "max", "sum", "count"],
        },
      },
      required: ["metrics"],
    },
  },

  {
    name: "get_latest_report",
    description: `Get the most recent DEXA scan or bloodwork report.

Use this tool when the user asks about:
- Current/latest body composition ("what's my current body fat percentage?")
- Most recent lab results ("what was my latest cholesterol?")
- Recent DEXA metrics ("show me my latest visceral fat")

Examples:
- "What's my current body fat?" → reportType: dexa, fields: [totalBodyFatPercent]
- "What was my latest cholesterol?" → reportType: bloodwork, fields: [cholesterol]`,
    parameters: {
      type: "object",
      properties: {
        reportType: {
          type: "string",
          description: "Type of report to retrieve",
          enum: ["dexa", "bloodwork"],
        },
        fields: {
          type: "array",
          description:
            'Specific fields to extract. For DEXA: totalBodyFatPercent, visceralFatAreaCm2, boneDensityTotal. For bloodwork: metric names like "cholesterol", "glucose", "hdl"',
          items: { type: "string" },
        },
      },
      required: ["reportType"],
    },
  },

  {
    name: "compare_reports",
    description: `Compare DEXA scans or bloodwork panels across multiple dates.

Use this tool when the user asks about:
- Progress over time ("how has my body fat changed?")
- Comparison between scans ("compare my last two DEXA scans")
- Trends in lab results ("how has my cholesterol trended?")

Examples:
- "Compare my last two DEXA scans" → reportType: dexa, dates: [latest, second-latest]
- "How has my visceral fat changed?" → reportType: dexa, fields: [visceralFatAreaCm2], dates: all
- "Compare my cholesterol from this year" → reportType: bloodwork, fields: [cholesterol]`,
    parameters: {
      type: "object",
      properties: {
        reportType: {
          type: "string",
          description: "Type of report to compare",
          enum: ["dexa", "bloodwork"],
        },
        dates: {
          type: "array",
          description:
            'Specific report dates to compare (ISO format), or "all" for all available reports',
          items: { type: "string" },
        },
        fields: {
          type: "array",
          description: "Specific fields to compare across reports",
          items: { type: "string" },
        },
      },
      required: ["reportType"],
    },
  },

  {
    name: "find_correlations",
    description: `Analyze correlation between two health metrics.

Use this tool when the user asks about:
- Relationships between metrics ("does exercise affect my sleep?")
- Conditional analysis ("when my heart rate is high, how is my HRV?")
- Impact analysis ("how do high-step days affect my sleep quality?")

Examples:
- "When my steps are above 10k, how is my sleep?" → primary: steps (filter >10000), secondary: sleep
- "Does high exercise affect my HRV?" → primary: exercise, secondary: hrv
- "Is there a pattern between my glucose and sleep?" → primary: glucose, secondary: sleep`,
    parameters: {
      type: "object",
      properties: {
        primaryMetric: {
          type: "object",
          description: "First metric to analyze",
          properties: {
            metric: { type: "string", description: "Metric name" },
            filter: {
              type: "object",
              description: "Optional filter to apply to primary metric",
              properties: {
                operator: { type: "string", enum: [">", "<", ">=", "<="] },
                value: { type: "number" },
              },
            },
          },
        },
        secondaryMetric: {
          type: "object",
          description: "Second metric to correlate with",
          properties: {
            metric: { type: "string", description: "Metric name" },
          },
        },
        dateRange: {
          type: "object",
          description: "Date range to analyze",
          properties: {
            start: { type: "string" },
            end: { type: "string" },
          },
        },
      },
      required: ["primaryMetric", "secondaryMetric"],
    },
  },

  {
    name: "get_data_summary",
    description: `Get a quick summary of available health data.

Use this tool when the user asks about:
- What data is available ("what health data do I have?")
- Date ranges ("how far back does my data go?")
- Data coverage ("do I have sleep data?")

This is a lightweight query that doesn't return actual data, just metadata about what's available.`,
    parameters: {
      type: "object",
      properties: {
        dataTypes: {
          type: "array",
          description:
            "Data types to summarize. Omit to get summary of all data types.",
          items: { type: "string" },
        },
      },
      required: [],
    },
  },
];

/**
 * Format tools for inclusion in AI system prompt
 */
export function formatToolsForPrompt(): string {
  let prompt = "\n\n## AVAILABLE TOOLS\n\n";
  prompt += "You have access to the following tools to query health data:\n\n";

  for (const tool of HEALTH_QUERY_TOOLS) {
    prompt += `### ${tool.name}\n\n`;
    prompt += `${tool.description}\n\n`;
    prompt += "**Parameters:**\n";
    prompt += "```json\n";
    prompt += JSON.stringify(tool.parameters, null, 2);
    prompt += "\n```\n\n";
  }

  prompt += `## HOW TO USE TOOLS\n\n`;
  prompt += `When the user's query requires health data, respond with a tool call in this format:\n\n`;
  prompt += "```json\n";
  prompt += `{
  "tool": "query_timeseries_metrics",
  "params": {
    "metrics": ["heartRate"],
    "dateRange": {
      "start": "2024-12-01",
      "end": "2024-12-31"
    }
  }
}
`;
  prompt += "\n```\n\n";
  prompt += `After receiving tool results, analyze and explain them to the user in plain language.\n`;
  prompt += `You can call multiple tools in sequence if needed.\n\n`;

  return prompt;
}
````

#### 2. `src/ai/tools/ToolExecutor.ts`

```typescript
/**
 * Executes tool calls from the AI
 * Routes to appropriate data source and returns results
 */

import { DataSource } from "../../data/sources/DataSourceInterface";
import { HEALTH_QUERY_TOOLS } from "./ToolDefinitions";

export interface ToolCall {
  tool: string;
  params: Record<string, unknown>;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export class ToolExecutor {
  constructor(private dataSource: DataSource) {}

  /**
   * Execute a tool call from the AI
   */
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    console.log("[ToolExecutor] Executing:", toolCall.tool);

    try {
      // Validate tool exists
      const toolDef = HEALTH_QUERY_TOOLS.find((t) => t.name === toolCall.tool);
      if (!toolDef) {
        throw new Error(`Unknown tool: ${toolCall.tool}`);
      }

      // Validate parameters
      this.validateParams(toolCall.params, toolDef.parameters);

      // Route to appropriate handler
      let result;
      switch (toolCall.tool) {
        case "query_timeseries_metrics":
          result = await this.handleQueryTimeseries(toolCall.params);
          break;
        case "get_latest_report":
          result = await this.handleGetLatestReport(toolCall.params);
          break;
        case "compare_reports":
          result = await this.handleCompareReports(toolCall.params);
          break;
        case "find_correlations":
          result = await this.handleFindCorrelations(toolCall.params);
          break;
        case "get_data_summary":
          result = await this.handleGetDataSummary(toolCall.params);
          break;
        default:
          throw new Error(`Unimplemented tool: ${toolCall.tool}`);
      }

      return {
        tool: toolCall.tool,
        success: true,
        data: result,
      };
    } catch (error) {
      console.error("[ToolExecutor] Error:", error);
      return {
        tool: toolCall.tool,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async handleQueryTimeseries(params: Record<string, unknown>) {
    const dateRange = params.dateRange as
      | { start: string; end: string }
      | undefined;
    const filters = params.filters as
      | Array<{
          metric: string;
          operator: string;
          value: number;
        }>
      | undefined;

    return await this.dataSource.query({
      dataType: "apple-health",
      metrics: params.metrics as string[],
      dateRange: dateRange
        ? {
            start: new Date(dateRange.start),
            end: new Date(dateRange.end),
          }
        : undefined,
      filters: filters?.map((f) => ({
        field: f.metric,
        operator: f.operator as any,
        value: f.value,
      })),
      groupBy: params.groupBy as any,
      aggregation: params.aggregation as any,
    });
  }

  private async handleGetLatestReport(params: Record<string, unknown>) {
    const result = await this.dataSource.query({
      dataType: params.reportType as "dexa" | "bloodwork",
      reportType: "latest",
      reportFields: params.fields as string[],
    });

    // Return the most recent report
    return result.data[0] || null;
  }

  private async handleCompareReports(params: Record<string, unknown>) {
    const dates = params.dates as string[];
    const fields = params.fields as string[];

    if (dates.includes("all")) {
      // Get all reports
      return await this.dataSource.query({
        dataType: params.reportType as "dexa" | "bloodwork",
        reportType: "all",
        reportFields: fields,
      });
    } else {
      // Get specific reports by date
      const reports = await Promise.all(
        dates.map((date) =>
          this.dataSource.query({
            dataType: params.reportType as "dexa" | "bloodwork",
            reportType: "within-range",
            dateRange: {
              start: new Date(date),
              end: new Date(date),
            },
            reportFields: fields,
          }),
        ),
      );

      return reports.flatMap((r) => r.data);
    }
  }

  private async handleFindCorrelations(params: Record<string, unknown>) {
    const primary = params.primaryMetric as {
      metric: string;
      filter?: { operator: string; value: number };
    };
    const secondary = params.secondaryMetric as { metric: string };
    const dateRange = params.dateRange as
      | { start: string; end: string }
      | undefined;

    // Query primary metric
    const primaryData = await this.dataSource.query({
      dataType: "apple-health",
      metrics: [primary.metric],
      dateRange: dateRange
        ? {
            start: new Date(dateRange.start),
            end: new Date(dateRange.end),
          }
        : undefined,
      filters: primary.filter
        ? [
            {
              field: primary.metric,
              operator: primary.filter.operator as any,
              value: primary.filter.value,
            },
          ]
        : undefined,
    });

    // Query secondary metric for matching dates
    const dates = primaryData.data.map((d) => d.date);
    const secondaryData = await this.dataSource.query({
      dataType: "apple-health",
      metrics: [secondary.metric],
      dateRange: dateRange
        ? {
            start: new Date(dateRange.start),
            end: new Date(dateRange.end),
          }
        : undefined,
    });

    // Calculate correlation
    const correlation = this.calculateCorrelation(
      primaryData.data,
      secondaryData.data,
    );

    return {
      primaryMetric: primary.metric,
      secondaryMetric: secondary.metric,
      correlation,
      primaryAvg: this.average(primaryData.data.map((d) => d.value)),
      secondaryAvg: this.average(secondaryData.data.map((d) => d.value)),
      dataPoints: primaryData.data.length,
    };
  }

  private async handleGetDataSummary(params: Record<string, unknown>) {
    const dataTypes = (params.dataTypes as string[]) || [
      "apple-health",
      "dexa",
      "bloodwork",
    ];

    const summary: Record<string, unknown> = {};

    for (const dataType of dataTypes) {
      const dateRange = await this.dataSource.getDateRange(dataType);
      const metrics = await this.dataSource.getAvailableMetrics(dataType);

      summary[dataType] = {
        available: dateRange !== null,
        dateRange,
        metrics,
      };
    }

    return summary;
  }

  private calculateCorrelation(data1: any[], data2: any[]): number {
    // Simple Pearson correlation
    if (data1.length === 0 || data2.length === 0) return 0;

    const values1 = data1.map((d) => d.value);
    const values2 = data2.map((d) => d.value);

    const mean1 = this.average(values1);
    const mean2 = this.average(values2);

    const numerator = values1.reduce((sum, v1, i) => {
      return sum + (v1 - mean1) * (values2[i] - mean2);
    }, 0);

    const denom1 = Math.sqrt(
      values1.reduce((sum, v) => sum + (v - mean1) ** 2, 0),
    );
    const denom2 = Math.sqrt(
      values2.reduce((sum, v) => sum + (v - mean2) ** 2, 0),
    );

    return numerator / (denom1 * denom2);
  }

  private average(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private validateParams(params: Record<string, unknown>, schema: any): void {
    // Basic validation - check required fields exist
    for (const required of schema.required) {
      if (!(required in params)) {
        throw new Error(`Missing required parameter: ${required}`);
      }
    }
  }
}
```

#### 3. `src/ai/tools/ToolResponseParser.ts`

````typescript
/**
 * Parses AI responses to extract tool calls
 */

import { ToolCall } from "./ToolExecutor";

export class ToolResponseParser {
  /**
   * Extract tool calls from AI response
   * Supports both JSON format and text with JSON blocks
   */
  static parseToolCalls(response: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // Try to parse as pure JSON first
    try {
      const json = JSON.parse(response);
      if (json.tool && json.params) {
        toolCalls.push({ tool: json.tool, params: json.params });
        return toolCalls;
      }
    } catch {
      // Not pure JSON, continue to extract from text
    }

    // Look for JSON blocks in markdown code fences
    const jsonBlockPattern = /```json\s*\n([\s\S]*?)\n```/g;
    let match;

    while ((match = jsonBlockPattern.exec(response)) !== null) {
      try {
        const json = JSON.parse(match[1]);
        if (json.tool && json.params) {
          toolCalls.push({ tool: json.tool, params: json.params });
        }
      } catch (error) {
        console.warn("[ToolResponseParser] Failed to parse JSON block:", error);
      }
    }

    // Look for <tool_call> tags
    const toolCallPattern = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;

    while ((match = toolCallPattern.exec(response)) !== null) {
      try {
        const json = JSON.parse(match[1]);
        if (json.tool && json.params) {
          toolCalls.push({ tool: json.tool, params: json.params });
        }
      } catch (error) {
        console.warn(
          "[ToolResponseParser] Failed to parse tool_call tag:",
          error,
        );
      }
    }

    return toolCalls;
  }

  /**
   * Check if response contains tool calls
   */
  static hasToolCalls(response: string): boolean {
    return (
      response.includes('"tool":') ||
      response.includes("<tool_call>") ||
      (response.includes("```json") && response.includes('"params"'))
    );
  }

  /**
   * Remove tool call JSON from response to get clean text
   */
  static stripToolCalls(response: string): string {
    let cleaned = response;

    // Remove JSON blocks
    cleaned = cleaned.replace(/```json\s*\n[\s\S]*?\n```/g, "");

    // Remove tool_call tags
    cleaned = cleaned.replace(/<tool_call>\s*[\s\S]*?\s*<\/tool_call>/g, "");

    return cleaned.trim();
  }
}
````

### Files to Modify

#### 1. `src/services/CosaintAiService.ts`

Add tool integration to prompt building:

```typescript
import { formatToolsForPrompt } from '../ai/tools/ToolDefinitions';
import { ToolExecutor } from '../ai/tools/ToolExecutor';
import { ToolResponseParser } from '../ai/tools/ToolResponseParser';

// In buildSystemMessage or createPromptWithFiles:
private buildSystemMessage(
  healthData?: HealthContextMetrics,
  userProfile?: NormalizedUserProfile,
): string {
  let message = cosaintCharacteristics.systemMessage;

  // ... existing profile and health data context ...

  // Add tool definitions
  message += formatToolsForPrompt();

  return message;
}

// Add tool execution loop to generateResponseWithFiles:
async generateResponseWithFiles(params) {
  // ... existing logic ...

  // Get initial AI response
  let response = await this.veniceApi.generateCompletion({
    systemPrompt,
    userPrompt,
  });

  // Check if response contains tool calls
  if (ToolResponseParser.hasToolCalls(response)) {
    const toolCalls = ToolResponseParser.parseToolCalls(response);

    // Execute tools
    const toolExecutor = new ToolExecutor(dataSource);
    const toolResults = await Promise.all(
      toolCalls.map(call => toolExecutor.execute(call))
    );

    // Send results back to AI
    const toolResultsText = this.formatToolResults(toolResults);
    const finalResponse = await this.veniceApi.generateCompletion({
      systemPrompt,
      userPrompt: `${userMessage}\n\n[Tool Results]\n${toolResultsText}\n\nBased on these results, provide your analysis.`,
    });

    return finalResponse;
  }

  return response;
}
```

### Testing for Phase 2

Create `src/ai/tools/__tests__/`:

#### 1. `ToolExecutor.test.ts`

```typescript
describe("ToolExecutor", () => {
  test("executes query_timeseries_metrics", async () => {
    const mockDataSource = createMockDataSource();
    const executor = new ToolExecutor(mockDataSource);

    const result = await executor.execute({
      tool: "query_timeseries_metrics",
      params: {
        metrics: ["heartRate"],
        dateRange: { start: "2024-12-01", end: "2024-12-31" },
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  test("executes find_correlations", async () => {
    const mockDataSource = createMockDataSource();
    const executor = new ToolExecutor(mockDataSource);

    const result = await executor.execute({
      tool: "find_correlations",
      params: {
        primaryMetric: {
          metric: "steps",
          filter: { operator: ">", value: 10000 },
        },
        secondaryMetric: { metric: "sleep" },
      },
    });

    expect(result.success).toBe(true);
    expect(result.data.correlation).toBeDefined();
  });
});
```

#### 2. `ToolResponseParser.test.ts`

```typescript
describe("ToolResponseParser", () => {
  test("parses JSON code block", () => {
    const response = `
I'll query your heart rate data.

\`\`\`json
{
  "tool": "query_timeseries_metrics",
  "params": {
    "metrics": ["heartRate"],
    "dateRange": { "start": "2024-12-01", "end": "2024-12-31" }
  }
}
\`\`\`
    `;

    const toolCalls = ToolResponseParser.parseToolCalls(response);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].tool).toBe("query_timeseries_metrics");
  });

  test("parses tool_call tags", () => {
    const response = `
<tool_call>
{
  "tool": "get_latest_report",
  "params": { "reportType": "dexa" }
}
</tool_call>
    `;

    const toolCalls = ToolResponseParser.parseToolCalls(response);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].tool).toBe("get_latest_report");
  });
});
```

---

## Phase 3: API Routes (Week 3)

### Goal

Expose tool execution as API endpoints for frontend use.

### New Files to Create

#### 1. `src/app/api/health/query/route.ts`

```typescript
/**
 * API route for executing health data queries via tools
 */

import { NextRequest, NextResponse } from "next/server";
import { IndexedDBDataSource } from "@/data/sources/IndexedDBDataSource";
import { ToolExecutor } from "@/ai/tools/ToolExecutor";
import { ToolCall } from "@/ai/tools/ToolExecutor";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { tool, params } = body as ToolCall;

    // Validate request
    if (!tool || !params) {
      return NextResponse.json(
        { error: "Missing tool or params" },
        { status: 400 },
      );
    }

    // Create data source (IndexedDB for now, will add Storj later)
    const dataSource = new IndexedDBDataSource();

    // Execute tool
    const executor = new ToolExecutor(dataSource);
    const result = await executor.execute({ tool, params });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      tool,
      data: result.data,
    });
  } catch (error) {
    console.error("[API /health/query] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
```

#### 2. `src/app/api/health/tools/route.ts`

```typescript
/**
 * API route to get available tools
 */

import { NextResponse } from "next/server";
import { HEALTH_QUERY_TOOLS } from "@/ai/tools/ToolDefinitions";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    tools: HEALTH_QUERY_TOOLS,
  });
}
```

### Files to Modify

#### 1. `src/services/CosaintAiService.ts`

Update to use API route instead of direct execution:

```typescript
// Replace direct ToolExecutor usage with API call
const toolResults = await Promise.all(
  toolCalls.map(async (call) => {
    const response = await fetch("/api/health/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(call),
    });

    return response.json();
  }),
);
```

### Testing for Phase 3

#### 1. `src/app/api/health/query/__tests__/route.test.ts`

```typescript
import { POST } from "../route";

describe("POST /api/health/query", () => {
  test("executes tool and returns result", async () => {
    const request = new Request("http://localhost/api/health/query", {
      method: "POST",
      body: JSON.stringify({
        tool: "query_timeseries_metrics",
        params: {
          metrics: ["heartRate"],
          dateRange: { start: "2024-12-01", end: "2024-12-31" },
        },
      }),
    });

    const response = await POST(request as any);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
  });

  test("returns error for invalid tool", async () => {
    const request = new Request("http://localhost/api/health/query", {
      method: "POST",
      body: JSON.stringify({
        tool: "invalid_tool",
        params: {},
      }),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(500);
  });
});
```

---

## Phase 4: Integration & Testing (Week 4)

### Goal

Integrate tool use into main AI flow and test end-to-end.

### Integration Steps

1. **Update CosaintAiService to enable tools by default**
2. **Add tool execution logging for debugging**
3. **Add user-facing indicators when tools are being used**
4. **Test with real user queries**

### Files to Modify

#### 1. `src/services/CosaintAiService.ts`

Full integration with tool loop:

```typescript
async generateResponseWithFiles(params) {
  // Build prompt with tools
  const systemPrompt = this.buildSystemMessage(healthData, userProfile);

  let conversationContext = userMessage;
  let iterationCount = 0;
  const maxIterations = 3; // Prevent infinite loops

  while (iterationCount < maxIterations) {
    iterationCount++;

    // Call AI
    const response = await this.veniceApi.generateCompletion({
      systemPrompt,
      userPrompt: conversationContext,
    });

    // Check for tool calls
    if (!ToolResponseParser.hasToolCalls(response)) {
      // No tools needed, return final response
      return response;
    }

    // Extract and execute tools
    const toolCalls = ToolResponseParser.parseToolCalls(response);
    console.log(`[CosaintAI] Executing ${toolCalls.length} tool(s)`);

    const toolResults = await Promise.all(
      toolCalls.map(call => this.executeToolViaAPI(call))
    );

    // Format results for AI
    const resultsText = this.formatToolResults(toolResults);

    // Update context with tool results
    conversationContext = `${conversationContext}\n\n[Tool Execution Results]\n${resultsText}\n\nProvide your analysis based on these results.`;
  }

  // If we hit max iterations, return last response
  return "I apologize, but I'm having trouble processing that query. Please try rephrasing.";
}

private async executeToolViaAPI(toolCall: ToolCall): Promise<any> {
  const response = await fetch('/api/health/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toolCall),
  });

  return response.json();
}

private formatToolResults(results: any[]): string {
  return results.map((result, i) => {
    if (!result.success) {
      return `Tool ${i + 1} (${result.tool}): Error - ${result.error}`;
    }

    return `Tool ${i + 1} (${result.tool}): ${JSON.stringify(result.data, null, 2)}`;
  }).join('\n\n');
}
```

#### 2. `src/components/AiCompanionModal.tsx`

Add visual indicator when tools are executing:

```typescript
// Add state for tool execution
const [isExecutingTools, setIsExecutingTools] = useState(false);

// In message sending logic:
if (ToolResponseParser.hasToolCalls(response)) {
  setIsExecutingTools(true);
  // ... execute tools ...
  setIsExecutingTools(false);
}

// In UI:
{isExecutingTools && (
  <div className="tool-execution-indicator">
    🔧 Querying your health data...
  </div>
)}
```

### End-to-End Tests

Create `e2e-tests/tool-use.test.ts`:

```typescript
describe("Tool Use E2E", () => {
  test("User asks about specific date range", async () => {
    const query = "Show me my heart rate from December 15-26";

    // Send to AI
    const response = await cosaintAi.generateResponse(query);

    // Verify AI used tools
    expect(response).toContain("heart rate");
    expect(response).toContain("December");

    // Verify specific data was returned (not just aggregates)
    expect(response).toMatch(/\d+ bpm/); // Should have actual values
  });

  test("User asks about correlations", async () => {
    const query = "When my steps are above 10,000, how is my sleep?";

    const response = await cosaintAi.generateResponse(query);

    expect(response).toContain("steps");
    expect(response).toContain("sleep");
    expect(response).toContain("correlation" || "relationship" || "pattern");
  });

  test("User asks about DEXA comparison", async () => {
    const query = "Compare my last two DEXA scans";

    const response = await cosaintAi.generateResponse(query);

    expect(response).toContain("body fat" || "visceral fat");
    expect(response).toContain("changed" || "improved" || "increased");
  });
});
```

---

## Phase 5: Storj Integration (Week 5)

### Goal

Extend data sources to include Storj for encrypted cloud storage.

### Files to Modify

#### 1. `src/data/sources/StorjDataSource.ts`

Complete implementation:

```typescript
async query(params: QueryParams): Promise<QueryResult> {
  // List relevant files from Storj by date range and type
  const fileRefs = await this.storjClient.listFiles(
    this.userAddress,
    this.encryptionKey,
    {
      dataType: params.dataType,
      dateRange: params.dateRange,
    }
  );

  // Download and decrypt files
  const dataPromises = fileRefs.map(async (ref) => {
    const result = await this.storageService.retrieveHealthData(
      ref.uri,
      this.encryptionKey,
      ref.contentHash,
      this.userAddress
    );
    return result.data;
  });

  const allData = await Promise.all(dataPromises);

  // Merge and filter data
  const mergedData = this.mergeData(allData, params);

  return {
    data: mergedData,
    metadata: {
      source: 'storj',
      queriedAt: new Date(),
      dateRange: params.dateRange || { start: new Date(0), end: new Date() },
      totalRecords: mergedData.length,
      returnedRecords: mergedData.length,
    },
  };
}
```

#### 2. `src/storage/StorjClient.ts`

Add file listing capability:

```typescript
async listFiles(
  userAddress: string,
  encryptionKey: WalletEncryptionKey,
  options: {
    dataType?: string;
    dateRange?: { start: Date; end: Date };
  }
): Promise<StorageReference[]> {
  // Query S3 for files matching criteria
  // Filter by metadata
}
```

#### 3. `src/services/CosaintAiService.ts`

Use HybridDataSource instead of IndexedDB only:

```typescript
// Create hybrid data source
const indexedDB = new IndexedDBDataSource();
const storj = new StorjDataSource(storageService, userAddress, encryptionKey);
const dataSource = new HybridDataSource(indexedDB, storj);

// Use in tool executor
const executor = new ToolExecutor(dataSource);
```

### Testing for Phase 5

```typescript
describe("Storj Integration", () => {
  test("queries historical data from Storj", async () => {
    const storj = new StorjDataSource(mockService, "addr", mockKey);

    const result = await storj.query({
      dataType: "apple-health",
      metrics: ["heartRate"],
      dateRange: {
        start: new Date("2024-01-01"),
        end: new Date("2024-01-31"),
      },
    });

    expect(result.metadata.source).toBe("storj");
    expect(result.data.length).toBeGreaterThan(0);
  });

  test("hybrid source splits query between IndexedDB and Storj", async () => {
    const hybrid = new HybridDataSource(indexedDB, storj);

    const result = await hybrid.query({
      dataType: "apple-health",
      metrics: ["heartRate"],
      dateRange: {
        start: new Date("2024-01-01"), // Historical - should use Storj
        end: new Date(), // Recent - should use IndexedDB
      },
    });

    expect(result.metadata.source).toBe("hybrid");
  });
});
```

---

## Testing Structure

### Unit Tests

```
src/
├── data/
│   └── sources/
│       └── __tests__/
│           ├── IndexedDBDataSource.test.ts
│           ├── StorjDataSource.test.ts
│           └── HybridDataSource.test.ts
├── ai/
│   └── tools/
│       └── __tests__/
│           ├── ToolExecutor.test.ts
│           ├── ToolResponseParser.test.ts
│           └── ToolDefinitions.test.ts
└── app/
    └── api/
        └── health/
            └── query/
                └── __tests__/
                    └── route.test.ts
```

### Integration Tests

```
tests/
└── integration/
    ├── data-source-integration.test.ts
    ├── tool-execution-flow.test.ts
    └── api-routes.test.ts
```

### End-to-End Tests

```
e2e-tests/
├── tool-use-queries.test.ts
├── storj-hybrid-queries.test.ts
└── correlation-analysis.test.ts
```

### Test Commands

Add to `package.json`:

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest --testPathPattern='__tests__'",
    "test:integration": "jest --testPathPattern='tests/integration'",
    "test:e2e": "jest --testPathPattern='e2e-tests'",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

---

## Performance Considerations

### Query Optimization

1. **Index commonly queried fields** in IndexedDB
2. **Cache Storj file listings** for 5-10 minutes
3. **Parallelize tool execution** when possible
4. **Limit result sets** with pagination

### Monitoring

1. **Log tool execution times**
2. **Track data source routing decisions**
3. **Monitor API endpoint latency**
4. **Alert on failed tool executions**

---

## Security Considerations

### Tool Execution

1. **Validate all tool parameters** before execution
2. **Rate limit tool executions** per user
3. **Sanitize tool results** before returning to AI
4. **Prevent infinite tool loops** (max 3 iterations)

### Data Access

1. **Verify user owns data** before querying
2. **Encrypt all Storj communications**
3. **Never log sensitive health data**
4. **Audit tool access patterns**

---

## Rollout Plan

### Week 1-2: Internal Testing

- Deploy to dev environment
- Test with your own health data
- Iterate on tool definitions

### Week 3-4: Beta Testing

- Enable for select users
- Collect feedback on tool usage
- Monitor performance and errors

### Week 5: Full Release

- Enable tools for all users
- Document tool capabilities
- Create user guide for complex queries

---

## Success Metrics

### User Experience

- % of queries that use tools
- Tool success rate (>95%)
- User satisfaction with specific date queries
- Reduction in "I don't have that data" responses

### Technical

- Average tool execution time (<2s)
- Cache hit rate for Storj (>80%)
- API error rate (<1%)
- Tool call parsing accuracy (>99%)

---

## Future Enhancements

### Phase 6: Advanced Analytics

- Add `statistical_analysis` tool (trends, anomalies)
- Add `predictive_analysis` tool (forecast future metrics)
- Add `goal_tracking` tool (progress toward health goals)

### Phase 7: Multi-Source Correlations

- CGM + Apple Health correlations
- Garmin + DEXA comparisons
- Bloodwork + continuous metrics

### Phase 8: Agentic Tool Discovery

- AI can request new tools dynamically
- User-defined custom queries
- Saved query templates

---

## Migration Path from Current System

### Backward Compatibility

- Keep existing coordinator/agent system
- Tools augment, don't replace
- Gradual rollout controlled by feature flag

### Feature Flag

```typescript
const ENABLE_TOOL_USE = process.env.NEXT_PUBLIC_ENABLE_TOOL_USE === "true";

if (ENABLE_TOOL_USE) {
  // Use new tool-based system
} else {
  // Use existing coordinator system
}
```

---

## Documentation

### For Users

Create `docs/USER_GUIDE.md`:

- What kinds of queries are supported
- Examples of complex queries
- How to ask about specific date ranges

### For Developers

Create `docs/DEVELOPER_GUIDE.md`:

- How to add new tools
- How to extend data sources
- Tool execution architecture

---

## Conclusion

This implementation plan transforms Cosaint from a passive AI into an **agentic system** that actively queries data on-demand. The tool-use architecture provides:

✅ **Flexibility**: No need to hardcode every query pattern
✅ **Extensibility**: Easy to add new data sources and tools
✅ **Performance**: Hybrid storage optimizes for speed and completeness
✅ **Maintainability**: Clean separation of concerns

**Total Timeline: 5 weeks**
**Estimated Effort: 120-150 hours**

Ready to start with Phase 1?
