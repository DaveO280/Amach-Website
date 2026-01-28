import type { VeniceApiService } from "@/api/venice/VeniceApiService";
import { logger } from "@/utils/logger";
import { logPromptToFile } from "@/utils/promptLogger";
import { shouldDisableVeniceThinking } from "@/utils/veniceThinking";

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

Analyze data systematically: review patterns, apply clinical context, assess confidence, prioritize actionable insights. Use exact numbers/dates. Compare to baselines. Be conservative.

Return JSON:
{
  "findings": [{"observation": "finding", "evidence": "data", "significance": "why", "confidence": 0.0-1.0}],
  "trends": [{"pattern": "trend", "timeframe": "period", "direction": "improving/declining/stable", "magnitude": "significance", "confidence": 0.0-1.0}],
  "concerns": [{"issue": "problem", "severity": "low/moderate/high", "evidence": "data", "recommendation": "action"}],
  "correlations": [{"metric1": "metric", "metric2": "metric", "relationship": "description", "strength": "weak/moderate/strong", "confidence": 0.0-1.0}],
  "recommendations": [{"action": "step", "priority": "high/medium/low", "rationale": "why", "timeframe": "when"}],
  "dataLimitations": ["missing data"],
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
      context,
    );

    try {
      const systemPrompt = this.getEnhancedSystemPrompt();
      console.log(`🔍 [${this.name}] Calling Venice API`, {
        promptLength: prompt.length,
        systemPromptLength: systemPrompt.length,
        totalPromptLength: systemPrompt.length + prompt.length,
        dataQuality: dataQuality.score,
        hasData: Boolean(relevantData),
      });

      // Log full prompts for debugging
      console.log(`📝 [${this.name}] FULL SYSTEM PROMPT:\n${systemPrompt}`);
      console.log(`📝 [${this.name}] FULL USER PROMPT:\n${prompt}`);

      // Save prompts to downloadable file for easier reading (development only)
      if (process.env.NODE_ENV === "development") {
        try {
          await logPromptToFile(this.name, systemPrompt, prompt);
        } catch (error) {
          console.warn(`[${this.name}] Could not log prompt to file:`, error);
        }
      }

      const response = await this.veniceService.generateCompletion({
        systemPrompt: this.getEnhancedSystemPrompt(),
        userPrompt: prompt,
        temperature: 0.4,
        maxTokens: 8000, // Increased for historical context analysis
        veniceParameters: {
          strip_thinking_response: true,
          include_venice_system_prompt: false,
          ...(shouldDisableVeniceThinking("analysis")
            ? { disable_thinking: true }
            : {}),
        },
      });

      console.log(`✅ [${this.name}] Venice API response received`, {
        responseLength: response.length,
        hasResponse: Boolean(response),
      });

      const insight = this.parseEnhancedResponse(response);
      console.log(`✅ [${this.name}] Response parsed successfully`, {
        findingsCount: insight.findings?.length || 0,
        confidence: insight.confidence,
      });

      try {
        return this.postProcessInsight(
          insight,
          relevantData,
          dataQuality,
          context,
        );
      } catch (postProcessError) {
        console.error(`❌ [${this.name}] postProcessInsight failed:`, {
          error:
            postProcessError instanceof Error
              ? postProcessError.message
              : String(postProcessError),
          stack:
            postProcessError instanceof Error
              ? postProcessError.stack?.substring(0, 500)
              : undefined,
        });
        // Return insight even if post-processing fails
        return insight;
      }
    } catch (error) {
      console.error(`❌ [${this.name}] Venice completion failed:`, {
        error: error instanceof Error ? error.message : String(error),
        stack:
          error instanceof Error ? error.stack?.substring(0, 500) : undefined,
      });
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
    context?: AgentExecutionContext,
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
${this.formatDataForAnalysis(data, context)}

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

  protected abstract formatDataForAnalysis(
    data: unknown,
    context?: AgentExecutionContext,
  ): string;

  protected parseEnhancedResponse(response: string): AgentInsight {
    try {
      // Strip <think> blocks that Venice AI sometimes includes
      let cleanedResponse = response;

      // Check if there are thinking blocks (don't use test() as it consumes the match)
      if (
        cleanedResponse.includes("<think>") ||
        cleanedResponse.includes("<think>")
      ) {
        console.log(`[${this.name}] Found thinking blocks, stripping them out`);
        console.log(
          `[${this.name}] Before stripping (first 500 chars):`,
          cleanedResponse.substring(0, 500),
        );

        // Remove all thinking blocks - handle both <think> and <think> tags
        cleanedResponse = cleanedResponse
          .replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, "")
          .replace(/<think>[\s\S]*?<\/think>/gi, "")
          .trim();

        console.log(
          `[${this.name}] After stripping (first 500 chars):`,
          cleanedResponse.substring(0, 500),
        );
        console.log(
          `[${this.name}] Still contains <think>?`,
          cleanedResponse.includes("<think>"),
        );
      }

      // Also try to extract JSON if response has extra text before/after
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedResponse = jsonMatch[0];
      }

      console.log(
        `[${this.name}] Attempting to parse JSON (length: ${cleanedResponse.length})`,
      );

      // Log first 1000 chars of what we're trying to parse
      console.log(
        `[${this.name}] JSON to parse:`,
        cleanedResponse.substring(0, 1000),
      );

      const parsed = JSON.parse(cleanedResponse);
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
      console.error(`❌ [${this.name}] Failed to parse response:`, {
        error: error instanceof Error ? error.message : String(error),
        originalResponsePreview: response.substring(0, 500),
      });

      // Try to fix common JSON issues
      console.log(`[${this.name}] Attempting to fix malformed JSON...`);
      try {
        let fixedResponse = response;

        // Strip thinking blocks - handle both <think> and <think> tags
        if (
          fixedResponse.includes("<think>") ||
          fixedResponse.includes("<think>")
        ) {
          fixedResponse = fixedResponse
            .replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, "")
            .replace(/<think>[\s\S]*?<\/think>/gi, "")
            .trim();
        }

        // Extract JSON
        const jsonMatch = fixedResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          fixedResponse = jsonMatch[0];
        }

        // Try to fix trailing commas in arrays/objects
        fixedResponse = fixedResponse.replace(/,(\s*[}\]])/g, "$1");

        console.log(
          `[${this.name}] Attempting to parse fixed JSON (length: ${fixedResponse.length})`,
        );
        const parsed = JSON.parse(fixedResponse);

        console.log(`✅ [${this.name}] Successfully parsed after fixes!`);
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
          trends: (parsed.trends ?? []).map(
            (trend: Record<string, unknown>) => ({
              pattern: String(trend.pattern ?? "Pattern not specified"),
              timeframe: String(trend.timeframe ?? "Timeframe not provided"),
              direction: String(trend.direction ?? "stable"),
              magnitude: String(trend.magnitude ?? "Not quantified"),
              confidence: Number(trend.confidence ?? 0.5),
            }),
          ),
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
          correlations: (parsed.correlations ?? []).map(
            (correlation: Record<string, unknown>) => ({
              metric1: String(correlation.metric1 ?? "Unknown"),
              metric2: String(correlation.metric2 ?? "Unknown"),
              relationship: String(correlation.relationship ?? "Not specified"),
              strength: String(correlation.strength ?? "unknown"),
              confidence: Number(correlation.confidence ?? 0.5),
            }),
          ),
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
          dataPoints: this.extractMentionedMetrics(fixedResponse),
          rawResponse: response,
        };
      } catch (retryError) {
        console.error(`❌ [${this.name}] Still failed after fixes:`, {
          error:
            retryError instanceof Error
              ? retryError.message
              : String(retryError),
        });
      }

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

  protected createErrorInsight(response: string): AgentInsight {
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
