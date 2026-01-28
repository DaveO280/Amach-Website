import type { VeniceApiService } from "@/api/venice/VeniceApiService";
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

const SUMMARY_SYSTEM_PROMPT = `You are Cosaint's integrative health analyst.
- Speak directly to the user (use "you" and "your"), weaving in Cosaint's data-forward yet compassionate tone. Use natural phrasing like "As a 44-year-old male..." rather than "You are a...".
- Keep the profile mention concise—one clause is enough. If this is a follow-up conversation, acknowledge the profile only if it adds context for the new question.
- You receive profile context plus structured findings from specialist agents (sleep, activity, cardiovascular, recovery, DEXA, bloodwork). Each specialist has already analyzed the raw data—your job is to synthesize their insights, highlight interplay between systems, and propose actionable next steps.

You must return a JSON object from this template:
{
  "summary": "3-4 flowing sentences (not bullet-like) that connect the main themes across agents, mention at least one cross-metric interaction (e.g., how sleep schedule influences HRV), and transition naturally between topics.",
  "keyFindings": [
    "For each available bloodwork panel, include a conversational bullet that starts with the panel name (e.g., 'Lipid panel: ...') and weaves in the exact values/flags, how they compare to reference ranges, and why they matter. Use full sentences rather than fragments.",
    "If DEXA data exists, include at least one bullet (full sentences) summarizing body composition (total body fat %, visceral metrics, android/gynoid balance), bone density (T/Z scores), and notable regional highlights from \`dexaRegionSummaries\`.",
    "Include additional bullets for other domains when needed, but keep each bullet conversational and avoid list-like fragments."
  ],
  "priorityActions": [
    "2-3 full-sentence items describing specific actions, why they matter, and how they influence multiple systems when possible."
  ],
  "watchItems": [
    "Optional full-sentence notes on emerging risks, conflicting signals, missing data, or items needing medical follow-up. Omit if not relevant."
  ]
}

Guidelines:
- Reference actual numbers (averages, ranges, lab values) when citing a metric.
- Leverage profile context (age, BMI, sex) to benchmark status when helpful.
- For each entry in \`bloodworkPanelSummaries\`, produce a dedicated keyFindings bullet (full sentences) covering all flagged markers and contextual in-range values. Ensure the tone remains conversational rather than clipped.
- If \`dexaRegionSummaries\` is present, ensure the DEXA bullet integrates total fat %, visceral fat, bone density, and notable regional summaries in narrative form.
- If a specialist metadata flag such as \`activityMeetsAerobicGuidelines\` is true, acknowledge that the guideline is already being met and avoid recommending increased duration; instead focus on refinement or sustainability.
- Priority actions should mention how improving one area can benefit another (e.g., "flatten weekend sleep swings to stabilize HRV") and use complete sentences.
- When the user asks about a specific topic, lean into that signal in the summary and key findings before introducing unrelated domains. You have access to the full conversation history via \`conversationHistory\`—use it to infer focus.
- Watch items are only for real gaps or conflicts—omit if data is robust.
- Do not invent data or embellish; stay grounded in the provided payload.
- Maintain Cosaint's supportive, evidence-based voice without sounding like a bulleted report.`;

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

    // Run all agents in parallel
    // Note: We rely on Venice API's built-in timeout (130s) rather than adding our own
    // to avoid race conditions where Venice completes successfully but our timeout wins

    const agentPromises = this.agents.map(async (agent) => {
      const query =
        queries?.[agent.id] ?? DEFAULT_AGENT_QUERIES[agent.id] ?? "";

      const startTime = Date.now();

      try {
        // Let Venice API handle its own timeout (130s) - no need for additional timeout here
        const insight = await agent.analyze({
          ...context,
          query,
          profile,
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
    const results = await Promise.allSettled(agentPromises);

    // Process results
    for (const result of results) {
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
        // If the promise itself was rejected (shouldn't happen, but handle it)
        console.error("[CoordinatorAgent] Agent promise rejected:", {
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
      }
    }

    console.log("[CoordinatorAgent] Agent results summary:", {
      totalAgents: this.agents.length,
      successfulInsights: Object.keys(agentInsights).length,
      agentIds: Object.keys(agentInsights),
    });

    const combinedSummary = await this.buildSummary(
      agentInsights,
      profile,
      context.conversationHistory,
    );

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
        maxTokens: 1200,
        veniceParameters: {
          strip_thinking_response: true,
          include_venice_system_prompt: false,
          ...(shouldDisableVeniceThinking("analysis")
            ? { disable_thinking: true }
            : {}),
        },
      });

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
