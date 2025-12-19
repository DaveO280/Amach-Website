// src/services/CosaintAiService.ts
import type { CoordinatorResult } from "@/agents/CoordinatorAgent";
import type { ParsedReportSummary } from "@/types/reportData";
import {
  calculateAgeFromBirthDate,
  type NormalizedUserProfile,
} from "@/utils/userProfileUtils";
import { randomChoice } from "@/utils/utils";
import { VeniceApiService } from "../api/venice/VeniceApiService";
import CharacteristicsLoader from "../components/ai/characteristicsLoader";
import cosaintCharacteristics from "../components/ai/cosaint";
import type { HealthContextMetrics } from "../types/HealthContext";
import type { HealthDataByType } from "../types/healthData";
import { logger } from "../utils/logger";
import { runCoordinatorAnalysis } from "./CoordinatorService";
import {
  type HealthMetric,
  type UserContext,
  rankMetricsByRelevance,
  getTopRelevant,
} from "@/ai/RelevanceScorer";
import {
  getRecommendedAnalysisMode,
  updateAnalysisState,
} from "@/utils/analysisState";
import {
  diagnoseAnalysisResult,
  logAnalysisDiagnostics,
} from "@/utils/analysisDiagnostics";
import { isCumulativeMetric } from "@/utils/dataDeduplicator";
import { extractDatePart } from "@/utils/dataDeduplicator";

const RESPONSE_FORMAT_GUIDELINES = `

Be informative and analytical. Weave metrics into flowing, detailed sentences that explain context and significance. Compare their numbers to age/sex norms to show what's working well or needs attention. Connect how different metrics influence each other. Stay measured and grounded in the data—let the numbers speak for themselves without excessive enthusiasm.
`;
export class CosaintAiService {
  private veniceApi: VeniceApiService;
  private characteristics: CharacteristicsLoader;

  constructor(veniceApi: VeniceApiService) {
    this.veniceApi = veniceApi;
    this.characteristics = new CharacteristicsLoader(cosaintCharacteristics);
  }

  /**
   * Convert HealthDataByType to HealthMetric[] format for relevance scoring
   */
  private convertToHealthMetrics(
    metricData?: HealthDataByType,
  ): HealthMetric[] {
    if (!metricData) return [];

    const metrics: HealthMetric[] = [];

    // Convert each metric type to HealthMetric format
    Object.entries(metricData).forEach(([type, dataPoints]) => {
      if (!dataPoints || !Array.isArray(dataPoints)) return;

      dataPoints.forEach((point) => {
        // Parse value to number (it's stored as string in HealthDataPoint)
        const numValue = parseFloat(point.value);
        if (isNaN(numValue)) return;

        // Use startDate as timestamp (convert ISO string to timestamp)
        const timestamp = new Date(point.startDate).getTime();

        metrics.push({
          type,
          value: numValue,
          unit: point.unit || "",
          timestamp,
          startDate: point.startDate, // Preserve for sleep duration analysis
          endDate: point.endDate, // Preserve for sleep duration analysis
        });
      });
    });

    return metrics;
  }

  /**
   * Build UserContext from user profile and conversation history
   */
  private buildUserContext(
    userProfile?: NormalizedUserProfile,
    conversationHistory?: Array<{
      role: "user" | "assistant";
      content: string;
    }>,
  ): UserContext {
    // Extract goals and conditions from conversation history
    const goals: string[] = [];
    const conditions: string[] = [];
    const recentQueries: string[] = [];

    conversationHistory?.forEach((msg) => {
      if (msg.role === "user") {
        const content = msg.content.toLowerCase();
        recentQueries.push(content);

        // Simple keyword matching to extract goals
        if (content.includes("want to") || content.includes("goal")) {
          goals.push(msg.content);
        }
        // Extract conditions
        if (
          content.includes("diagnosed") ||
          content.includes("condition") ||
          content.includes("illness")
        ) {
          conditions.push(msg.content);
        }
      }
    });

    return {
      age: userProfile?.age,
      sex: userProfile?.sex as "male" | "female" | undefined,
      weight: userProfile?.weightLbs || userProfile?.weightKg,
      height: userProfile?.heightIn || userProfile?.heightCm,
      goals: goals.length > 0 ? goals : undefined,
      conditions: conditions.length > 0 ? conditions : undefined,
      recentQueries: recentQueries.slice(-5), // Keep last 5 queries
    };
  }

  /**
   * Generate a response to a user message, incorporating health data if available
   */
  async generateResponse(
    userMessage: string,
    conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
    healthData?: HealthContextMetrics,
  ): Promise<string> {
    try {
      // Log health data status
      console.log("[CosaintAiService] Health data received:", {
        hasHealthData: Boolean(healthData),
        availableMetrics: healthData ? Object.keys(healthData) : [],
      });

      // Create the prompt using the character's characteristics
      const prompt = this.createPrompt(
        userMessage,
        conversationHistory,
        healthData,
      );

      // Log the prompt for debugging (you can remove this in production)
      console.log(
        "[CosaintAiService] Generated prompt:",
        prompt.substring(0, 500) + "...",
        "Total length:",
        prompt.length,
      );

      // Generate a response using the Venice API
      const response = await this.veniceApi.generateVeniceResponse(
        prompt,
        1000,
      );

      if (!response) {
        logger.warn("Empty response from Venice API", { userMessage });
        return this.getFallbackResponse(userMessage);
      }

      return response;
    } catch (error) {
      logger.error("Error generating AI response", {
        error: error instanceof Error ? error.message : String(error),
        userMessage,
      });
      return this.getFallbackResponse(userMessage);
    }
  }

  /**
   * Generate a response to a user message, incorporating health data and uploaded files if available
   */
  async generateResponseWithFiles(
    userMessage: string,
    conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
    healthData?: HealthContextMetrics,
    uploadedFiles?: Array<{
      summary: string;
      rawData?: Record<string, unknown>;
    }>,
    userProfile?: NormalizedUserProfile,
    metricData?: HealthDataByType,
    useMultiAgent: boolean = true,
    reports?: ParsedReportSummary[],
    forceInitialAnalysis: boolean = false,
  ): Promise<string> {
    try {
      // Log health data and file status
      console.log("[CosaintAiService] Health data received:", {
        hasHealthData: Boolean(healthData),
        availableMetrics: healthData ? Object.keys(healthData) : [],
        uploadedFilesCount: uploadedFiles?.length || 0,
        uploadedFiles: uploadedFiles?.map((f) => ({
          summary: f.summary,
          hasRawData: !!f.rawData,
        })),
        userProfile,
        structuredReportCount: reports?.length ?? 0,
      });

      // Convert and rank health metrics by relevance
      let rankedMetrics: HealthMetric[] = [];
      let allHealthMetrics: HealthMetric[] = []; // Keep all metrics for date range calculation
      if (metricData && Object.keys(metricData).length > 0) {
        const rawMetrics = this.convertToHealthMetrics(metricData);
        // Deep clone all metrics to break any circular references
        allHealthMetrics = rawMetrics.map((metric) => {
          try {
            return JSON.parse(JSON.stringify(metric));
          } catch {
            // If JSON stringify fails, return a safe minimal version
            return {
              type: metric.type,
              value: metric.value,
              timestamp: metric.timestamp,
              unit: metric.unit,
              startDate: metric.startDate,
              endDate: metric.endDate,
            };
          }
        });
        const userContext = this.buildUserContext(
          userProfile,
          conversationHistory,
        );

        console.log("[CosaintAiService] Ranking metrics by relevance:", {
          totalMetrics: allHealthMetrics.length,
          userContext: {
            hasGoals: Boolean(userContext.goals?.length),
            hasConditions: Boolean(userContext.conditions?.length),
            hasRecentQueries: Boolean(userContext.recentQueries?.length),
          },
        });

        // Rank metrics by relevance
        const ranked = rankMetricsByRelevance(allHealthMetrics, userContext);

        // Get top 100 most relevant metrics (reduce context size while keeping quality)
        // Deep clone to break any circular references
        rankedMetrics = getTopRelevant(ranked, 100).map((rm) => {
          try {
            // Deep clone the metric to break circular references
            return JSON.parse(JSON.stringify(rm.metric));
          } catch {
            // If JSON stringify fails, return a safe minimal version
            return {
              type: rm.metric.type,
              value: rm.metric.value,
              timestamp: rm.metric.timestamp,
              unit: rm.metric.unit,
              startDate: rm.metric.startDate,
              endDate: rm.metric.endDate,
            };
          }
        });

        console.log("[CosaintAiService] Ranked metrics:", {
          topMetricsCount: rankedMetrics.length,
          topMetricTypes: [
            ...new Set(rankedMetrics.slice(0, 10).map((m) => m.type)),
          ],
        });
      }

      let coordinatorResult: CoordinatorResult | null = null;
      if (
        useMultiAgent &&
        ((metricData && Object.keys(metricData).length > 0) || reports?.length)
      ) {
        try {
          // Calculate data range for analysis mode detection
          let dataRange: { start: Date; end: Date } | undefined;
          if (metricData && Object.keys(metricData).length > 0) {
            let earliest: number | null = null;
            let latest: number | null = null;

            for (const points of Object.values(metricData)) {
              for (const point of points) {
                if (point?.startDate) {
                  const timestamp = new Date(point.startDate).getTime();
                  if (!Number.isNaN(timestamp)) {
                    if (earliest === null || timestamp < earliest) {
                      earliest = timestamp;
                    }
                    if (latest === null || timestamp > latest) {
                      latest = timestamp;
                    }
                  }
                }
              }
            }

            if (earliest !== null && latest !== null) {
              dataRange = {
                start: new Date(earliest),
                end: new Date(latest),
              };
            }
          }

          // Determine analysis mode using auto-detection or force flag
          const analysisMode = getRecommendedAnalysisMode(
            dataRange,
            forceInitialAnalysis,
          );

          console.log("[CosaintAiService] Analysis mode determined:", {
            mode: analysisMode,
            forceInitial: forceInitialAnalysis,
            dataRange: dataRange
              ? {
                  start: dataRange.start.toISOString(),
                  end: dataRange.end.toISOString(),
                  days:
                    (dataRange.end.getTime() - dataRange.start.getTime()) /
                    (1000 * 60 * 60 * 24),
                }
              : null,
          });

          coordinatorResult = await runCoordinatorAnalysis({
            metricData,
            profile: userProfile,
            reports,
            conversationHistory,
            veniceService: this.veniceApi,
            analysisMode,
          });

          // Log diagnostics for debugging
          if (coordinatorResult) {
            const metricCount = metricData ? Object.keys(metricData).length : 0;
            const reportCount = reports?.length ?? 0;
            const diagnostics = diagnoseAnalysisResult(
              coordinatorResult,
              metricCount,
              reportCount,
            );
            if (diagnostics) {
              logAnalysisDiagnostics(diagnostics);
            }

            // Update analysis state after successful analysis
            if (dataRange) {
              updateAnalysisState(analysisMode, dataRange);
              console.log("[CosaintAiService] Analysis state updated:", {
                mode: analysisMode,
                date: new Date().toISOString(),
              });
            }
          } else {
            console.warn(
              "[CosaintAiService] Coordinator analysis returned null",
              {
                hasMetricData: Boolean(
                  metricData && Object.keys(metricData).length > 0,
                ),
                hasReports: Boolean(reports && reports.length > 0),
              },
            );
          }
        } catch (coordinatorError) {
          console.warn(
            "[CosaintAiService] Coordinator analysis failed:",
            coordinatorError,
          );
        }
      }

      // Create the prompt using the character's characteristics and context
      const prompt = this.createPromptWithFiles(
        userMessage,
        conversationHistory,
        healthData,
        uploadedFiles,
        userProfile,
        coordinatorResult,
        reports,
        rankedMetrics,
        allHealthMetrics, // Pass all metrics for accurate date range calculation
      );

      // Log the prompt for debugging (you can remove this in production)
      console.log(
        "[CosaintAiService] Generated prompt (first 500 chars):",
        prompt.substring(0, 500) + "...",
      );
      console.log("[CosaintAiService] FULL PROMPT LENGTH:", prompt.length);
      console.log("[CosaintAiService] FULL PROMPT:", prompt);

      // Generate a response using the Venice API
      // Note: Qwen models use more tokens for internal reasoning, so we need higher limits
      console.log("[CosaintAiService] Calling Venice API", {
        promptLength: prompt.length,
        maxTokens: 4000,
        userMessage: userMessage.substring(0, 100),
      });

      const response = await this.veniceApi.generateVeniceResponse(
        prompt,
        4000, // High token limit for Qwen's thinking + response with multi-agent context
      );

      console.log("[CosaintAiService] Venice API response received", {
        hasResponse: Boolean(response),
        responseLength: response?.length || 0,
        responsePreview: response?.substring(0, 200),
        isEmptyString: response === "",
        isNull: response === null,
        isUndefined: response === undefined,
      });

      if (!response) {
        console.warn(
          "⚠️ [CosaintAiService] Empty response from Venice API - returning fallback",
          { userMessage: userMessage.substring(0, 100) },
        );
        logger.warn("Empty response from Venice API", { userMessage });
        return this.getFallbackResponse(userMessage);
      }

      console.log("✅ [CosaintAiService] Returning successful response");
      return response;
    } catch (error) {
      console.error("❌ [CosaintAiService] Error generating AI response:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userMessage: userMessage.substring(0, 100),
      });
      logger.error("Error generating AI response", {
        error: error instanceof Error ? error.message : String(error),
        userMessage,
      });
      return this.getFallbackResponse(userMessage);
    }
  }

  /**
   * Create a prompt for the Venice API based on user message and context
   */
  private createPrompt(
    userMessage: string,
    conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
    healthData?: HealthContextMetrics,
    userProfile?: NormalizedUserProfile,
  ): string {
    // Build the system message including character background and health data context
    const systemMessage = this.buildSystemMessage(healthData, userProfile);

    // Format the conversation history
    const formattedHistory =
      this.formatConversationHistory(conversationHistory);

    // Combine everything into a single prompt
    return `${systemMessage}

${formattedHistory}

User: ${userMessage}

Please provide a helpful response as Cosaint, keeping in mind the user's health data if available. Your response should be friendly, empathetic and evidence-informed.`;
  }

  /**
   * Create a prompt for the Venice API based on user message, context, and uploaded files
   */
  private createPromptWithFiles(
    userMessage: string,
    conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
    healthData?: HealthContextMetrics,
    uploadedFiles?: Array<{
      summary: string;
      rawData?: Record<string, unknown>;
    }>,
    userProfile?: NormalizedUserProfile,
    coordinatorResult?: CoordinatorResult | null,
    reports?: ParsedReportSummary[],
    rankedMetrics?: HealthMetric[],
    allMetrics?: HealthMetric[], // All metrics for accurate date range calculation
  ): string {
    // Build the system message including character background, health data, file context, and user profile
    let systemMessage = this.buildSystemMessage(healthData, userProfile);
    systemMessage +=
      "\n\nFollow-up instruction: Always address the user's latest question or concern first, use the conversation history to avoid repeating full introductions or already acknowledged profile details, and consolidate duplicate findings instead of listing the same metric multiple times.";

    // Add relevance-ranked metrics if available AND we don't have coordinator results
    // (If we have coordinator results, the agents already analyzed the data properly with tiered aggregation)
    if (rankedMetrics && rankedMetrics.length > 0 && !coordinatorResult) {
      systemMessage +=
        "\n\n📊 Top Relevant Health Metrics (AI-scored by importance):";

      // Group ranked metrics by type for relevance display
      const rankedMetricsByType = rankedMetrics.reduce(
        (acc, metric) => {
          if (!acc[metric.type]) acc[metric.type] = [];
          acc[metric.type].push(metric);
          return acc;
        },
        {} as Record<string, HealthMetric[]>,
      );

      // Use all metrics (not just ranked) for accurate date range calculation
      const allMetricsByType = (allMetrics || rankedMetrics).reduce(
        (acc, metric) => {
          if (!acc[metric.type]) acc[metric.type] = [];
          acc[metric.type].push(metric);
          return acc;
        },
        {} as Record<string, HealthMetric[]>,
      );

      // Show top 5 metric types with aggregated information
      Object.entries(rankedMetricsByType)
        .slice(0, 5)
        .forEach(([type, rankedTypeMetrics]) => {
          if (rankedTypeMetrics.length === 0) return;

          // Get all metrics of this type for accurate date range
          const allTypeMetrics = allMetricsByType[type] || rankedTypeMetrics;

          // Check if this is a cumulative metric (steps, active energy, exercise time)
          const isCumulative = isCumulativeMetric(type);

          let avg: number | null = null;
          let min: number | null = null;
          let max: number | null = null;

          if (isCumulative) {
            // For cumulative metrics, aggregate by day first (sum per day), then average daily totals
            const dailyTotals = new Map<string, number>();

            for (const metric of allTypeMetrics) {
              try {
                // Safely extract date - use timestamp if startDate not available
                const dateStr =
                  metric.startDate || new Date(metric.timestamp).toISOString();
                const dateKey = extractDatePart(dateStr);
                const currentTotal = dailyTotals.get(dateKey) || 0;
                dailyTotals.set(dateKey, currentTotal + metric.value);
              } catch (e) {
                // Skip invalid dates
                console.warn(`[CosaintAiService] Invalid date for metric:`, e);
                continue;
              }
            }

            const dailyValues = Array.from(dailyTotals.values());
            if (dailyValues.length > 0) {
              avg =
                dailyValues.reduce((sum, v) => sum + v, 0) / dailyValues.length;
              min = Math.min(...dailyValues);
              max = Math.max(...dailyValues);
            }
          } else {
            // For non-cumulative metrics (heart rate, HRV, etc.), average individual readings
            const values = allTypeMetrics
              .map((m) => m.value)
              .filter((v) => !isNaN(v));
            if (values.length > 0) {
              avg = values.reduce((sum, v) => sum + v, 0) / values.length;
              min = Math.min(...values);
              max = Math.max(...values);
            }
          }

          // Calculate date range from ALL metrics of this type (not just ranked)
          const sortedAll = allTypeMetrics.sort(
            (a, b) => a.timestamp - b.timestamp,
          );
          const earliest = sortedAll[0];
          const latest = sortedAll[sortedAll.length - 1];

          // Format date range
          const startDate = new Date(earliest.timestamp).toLocaleDateString();
          const endDate = new Date(latest.timestamp).toLocaleDateString();
          const dateRange =
            startDate === endDate ? startDate : `${startDate} to ${endDate}`;

          // Format value display
          let valueDisplay = "";
          if (avg !== null) {
            valueDisplay = `Avg: ${avg.toFixed(1)}${earliest.unit || ""}`;
            if (min !== null && max !== null && min !== max) {
              valueDisplay += ` (Range: ${min.toFixed(1)}-${max.toFixed(1)})`;
            }
          } else {
            valueDisplay = `Latest: ${latest.value}${latest.unit || ""}`;
          }

          // For cumulative metrics, show daily average in the description
          let dataPointDescription = `${allTypeMetrics.length} data points`;
          if (isCumulative) {
            try {
              const uniqueDays = new Set<string>();
              for (const m of allTypeMetrics) {
                const dateStr =
                  m.startDate || new Date(m.timestamp).toISOString();
                uniqueDays.add(extractDatePart(dateStr));
              }
              dataPointDescription = `${allTypeMetrics.length} readings, ${uniqueDays.size} days`;
            } catch (e) {
              // Fallback to simple count if date extraction fails
              dataPointDescription = `${allTypeMetrics.length} readings`;
            }
          }

          systemMessage += `\n- ${type}: ${valueDisplay} (${dateRange}, ${dataPointDescription})`;
        });

      systemMessage +=
        "\n\nNote: These metrics have been prioritized based on relevance to the user's goals, health conditions, and conversation context.";
    }

    // Debug: Check if coordinator summary exists
    console.log("[CosaintAI] Coordinator result check:", {
      hasCoordinatorResult: !!coordinatorResult,
      hasCombinedSummary: !!coordinatorResult?.combinedSummary,
      summaryPreview: coordinatorResult?.combinedSummary
        ? JSON.stringify(coordinatorResult.combinedSummary).substring(0, 200)
        : null,
    });

    if (coordinatorResult?.combinedSummary) {
      const summary = coordinatorResult.combinedSummary;
      console.log("[CosaintAI] Adding coordinator summary to system message");
      systemMessage +=
        "\n\nLatest multi-agent synthesis (do not repeat profile details already mentioned in the summary):";
      systemMessage += `\nSummary: ${summary.summary}`;
      systemMessage += `\nKey Findings:\n${summary.keyFindings
        .map((finding) => `- ${finding}`)
        .join("\n")}`;
      if (summary.priorityActions?.length) {
        systemMessage += `\nPriority Actions:\n${summary.priorityActions
          .map((action) => `- ${action}`)
          .join("\n")}`;
      }
      if (summary.watchItems?.length) {
        systemMessage += `\nWatch Items:\n${summary.watchItems
          .map((item) => `- ${item}`)
          .join("\n")}`;
      }

      // Add formatting instructions
      systemMessage +=
        "\n\nIMPORTANT FORMATTING INSTRUCTIONS:\n" +
        "- Present the analysis using the same structure as shown above (Summary, Key Findings, Priority Actions, Watch Items)\n" +
        "- DO NOT add introductory greetings like 'Hello! I'm Cosaint' - jump straight into the analysis\n" +
        "- DO NOT use markdown headers (###) or bold formatting (**) for section titles\n" +
        "- Keep your warm, conversational tone with natural flow and helpful context\n" +
        "- Use plain text section labels (e.g., 'Summary:' not '### Summary')\n" +
        "- Match the structure and depth of the synthesis above while maintaining your friendly, evidence-informed voice";
    }

    if (coordinatorResult?.agentInsights) {
      const agentDetails = Object.entries(coordinatorResult.agentInsights)
        .map(([agentId, insight]) => {
          const topFinding = insight.findings?.[0]?.observation;
          const trend = insight.trends?.[0]?.pattern;
          return `• ${agentId}: finding=${topFinding ?? "n/a"}, trend=${trend ?? "n/a"}`;
        })
        .join("\n");
      if (agentDetails) {
        systemMessage += `\n\nSpecialist notes:\n${agentDetails}`;
      }
    }

    if (reports && reports.length > 0) {
      const reportLines = reports.slice(0, 5).map((summary) => {
        const report = summary.report;
        if (report.type === "dexa") {
          return `- DEXA (${summary.extractedAt}): Total fat ${report.totalBodyFatPercent ?? "n/a"}%, visceral rating ${report.visceralFatRating ?? "n/a"}, regions captured: ${report.regions
            .map((r) => r.region)
            .slice(0, 5)
            .join(", ")}`;
        }
        if (report.type === "bloodwork") {
          const highFlags = report.metrics.filter(
            (metric) => metric.flag && metric.flag !== "normal",
          );
          return `- Bloodwork (${summary.extractedAt}): ${report.metrics.length} metrics, notable flags: ${
            highFlags.length
              ? highFlags
                  .slice(0, 4)
                  .map(
                    (metric) =>
                      `${metric.name}${metric.flag ? ` (${metric.flag})` : ""}`,
                  )
                  .join(", ")
              : "none"
          }`;
        }
        return `- Report (${summary.extractedAt})`;
      });
      systemMessage += `\n\nStructured reports available:\n${reportLines.join("\n")}`;
      if (reports.length > 5) {
        systemMessage += `\n- ...and ${reports.length - 5} more reports`;
      }
    }

    // Add uploaded file summaries if present
    if (uploadedFiles && uploadedFiles.length > 0) {
      systemMessage += `\n\nYou also have access to the following uploaded files for this user:\n`;
      uploadedFiles.forEach((file) => {
        systemMessage += `- ${file.summary}\n`;
        // If the file has parsed content, include it in the context
        if (file.rawData?.content && typeof file.rawData.content === "string") {
          const content = file.rawData.content;

          // Always include maximum content for comprehensive analysis
          const maxLength = 20000; // Increased limit for all health reports
          const preview =
            content.length > maxLength
              ? content.substring(0, maxLength) + "... (truncated)"
              : content;

          let fileInfo = `  File content (${file.rawData.parsedType || "unknown"} format)`;

          // Add PDF-specific information
          if (file.rawData.parsedType === "pdf") {
            fileInfo += ` - ${file.rawData.pageCount || 0} pages`;
            if (
              file.rawData.metadata &&
              typeof file.rawData.metadata === "object" &&
              "title" in file.rawData.metadata
            ) {
              fileInfo += ` - Title: ${(file.rawData.metadata as { title?: string }).title}`;
            }
          }

          // Add instruction for comprehensive analysis of all health reports
          fileInfo += ` - HEALTH REPORT DATA: Please analyze ALL metrics and values found in this report comprehensively`;

          systemMessage += `${fileInfo}:\n${preview}\n\n`;
        }
      });
    }

    // Format the conversation history
    const formattedHistory =
      this.formatConversationHistory(conversationHistory);

    // Debug: Check final prompt includes coordinator summary
    const finalPrompt = `${systemMessage}

${formattedHistory}

User: ${userMessage}

Please provide a helpful response as Cosaint, keeping in mind the user's health data, profile, and uploaded files if available. Your response should be friendly, empathetic and evidence-informed.`;

    console.log(
      "[CosaintAI] Final prompt includes coordinator summary:",
      finalPrompt.includes("Latest multi-agent synthesis"),
    );
    console.log("[CosaintAI] System message length:", systemMessage.length);

    return finalPrompt;
  }

  /**
   * Build a system message that includes character background and health data context
   */
  private buildSystemMessage(
    healthData?: HealthContextMetrics,
    userProfile?: NormalizedUserProfile,
  ): string {
    // Start with the character's core identity
    let systemMessage = `You are Cosaint, a holistic health AI companion developed by Amach Health.\n\n${this.characteristics.getBio()}\n\nYour personality is:\n- Empathetic: You genuinely care about the user's wellbeing\n- Evidence-informed: You provide helpful health insights based on research\n- Holistic: You consider the interconnectedness of health factors\n- Practical: You offer actionable suggestions that are realistic to implement

Keep responses conversational and natural. If you mention research, weave it into the conversation without formal citations. When health reports or data are available, provide thoughtful analysis of the notable findings.`;

    // Add user profile context if available
    if (userProfile) {
      const derivedAge =
        userProfile.age ??
        calculateAgeFromBirthDate(userProfile.birthDate ?? undefined);
      const heightInches =
        userProfile.heightIn ??
        (userProfile.heightCm ? userProfile.heightCm / 2.54 : undefined);
      const heightDisplay =
        typeof heightInches === "number"
          ? `${Math.floor(heightInches / 12)}'${Math.round(heightInches % 12)}"`
          : undefined;
      const weightLbs =
        userProfile.weightLbs ??
        (userProfile.weightKg ? userProfile.weightKg * 2.20462 : undefined);

      systemMessage += `\n\nUser Profile:`;
      if (derivedAge !== undefined) {
        systemMessage += `\n- Age: ${Math.round(derivedAge)} years`;
      }
      if (userProfile.birthDate) {
        systemMessage += `\n- Birth date: ${userProfile.birthDate}`;
      }
      if (userProfile.sex) {
        systemMessage += `\n- Sex: ${userProfile.sex}`;
      }
      if (heightDisplay) {
        systemMessage += `\n- Height: ${heightDisplay}`;
      }
      if (typeof userProfile.heightCm === "number") {
        systemMessage += ` (${userProfile.heightCm.toFixed(1)} cm)`;
      }
      if (weightLbs !== undefined) {
        systemMessage += `\n- Weight: ${Math.round(weightLbs)} lbs`;
      }
      if (typeof userProfile.weightKg === "number") {
        systemMessage += ` (${userProfile.weightKg.toFixed(1)} kg)`;
      }
      if (typeof userProfile.bmi === "number") {
        systemMessage += `\n- BMI: ${userProfile.bmi.toFixed(1)}`;
      }
    }

    // Add health data context if available
    if (healthData) {
      systemMessage += `\n\nYou have access to the following health data for this user:`;

      const metricLabels: Record<string, string> = {
        steps: "Steps",
        exercise: "Exercise Time",
        heartRate: "Heart Rate",
        hrv: "Heart Rate Variability",
        restingHR: "Resting Heart Rate",
        respiratory: "Respiratory Rate",
        activeEnergy: "Active Energy",
        sleep: "Sleep",
      };
      const metricUnits: Record<string, string> = {
        steps: "steps",
        exercise: "min",
        heartRate: "bpm",
        hrv: "ms",
        restingHR: "bpm",
        respiratory: "BrPM",
        activeEnergy: "kcal",
        sleep: "min",
      };
      const metricKeys = [
        "steps",
        "exercise",
        "heartRate",
        "hrv",
        "restingHR",
        "respiratory",
        "activeEnergy",
        "sleep",
      ] as const;
      // Alerts for actionable out-of-range values
      let alerts: string[] = [];
      // Compose lines for each metric
      for (const key of metricKeys) {
        const m = healthData[key];
        if (!m) continue;
        let line = `- ${metricLabels[key] || key}: Avg ${m.average}`;
        if ("low" in m && "high" in m)
          line += ` (Low: ${m.low}, High: ${m.high})`;
        if (key === "sleep") {
          const sleepMetric = m as typeof healthData.sleep;
          line = `- Sleep: Avg ${Math.floor(sleepMetric.average / 60)}h ${Math.round(sleepMetric.average % 60)}m (Low: ${Math.floor(sleepMetric.low / 60)}h ${Math.round(sleepMetric.low % 60)}m, High: ${Math.floor(sleepMetric.high / 60)}h ${Math.round(sleepMetric.high % 60)}m), Efficiency: ${sleepMetric.efficiency}%`;
          if (sleepMetric.efficiency < 80)
            alerts.push(
              "Sleep efficiency is below 80%. Consider improving your sleep habits.",
            );
        } else {
          if (metricUnits[key]) line += ` ${metricUnits[key]}`;
        }
        if (key === "heartRate" && m.low < 50)
          alerts.push(
            "Your lowest recorded heart rate is below 50 bpm. If you are not an athlete, consult your doctor.",
          );
        if (key === "hrv" && m.average < 30)
          alerts.push(
            "Your HRV is lower than typical. Consider stress management or recovery.",
          );
        if (key !== "sleep") systemMessage += `\n${line}`;
        if (key === "sleep") systemMessage += `\n${line}`;
      }
      if (alerts.length > 0) {
        systemMessage += `\n\nAlerts:\n- ` + alerts.join("\n- ");
      }
      systemMessage += `\n\nWhen making recommendations or setting goals, use the user\'s average, high, and low values for each metric to personalize your advice. Suggest realistic improvements based on their current range.`;
    }
    systemMessage += RESPONSE_FORMAT_GUIDELINES;
    return systemMessage;
  }

  /**
   * Format conversation history for the prompt
   */
  private formatConversationHistory(
    history: Array<{ role: "user" | "assistant"; content: string }>,
  ): string {
    if (!history || history.length === 0) return "";

    return history
      .map((msg) => {
        const role = msg.role === "user" ? "User" : "Cosaint";
        return `${role}: ${msg.content}`;
      })
      .join("\n\n");
  }

  /**
   * Get a fallback response if the API call fails
   */
  private getFallbackResponse(userMessage: string): string {
    // Check if the message relates to any known topics
    for (const topic of cosaintCharacteristics.responseContext.topics) {
      for (const keyword of topic.keywords) {
        if (userMessage.toLowerCase().includes(keyword.toLowerCase())) {
          return randomChoice(topic.responses);
        }
      }
    }

    // Default fallback
    return randomChoice(
      cosaintCharacteristics.responseContext.defaultResponses,
    );
  }

  /**
   * Creates a singleton instance using environment variables
   */
  static createFromEnv(): CosaintAiService {
    // Create the Venice API service instance with the correct configuration
    const veniceApi = new VeniceApiService(
      process.env.NEXT_PUBLIC_VENICE_MODEL_NAME || "zai-org-glm-4.6",
      process.env.NODE_ENV === "development",
    );

    // Return the Cosaint service
    return new CosaintAiService(veniceApi);
  }

  /**
   * Summarize health data and uploaded files for AI analysis
   */
  private summarizeHealthData(
    healthData: HealthContextMetrics,
    uploadedFiles?: Array<{ type: string; summary: string; date: string }>,
  ): string {
    let summary = "User Health Summary:\n";
    if (healthData.steps) {
      summary += `- Steps: Avg ${healthData.steps.average}\n`;
    }
    if (healthData.exercise) {
      summary += `- Exercise: Avg ${healthData.exercise.average} min/day\n`;
    }
    if (healthData.heartRate) {
      summary += `- Heart Rate: Avg ${healthData.heartRate.average} bpm\n`;
    }
    if (healthData.activeEnergy) {
      summary += `- Active Energy: Avg ${healthData.activeEnergy.average} kcal/day\n`;
    }
    if (healthData.sleep) {
      const sleepMetric = healthData.sleep;
      summary += `- Sleep: Avg ${Math.floor(sleepMetric.average / 60)}h ${sleepMetric.average % 60}m, Efficiency ${sleepMetric.efficiency}%\n`;
    }
    if (uploadedFiles && uploadedFiles.length > 0) {
      summary += "\nRecent Uploaded Files (up to 3):\n";
      uploadedFiles.slice(-3).forEach((file) => {
        summary += `- ${file.type.toUpperCase()} (${file.date.split("T")[0]}): ${file.summary}\n`;
      });
    }
    return summary;
  }

  /**
   * Generate a list of health goals based on user health data using Venice AI
   */
  async generateGoalsFromHealthData(
    healthData: HealthContextMetrics,
    uploadedFiles?: Array<{ type: string; summary: string; date: string }>,
  ): Promise<string[]> {
    const summary = this.summarizeHealthData(healthData, uploadedFiles);
    const prompt = `
You are a health AI. Based on the following user health summary, suggest 5 specific, actionable, and measurable health goals for the user.
For each goal:
- Reference a specific metric from the user's health data (e.g., steps, sleep, heart rate, etc.).
- Make the goal measurable (e.g., 'Walk 8,000 steps per day', 'Sleep at least 7 hours nightly').
- **Explicitly include the percent increase or decrease from the user's current average for that metric in parentheses at the end of each goal.**
For example: "Walk 8,000 steps per day (7% increase from current average)".

For each goal, use the user's current average as a baseline. For example, if the user already averages 12,000 steps per day, suggest a goal that is a realistic improvement or maintenance of that level, not a lower value.
Return only a bullet list of goals, no extra commentary.

${summary}`;

    if (process.env.NODE_ENV === "development") {
      // Log the prompt for debugging

      console.log(
        "[CosaintAiService] Venice goal generation prompt:\n",
        prompt,
      );
    }

    const response = await this.veniceApi.generateVeniceResponse(prompt, 500);
    return response
      ? response
          .split("\n")
          .map((line) => line.replace(/^[-*]\s*/, "").trim())
          .filter((line) => line.length > 0)
      : [];
  }
}
