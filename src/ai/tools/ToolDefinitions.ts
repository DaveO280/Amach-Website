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
          items: {
            type: "string",
            description: "String item",
          } as ParameterSchema,
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
            description: "Filter specification",
            properties: {
              metric: { type: "string", description: "Metric to filter on" },
              operator: {
                type: "string",
                description: "Comparison operator",
                enum: [">", "<", "=", ">=", "<=", "!=", "between"],
              } as ParameterSchema,
              value: {
                type: "number",
                description:
                  'Value to compare against. For "between", use array [min, max]',
              } as ParameterSchema,
            },
          } as ParameterSchema,
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
          items: {
            type: "string",
            description: "String item",
          } as ParameterSchema,
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
          items: {
            type: "string",
            description: "String item",
          } as ParameterSchema,
        },
        fields: {
          type: "array",
          description: "Specific fields to compare across reports",
          items: {
            type: "string",
            description: "String item",
          } as ParameterSchema,
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
                operator: {
                  type: "string",
                  description: "Comparison operator",
                  enum: [">", "<", ">=", "<="],
                } as ParameterSchema,
                value: {
                  type: "number",
                  description: "Value to compare against",
                } as ParameterSchema,
              },
            } as ParameterSchema,
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
            start: { type: "string", description: "Start date in ISO format" },
            end: { type: "string", description: "End date in ISO format" },
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
          items: {
            type: "string",
            description: "String item",
          } as ParameterSchema,
        },
      },
      required: [],
    },
  },
];

/**
 * Format tools for inclusion in AI system prompt
 */
export function formatToolsForPrompt(mode: "full" | "lite" = "full"): string {
  // Keep tool docs compact to avoid bloating prompt context.
  // The model only needs: tool names, parameter schema, and the tool-call format.
  let prompt = "\n\n## AVAILABLE TOOLS\n\n";
  prompt +=
    "Use tools to fetch data instead of asking the user to paste it. Call tools only when needed.\n\n";

  const stripDescriptions = (schema: unknown): unknown => {
    if (!schema || typeof schema !== "object") return schema;
    if (Array.isArray(schema)) return schema.map(stripDescriptions);
    const obj = schema as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "description") continue;
      out[k] = stripDescriptions(v);
    }
    return out;
  };

  for (const tool of HEALTH_QUERY_TOOLS) {
    const firstLine = tool.description.split("\n")[0]?.trim() || tool.name;
    prompt += `### ${tool.name}\n`;
    prompt += `${firstLine}\n`;

    if (mode === "full") {
      prompt += "Parameters:\n";
      prompt += "```json\n";
      prompt += JSON.stringify(stripDescriptions(tool.parameters), null, 2);
      prompt += "\n```\n\n";
    }
  }

  prompt += "## TOOL CALL FORMAT\n\n";
  prompt +=
    "When you need data, respond with ONLY a JSON object in this exact format:\n\n";
  prompt += "```json\n";
  prompt += `{"tool":"query_timeseries_metrics","params":{"metrics":["hrv"],"dateRange":{"start":"2024-12-01","end":"2024-12-31"},"groupBy":"day","aggregation":"avg"}}`;
  prompt += "\n```\n\n";
  prompt +=
    "After tool results are returned, write the final user-facing answer in plain language.\n";

  return prompt;
}
