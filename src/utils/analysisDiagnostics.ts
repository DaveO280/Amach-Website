/**
 * Diagnostic utilities for analyzing multi-agent framework issues
 */

import type { CoordinatorResult } from "@/agents/CoordinatorAgent";
import type { AgentInsight } from "@/agents/types";

export interface AnalysisDiagnostics {
  timestamp: string;
  totalAgents: number;
  successfulAgents: number;
  failedAgents: number;
  timedOutAgents: number;
  agentDetails: AgentDiagnostic[];
  hasSummary: boolean;
  summaryError?: string;
  dataCoverage: {
    hasMetricData: boolean;
    hasReports: boolean;
    metricCount: number;
    reportCount: number;
  };
  performance: {
    estimatedDuration: number;
    slowestAgent?: string;
  };
}

export interface AgentDiagnostic {
  agentId: string;
  agentName: string;
  status: "success" | "failed" | "timeout" | "error";
  hasInsight: boolean;
  insightQuality: {
    hasFindings: boolean;
    findingsCount: number;
    hasTrends: boolean;
    trendsCount: number;
    hasRecommendations: boolean;
    recommendationsCount: number;
    confidence: number;
    relevance: number;
  };
  errorMessage?: string;
  dataPoints: number;
  rawResponseLength?: number;
  rawResponsePreview?: string;
}

/**
 * Analyze coordinator result and generate diagnostics
 */
export function diagnoseAnalysisResult(
  result: CoordinatorResult | null,
  metricDataCount: number = 0,
  reportCount: number = 0,
): AnalysisDiagnostics | null {
  if (!result) {
    return null;
  }

  const agentDetails: AgentDiagnostic[] = [];
  let successfulAgents = 0;
  let failedAgents = 0;
  let timedOutAgents = 0;
  let slowestAgent: string | undefined;
  let maxResponseLength = 0;

  for (const [agentId, insight] of Object.entries(result.agentInsights)) {
    const status = determineAgentStatus(insight);
    if (status === "success") {
      successfulAgents++;
    } else if (status === "timeout") {
      timedOutAgents++;
    } else {
      failedAgents++;
    }

    const diagnostic: AgentDiagnostic = {
      agentId,
      agentName: getAgentName(agentId),
      status,
      hasInsight: Boolean(insight),
      insightQuality: {
        hasFindings: (insight.findings?.length ?? 0) > 0,
        findingsCount: insight.findings?.length ?? 0,
        hasTrends: (insight.trends?.length ?? 0) > 0,
        trendsCount: insight.trends?.length ?? 0,
        hasRecommendations: (insight.recommendations?.length ?? 0) > 0,
        recommendationsCount: insight.recommendations?.length ?? 0,
        confidence: insight.confidence ?? 0,
        relevance: insight.relevance ?? 0,
      },
      errorMessage: insight.note || undefined,
      dataPoints: insight.dataPoints?.length ?? 0,
      rawResponseLength: insight.rawResponse?.length,
      rawResponsePreview: insight.rawResponse
        ? insight.rawResponse.substring(0, 200)
        : undefined,
    };

    if (insight.rawResponse && insight.rawResponse.length > maxResponseLength) {
      maxResponseLength = insight.rawResponse.length;
      slowestAgent = agentId;
    }

    agentDetails.push(diagnostic);
  }

  return {
    timestamp: new Date().toISOString(),
    totalAgents: Object.keys(result.agentInsights).length,
    successfulAgents,
    failedAgents,
    timedOutAgents,
    agentDetails,
    hasSummary: Boolean(result.combinedSummary),
    summaryError: result.combinedSummary
      ? undefined
      : "Summary generation failed or returned null",
    dataCoverage: {
      hasMetricData: metricDataCount > 0,
      hasReports: reportCount > 0,
      metricCount: metricDataCount,
      reportCount,
    },
    performance: {
      estimatedDuration: 0, // Would need timing data
      slowestAgent,
    },
  };
}

/**
 * Determine agent status from insight
 */
function determineAgentStatus(
  insight: AgentInsight,
): "success" | "failed" | "timeout" | "error" {
  // Check for timeout
  if (
    insight.note?.toLowerCase().includes("timeout") ||
    insight.rawResponse?.toLowerCase().includes("timeout")
  ) {
    return "timeout";
  }

  // Check for failure
  if (
    insight.confidence < 0.2 ||
    insight.relevance < 0.2 ||
    (insight.findings?.length ?? 0) === 0 ||
    insight.note?.toLowerCase().includes("failed")
  ) {
    return "failed";
  }

  // Check for error
  if (
    insight.dataLimitations?.some((lim) =>
      lim.toLowerCase().includes("error"),
    ) ||
    insight.rawResponse?.toLowerCase().includes("error")
  ) {
    return "error";
  }

  return "success";
}

/**
 * Get agent display name
 */
function getAgentName(agentId: string): string {
  const names: Record<string, string> = {
    sleep: "Sleep Quality Specialist",
    activity_energy: "Activity & Energy Specialist",
    cardiovascular: "Cardiovascular Specialist",
    recovery_stress: "Recovery & Stress Specialist",
    dexa: "DEXA Specialist",
    bloodwork: "Bloodwork Specialist",
  };
  return names[agentId] || agentId;
}

/**
 * Log diagnostics to console in a readable format
 */
export function logAnalysisDiagnostics(diagnostics: AnalysisDiagnostics): void {
  console.group("🔍 Multi-Agent Analysis Diagnostics");
  console.log(`Timestamp: ${diagnostics.timestamp}`);
  console.log(
    `Agents: ${diagnostics.successfulAgents}/${diagnostics.totalAgents} successful, ${diagnostics.failedAgents} failed, ${diagnostics.timedOutAgents} timed out`,
  );

  console.group("Agent Details");
  for (const agent of diagnostics.agentDetails) {
    const statusIcon =
      agent.status === "success"
        ? "✅"
        : agent.status === "timeout"
          ? "⏱️"
          : agent.status === "failed"
            ? "❌"
            : "⚠️";

    console.group(`${statusIcon} ${agent.agentName} (${agent.agentId})`);
    console.log(`Status: ${agent.status}`);
    console.log(`Confidence: ${agent.insightQuality.confidence.toFixed(2)}`);
    console.log(`Relevance: ${agent.insightQuality.relevance.toFixed(2)}`);
    console.log(
      `Findings: ${agent.insightQuality.findingsCount} | Trends: ${agent.insightQuality.trendsCount} | Recommendations: ${agent.insightQuality.recommendationsCount}`,
    );
    console.log(`Data Points: ${agent.dataPoints}`);
    if (agent.errorMessage) {
      console.warn(`Error: ${agent.errorMessage}`);
    }
    if (agent.rawResponseLength) {
      console.log(`Response Length: ${agent.rawResponseLength} chars`);
    }
    if (agent.rawResponsePreview && agent.status !== "success") {
      console.warn(`Response Preview: ${agent.rawResponsePreview}`);
    }
    console.groupEnd();
  }
  console.groupEnd();

  console.group("Summary");
  console.log(
    `Has Summary: ${diagnostics.hasSummary ? "✅" : "❌"} ${diagnostics.summaryError || ""}`,
  );
  console.groupEnd();

  console.group("Data Coverage");
  console.log(
    `Metrics: ${diagnostics.dataCoverage.metricCount} types, Reports: ${diagnostics.dataCoverage.reportCount}`,
  );
  console.log(
    `Has Metric Data: ${diagnostics.dataCoverage.hasMetricData ? "✅" : "❌"}`,
  );
  console.log(
    `Has Reports: ${diagnostics.dataCoverage.hasReports ? "✅" : "❌"}`,
  );
  console.groupEnd();

  console.groupEnd();
}
