import { randomChoice } from "../../my-health-app/utils/utils";
import { AgentCharacteristics, HealthAgentCharacteristics } from "./types";

class CharacteristicsLoader {
  protected characteristics: HealthAgentCharacteristics;

  constructor(characteristics: AgentCharacteristics) {
    this.characteristics = this.extendForHealthChat(characteristics);
  }

  private extendForHealthChat(
    baseCharacteristics: AgentCharacteristics,
  ): HealthAgentCharacteristics {
    // Add health-specific characteristics
    return {
      ...baseCharacteristics,
      healthMetricResponses: {
        steps: {
          interpretation: [
            "Your step count patterns reveal interesting insights about your movement ecology.",
            "Let's explore how your daily movement rhythms align with your energy levels.",
          ],
          suggestions: [
            "Consider integrating natural movement patterns throughout your day.",
            "Research shows varied movement types enhance metabolic flexibility.",
          ],
          correlations: [
            "I notice interesting patterns between your step counts and sleep quality.",
            "There might be a connection between movement timing and your energy levels.",
          ],
        },
        // Add more metrics as needed
      },
      trendAnalysis: {
        increasing: [
          "I'm noticing a positive trend in your {{metric}}. This aligns with research showing...",
          "The gradual improvement in {{metric}} suggests your body is adapting well...",
        ],
        decreasing: [
          "I see a gentle decline in your {{metric}}. Let's explore potential factors...",
          "The change in {{metric}} might be connected to seasonal or lifestyle patterns...",
        ],
        stable: [
          "Your {{metric}} shows remarkable consistency. This stability often indicates...",
          "The steady pattern in {{metric}} suggests well-established rhythms...",
        ],
        fluctuating: [
          "I notice natural variations in your {{metric}}, which is often healthy...",
          "These fluctuations in {{metric}} might reflect your body's adaptive responses...",
        ],
      },
      dataVisualization: {
        patterns: [
          "The visualization reveals natural cycles in your health data...",
          "I notice interesting rhythms in how your metrics interact...",
        ],
        insights: [
          "This pattern often correlates with circadian alignment...",
          "Research suggests these variations are normal and healthy...",
        ],
        recommendations: [
          "Based on these patterns, you might benefit from...",
          "Consider adjusting your timing to align with your body's natural rhythms...",
        ],
      },
    };
  }

  public getResponseForMetric(metric: string, trend: string): string {
    const responses = this.characteristics.healthMetricResponses?.[metric];
    if (!responses) return this.getDefaultResponse();

    // Safely get trend responses with default empty array
    const trendKey = trend as keyof typeof this.characteristics.trendAnalysis;
    const trendResponses = this.characteristics.trendAnalysis?.[trendKey] || [];

    // Make sure we have trend responses before using them
    let responseText = "";

    if (responses.interpretation && responses.interpretation.length > 0) {
      responseText += randomChoice(responses.interpretation) + " ";
    }

    if (responses.suggestions && responses.suggestions.length > 0) {
      responseText += randomChoice(responses.suggestions) + " ";
    }

    if (trendResponses.length > 0) {
      // Since TypeScript isn't recognizing that items in trendResponses are strings,
      // we'll use a type assertion here to help it
      const trendResponse = randomChoice(trendResponses) as string;
      responseText += trendResponse.replace(/\{\{metric\}\}/g, metric);
    }

    return responseText.trim();
  }

  public getVisualizationInsight(): string {
    const viz = this.characteristics.dataVisualization;
    if (!viz) return this.getDefaultResponse();

    const parts: string[] = [];

    if (viz.patterns && viz.patterns.length > 0) {
      parts.push(randomChoice(viz.patterns));
    }

    if (viz.insights && viz.insights.length > 0) {
      parts.push(randomChoice(viz.insights));
    }

    if (viz.recommendations && viz.recommendations.length > 0) {
      parts.push(randomChoice(viz.recommendations));
    }

    return parts.length > 0 ? parts.join(" ") : this.getDefaultResponse();
  }

  public getGreeting(): string {
    const greetings = this.characteristics.responseContext.greetings;
    if (!greetings || greetings.length === 0) {
      return "Hello! I'm your health companion.";
    }
    return randomChoice(greetings);
  }

  public getDefaultResponse(): string {
    const defaultResponses =
      this.characteristics.responseContext.defaultResponses;
    if (!defaultResponses || defaultResponses.length === 0) {
      return "I'm here to help with your health questions.";
    }
    return randomChoice(defaultResponses);
  }

  public getBio(): string {
    return this.characteristics.bio.join(" ");
  }
}

export default CharacteristicsLoader;
