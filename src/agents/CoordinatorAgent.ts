import type { VeniceApiService } from "@/api/venice/VeniceApiService";
import {
  getCachedAgentResult,
  setCachedAgentResult,
} from "@/utils/agentResultCache";
import {
  getCachedCoordinatorSummary,
  setCachedCoordinatorSummary,
} from "@/utils/coordinatorSummaryCache";
import { shouldDisableVeniceThinking } from "@/utils/veniceThinking";

import { ActivityEnergyAgent } from "./ActivityEnergyAgent";
import { BaseHealthAgent } from "./BaseHealthAgent";
import { BloodworkAgent } from "./BloodworkAgent";
import { CardiovascularAgent } from "./CardiovascularAgent";
import { DexaAgent } from "./DexaAgent";
import { RecoveryStressAgent } from "./RecoveryStressAgent";
import { SleepAgent } from "./SleepAgent";
import type {
  AgentExecutionContext,
  AgentInsight,
  AgentProfile,
} from "./types";

export interface CoordinatorOptions {
  profile?: AgentProfile;
  queries?: Partial<Record<string, string>>;
}

export interface CoordinatorSummary {
  summary: string;
  keyFindings: string[];
  priorityActions: string[];
  watchItems?: string[];
}

export interface CoordinatorResult {
  profile?: AgentProfile;
  agentInsights: Record<string, AgentInsight>;
  combinedSummary: CoordinatorSummary | null;
  rawSummary?: string;
}

const DEFAULT_AGENT_QUERIES: Record<string, string> = {
  sleep: "Analyze sleep quality, consistency, and recovery signals.",
  activity_energy:
    "Review daily movement, energy expenditure, and structured exercise patterns.",
  cardiovascular: "Assess cardiovascular load, trends, and potential risks.",
  recovery_stress:
    "Evaluate autonomic recovery readiness, stress load, and restorative factors.",
  dexa: "Interpret DEXA scan data for body composition, visceral fat, and bone density insights.",
  bloodwork:
    "Summarize notable laboratory findings, prioritizing abnormal biomarkers and panel-level themes.",
};

const SUMMARY_SYSTEM_PROMPT = `You are Cosaint's integrative health analyst. Synthesize specialist agent findings into a cohesive analysis.

Return JSON:
{
  "summary": "3-4 sentences connecting themes, mention cross-metric interactions (e.g., sleep→HRV), natural transitions.",
  "keyFindings": ["Full sentences per domain. Bloodwork: panel name + values + context. DEXA: body comp + bone density. Other domains as relevant."],
  "priorityActions": ["2-3 full sentences: specific actions, why they matter, multi-system benefits."],
  "watchItems": ["Optional: emerging risks, conflicts, missing data. Omit if not relevant."]
}

Guidelines:
- Use "you/your", natural phrasing ("As a 44-year-old male...").
- Reference actual numbers. Use profile (age/BMI/sex) for context.
- Bloodwork: one bullet per panel with flagged markers + context.
- DEXA: integrate total fat %, visceral fat, bone density, regional highlights.
- If metadata flags show guidelines met, focus on refinement not increases.
- Priority actions: show cross-system benefits (e.g., "flatten sleep swings to stabilize HRV").
- Use conversationHistory to infer user focus.
- Watch items: only real gaps/conflicts.
- Stay grounded in payload. Supportive, evidence-based voice.`;

export class CoordinatorAgent {
  private readonly agents: BaseHealthAgent[];

  constructor(private readonly veniceService: VeniceApiService) {
    this.agents = [
      new SleepAgent(veniceService),
      new ActivityEnergyAgent(veniceService),
      new CardiovascularAgent(veniceService),
      new RecoveryStressAgent(veniceService),
      new DexaAgent(veniceService),
      new BloodworkAgent(veniceService),
    ];
  }

  async analyze(
    context: Omit<AgentExecutionContext, "query"> & {
      conversationHistory?: Array<{
        role: "user" | "assistant";
        content: string;
      }>;
    },
    options: CoordinatorOptions = {},
  ): Promise<CoordinatorResult> {
    const { profile, queries } = options;
    const agentInsights: Record<string, AgentInsight> = {};

    // Cache TTL: same as coordinator cache (24h for initial, 15m for ongoing)
    const maxAgeMs =
      context.analysisMode === "initial" ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000;

    // Run all agents with a 100ms stagger to reduce concurrent load on Venice API
    // Note: We rely on Venice API's built-in timeout (130s) rather than adding our own
    // to avoid race conditions where Venice completes successfully but our timeout wins

    const agentPromises = this.agents.map(async (agent, index) => {
      // Stagger agent execution by 100ms per agent to reduce concurrent load
      if (index > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100 * index));
      }

      const query =
        queries?.[agent.id] ?? DEFAULT_AGENT_QUERIES[agent.id] ?? "";

      const startTime = Date.now();

      // Check cache first
      const cached = getCachedAgentResult({
        agentId: agent.id,
        availableData: context.availableData,
        analysisMode: context.analysisMode ?? "ongoing",
        maxAgeMs,
      });

      if (cached) {
        const duration = Date.now() - startTime;
        console.log(
          `✅ [CoordinatorAgent] Agent ${agent.id} cache HIT (${duration}ms)`,
          {
            findingsCount: cached.findings?.length ?? 0,
            confidence: cached.confidence,
            relevance: cached.relevance,
          },
        );
        return { agentId: agent.id, insight: cached, error: null };
      }

      try {
        // Let Venice API handle its own timeout (130s) - no need for additional timeout here
        const insight = await agent.analyze({
          ...context,
          query,
          profile,
        });

        // Cache the result
        setCachedAgentResult({
          agentId: agent.id,
          availableData: context.availableData,
          analysisMode: context.analysisMode ?? "ongoing",
          result: insight,
        });

        const duration = Date.now() - startTime;
        console.log(
          `✅ [CoordinatorAgent] Agent ${agent.id} completed successfully in ${duration}ms`,
          {
            findingsCount: insight.findings?.length ?? 0,
            confidence: insight.confidence,
            relevance: insight.relevance,
          },
        );

        return { agentId: agent.id, insight, error: null };
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(
          `❌ [CoordinatorAgent] Agent ${agent.id} failed after ${duration}ms:`,
          {
            error: error instanceof Error ? error.message : String(error),
            stack:
              error instanceof Error
                ? error.stack?.substring(0, 500)
                : undefined,
            errorType:
              error instanceof Error ? error.constructor.name : typeof error,
            isTimeout:
              error instanceof Error && error.message.includes("timed out"),
          },
        );
        // Return error insight so coordinator can still build summary
        const errorMessage =
          error instanceof Error ? error.message : "Analysis failed";
        const errorInsight: AgentInsight = {
          agentId: agent.id,
          relevance: 0.1,
          confidence: 0.3,
          findings: [
            {
              observation: `${agent.name} analysis failed`,
              evidence: errorMessage,
              significance: "Analysis could not be completed",
              confidence: 0.3,
            },
          ],
          trends: [],
          concerns: [],
          correlations: [],
          recommendations: [],
          dataLimitations: [errorMessage],
          dataPoints: [],
          rawResponse: errorMessage,
        };
        return {
          agentId: agent.id,
          insight: errorInsight,
          error: errorMessage,
        };
      }
    });

    // Wait for all agents to complete (or fail gracefully)
    console.log("[CoordinatorAgent] Waiting for all agents to complete...");
    const results = await Promise.allSettled(agentPromises);
    console.log(
      "[CoordinatorAgent] All agents completed, processing results...",
    );

    // Process results
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const agent = this.agents[i];

      if (result.status === "fulfilled") {
        const { agentId, insight, error } = result.value;
        agentInsights[agentId] = insight;

        if (error) {
          console.warn(
            `[CoordinatorAgent] Agent ${agentId} completed with error:`,
            error,
          );
        } else {
          console.log(`[CoordinatorAgent] Agent ${agentId} result processed:`, {
            hasInsight: Boolean(insight),
            findingsCount: insight.findings?.length ?? 0,
            confidence: insight.confidence,
            relevance: insight.relevance,
          });
        }
      } else {
        // If the promise itself was rejected, create a fallback error insight
        const agentId = agent?.id;
        console.error("[CoordinatorAgent] Agent promise rejected:", {
          agentId,
          reason: result.reason,
          errorMessage:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
          stack:
            result.reason instanceof Error
              ? result.reason.stack?.substring(0, 500)
              : undefined,
        });
        // Add fallback error insight so coordinator has complete data
        if (agentId) {
          agentInsights[agentId] = {
            agentId,
            relevance: 0.1,
            confidence: 0.3,
            findings: [
              {
                observation: `${agentId} analysis failed due to promise rejection`,
                evidence:
                  result.reason instanceof Error
                    ? result.reason.message
                    : String(result.reason),
                significance: "Analysis could not be completed",
                confidence: 0.3,
              },
            ],
            trends: [],
            concerns: [],
            correlations: [],
            recommendations: [],
            dataLimitations: ["Agent promise was rejected"],
            dataPoints: [],
            rawResponse:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          };
        }
      }
    }

    console.log("[CoordinatorAgent] Agent results summary:", {
      totalAgents: this.agents.length,
      successfulInsights: Object.keys(agentInsights).length,
      agentIds: Object.keys(agentInsights),
      allAgentsPresent: this.agents.every(
        (a) => agentInsights[a.id] !== undefined,
      ),
    });

    // Ensure all agents are present before generating summary
    if (Object.keys(agentInsights).length < this.agents.length) {
      console.warn(
        `[CoordinatorAgent] Missing agent insights: expected ${this.agents.length}, got ${Object.keys(agentInsights).length}`,
      );
    }

    // Check cache for coordinator summary (depends only on agent insights)
    const summaryMaxAgeMs =
      context.analysisMode === "initial" ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000;
    let combinedSummary:
      | { raw: string; parsed: CoordinatorSummary | null }
      | undefined;

    const cachedSummary = getCachedCoordinatorSummary({
      agentInsights,
      maxAgeMs: summaryMaxAgeMs,
    });

    if (cachedSummary) {
      console.log("[CoordinatorAgent] Using cached coordinator summary");
      combinedSummary = { raw: "", parsed: cachedSummary };
    } else {
      console.log("[CoordinatorAgent] Generating coordinator summary...", {
        agentCount: Object.keys(agentInsights).length,
        expectedAgentCount: this.agents.length,
      });
      combinedSummary = await this.buildSummary(
        agentInsights,
        profile,
        context.conversationHistory,
      );

      // Cache the summary if generation succeeded
      if (combinedSummary?.parsed) {
        setCachedCoordinatorSummary({
          agentInsights,
          summary: combinedSummary.parsed,
        });
      }
    }

    console.log("[CoordinatorAgent] Summary generation result:", {
      hasSummary: Boolean(combinedSummary),
      hasParsed: Boolean(combinedSummary?.parsed),
      hasRaw: Boolean(combinedSummary?.raw),
      rawLength: combinedSummary?.raw?.length ?? 0,
    });

    return {
      profile,
      agentInsights,
      combinedSummary: combinedSummary?.parsed ?? null,
      rawSummary: combinedSummary?.raw,
    };
  }

  private async buildSummary(
    agentInsights: Record<string, AgentInsight>,
    profile?: AgentProfile,
    conversationHistory?: Array<{
      role: "user" | "assistant";
      content: string;
    }>,
  ): Promise<{ raw: string; parsed: CoordinatorSummary | null } | undefined> {
    try {
      const payload = {
        profile,
        specialists: this.agents.map((agent) => {
          const insight = agentInsights[agent.id];
          return {
            id: agent.id,
            name: agent.name,
            confidence: insight?.confidence ?? null,
            relevance: insight?.relevance ?? null,
            metadata: insight?.metadata ?? {},
            findings: insight?.findings ?? [],
            trends: insight?.trends ?? [],
            concerns: insight?.concerns ?? [],
            recommendations: insight?.recommendations ?? [],
            dataLimitations: insight?.dataLimitations ?? [],
          };
        }),
        crossSignals: this.buildCrossSignals(agentInsights),
        conversationHistory,
      };

      const summaryPrompt = `PROFILE_AND_SPECIALIST_DATA:\n${JSON.stringify(payload, null, 2)}\n\nGenerate the required JSON response.`;

      const rawSummary = await this.veniceService.generateCompletion({
        systemPrompt: SUMMARY_SYSTEM_PROMPT,
        userPrompt: summaryPrompt,
        temperature: 0.2,
        // Coordinator summary should stay concise: enough room for rich bullets,
        // but bounded to keep total Deep analysis latency under 60s.
        maxTokens: 900,
        veniceParameters: {
          strip_thinking_response: true,
          include_venice_system_prompt: false,
          ...(shouldDisableVeniceThinking("analysis")
            ? { disable_thinking: true }
            : {}),
        },
      });

      // Check if summary is empty (Venice timeout or error)
      if (!rawSummary || rawSummary.trim().length === 0) {
        console.error(
          "[CoordinatorAgent] Summary generation returned empty response",
          {
            agentCount: Object.keys(agentInsights).length,
            payloadSize: JSON.stringify(payload).length,
          },
        );
        return { raw: "", parsed: null };
      }

      let parsed: CoordinatorSummary | null = null;
      try {
        // Strip markdown code fences if present (Venice API sometimes wraps JSON in ```json...```)
        let cleanedSummary = rawSummary.trim();
        if (cleanedSummary.startsWith("```json")) {
          cleanedSummary = cleanedSummary.substring(7); // Remove ```json
        } else if (cleanedSummary.startsWith("```")) {
          cleanedSummary = cleanedSummary.substring(3); // Remove ```
        }
        if (cleanedSummary.endsWith("```")) {
          cleanedSummary = cleanedSummary.substring(
            0,
            cleanedSummary.length - 3,
          );
        }
        cleanedSummary = cleanedSummary.trim();

        parsed = JSON.parse(cleanedSummary) as CoordinatorSummary;
        console.log("[CoordinatorAgent] Summary parsed successfully:", {
          hasSummary: Boolean(parsed?.summary),
          keyFindingsCount: parsed?.keyFindings?.length ?? 0,
          priorityActionsCount: parsed?.priorityActions?.length ?? 0,
          watchItemsCount: parsed?.watchItems?.length ?? 0,
        });
      } catch (error) {
        console.error("[CoordinatorAgent] Summary parsing failed:", {
          error: error instanceof Error ? error.message : String(error),
          rawSummaryLength: rawSummary.length,
          rawSummaryPreview: rawSummary.substring(0, 500),
        });
        // If parsing fails, keep parsed as null but return raw for inspection
      }

      return { raw: rawSummary, parsed };
    } catch (error) {
      console.error("[CoordinatorAgent] Summary generation failed:", {
        error: error instanceof Error ? error.message : String(error),
        stack:
          error instanceof Error ? error.stack?.substring(0, 500) : undefined,
        agentCount: Object.keys(agentInsights).length,
      });
      return undefined;
    }
  }

  private buildCrossSignals(
    agentInsights: Record<string, AgentInsight>,
  ): Record<string, unknown> {
    const sleepMeta = agentInsights.sleep?.metadata ?? {};
    const activityMeta = agentInsights.activity_energy?.metadata ?? {};
    const cardioMeta = agentInsights.cardiovascular?.metadata ?? {};
    const recoveryMeta = agentInsights.recovery_stress?.metadata ?? {};
    const dexaMeta = agentInsights.dexa?.metadata ?? {};
    const bloodworkMeta = agentInsights.bloodwork?.metadata ?? {};

    const crossSignals: Record<string, unknown> = {};

    if (
      typeof sleepMeta.sleepConsistencyScore === "number" &&
      typeof recoveryMeta.recoveryHRVVolatility === "number"
    ) {
      crossSignals.sleepRecoveryCoupling = {
        sleepConsistencyScore: sleepMeta.sleepConsistencyScore,
        hrvVolatility: recoveryMeta.recoveryHRVVolatility,
      };
    }

    if (
      typeof activityMeta.activityAverageSteps === "number" &&
      typeof cardioMeta.cardioAverageVO2Max === "number"
    ) {
      crossSignals.activityCardioIntegration = {
        averageSteps: activityMeta.activityAverageSteps,
        vo2Max: cardioMeta.cardioAverageVO2Max,
      };
    }

    if (
      typeof activityMeta.activityHighIntensityMinutesPerWeek === "number" ||
      typeof activityMeta.activityModerateIntensityMinutesPerWeek === "number"
    ) {
      crossSignals.trainingLoad = {
        highIntensityMinutesPerWeek:
          activityMeta.activityHighIntensityMinutesPerWeek ?? null,
        moderateIntensityMinutesPerWeek:
          activityMeta.activityModerateIntensityMinutesPerWeek ?? null,
        meetsAerobicGuidelines:
          activityMeta.activityMeetsAerobicGuidelines ?? null,
      };
    }

    if (
      typeof dexaMeta.dexaTotalBodyFatPercent === "number" &&
      typeof activityMeta.activityAverageSteps === "number"
    ) {
      crossSignals.bodyCompositionMovement = {
        totalBodyFatPercent: dexaMeta.dexaTotalBodyFatPercent,
        averageSteps: activityMeta.activityAverageSteps,
      };
    }

    if (
      typeof bloodworkMeta.bloodworkFlaggedMetrics === "number" &&
      bloodworkMeta.bloodworkPanels
    ) {
      crossSignals.labPriorities = {
        flaggedMetrics: bloodworkMeta.bloodworkFlaggedMetrics,
        panels: bloodworkMeta.bloodworkPanels,
      };
    }

    if (
      typeof dexaMeta.dexaBoneDensityTScore === "number" &&
      typeof bloodworkMeta.bloodworkFlaggedMetrics === "number"
    ) {
      crossSignals.boneDensityLabContext = {
        tScore: dexaMeta.dexaBoneDensityTScore,
        flaggedLabs: bloodworkMeta.bloodworkFlaggedMetrics,
      };
    }

    return crossSignals;
  }
}
