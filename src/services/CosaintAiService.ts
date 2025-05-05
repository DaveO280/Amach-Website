// src/services/CosaintAiService.ts
import { VeniceApiService } from "../api/VeniceApiService";
import CharacteristicsLoader from "../components/ai/characteristicsLoader";
import cosaintCharacteristics from "../components/ai/cosaint";
import { randomChoice } from "../my-health-app/utils/utils";
import { logger } from "../utils/logger";

interface HealthMetrics {
  steps: {
    average: number;
    total: number;
  };
  exercise: {
    average: number;
    total: number;
  };
  heartRate: {
    average: number;
  };
  activeEnergy: {
    average: number;
    total: number;
  };
  sleep: {
    average: number;
    efficiency: number;
  };
}

export class CosaintAiService {
  private veniceApi: VeniceApiService;
  private characteristics: CharacteristicsLoader;

  constructor(veniceApi: VeniceApiService) {
    this.veniceApi = veniceApi;
    this.characteristics = new CharacteristicsLoader(cosaintCharacteristics);
  }

  /**
   * Generate a response to a user message, incorporating health data if available
   */
  async generateResponse(
    userMessage: string,
    conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
    healthData?: HealthMetrics,
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
   * Create a prompt for the Venice API based on user message and context
   */
  private createPrompt(
    userMessage: string,
    conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
    healthData?: HealthMetrics,
  ): string {
    // Build the system message including character background and health data context
    const systemMessage = this.buildSystemMessage(healthData);

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
   * Build a system message that includes character background and health data context
   */
  private buildSystemMessage(healthData?: HealthMetrics): string {
    // Start with the character's core identity
    let systemMessage = `You are Cosaint, a holistic health AI companion developed by Amach Health.

${this.characteristics.getBio()}

Your personality is:
- Empathetic: You genuinely care about the user's wellbeing
- Evidence-informed: You reference scientific studies and data when appropriate
- Holistic: You consider the interconnectedness of health factors
- Practical: You offer actionable suggestions that are realistic to implement`;

    // Add health data context if available
    if (healthData) {
      systemMessage += `\n\nYou have access to the following health data for this user:

Health Data Summary:`;

      // Add available metrics
      if (healthData.steps) {
        systemMessage += `\n- Steps: Average ${healthData.steps.average} steps per day, Total ${healthData.steps.total} steps`;
      }
      if (healthData.exercise) {
        systemMessage += `\n- Exercise: Average ${healthData.exercise.average} minutes per day, Total ${healthData.exercise.total} minutes`;
      }
      if (healthData.heartRate) {
        systemMessage += `\n- Heart Rate: Average ${healthData.heartRate.average} bpm`;
      }
      if (healthData.activeEnergy) {
        systemMessage += `\n- Active Energy: Average ${healthData.activeEnergy.average} kcal per day, Total ${healthData.activeEnergy.total} kcal`;
      }
      if (healthData.sleep) {
        systemMessage += `\n- Sleep: Average ${Math.floor(healthData.sleep.average / 60)} hours ${healthData.sleep.average % 60} minutes per day, Efficiency ${healthData.sleep.efficiency}%`;
      }
    }

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
      process.env.VENICE_MODEL_NAME || "llama-3.1-405b",
      process.env.NODE_ENV === "development",
    );

    // Return the Cosaint service
    return new CosaintAiService(veniceApi);
  }
}
