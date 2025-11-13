import type { VeniceApiService } from "@/api/venice/VeniceApiService";
import { logger } from "@/utils/logger";

import type {
  AgentDataQualityAssessment,
  AgentExecutionContext,
  AgentInsight,
  MetricSample,
} from "./types";

export abstract class BaseHealthAgent {
  abstract id: string;
  abstract name: string;
  abstract expertise: string[];
  abstract systemPrompt: string;

  constructor(protected veniceService: VeniceApiService) {}

  protected getEnhancedSystemPrompt(): string {
    return `${this.systemPrompt}

ANALYSIS FRAMEWORK:
1. Data Review: Examine all available data carefully
2. Pattern Recognition: Identify trends, anomalies, correlations
3. Clinical Context: Consider normal ranges, age, activity level
4. Confidence Assessment: Be explicit about certainty levels
5. Actionability: Prioritize insights that lead to action

QUALITY STANDARDS:
- Be specific: Use exact numbers, dates, percentages
- Show your work: Explain how you reached conclusions
- Acknowledge limitations: State what you can't determine
- Provide context: Compare to baselines, norms, previous periods
- Be conservative: Better to say "possible" than "certain"

OUTPUT STRUCTURE:
{
  "findings": [
    {
      "observation": "specific data-backed finding",
      "evidence": "which data points support this",
      "significance": "why this matters",
      "confidence": 0.0-1.0
    }
  ],
  "trends": [
    {
      "pattern": "description of trend",
      "timeframe": "over what period",
      "direction": "improving/declining/stable",
      "magnitude": "how significant",
      "confidence": 0.0-1.0
    }
  ],
  "concerns": [
    {
      "issue": "potential problem identified",
      "severity": "low/moderate/high",
      "evidence": "supporting data",
      "recommendation": "what to do about it"
    }
  ],
  "correlations": [
    {
      "metric1": "first metric",
      "metric2": "second metric",
      "relationship": "description of correlation",
      "strength": "weak/moderate/strong",
      "confidence": 0.0-1.0
    }
  ],
  "recommendations": [
    {
      "action": "specific actionable step",
      "priority": "high/medium/low",
      "rationale": "why this matters",
      "timeframe": "when to do this"
    }
  ],
  "dataLimitations": [
    "what data would improve this analysis"
  ],
  "overallConfidence": 0.0-1.0,
  "relevanceToQuery": 0.0-1.0
}`;
  }

  async analyze(context: AgentExecutionContext): Promise<AgentInsight> {
    const relevantData = this.extractRelevantData(context);
    const dataQuality = this.assessDataQuality(relevantData);

    if (dataQuality.score < 0.2) {
      return {
        agentId: this.id,
        relevance: 0,
        findings: [],
        confidence: 0,
        dataPoints: [],
        note: `Insufficient data for ${this.name}. Need: ${dataQuality.missing.join(", ")}`,
        trends: [],
        concerns: [],
        correlations: [],
        recommendations: [],
        dataLimitations: dataQuality.limitations.length
          ? dataQuality.limitations
          : ["Not enough data for analysis"],
      };
    }

    const prompt = this.buildDetailedPrompt(
      context.query,
      relevantData,
      dataQuality,
    );

    try {
      const response = await this.veniceService.generateCompletion({
        systemPrompt: this.getEnhancedSystemPrompt(),
        userPrompt: prompt,
        temperature: 0.4,
        maxTokens: 4000,
      });

      const insight = this.parseEnhancedResponse(response);
      return this.postProcessInsight(
        insight,
        relevantData,
        dataQuality,
        context,
      );
    } catch (error) {
      logger.error(`[${this.name}] Venice completion failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.createErrorInsight("Failed to generate analysis");
    }
  }

  protected buildDetailedPrompt(
    query: string,
    data: unknown,
    quality: AgentDataQualityAssessment,
  ): string {
    const dateRange =
      quality.dateRange != null
        ? `${quality.dateRange.start.toLocaleDateString()} to ${quality.dateRange.end.toLocaleDateString()}`
        : "Insufficient date coverage";

    return `USER QUERY: "${query}"

DATA QUALITY ASSESSMENT:
- Overall Score: ${quality.score.toFixed(2)}/1.0
- Strengths: ${quality.strengths.join(", ") || "None identified"}
- Limitations: ${quality.limitations.join(", ") || "None identified"}
${quality.missing.length > 0 ? `- Missing: ${quality.missing.join(", ")}` : ""}

AVAILABLE DATA:
${this.formatDataForAnalysis(data)}

TIME CONTEXT:
- Analysis Period: ${dateRange}
- Days of Data: ${quality.dayCount}
- Sample Frequency: ${quality.sampleFrequency}

INSTRUCTIONS:
Analyze this data in the context of the user's query. Provide:
1. Specific findings backed by the data
2. Trends over time with directionality and magnitude
3. Any concerns that should be flagged
4. Correlations between metrics (if multiple available)
5. Actionable recommendations with priority levels
6. Clear statement of confidence and limitations

Be thorough but precise. Quality over quantity.`;
  }

  protected abstract extractRelevantData(
    context: AgentExecutionContext,
  ): unknown;

  protected abstract assessDataQuality(
    data: unknown,
  ): AgentDataQualityAssessment;

  protected abstract formatDataForAnalysis(data: unknown): string;

  protected parseEnhancedResponse(response: string): AgentInsight {
    try {
      const parsed = JSON.parse(response);
      return {
        agentId: this.id,
        relevance: parsed.relevanceToQuery ?? 0.5,
        confidence: parsed.overallConfidence ?? 0.5,
        findings: (parsed.findings ?? []).map(
          (finding: Record<string, unknown>) => ({
            observation: String(
              finding.observation ?? "Unspecified observation",
            ),
            evidence: String(finding.evidence ?? "Evidence not provided"),
            significance: String(
              finding.significance ?? "Significance not provided",
            ),
            confidence: Number(finding.confidence ?? 0.5),
          }),
        ),
        trends: (parsed.trends ?? []).map((trend: Record<string, unknown>) => ({
          pattern: String(trend.pattern ?? "Pattern not specified"),
          timeframe: String(trend.timeframe ?? "Timeframe not provided"),
          direction: String(trend.direction ?? "stable"),
          magnitude: String(trend.magnitude ?? "Not quantified"),
          confidence: Number(trend.confidence ?? 0.5),
        })),
        concerns: (parsed.concerns ?? []).map(
          (concern: Record<string, unknown>) => ({
            issue: String(concern.issue ?? "Issue not specified"),
            severity: String(concern.severity ?? "low"),
            evidence: String(concern.evidence ?? "No evidence provided"),
            recommendation: String(
              concern.recommendation ?? "No recommendation provided",
            ),
          }),
        ),
        correlations: parsed.correlations ?? [],
        recommendations: (parsed.recommendations ?? []).map(
          (recommendation: Record<string, unknown>) => ({
            action: String(recommendation.action ?? "Action not specified"),
            priority: String(recommendation.priority ?? "medium"),
            rationale: String(
              recommendation.rationale ?? "No rationale provided",
            ),
            timeframe: String(recommendation.timeframe ?? "Not specified"),
          }),
        ),
        dataLimitations: parsed.dataLimitations ?? [],
        dataPoints: this.extractMentionedMetrics(response),
        rawResponse: response,
      };
    } catch (error) {
      logger.error(`Failed to parse ${this.id} response`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.createErrorInsight(response);
    }
  }

  protected extractMentionedMetrics(response: string): string[] {
    const metricRegex =
      /["']?(steps|sleep|hrv|heart rate|resting heart rate|respiratory|calories|energy|temperature)["']?/gi;
    const matches = response.match(metricRegex) ?? [];
    return Array.from(new Set(matches.map((metric) => metric.toLowerCase())));
  }

  protected getDateRange(samples: MetricSample[]): {
    start: Date;
    end: Date;
  } | null {
    if (!samples.length) {
      return null;
    }

    const timestamps = samples
      .map((sample) => sample.timestamp)
      .filter((timestamp): timestamp is Date => timestamp instanceof Date);

    if (!timestamps.length) {
      return null;
    }

    return {
      start: new Date(Math.min(...timestamps.map((date) => date.getTime()))),
      end: new Date(Math.max(...timestamps.map((date) => date.getTime()))),
    };
  }

  private createErrorInsight(response: string): AgentInsight {
    return {
      agentId: this.id,
      relevance: 0.1,
      confidence: 0.3,
      findings: [
        {
          observation: `${this.name} analysis completed with parsing issues`,
          evidence: "See raw response",
          significance: "May require manual review",
          confidence: 0.3,
        },
      ],
      trends: [],
      concerns: [],
      correlations: [],
      recommendations: [],
      dataLimitations: ["Response parsing failed"],
      dataPoints: [],
      rawResponse: response,
    };
  }

  protected postProcessInsight(
    insight: AgentInsight,
    data: unknown,
    quality: AgentDataQualityAssessment,
    context: AgentExecutionContext,
    extras?: Record<string, unknown>,
  ): AgentInsight {
    void data;
    void quality;
    void context;
    void extras;
    return insight;
  }
}
