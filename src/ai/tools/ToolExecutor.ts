/**
 * Executes tool calls from the AI
 * Routes to appropriate data source and returns results
 */

import { DataSource } from "../../data/sources/DataSourceInterface";
import { HEALTH_QUERY_TOOLS } from "./ToolDefinitions";
import type { QueryFilter } from "../../data/sources/DataSourceInterface";

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
    console.log(
      "[ToolExecutor] Tool call parameters:",
      JSON.stringify(toolCall.params, null, 2),
    );

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

  private async handleQueryTimeseries(
    params: Record<string, unknown>,
  ): Promise<import("../../data/sources/DataSourceInterface").QueryResult> {
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
        operator: f.operator as QueryFilter["operator"],
        value: f.value,
      })),
      groupBy: params.groupBy as "hour" | "day" | "week" | "month" | undefined,
      aggregation: params.aggregation as
        | "avg"
        | "min"
        | "max"
        | "sum"
        | "count"
        | undefined,
    });
  }

  private async handleGetLatestReport(
    params: Record<string, unknown>,
  ): Promise<{
    reportType: "dexa" | "bloodwork";
    reportDate: Date;
    fields: Record<string, unknown>;
    rawData: unknown;
  } | null> {
    const result = await this.dataSource.query({
      dataType: params.reportType as "dexa" | "bloodwork",
      reportType: "latest",
      reportFields: params.fields as string[],
    });

    // Return the most recent report (data will be ReportData[])
    if (result.data.length === 0) return null;

    // Type guard to ensure it's ReportData
    const firstItem = result.data[0];
    if ("reportType" in firstItem && "reportDate" in firstItem) {
      return firstItem;
    }

    return null;
  }

  private async handleCompareReports(params: Record<string, unknown>): Promise<
    Array<{
      reportType: "dexa" | "bloodwork";
      reportDate: Date;
      fields: Record<string, unknown>;
      rawData: unknown;
    }>
  > {
    const dates = params.dates as string[];
    const fields = params.fields as string[];

    if (dates && dates.includes("all")) {
      // Get all reports
      const result = await this.dataSource.query({
        dataType: params.reportType as "dexa" | "bloodwork",
        reportType: "all",
        reportFields: fields,
      });
      // Type assertion: reports query always returns ReportData[]
      return result.data as Array<{
        reportType: "dexa" | "bloodwork";
        reportDate: Date;
        fields: Record<string, unknown>;
        rawData: unknown;
      }>;
    } else if (dates && dates.length > 0) {
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

      // All reports should be ReportData, type assert since we know these are report queries
      const allReports: Array<{
        reportType: "dexa" | "bloodwork";
        reportDate: Date;
        fields: Record<string, unknown>;
        rawData: unknown;
      }> = reports.flatMap(
        (r) =>
          r.data as Array<{
            reportType: "dexa" | "bloodwork";
            reportDate: Date;
            fields: Record<string, unknown>;
            rawData: unknown;
          }>,
      );
      return allReports;
    } else {
      // Get all reports if no dates specified
      const result = await this.dataSource.query({
        dataType: params.reportType as "dexa" | "bloodwork",
        reportType: "all",
        reportFields: fields,
      });
      // Type assertion: reports query always returns ReportData[]
      return result.data as Array<{
        reportType: "dexa" | "bloodwork";
        reportDate: Date;
        fields: Record<string, unknown>;
        rawData: unknown;
      }>;
    }
  }

  private async handleFindCorrelations(
    params: Record<string, unknown>,
  ): Promise<{
    primaryMetric: string;
    secondaryMetric: string;
    correlation: number;
    primaryAvg: number;
    secondaryAvg: number;
    dataPoints: number;
  }> {
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
              operator: primary.filter.operator as QueryFilter["operator"],
              value: primary.filter.value,
            },
          ]
        : undefined,
    });

    // Query secondary metric for matching dates
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

    // Calculate correlation - ensure we have TimeSeriesData
    // Type assertion: apple-health queries always return TimeSeriesData[]
    const primaryTimeSeries = primaryData.data as Array<{
      date: Date;
      value: number;
      metric: string;
      unit: string;
    }>;
    const secondaryTimeSeries = secondaryData.data as Array<{
      date: Date;
      value: number;
      metric: string;
      unit: string;
    }>;

    const correlation = this.calculateCorrelation(
      primaryTimeSeries,
      secondaryTimeSeries,
    );

    return {
      primaryMetric: primary.metric,
      secondaryMetric: secondary.metric,
      correlation,
      primaryAvg: this.average(primaryTimeSeries.map((d) => d.value)),
      secondaryAvg: this.average(secondaryTimeSeries.map((d) => d.value)),
      dataPoints: primaryData.data.length,
    };
  }

  private async handleGetDataSummary(
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
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

  private calculateCorrelation(
    data1: Array<{ date: Date; value: number }>,
    data2: Array<{ date: Date; value: number }>,
  ): number {
    // Simple Pearson correlation
    if (data1.length === 0 || data2.length === 0) return 0;

    // Match data points by date (same day)
    const data1ByDate = new Map<string, number>();
    for (const d of data1) {
      const dateKey = d.date.toISOString().split("T")[0];
      data1ByDate.set(dateKey, d.value);
    }

    const matchedPairs: Array<[number, number]> = [];
    for (const d of data2) {
      const dateKey = d.date.toISOString().split("T")[0];
      const value1 = data1ByDate.get(dateKey);
      if (value1 !== undefined) {
        matchedPairs.push([value1, d.value]);
      }
    }

    if (matchedPairs.length === 0) return 0;

    const values1 = matchedPairs.map((p) => p[0]);
    const values2 = matchedPairs.map((p) => p[1]);

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

    if (denom1 === 0 || denom2 === 0) return 0;

    return numerator / (denom1 * denom2);
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private validateParams(
    params: Record<string, unknown>,
    schema: { required?: string[] },
  ): void {
    // Basic validation - check required fields exist
    for (const required of schema.required || []) {
      if (!(required in params)) {
        throw new Error(`Missing required parameter: ${required}`);
      }
    }
  }
}
