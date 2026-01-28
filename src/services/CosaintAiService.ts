// src/services/CosaintAiService.ts
import type { CoordinatorResult } from "@/agents/CoordinatorAgent";
import {
  getTopRelevant,
  rankMetricsByRelevance,
  type HealthMetric,
  type UserContext,
} from "@/ai/RelevanceScorer";
import { formatToolsForPrompt } from "@/ai/tools/ToolDefinitions";
import type { ToolCall } from "@/ai/tools/ToolExecutor";
import { ToolExecutor } from "@/ai/tools/ToolExecutor";
import { ToolResponseParser } from "@/ai/tools/ToolResponseParser";
import { IndexedDBDataSource } from "@/data/sources/IndexedDBDataSource";
import type { ConversationMemory } from "@/types/conversationMemory";
import type { ParsedReportSummary } from "@/types/reportData";
import {
  diagnoseAnalysisResult,
  logAnalysisDiagnostics,
} from "@/utils/analysisDiagnostics";
import {
  getRecommendedAnalysisMode,
  updateAnalysisState,
} from "@/utils/analysisState";
import { getReportsSummary } from "@/utils/reportFormatters";
import {
  buildTemporalContext,
  formatTemporalContext,
} from "@/utils/temporalContext";
import {
  calculateAgeFromBirthDate,
  type NormalizedUserProfile,
} from "@/utils/userProfileUtils";
import { randomChoice } from "@/utils/utils";
import {
  getCachedCoordinatorResult,
  setCachedCoordinatorResult,
  type CoordinatorAnalysisFingerprint,
} from "@/utils/coordinatorAnalysisCache";
import {
  getCachedToolResult,
  makeToolCacheKey,
  setCachedToolResult,
  type ToolCacheDataFingerprint,
} from "@/utils/toolResultCache";
import { shouldDisableVeniceThinking } from "@/utils/veniceThinking";
import { VeniceApiService } from "../api/venice/VeniceApiService";
import CharacteristicsLoader from "../components/ai/characteristicsLoader";
import cosaintCharacteristics from "../components/ai/cosaint";
import type { HealthContextMetrics } from "../types/HealthContext";
import type { HealthDataByType } from "../types/healthData";
import { logger } from "../utils/logger";
import { runCoordinatorAnalysis } from "./CoordinatorService";

/**
 * Efficiently get min/max timestamps from a large array without sorting
 */
function getTimestampRange(
  metrics: HealthMetric[],
): { min: number; max: number } | null {
  if (metrics.length === 0) return null;

  let min = metrics[0].timestamp;
  let max = metrics[0].timestamp;

  for (let i = 1; i < metrics.length; i++) {
    const ts = metrics[i].timestamp;
    if (ts < min) min = ts;
    if (ts > max) max = ts;
  }

  return { min, max };
}

const RESPONSE_FORMAT_GUIDELINES = `

Be informative and analytical. Weave metrics into flowing, detailed sentences that explain context and significance. Compare their numbers to age/sex norms to show what's working well or needs attention. Connect how different metrics influence each other. Stay measured and grounded in the data—let the numbers speak for themselves without excessive enthusiasm.
`;

// These are the metric IDs the multi-agent coordinator actually uses.
// Keeping this local avoids exporting internal constants from CoordinatorService.
const COORDINATOR_SUPPORTED_METRICS = new Set<string>([
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierAppleExerciseTime",
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKQuantityTypeIdentifierRespiratoryRate",
  "HKQuantityTypeIdentifierVO2Max",
  "HKCategoryTypeIdentifierSleepAnalysis",
]);

const QUICK_RESPONSE_GUIDELINES = `

Response style:
- Provide direct, practical, evidence-informed health guidance
- Keep responses conversational (1-3 paragraphs for most questions)
- Reference user profile (age, sex, height, weight) when relevant for personalized context
- Use specific examples and actionable recommendations
- Respect dietary preferences or constraints mentioned in conversation
- Focus on what you CAN help with (general guidance, profile-based advice, evidence-based recommendations)
- If asked about specific metrics/lab results you don't have, suggest Deep mode for data analysis
`;

// Feature flag for tool use - set via environment variable
const ENABLE_TOOL_USE = process.env.NEXT_PUBLIC_ENABLE_TOOL_USE === "true";

const COSAINT_SERVICE_BUILD_STAMP =
  "cosaint-service-build-2026-01-22TquickTokensOverride-v1";

function getQuickMaxTokensOverride(): number | null {
  // Dev-only: allow temporarily increasing Quick mode token budget to inspect full output.
  // Set via:
  // localStorage.setItem("cosaint_quick_max_tokens", "4000")
  if (process.env.NODE_ENV !== "development") return null;

  // IMPORTANT: Prefer localStorage over env so the in-app dev controls always win.
  const localRaw =
    typeof window !== "undefined"
      ? window.localStorage.getItem("cosaint_quick_max_tokens")
      : null;
  const envVal = process.env.NEXT_PUBLIC_VENICE_QUICK_MAX_TOKENS;
  const raw =
    (typeof localRaw === "string" && localRaw.trim().length > 0
      ? localRaw
      : null) ??
    (typeof envVal === "string" && envVal.trim().length > 0 ? envVal : null);

  // Dev-only trace so we can verify the browser is running the latest bundle.
  if (typeof window !== "undefined") {
    console.log("[CosaintAiService] Quick max_tokens override trace", {
      build: COSAINT_SERVICE_BUILD_STAMP,
      localRaw,
      envVal: envVal ?? null,
      rawChosenBeforeClamp: raw ?? null,
    });
  }

  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // Cap to avoid runaway costs and absurdly long generations.
  // Also enforce a floor: values like 900 often cause GLM to hit length while still "thinking",
  // which can yield empty content when thinking is stripped server-side.
  const clamped = Math.max(1500, Math.min(Math.floor(n), 8000));
  return clamped;
}

function compactOneLine(text: string, maxLen: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
}

function formatConversationMemoryCapsule(
  memory: ConversationMemory,
): string | null {
  const activeFacts = (memory.criticalFacts ?? [])
    .filter((f) => f && f.isActive)
    .slice(-12);

  const goals = activeFacts
    .filter((f) => f.category === "goal")
    .map((f) => compactOneLine(String(f.value ?? ""), 120))
    .filter(Boolean)
    .slice(-6);
  const concerns = activeFacts
    .filter((f) => f.category === "concern")
    .map((f) => compactOneLine(String(f.value ?? ""), 120))
    .filter(Boolean)
    .slice(-6);

  const sessions = [
    ...(memory.importantSessions ?? []),
    ...(memory.recentSessions ?? []),
  ]
    .slice(-5)
    .map((s) => {
      const date = typeof s.date === "string" ? s.date : "";
      const summary = compactOneLine(String(s.summary ?? ""), 180);
      return date ? `${date}: ${summary}` : summary;
    })
    .filter(Boolean);

  const lines: string[] = [];
  if (goals.length) lines.push(`- Active goals: ${goals.join(" | ")}`);
  if (concerns.length) lines.push(`- Active concerns: ${concerns.join(" | ")}`);
  if (sessions.length) {
    lines.push(`- Recent session notes:`);
    for (const s of sessions) lines.push(`  - ${s}`);
  }

  if (!lines.length) return null;
  return `Conversation memory (from prior chats):\n${lines.join("\n")}`;
}

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
        return this.getFallbackResponse(userMessage, conversationHistory);
      }

      return response;
    } catch (error) {
      logger.error("Error generating AI response", {
        error: error instanceof Error ? error.message : String(error),
        userMessage,
      });
      return this.getFallbackResponse(userMessage, conversationHistory);
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
    conversationMemory?: ConversationMemory | null,
  ): Promise<string> {
    try {
      const isQuick = !useMultiAgent;

      // Log health data and file status
      if (!isQuick) {
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
      }

      // Convert and rank health metrics by relevance
      // Standard mode: skip expensive ranking (faster prompt build).
      let rankedMetrics: HealthMetric[] = [];
      let allHealthMetrics: HealthMetric[] = []; // Keep all metrics for date range calculation (deep mode)
      const shouldComputeRanking = useMultiAgent;
      if (
        shouldComputeRanking &&
        metricData &&
        Object.keys(metricData).length > 0
      ) {
        allHealthMetrics = this.convertToHealthMetrics(metricData);
        const userContext = this.buildUserContext(
          userProfile,
          conversationHistory,
        );

        // Rank metrics by relevance
        const ranked = rankMetricsByRelevance(allHealthMetrics, userContext);

        // Get top 100 most relevant metrics
        rankedMetrics = getTopRelevant(ranked, 100).map((rm) => rm.metric);
      }

      let coordinatorResult: CoordinatorResult | null = null;
      let toolCacheFingerprint: ToolCacheDataFingerprint | null = null;
      let toolCacheMaxAgeMs: number | null = null;
      if (
        useMultiAgent &&
        ((metricData && Object.keys(metricData).length > 0) || reports?.length)
      ) {
        try {
          // Calculate data range & fingerprint for caching / mode detection.
          // Avoid a second full scan of metricData by reusing the converted metrics array.
          const supportedMetrics = allHealthMetrics.filter((m) =>
            COORDINATOR_SUPPORTED_METRICS.has(m.type),
          );
          const tsRange = getTimestampRange(supportedMetrics);
          const dataRange =
            tsRange != null
              ? { start: new Date(tsRange.min), end: new Date(tsRange.max) }
              : undefined;

          // Fingerprint should reflect the coordinator's actual inputs, not every metric in the raw payload.
          const metricTypesCount = metricData
            ? Object.keys(metricData).filter((k) =>
                COORDINATOR_SUPPORTED_METRICS.has(k),
              ).length
            : 0;
          const reportsCount = reports?.length ?? 0;

          // Determine analysis mode using auto-detection or force flag
          const analysisMode = getRecommendedAnalysisMode(
            dataRange,
            forceInitialAnalysis,
          );

          const fingerprint: CoordinatorAnalysisFingerprint = {
            analysisMode,
            metricTypesCount,
            earliestMs: tsRange?.min ?? null,
            latestMs: tsRange?.max ?? null,
            reportsCount,
          };
          toolCacheFingerprint = fingerprint;

          // Cache policy:
          // - initial: expensive and stable → cache longer
          // - ongoing: cache shorter but still avoid re-running on every deep chat turn
          const maxAgeMs =
            analysisMode === "initial"
              ? 24 * 60 * 60 * 1000 // 24h
              : 15 * 60 * 1000; // 15m
          toolCacheMaxAgeMs = maxAgeMs;

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
            cache: {
              enabled: true,
              maxAgeMs,
              fingerprint,
            },
          });

          // Emit a plain-text, always-visible log line so we can confirm cache behavior
          // even if object logs are collapsed or filtered.
          if (process.env.NODE_ENV === "development") {
            console.log(
              `[CosaintAiService] Coordinator cache lookup: ${JSON.stringify(
                fingerprint,
              )} (ttlMs=${maxAgeMs})`,
            );
          }

          coordinatorResult = getCachedCoordinatorResult({
            fingerprint,
            maxAgeMs,
          });
          const usedCachedCoordinator = Boolean(coordinatorResult);

          if (coordinatorResult) {
            console.log(
              "[CosaintAiService] Using cached coordinator analysis",
              {
                analysisMode,
                fingerprint,
              },
            );
          } else {
            if (process.env.NODE_ENV === "development") {
              console.log("[CosaintAiService] Coordinator cache result: MISS");
            }
            coordinatorResult = await runCoordinatorAnalysis({
              metricData,
              profile: userProfile,
              reports,
              conversationHistory,
              veniceService: this.veniceApi,
              analysisMode,
            });
            setCachedCoordinatorResult({
              fingerprint,
              result: coordinatorResult,
            });
          }

          // Log diagnostics for debugging
          if (coordinatorResult) {
            // Only log multi-agent diagnostics and update analysis state when we actually ran the agents.
            // Cached coordinator results are expected and should not look like "agents are running" in logs.
            if (!usedCachedCoordinator) {
              const metricCount = metricData
                ? Object.keys(metricData).length
                : 0;
              const reportCount = reports?.length ?? 0;
              const diagnostics = diagnoseAnalysisResult(
                coordinatorResult,
                metricCount,
                reportCount,
              );
              if (diagnostics) {
                logAnalysisDiagnostics(diagnostics);
              }

              // Update analysis state after successful (fresh) analysis
              if (dataRange) {
                updateAnalysisState(analysisMode, dataRange);
                console.log("[CosaintAiService] Analysis state updated:", {
                  mode: analysisMode,
                  date: new Date().toISOString(),
                });
              }
            } else if (process.env.NODE_ENV === "development") {
              console.log(
                "[CosaintAiService] Coordinator cache result: HIT (no agent calls)",
              );
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
        useMultiAgent ? "full" : "lite",
        conversationMemory,
      );

      // Dev-only: log prompt stats without dumping full prompt content.
      if (process.env.NODE_ENV === "development") {
        console.log("[CosaintAiService] Prompt stats", {
          systemChars: prompt.split("\n\n")[0]?.length ?? undefined,
          totalChars: prompt.length,
        });
      }

      // Generate a response using the Venice API
      // Quick Chat (standard): keep token budget smaller for faster responses.
      // QUICK MODE FIX: Increased from 900 to 1500 to ensure model completes its response
      const debugQuickMaxTokens = !useMultiAgent
        ? getQuickMaxTokensOverride()
        : null;
      // Temporary: allow much deeper responses (compute not a concern).
      // Quick can still be overridden via localStorage/env, but defaults high.
      const maxTokens = useMultiAgent ? 8000 : (debugQuickMaxTokens ?? 8000);
      if (process.env.NODE_ENV === "development" && !useMultiAgent) {
        console.log("[CosaintAiService] Quick max_tokens override", {
          fromLocalStorage:
            typeof window !== "undefined"
              ? window.localStorage.getItem("cosaint_quick_max_tokens")
              : null,
          fromEnv: process.env.NEXT_PUBLIC_VENICE_QUICK_MAX_TOKENS ?? null,
          chosen: maxTokens,
        });
      }
      console.log("[CosaintAiService] Calling Venice API", {
        promptLength: prompt.length,
        maxTokens,
        userMessage: userMessage.substring(0, 100),
        mode: useMultiAgent ? "deep" : "quick",
      });

      // Venice parameters: per docs, disable thinking to avoid <think> blocks and empty content when thinking is stripped.
      // Docs: https://docs.venice.ai/overview/about-venice
      const veniceParams: Record<string, unknown> = {
        strip_thinking_response: true,
        include_venice_system_prompt: false,
        ...(useMultiAgent
          ? // Deep chat: allow disabling thinking via config (defaults to false).
            shouldDisableVeniceThinking("deep")
            ? { disable_thinking: true }
            : {}
          : // Quick chat: always disable thinking to ensure answers land in content.
            { disable_thinking: true }),
      };

      let response = await this.veniceApi.generateVeniceResponse(
        prompt,
        maxTokens,
        veniceParams,
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
        // QUICK: retry once on empty response (we've seen occasional empty choices)
        if (!useMultiAgent) {
          console.warn(
            "⚠️ [CosaintAiService] Empty response from Venice API (quick) - retrying once",
            { userMessage: userMessage.substring(0, 100) },
          );
          // Retry up to 2 times (very small additional latency) before falling back.
          for (let attempt = 1; attempt <= 2 && !response; attempt++) {
            if (attempt > 1) {
              await new Promise((r) => setTimeout(r, 200));
            }
            response = await this.veniceApi.generateVeniceResponse(
              prompt,
              maxTokens,
              veniceParams,
            );
          }
        }

        if (!response) {
          console.warn(
            "⚠️ [CosaintAiService] Empty response from Venice API - returning fallback",
            { userMessage: userMessage.substring(0, 100) },
          );
          logger.warn("Empty response from Venice API", { userMessage });
          return this.getFallbackResponse(userMessage, conversationHistory);
        }
      }

      // Tool execution loop (if enabled)
      if (
        ENABLE_TOOL_USE &&
        useMultiAgent &&
        ToolResponseParser.hasToolCalls(response)
      ) {
        console.log(
          "[CosaintAiService] Tool calls detected, executing tools...",
        );
        let iterationCount = 0;
        const maxIterations = 3; // Prevent infinite loops
        let conversationContext = userMessage;

        while (
          iterationCount < maxIterations &&
          response &&
          ToolResponseParser.hasToolCalls(response)
        ) {
          iterationCount++;
          console.log(
            `[CosaintAiService] Tool execution iteration ${iterationCount}`,
          );

          // Extract tool calls
          const toolCalls = ToolResponseParser.parseToolCalls(response);
          if (!toolCalls.length) {
            if (process.env.NODE_ENV === "development") {
              console.log(
                "[CosaintAiService] hasToolCalls=true but parseToolCalls returned 0 tool calls; breaking to avoid extra Venice calls.",
              );
            }
            break;
          }
          console.log(
            `[CosaintAiService] Found ${toolCalls.length} tool call(s):`,
            toolCalls.map((tc) => tc.tool),
          );
          console.log(
            "[CosaintAiService] Tool call details:",
            JSON.stringify(toolCalls, null, 2),
          );

          // Execute tools directly on client (IndexedDB is browser-only)
          const toolResults = await Promise.all(
            toolCalls.map(async (call) => {
              if (!toolCacheFingerprint) {
                return await this.executeTool(call);
              }

              // Tool caching: keyed by tool+params+data fingerprint.
              // Safe because tools only read local data; any upload changes the fingerprint.
              const key = makeToolCacheKey({
                toolCall: call,
                fingerprint: toolCacheFingerprint,
              });
              const cached = getCachedToolResult({
                key,
                maxAgeMs: toolCacheMaxAgeMs ?? 15 * 60 * 1000,
              });
              if (cached) {
                if (process.env.NODE_ENV === "development") {
                  console.log(
                    `[ToolCache] HIT tool=${call.tool} bytes=${JSON.stringify(cached).length}`,
                  );
                }
                return cached;
              }

              const result = await this.executeTool(call);
              if (result.success) {
                setCachedToolResult({ key, result });
                if (process.env.NODE_ENV === "development") {
                  console.log(`[ToolCache] MISS+STORE tool=${call.tool}`);
                }
              } else if (process.env.NODE_ENV === "development") {
                console.log(`[ToolCache] MISS tool=${call.tool} (not cached)`);
              }
              return result;
            }),
          );

          // Format results for AI
          const resultsText = this.formatToolResults(toolResults);
          console.log(
            "[CosaintAiService] Tool execution complete, sending results to AI",
          );

          // Update context with tool results and get new response
          conversationContext = `${conversationContext}\n\n[Tool Execution Results]\n${resultsText}\n\nBased on these results, provide your analysis.`;

          const followUpPrompt = `${prompt}\n\n${conversationContext}\n\nPlease provide your analysis based on the tool results above.`;
          // Tool follow-up should have enough budget to avoid cutoffs and retries.
          const toolFollowUpMaxTokens = maxTokens;
          const followUpStartedAt = Date.now();
          const newResponse = await this.veniceApi.generateVeniceResponse(
            followUpPrompt,
            toolFollowUpMaxTokens,
            {
              strip_thinking_response: true,
              include_venice_system_prompt: false,
            },
          );
          if (process.env.NODE_ENV === "development") {
            console.log("[CosaintAiService] Tool follow-up Venice latency", {
              elapsedMs: Date.now() - followUpStartedAt,
              toolFollowUpMaxTokens,
            });
          }

          if (!newResponse) {
            console.warn(
              "[CosaintAiService] No response from AI after tool execution",
            );
            break;
          }

          response = newResponse;

          // If no more tool calls, break
          if (!ToolResponseParser.hasToolCalls(response)) {
            break;
          }
        }

        if (iterationCount >= maxIterations) {
          console.warn(
            "[CosaintAiService] Max tool iterations reached, returning last response",
          );
        }
      }

      console.log("✅ [CosaintAiService] Returning successful response");
      return (
        response || this.getFallbackResponse(userMessage, conversationHistory)
      );
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
      return this.getFallbackResponse(userMessage, conversationHistory);
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
    toolPromptMode?: "full" | "lite",
    conversationMemory?: ConversationMemory | null,
  ): string {
    const promptStyle: "deep" | "quick" =
      toolPromptMode === "lite" ? "quick" : "deep";
    const includeHealthContext = promptStyle === "deep";

    // Build the system message including character background, health data, file context, and user profile
    let systemMessage = this.buildSystemMessage(healthData, userProfile, {
      toolPromptMode: toolPromptMode ?? "full",
      promptStyle,
      includePersonaDetails: promptStyle === "deep",
      // QUICK MODE FIX: Include profile in Quick mode (age/sex/height/weight for context)
      includeUserProfile: includeHealthContext || promptStyle === "quick",
      includeHealthData: includeHealthContext
        ? promptStyle === "deep"
          ? "full"
          : "minimal"
        : "none",
      includeAlerts: promptStyle === "deep",
    });

    // Add a compact "memory capsule" to let the model reference prior chats without full logs.
    if (conversationMemory) {
      const capsule = formatConversationMemoryCapsule(conversationMemory);
      if (capsule) {
        systemMessage += `\n\n${capsule}`;
      }
    }

    // Add temporal context (current date, data timespan, seasonal context)
    if (includeHealthContext) {
      const timestampRange = allMetrics ? getTimestampRange(allMetrics) : null;
      const dataStartDate = timestampRange
        ? new Date(timestampRange.min)
        : undefined;
      const dataEndDate = timestampRange
        ? new Date(timestampRange.max)
        : undefined;

      const temporalContext = buildTemporalContext(
        healthData,
        dataStartDate,
        dataEndDate,
      );
      systemMessage += "\n\n" + formatTemporalContext(temporalContext);
    }

    systemMessage +=
      "\n\nFollow-up instruction: Always address the user's latest question or concern first, use the conversation history to avoid repeating full introductions or already acknowledged profile details, and consolidate duplicate findings instead of listing the same metric multiple times.";

    // Keep data availability compact. Do not dump raw values into the system prompt.
    // The model should use tools to retrieve the specific slices it needs.
    if (includeHealthContext) {
      const availableMetricTypes = Array.from(
        new Set((rankedMetrics ?? allMetrics ?? []).map((m) => m.type)),
      ).slice(0, 12);
      if (availableMetricTypes.length > 0) {
        systemMessage += `\n\nData index (use tools for actual values):`;
        systemMessage += `\n- Timeseries metrics available: ${availableMetricTypes.join(", ")}`;
        const r = allMetrics ? getTimestampRange(allMetrics) : null;
        if (r) {
          systemMessage += `\n- Timeseries coverage: ${new Date(r.min).toLocaleDateString()} to ${new Date(r.max).toLocaleDateString()}`;
        }
      }
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

    // Keep report/file context compact; retrieve details via tools if needed.
    if (includeHealthContext && reports && reports.length > 0) {
      systemMessage += `\n\nReports available: ${getReportsSummary(reports)}.`;
      const latest = reports
        .slice()
        .sort(
          (a, b) =>
            (b.report.type === "bloodwork" ? 1 : 0) -
            (a.report.type === "bloodwork" ? 1 : 0),
        )
        .slice(0, 3);
      const lines = latest.map((r) => {
        if (r.report.type === "bloodwork") {
          return `- bloodwork${r.report.reportDate ? ` (${r.report.reportDate})` : ""}`;
        }
        return `- dexa${r.report.scanDate ? ` (${r.report.scanDate})` : ""}`;
      });
      systemMessage += `\nLatest reports:\n${lines.join("\n")}`;
      systemMessage += `\nUse get_latest_report to retrieve specific fields when needed.`;
    } else if (
      includeHealthContext &&
      uploadedFiles &&
      uploadedFiles.length > 0
    ) {
      // Avoid including raw file text; summaries can be huge. Keep a tiny one-line hint only.
      const recentFiles = uploadedFiles
        .slice(-3)
        .map((f) => compactOneLine(f.summary ?? "", 220))
        .filter(Boolean);
      if (recentFiles.length > 0) {
        systemMessage += `\n\nRecent uploaded files (metadata only):\n- ${recentFiles.join("\n- ")}`;
      }
    }

    // Format the conversation history
    const formattedHistory =
      this.formatConversationHistory(conversationHistory);

    const tailInstruction =
      promptStyle === "quick"
        ? "Please provide a helpful response as Cosaint. Be friendly, empathetic, and evidence-informed."
        : "Please provide a helpful response as Cosaint, keeping in mind the user's health data, profile, and uploaded files if available. Your response should be friendly, empathetic and evidence-informed.";

    // Debug: Check final prompt includes coordinator summary
    const finalPrompt = `${systemMessage}

${formattedHistory}

User: ${userMessage}

${tailInstruction}`;

    // Dev-only: log prompt sizes for debugging without printing sensitive content.
    if (process.env.NODE_ENV === "development") {
      console.log("[CosaintAI] Prompt sizes", {
        systemChars: systemMessage.length,
        historyChars: formattedHistory.length,
        userMessageChars: userMessage.length,
        totalChars: finalPrompt.length,
        includesCoordinatorSummary: finalPrompt.includes(
          "Latest multi-agent synthesis",
        ),
      });
    }

    return finalPrompt;
  }

  /**
   * Build a system message that includes character background and health data context
   */
  private buildSystemMessage(
    healthData?: HealthContextMetrics,
    userProfile?: NormalizedUserProfile,
    options?: {
      toolPromptMode?: "full" | "lite";
      promptStyle?: "deep" | "quick";
      includeUserProfile?: boolean;
      includeHealthData?: "none" | "minimal" | "full";
      includeAlerts?: boolean;
      includePersonaDetails?: boolean;
    },
  ): string {
    // Start with the character's core identity
    const promptStyle = options?.promptStyle ?? "deep";
    const includePersonaDetails =
      options?.includePersonaDetails ?? promptStyle === "deep";

    let systemMessage = `You are Cosaint, a holistic health AI companion developed by Amach Health.`;
    if (includePersonaDetails) {
      systemMessage += `\n\n${this.characteristics.getBio()}\n\nYour personality is:\n- Empathetic: You genuinely care about the user's wellbeing\n- Evidence-informed: You provide helpful health insights based on research\n- Holistic: You consider the interconnectedness of health factors\n- Practical: You offer actionable suggestions that are realistic to implement

Keep responses conversational and natural. If you mention research, weave it into the conversation without formal citations. When health reports or data are available, provide thoughtful analysis of the notable findings.`;
    } else {
      systemMessage +=
        "\nKeep responses conversational, practical, and grounded.";
    }

    // QUICK mode: clarify available context without negative framing
    if (promptStyle === "quick") {
      systemMessage +=
        "\n\nAvailable for this conversation:\n" +
        "- User profile (age, sex, height, weight, BMI)\n" +
        "- Conversation history and context\n" +
        "- General health knowledge and evidence-based guidance\n\n" +
        "When responding:\n" +
        "- Provide practical, evidence-informed advice\n" +
        "- Reference profile details when relevant (e.g., age-appropriate recommendations)\n" +
        "- Respect dietary preferences or constraints mentioned in the conversation\n" +
        "- If asked about specific health metrics (steps, HRV, sleep patterns) or lab results, suggest switching to Deep mode for personalized data analysis";
    }

    // Add tool definitions if tool use is enabled
    if (ENABLE_TOOL_USE && promptStyle === "deep") {
      systemMessage += formatToolsForPrompt(options?.toolPromptMode ?? "full");
    }

    // Add tool definitions if tool use is enabled
    if (ENABLE_TOOL_USE) {
      systemMessage += formatToolsForPrompt();
    }

    // Add user profile context if available
    const includeUserProfile =
      options?.includeUserProfile ?? promptStyle === "deep";
    if (includeUserProfile && userProfile) {
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
      if (promptStyle === "deep" && userProfile.birthDate) {
        systemMessage += `\n- Birth date: ${userProfile.birthDate}`;
      }
      if (userProfile.sex) {
        systemMessage += `\n- Sex: ${userProfile.sex}`;
      }
      // QUICK MODE FIX: Include basic physical stats in Quick mode too
      if (
        (promptStyle === "deep" || promptStyle === "quick") &&
        heightDisplay
      ) {
        systemMessage += `\n- Height: ${heightDisplay}`;
      }
      if (
        (promptStyle === "deep" || promptStyle === "quick") &&
        typeof userProfile.heightCm === "number"
      ) {
        systemMessage += ` (${userProfile.heightCm.toFixed(1)} cm)`;
      }
      if (
        (promptStyle === "deep" || promptStyle === "quick") &&
        weightLbs !== undefined
      ) {
        systemMessage += `\n- Weight: ${Math.round(weightLbs)} lbs`;
      }
      if (
        (promptStyle === "deep" || promptStyle === "quick") &&
        typeof userProfile.weightKg === "number"
      ) {
        systemMessage += ` (${userProfile.weightKg.toFixed(1)} kg)`;
      }
      if (
        (promptStyle === "deep" || promptStyle === "quick") &&
        typeof userProfile.bmi === "number"
      ) {
        systemMessage += `\n- BMI: ${userProfile.bmi.toFixed(1)}`;
      }
    }

    // Add health data context if available
    const includeHealthData = options?.includeHealthData ?? "full";
    const includeAlerts = options?.includeAlerts ?? promptStyle === "deep";
    if (healthData && includeHealthData !== "none") {
      if (includeHealthData === "minimal") {
        const keys = Object.entries(healthData)
          .filter(([, v]) => Boolean(v))
          .map(([k]) => k)
          .slice(0, 12);
        systemMessage += `\n\nHealth data available (use tools for values): ${keys.join(
          ", ",
        )}`;
        systemMessage += RESPONSE_FORMAT_GUIDELINES;
        return systemMessage;
      }

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
      if (includeAlerts && alerts.length > 0) {
        systemMessage += `\n\nAlerts:\n- ` + alerts.join("\n- ");
      }
      if (promptStyle === "deep") {
        systemMessage += `\n\nWhen making recommendations or setting goals, use the user's average, high, and low values for each metric to personalize your advice. Suggest realistic improvements based on their current range.`;
      } else {
        systemMessage +=
          "\n\nUse tools to retrieve exact values for the timeframe the user mentions.";
      }
    }
    systemMessage +=
      promptStyle === "quick"
        ? QUICK_RESPONSE_GUIDELINES
        : RESPONSE_FORMAT_GUIDELINES;
    return systemMessage;
  }

  /**
   * Format conversation history for the prompt
   * Uses rolling summary strategy: summarize older messages, keep recent 6 in full
   * This maintains long-term context while preventing timeout issues
   */
  private formatConversationHistory(
    history: Array<{ role: "user" | "assistant"; content: string }>,
  ): string {
    if (!history || history.length === 0) return "";

    // If conversation is short, send everything
    if (history.length <= 6) {
      return history
        .map((msg) => {
          const role = msg.role === "user" ? "User" : "Cosaint";
          return `${role}: ${msg.content}`;
        })
        .join("\n\n");
    }

    // For longer conversations: summarize older messages, keep recent 6 in full
    const olderMessages = history.slice(0, -6);
    const recentMessages = history.slice(-6);

    const summary = this.summarizeOlderMessages(olderMessages);
    const recentFormatted = recentMessages
      .map((msg) => {
        const role = msg.role === "user" ? "User" : "Cosaint";
        return `${role}: ${msg.content}`;
      })
      .join("\n\n");

    return `${summary}\n\n---\n\nRecent conversation:\n${recentFormatted}`;
  }

  /**
   * Summarize older conversation messages into compact context
   * Extracts key topics and user questions without full message content
   */
  private summarizeOlderMessages(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
  ): string {
    if (messages.length === 0) return "";

    // Extract user questions (truncated for brevity)
    const userQuestions = messages
      .filter((msg) => msg.role === "user")
      .map((msg) => msg.content.substring(0, 100).trim())
      .filter((content) => content.length > 0);

    // Identify health topics mentioned
    const topicsSet = new Set<string>();
    const topicKeywords: Record<string, string[]> = {
      exercise: [
        "exercise",
        "workout",
        "activity",
        "steps",
        "walking",
        "running",
      ],
      sleep: ["sleep", "rest", "insomnia", "tired"],
      diet: ["diet", "nutrition", "food", "eating", "calories"],
      cardiovascular: [
        "heart",
        "cardiovascular",
        "blood pressure",
        "hrv",
        "cardio",
      ],
      weight: ["weight", "bmi", "mass"],
      stress: ["stress", "anxiety", "mental health"],
      "lab results": ["lab", "blood test", "results", "cholesterol", "glucose"],
    };

    messages.forEach((msg) => {
      const lowerContent = msg.content.toLowerCase();
      Object.entries(topicKeywords).forEach(([topic, keywords]) => {
        if (keywords.some((keyword) => lowerContent.includes(keyword))) {
          topicsSet.add(topic);
        }
      });
    });

    const topics = Array.from(topicsSet);

    // Build compact summary
    let summary = "Previous conversation context:";

    if (topics.length > 0) {
      summary += `\n- Topics discussed: ${topics.join(", ")}`;
    }

    if (userQuestions.length > 0) {
      summary += `\n- User asked about: ${userQuestions.slice(0, 3).join("; ")}${userQuestions.length > 3 ? "..." : ""}`;
    }

    return summary;
  }

  /**
   * Get a fallback response if the API call fails
   */
  private getFallbackResponse(
    userMessage: string,
    conversationHistory?: Array<{
      role: "user" | "assistant";
      content: string;
    }>,
  ): string {
    const lower = userMessage.toLowerCase().trim();

    const isShortAffirmation =
      /^(y|yes|yeah|yep|sure|ok|okay|please|pls|go ahead|sounds good)\b/.test(
        lower,
      ) && lower.length <= 24;

    if (
      isShortAffirmation &&
      conversationHistory &&
      conversationHistory.length
    ) {
      const lastAssistant = [...conversationHistory]
        .reverse()
        .find((m) => m.role === "assistant")?.content;
      const lastUser = [...conversationHistory]
        .reverse()
        .find((m) => m.role === "user")?.content;

      const contextText =
        `${lastUser ?? ""}\n${lastAssistant ?? ""}`.toLowerCase();

      if (
        contextText.includes("keto") &&
        (contextText.includes("protein alternatives") ||
          contextText.includes("unprocessed protein") ||
          contextText.includes("unprocessed protein alternatives"))
      ) {
        return (
          "Here are keto-friendly, mostly unprocessed protein options (with easy swaps):\n\n" +
          "- Fish/seafood: salmon, sardines, trout, shrimp (great omega-3s)\n" +
          "- Poultry: chicken thighs, turkey, rotisserie chicken (check ingredients)\n" +
          "- Eggs: hard-boiled, omelets; add spinach/mushrooms/cheese\n" +
          "- Beef/lamb: steak, ground beef (look for single-ingredient), slow-cooked roasts\n" +
          "- Pork (less processed): pork shoulder, pork chops\n" +
          "- Dairy (if you tolerate it): Greek yogurt (unsweetened), cottage cheese, cheese\n" +
          "- Plant-based: tofu/tempeh, edamame (carbs vary by portion)\n\n" +
          "If you want to keep some processed meats, a simple approach is: make them an occasional accent (a few servings/week), not the default protein, and pair them with high-fiber sides (non-starchy veg) to balance the meal."
        );
      }

      // Generic "yes" continuation: if Cosaint just offered to elaborate on keto options,
      // provide a concrete next step instead of saying "missing context".
      if (
        contextText.includes("keto") &&
        (contextText.includes("elaborate") ||
          contextText.includes("food options") ||
          (contextText.includes("keto") &&
            contextText.includes("would you like")))
      ) {
        return (
          "Great—here are a few high-signal keto staples beyond meat, with how to use them:\n\n" +
          "- Low-carb veg (base of meals): spinach, broccoli, cauliflower, zucchini, peppers. Roast/sauté and add olive oil/butter.\n" +
          "- Healthy fats (make it satisfying): olive oil, avocado, olives, nuts/seeds; use these to hit satiety without processed meats.\n" +
          "- Eggs (easy protein): omelets/frittatas with veg + cheese.\n" +
          "- Dairy (if tolerated): hard cheeses, cottage cheese, unsweetened Greek yogurt; watch portions if it stalls goals.\n" +
          "- Seafood (great quality): salmon/sardines/shrimp—often a cleaner protein than processed meats.\n\n" +
          "If you tell me what you typically eat in a day on keto, I can suggest the cleanest swaps to reduce processed meats without making keto feel restrictive."
        );
      }
    }

    // Provide a minimally helpful, topic-aware fallback for common questions
    // (Prefer this over generic "defaultResponses" when the model returns empty.)
    if (lower.includes("keto") && lower.includes("energy")) {
      return "Keto can help some people feel steadier energy after an adaptation phase, but the first 1–2 weeks often feel worse (fatigue, headaches). The biggest fix is usually electrolytes (salt, potassium, magnesium) plus enough calories and protein. If your goal is higher day-to-day energy, a less restrictive approach (higher-protein, minimally processed carbs around training, consistent sleep) often works as well with fewer downsides. Are you doing keto for weight loss, blood sugar control, or just energy?";
    }

    if (
      lower.includes("keto") &&
      (lower.includes("processed") ||
        lower.includes("processed meats") ||
        lower.includes("meats"))
    ) {
      return "If you’re doing keto, it’s still a good idea to keep processed meats as an occasional add-on rather than a staple. A practical target is: most days choose unprocessed proteins (fish, poultry, eggs, yogurt, tofu/tempeh) and use processed meats (bacon/sausage/deli meats) sparingly—e.g., a few servings per week. If you do have them, pick options with fewer additives (lower sodium, no nitrates/nitrites when possible) and balance with plenty of fiber (non-starchy veg, nuts/seeds).";
    }

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
      process.env.NEXT_PUBLIC_VENICE_MODEL_NAME || "zai-org-glm-4.7",
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

    const response = await this.veniceApi.generateVeniceResponse(prompt, 500, {
      disable_thinking: true,
      strip_thinking_response: true,
      include_venice_system_prompt: false,
    });
    return response
      ? response
          .split("\n")
          .map((line) => line.replace(/^[-*]\s*/, "").trim())
          .filter((line) => line.length > 0)
      : [];
  }

  /**
   * Execute a tool call directly on the client (IndexedDB is browser-only)
   */
  private async executeTool(toolCall: ToolCall): Promise<{
    success: boolean;
    tool: string;
    data?: unknown;
    error?: string;
  }> {
    try {
      // Create data source and executor on client side where IndexedDB is available
      const dataSource = new IndexedDBDataSource();
      const executor = new ToolExecutor(dataSource);
      const result = await executor.execute(toolCall);

      return {
        success: result.success,
        tool: result.tool,
        data: result.data,
        error: result.error,
      };
    } catch (error) {
      console.error("[CosaintAiService] Tool execution error:", error);
      return {
        success: false,
        tool: toolCall.tool,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Format tool results for AI consumption
   */
  private formatToolResults(
    results: Array<{
      success: boolean;
      tool: string;
      data?: unknown;
      error?: string;
    }>,
  ): string {
    return results
      .map((result, i) => {
        if (!result.success) {
          return `Tool ${i + 1} (${result.tool}): Error - ${result.error}`;
        }

        // Format data nicely
        let dataStr = "";
        try {
          // Check if data has a structure we can summarize
          const data = result.data as { data?: unknown[]; metadata?: unknown };

          if (
            data &&
            typeof data === "object" &&
            "data" in data &&
            Array.isArray(data.data)
          ) {
            const dataArray = data.data;
            const metadata = data.metadata || {};

            // For large datasets, provide a summary instead of truncating
            if (dataArray.length > 100) {
              // Sample first and last few points, plus summary stats
              const sampleSize = 10;
              const firstSample = dataArray.slice(0, sampleSize);
              const lastSample = dataArray.slice(-sampleSize);

              // Calculate summary statistics if it's time-series data
              let summary = "";
              if (
                dataArray.length > 0 &&
                typeof dataArray[0] === "object" &&
                dataArray[0] !== null &&
                "value" in dataArray[0]
              ) {
                const values = dataArray
                  .map((d: unknown) => {
                    const item = d as { value?: number | string };
                    if (typeof item.value === "number") return item.value;
                    if (typeof item.value === "string")
                      return parseFloat(item.value);
                    return 0;
                  })
                  .filter((v) => !isNaN(v) && v > 0);
                if (values.length > 0) {
                  const avg = values.reduce((a, b) => a + b, 0) / values.length;
                  const min = Math.min(...values);
                  const max = Math.max(...values);
                  summary = `\nSummary: ${values.length} data points, avg: ${avg.toFixed(2)}, min: ${min.toFixed(2)}, max: ${max.toFixed(2)}`;
                }
              }

              dataStr = JSON.stringify(
                {
                  metadata,
                  totalRecords: dataArray.length,
                  sample: {
                    first: firstSample,
                    last: lastSample,
                  },
                  summary,
                  note: `Showing first ${sampleSize} and last ${sampleSize} of ${dataArray.length} total records. Full data available on request.`,
                },
                null,
                2,
              );
            } else {
              // For smaller datasets, return full data
              dataStr = JSON.stringify(result.data, null, 2);
            }

            // Still limit total length to avoid token overflow (but much higher limit)
            const maxLength = 10000; // Increased from 2000
            if (dataStr.length > maxLength) {
              dataStr =
                dataStr.substring(0, maxLength) +
                `\n... (truncated at ${maxLength} chars, total was ${dataStr.length} chars)`;
            }
          } else {
            // For non-array data, use original logic with higher limit
            dataStr = JSON.stringify(result.data, null, 2);
            const maxLength = 10000;
            if (dataStr.length > maxLength) {
              dataStr =
                dataStr.substring(0, maxLength) +
                `\n... (truncated at ${maxLength} chars)`;
            }
          }
        } catch {
          dataStr = String(result.data);
        }

        // Log the size of data being sent to AI
        console.log(`[CosaintAiService] Tool result size for ${result.tool}:`, {
          length: dataStr.length,
          truncated: dataStr.includes("truncated"),
        });

        return `Tool ${i + 1} (${result.tool}):\n${dataStr}`;
      })
      .join("\n\n");
  }
}
