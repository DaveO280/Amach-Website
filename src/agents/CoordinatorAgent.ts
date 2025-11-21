import type { VeniceApiService } from "@/api/venice/VeniceApiService";

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

    // Run all agents in parallel with individual timeouts
    // This prevents sequential execution from exceeding the 60s Vercel limit
    const AGENT_TIMEOUT_MS = 50000; // 50 seconds per agent (leaving buffer for coordinator summary)

    const agentPromises = this.agents.map(async (agent) => {
      const query =
        queries?.[agent.id] ?? DEFAULT_AGENT_QUERIES[agent.id] ?? "";

      // Wrap each agent call in a timeout
      const timeoutPromise = new Promise<AgentInsight>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                `Agent ${agent.id} timed out after ${AGENT_TIMEOUT_MS}ms`,
              ),
            ),
          AGENT_TIMEOUT_MS,
        );
      });

      const agentPromise = agent.analyze({
        ...context,
        query,
        profile,
      });

      try {
        const insight = await Promise.race([agentPromise, timeoutPromise]);
        return { agentId: agent.id, insight, error: null };
      } catch (error) {
        console.error(`[CoordinatorAgent] Agent ${agent.id} failed:`, {
          error: error instanceof Error ? error.message : String(error),
        });
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
        agentInsights[result.value.agentId] = result.value.insight;
      } else {
        // If the promise itself was rejected (shouldn't happen, but handle it)
        console.error(
          "[CoordinatorAgent] Agent promise rejected:",
          result.reason,
        );
      }
    }

    const combinedSummary = await this.buildSummary(
      agentInsights,
      profile,
      context.conversationHistory,
    );

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
      });

      let parsed: CoordinatorSummary | null = null;
      try {
        parsed = JSON.parse(rawSummary) as CoordinatorSummary;
      } catch (error) {
        // If parsing fails, keep parsed as null but return raw for inspection
      }

      return { raw: rawSummary, parsed };
    } catch (error) {
      console.error("Coordinator summary generation failed", error);
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
