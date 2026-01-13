/**
 * IndexedDB implementation of DataSource interface
 * Fast local queries for recent data
 */

import {
  DataSource,
  QueryParams,
  QueryResult,
  QueryFilter,
  TimeSeriesData,
  ReportData,
} from "./DataSourceInterface";
import { healthDataProcessor } from "../processors/HealthDataProcessor";
import { healthDataStore } from "../store/healthDataStore";
import { normalizeToAppleId, toMetricName } from "../utils/metricNameMapping";

export class IndexedDBDataSource implements DataSource {
  name = "indexeddb";

  async query(params: QueryParams): Promise<QueryResult> {
    console.log("[IndexedDBDataSource] Querying:", params);

    if (params.dataType === "apple-health") {
      return this.queryTimeSeries(params);
    } else if (params.dataType === "dexa" || params.dataType === "bloodwork") {
      return this.queryReports(params);
    }

    throw new Error(`Unsupported data type: ${params.dataType}`);
  }

  private async queryTimeSeries(params: QueryParams): Promise<QueryResult> {
    // Try to get data from HealthDataProcessor (processed/aggregated data)
    let rawData = healthDataProcessor.getDataForHealthScores({
      startDate: params.dateRange?.start,
      endDate: params.dateRange?.end,
    });

    // If processor has no data, fall back to raw data from store
    const availableMetrics = Object.keys(rawData);
    if (availableMetrics.length === 0) {
      console.log(
        "[IndexedDBDataSource] Processor has no data, falling back to raw store data",
      );
      const rawStoreData = await healthDataStore.getHealthData();
      if (rawStoreData) {
        // Convert HealthDataResults format to HealthDataByType format
        // Also filter by date range if specified
        const filteredData: typeof rawData = {};
        for (const [metricType, metrics] of Object.entries(rawStoreData)) {
          const filtered = metrics.filter((metric) => {
            const metricDate = new Date(metric.startDate);
            if (params.dateRange?.start && metricDate < params.dateRange.start)
              return false;
            if (params.dateRange?.end && metricDate > params.dateRange.end)
              return false;
            return true;
          });
          if (filtered.length > 0) {
            filteredData[metricType] = filtered.map((m) => ({
              startDate: m.startDate,
              endDate: m.endDate,
              value: m.value,
              unit: m.unit,
              source: m.source,
              device: m.device,
              type: m.type,
            }));
          }
        }
        rawData = filteredData;
        console.log(
          "[IndexedDBDataSource] Loaded and filtered raw data from store:",
          {
            metrics: Object.keys(rawData),
            totalPoints: Object.values(rawData).reduce(
              (sum, arr) => sum + arr.length,
              0,
            ),
          },
        );
      }
    }

    // Log available metrics for debugging
    const finalAvailableMetrics = Object.keys(rawData);
    console.log(
      "[IndexedDBDataSource] Available metrics:",
      finalAvailableMetrics,
    );
    console.log("[IndexedDBDataSource] Date range:", {
      start: params.dateRange?.start?.toISOString(),
      end: params.dateRange?.end?.toISOString(),
    });
    console.log("[IndexedDBDataSource] Raw data sample:", {
      metricCount: finalAvailableMetrics.length,
      sampleMetrics: finalAvailableMetrics.slice(0, 5).map((key) => ({
        key,
        dataPointCount: rawData[key]?.length || 0,
        firstPoint: rawData[key]?.[0]
          ? {
              startDate: rawData[key][0].startDate,
              value: rawData[key][0].value,
              unit: rawData[key][0].unit,
            }
          : null,
      })),
    });

    // Normalize metric names: convert user-friendly names to Apple Health IDs
    let relevantMetrics: string[];
    if (params.metrics && params.metrics.length > 0) {
      relevantMetrics = params.metrics.map(normalizeToAppleId);
      console.log("[IndexedDBDataSource] Normalized metrics:", {
        original: params.metrics,
        normalized: relevantMetrics,
      });

      // Check if any requested metrics are missing from processor data
      const missingMetrics = relevantMetrics.filter(
        (m) => !finalAvailableMetrics.includes(m),
      );
      if (missingMetrics.length > 0) {
        console.log(
          "[IndexedDBDataSource] Missing metrics in processor, trying raw store:",
          missingMetrics,
        );
        // Try to get missing metrics from raw store
        const rawStoreData = await healthDataStore.getHealthData();
        if (rawStoreData) {
          for (const missingMetric of missingMetrics) {
            if (rawStoreData[missingMetric]) {
              // Filter by date range if specified
              let filtered = rawStoreData[missingMetric];
              if (params.dateRange) {
                filtered = filtered.filter((metric) => {
                  const metricDate = new Date(metric.startDate);
                  if (
                    params.dateRange?.start &&
                    metricDate < params.dateRange.start
                  )
                    return false;
                  if (
                    params.dateRange?.end &&
                    metricDate > params.dateRange.end
                  )
                    return false;
                  return true;
                });
              }

              if (filtered.length > 0) {
                // Convert to the format expected by the rest of the code
                rawData[missingMetric] = filtered.map((m) => ({
                  startDate: m.startDate,
                  endDate: m.endDate,
                  value: m.value,
                  unit: m.unit,
                  source: m.source,
                  device: m.device,
                  type: m.type,
                }));
                console.log(
                  `[IndexedDBDataSource] Found ${filtered.length} data points for ${missingMetric} in raw store`,
                );
              }
            }
          }
          // Update final available metrics
          finalAvailableMetrics.push(
            ...Object.keys(rawData).filter(
              (k) => !finalAvailableMetrics.includes(k),
            ),
          );
        }
      }
    } else {
      relevantMetrics = Object.keys(rawData);
    }

    // Log what we're about to query
    console.log("[IndexedDBDataSource] Querying metrics:", {
      requested: relevantMetrics,
      available: finalAvailableMetrics,
      willFind: relevantMetrics.filter((m) =>
        finalAvailableMetrics.includes(m),
      ),
      willMiss: relevantMetrics.filter(
        (m) => !finalAvailableMetrics.includes(m),
      ),
    });

    const timeSeriesData: TimeSeriesData[] = [];
    const metricStats: Record<
      string,
      { total: number; filtered: number; added: number }
    > = {};

    for (const appleId of relevantMetrics) {
      if (!rawData[appleId]) {
        console.warn(`[IndexedDBDataSource] Metric not found: ${appleId}`, {
          requested: appleId,
          available: finalAvailableMetrics,
          suggestion:
            finalAvailableMetrics.find((m) =>
              m
                .toLowerCase()
                .includes(
                  appleId.toLowerCase().split("Identifier")[1]?.toLowerCase() ||
                    "",
                ),
            ) || "none",
        });
        continue;
      }

      const userFriendlyName = toMetricName(appleId);
      const totalPoints = rawData[appleId].length;
      let filteredCount = 0;
      let addedCount = 0;

      for (const point of rawData[appleId]) {
        const value = parseFloat(point.value);
        if (isNaN(value)) {
          filteredCount++;
          continue;
        }

        // Apply filters (filters may use user-friendly names, so normalize them too)
        if (
          params.filters &&
          !this.matchesFilters(value, params.filters, appleId)
        ) {
          filteredCount++;
          continue;
        }

        timeSeriesData.push({
          date: new Date(point.startDate),
          metric: userFriendlyName, // Use user-friendly name in response
          value,
          unit: point.unit || "unknown",
        });
        addedCount++;
      }

      metricStats[userFriendlyName] = {
        total: totalPoints,
        filtered: filteredCount,
        added: addedCount,
      };
    }

    // Log detailed statistics for each metric
    console.log("[IndexedDBDataSource] Metric statistics:", metricStats);
    console.log(
      "[IndexedDBDataSource] Total time-series data points:",
      timeSeriesData.length,
    );

    // Log date range of actual data
    if (timeSeriesData.length > 0) {
      const dates = timeSeriesData.map((d) => d.date.getTime());
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      console.log("[IndexedDBDataSource] Data date range:", {
        earliest: minDate.toISOString().split("T")[0],
        latest: maxDate.toISOString().split("T")[0],
        days: Math.ceil(
          (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24),
        ),
      });
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
    const reports = await healthDataStore.getAllUploadedFiles();

    // Filter by report type
    const relevantReports = reports.filter((file) => {
      if (
        params.dataType === "dexa" &&
        !file.fileType.toLowerCase().includes("dexa")
      )
        return false;
      if (
        params.dataType === "bloodwork" &&
        !file.fileType.toLowerCase().includes("blood")
      )
        return false;
      return true;
    });

    // Parse and structure report data
    const reportData: ReportData[] = relevantReports.map((report) => {
      let parsedContent: Record<string, unknown> = {};
      try {
        parsedContent = JSON.parse(report.parsedContent);
      } catch {
        // If not JSON, treat as plain text
        parsedContent = { raw: report.parsedContent };
      }

      // Extract requested fields if specified
      const fields = params.reportFields
        ? Object.fromEntries(
            params.reportFields
              .filter((field) => field in parsedContent)
              .map((field) => [field, parsedContent[field]]),
          )
        : parsedContent;

      return {
        reportType: (params.dataType === "dexa" ? "dexa" : "bloodwork") as
          | "dexa"
          | "bloodwork",
        reportDate: new Date(report.uploadedAt),
        fields,
        rawData: parsedContent,
      };
    });

    // Filter by reportType if specified
    let filteredReports = reportData;
    if (params.reportType === "latest") {
      filteredReports = reportData.length > 0 ? [reportData[0]] : [];
    } else if (params.reportType === "within-range" && params.dateRange) {
      filteredReports = reportData.filter((report) => {
        const reportDate = report.reportDate;
        return (
          reportDate >= params.dateRange!.start &&
          reportDate <= params.dateRange!.end
        );
      });
    }

    // Apply limit/offset
    const paginatedData = filteredReports.slice(
      params.offset || 0,
      (params.offset || 0) + (params.limit || filteredReports.length),
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
        totalRecords: filteredReports.length,
        returnedRecords: paginatedData.length,
      },
    };
  }

  private matchesFilters(
    value: number,
    filters: QueryFilter[],
    appleId: string,
  ): boolean {
    return filters.every((filter) => {
      // Normalize filter field name (may be user-friendly or Apple ID)
      const normalizedFilterField = normalizeToAppleId(filter.field);
      const userFriendlyName = toMetricName(appleId);

      // Check if filter applies to this metric
      // Filter field can be: user-friendly name, Apple ID, or 'value'
      if (
        normalizedFilterField !== appleId &&
        filter.field !== userFriendlyName &&
        filter.field !== "value"
      ) {
        return true; // Filter doesn't apply to this metric
      }

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
      const key = this.getGroupKey(point.date, groupBy, point.metric);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(point);
    }

    // Aggregate each group
    return Array.from(groups.values()).map((points) => {
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
        default:
          aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
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

  private getGroupKey(date: Date, groupBy: string, metric: string): string {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const hour = date.getHours();

    switch (groupBy) {
      case "hour":
        return `${metric}_${year}-${month}-${day}-${hour}`;
      case "day":
        return `${metric}_${year}-${month}-${day}`;
      case "week":
        const weekNum = Math.floor(day / 7);
        return `${metric}_${year}-${month}-W${weekNum}`;
      case "month":
        return `${metric}_${year}-${month}`;
      default:
        return `${metric}_${date.toISOString()}`;
    }
  }

  async getDateRange(
    dataType: string,
  ): Promise<{ start: Date; end: Date } | null> {
    if (dataType === "apple-health") {
      return healthDataProcessor.getDateRange();
    }
    // For reports, we'd need to check uploaded files
    return null;
  }

  async getAvailableMetrics(dataType: string): Promise<string[]> {
    if (dataType === "apple-health") {
      const data = healthDataProcessor.getDataForHealthScores();
      // Return user-friendly names instead of Apple Health IDs
      return Object.keys(data).map(toMetricName);
    }
    return [];
  }

  async hasData(params: Partial<QueryParams>): Promise<boolean> {
    if (params.dataType === "apple-health") {
      return healthDataProcessor.hasData();
    }
    if (params.dataType === "dexa" || params.dataType === "bloodwork") {
      const files = await healthDataStore.getAllUploadedFiles();
      return files.some((file) => {
        if (params.dataType === "dexa") {
          return file.fileType.toLowerCase().includes("dexa");
        }
        return file.fileType.toLowerCase().includes("blood");
      });
    }
    return false;
  }
}
