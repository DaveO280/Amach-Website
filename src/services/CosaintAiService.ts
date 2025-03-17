// src/services/CosaintAiService.ts
import { VeniceApiService } from "../api/VeniceApiService";
import CharacteristicsLoader from "../components/ai/characteristicsLoader";
import cosaintCharacteristics from "../components/ai/cosaint";
import { logger } from "../utils/logger";

// Match the data structure from your HealthDataProvider
interface DailySummary {
  date: string;
  heartRate: {
    avg: number;
    min: number | null;
    max: number | null;
    count: number;
  };
  steps: {
    total: number;
    count: number;
  };
  activeEnergy: {
    total: number;
    count: number;
  };
  exerciseTime: {
    total: number;
    count: number;
  };
  sleep: {
    total: number;
    deepSleep: number;
    remSleep: number;
    lightSleep: number;
    awake: number;
    count: number;
    totalHours?: number;
  };
}

interface HealthStats {
  timeFrame: string;
  dateRange: {
    start: string | null;
    end: string | null;
  };
  totalDays: number;
  metrics: {
    heartRate: {
      available: boolean;
      avgDaily: number;
    };
    steps: {
      available: boolean;
      avgDaily: number;
      total: number;
    };
    activeEnergy: {
      available: boolean;
      avgDaily: number;
      total: number;
    };
    exerciseTime: {
      available: boolean;
      avgDaily: number;
      total: number;
    };
    sleep: {
      available: boolean;
      avgDaily: number;
    };
    heartRateVariability?: {
      available: boolean;
      avgDaily: number;
    };
    respiratoryRate?: {
      available: boolean;
      avgDaily: number;
    };
    restingHeartRate?: {
      available: boolean;
      avgDaily: number;
    };
  };
}

interface SummarizedData {
  daily: DailySummary[];
  stats: HealthStats;
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
    healthData?: SummarizedData,
  ): Promise<string> {
    try {
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
    healthData?: SummarizedData,
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
  private buildSystemMessage(healthData?: SummarizedData): string {
    // Start with the character's core identity
    let systemMessage = `You are Cosaint, a holistic health AI companion developed by Amach Health.

${this.characteristics.getBio()}

Your personality is:
- Empathetic: You genuinely care about the user's wellbeing
- Evidence-informed: You reference scientific studies and data when appropriate
- Holistic: You consider the interconnectedness of health factors
- Practical: You offer actionable suggestions that are realistic to implement`;

    // Add health data context if available
    if (healthData && healthData.stats) {
      const stats = healthData.stats;

      systemMessage += `\n\nYou have access to the following health data for this user:

Health Data Summary:
- Time period: ${stats.timeFrame || "Recent"}
- Data range: ${stats.dateRange.start || "Unknown"} to ${stats.dateRange.end || "Unknown"}
- Total days of data: ${stats.totalDays}

Available Metrics:`;

      // Add Heart Rate data if available
      if (stats.metrics.heartRate.available) {
        systemMessage += `\n- Heart Rate: Average ${stats.metrics.heartRate.avgDaily} bpm`;

        // Add recent trends if we have daily data
        if (healthData.daily && healthData.daily.length > 0) {
          const recentDays = healthData.daily.slice(-7); // Last 7 days

          // Calculate recent average
          const recentAvg = Math.round(
            recentDays.reduce((sum, day) => sum + day.heartRate.avg, 0) /
              recentDays.length,
          );

          // Find min and max values
          const allMins = recentDays
            .map((day) => day.heartRate.min)
            .filter((val) => val !== null) as number[];

          const allMaxs = recentDays
            .map((day) => day.heartRate.max)
            .filter((val) => val !== null) as number[];

          const minHR = allMins.length > 0 ? Math.min(...allMins) : null;
          const maxHR = allMaxs.length > 0 ? Math.max(...allMaxs) : null;

          if (minHR !== null && maxHR !== null) {
            systemMessage += ` (Recent range: ${minHR}-${maxHR} bpm)`;
          }
        }
      }

      // Add Heart Rate Variability data if available
      if (stats.metrics.heartRateVariability?.available) {
        systemMessage += `\n- Heart Rate Variability: Average ${stats.metrics.heartRateVariability.avgDaily} ms`;
        systemMessage += `\n  * Context: Higher HRV generally indicates better stress recovery and cardiovascular health`;
      }

      // Add Respiratory Rate data if available
      if (stats.metrics.respiratoryRate?.available) {
        systemMessage += `\n- Respiratory Rate: Average ${stats.metrics.respiratoryRate.avgDaily} BrPM`;
        systemMessage += `\n  * Context: Normal respiratory rate is typically 12-20 breaths per minute`;
      }

      // Add Resting Heart Rate data if available
      if (stats.metrics.restingHeartRate?.available) {
        systemMessage += `\n- Resting Heart Rate: Average ${stats.metrics.restingHeartRate.avgDaily} bpm`;
        systemMessage += `\n  * Context: Lower resting heart rate often indicates better cardiovascular fitness`;
      }

      // Add Steps data if available
      if (stats.metrics.steps.available) {
        systemMessage += `\n- Steps: Average ${stats.metrics.steps.avgDaily.toLocaleString()} steps per day`;
        systemMessage += ` (Total: ${stats.metrics.steps.total.toLocaleString()} steps)`;

        // Add context about recommended steps
        systemMessage += `\n  * Context: 10,000 steps is often recommended, but research shows health benefits begin at 4,000-5,000 steps`;

        // Add recent trends
        if (healthData.daily && healthData.daily.length >= 7) {
          const recentSteps = healthData.daily
            .slice(-7)
            .map((day) => day.steps.total);
          const recentAvg = Math.round(
            recentSteps.reduce((sum, steps) => sum + steps, 0) /
              recentSteps.length,
          );

          // Calculate trend direction
          const older = healthData.daily
            .slice(-14, -7)
            .map((day) => day.steps.total);
          const olderAvg =
            older.length > 0
              ? Math.round(
                  older.reduce((sum, steps) => sum + steps, 0) / older.length,
                )
              : 0;

          if (olderAvg > 0) {
            const percentChange = Math.round(
              ((recentAvg - olderAvg) / olderAvg) * 100,
            );
            if (Math.abs(percentChange) >= 10) {
              systemMessage += `\n  * Trend: ${percentChange > 0 ? "Increasing" : "Decreasing"} by ${Math.abs(percentChange)}% recently`;
            }
          }
        }
      }

      // Add Active Energy data if available
      if (stats.metrics.activeEnergy.available) {
        systemMessage += `\n- Active Energy: Average ${stats.metrics.activeEnergy.avgDaily.toLocaleString()} calories burned daily`;
        systemMessage += ` (Total: ${stats.metrics.activeEnergy.total.toLocaleString()} calories)`;
      }

      // Add Exercise Time data if available
      if (stats.metrics.exerciseTime.available) {
        systemMessage += `\n- Exercise Time: Average ${stats.metrics.exerciseTime.avgDaily} minutes per day`;
        systemMessage += ` (Total: ${stats.metrics.exerciseTime.total} minutes)`;

        // Add context about recommended exercise time
        systemMessage += `\n  * Context: WHO recommends 150 minutes of moderate activity per week`;
      }

      // Add Sleep data if available
      if (stats.metrics.sleep.available) {
        systemMessage += `\n- Sleep: Average ${stats.metrics.sleep.avgDaily} hours per night`;

        // Add context about sleep quality if we have detailed sleep data
        if (
          healthData.daily.some(
            (day) => day.sleep.deepSleep > 0 || day.sleep.remSleep > 0,
          )
        ) {
          // Calculate average sleep composition
          const deepSleepTotal = healthData.daily.reduce(
            (sum, day) => sum + day.sleep.deepSleep,
            0,
          );
          const remSleepTotal = healthData.daily.reduce(
            (sum, day) => sum + day.sleep.remSleep,
            0,
          );
          const lightSleepTotal = healthData.daily.reduce(
            (sum, day) => sum + day.sleep.lightSleep,
            0,
          );
          const totalSleepTime =
            deepSleepTotal + remSleepTotal + lightSleepTotal;

          if (totalSleepTime > 0) {
            const deepPercent = Math.round(
              (deepSleepTotal / totalSleepTime) * 100,
            );
            const remPercent = Math.round(
              (remSleepTotal / totalSleepTime) * 100,
            );

            systemMessage += `\n  * Sleep composition: Approximately ${deepPercent}% deep sleep, ${remPercent}% REM sleep`;
            systemMessage += `\n  * Context: Healthy sleep typically includes 15-25% deep sleep and 20-25% REM sleep`;
          }
        }
      }

      systemMessage += `\n\nWhen responding, incorporate insights from this health data when relevant to the user's question. Don't list all the data in your response unless explicitly asked, but use it to inform your guidance. If you notice concerning patterns or areas for improvement, mention them diplomatically.`;
    } else {
      systemMessage += `\n\nYou don't have access to the user's health data. You can mention that your insights would be more personalized if they processed their health data in the Health Dashboard.`;
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
          return this.randomChoice(topic.responses);
        }
      }
    }

    // Default fallback
    return this.randomChoice(
      cosaintCharacteristics.responseContext.defaultResponses,
    );
  }

  /**
   * Helper to select a random item from an array
   */
  private randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Creates a singleton instance using environment variables
   */
  static createFromEnv(): CosaintAiService {
    // Get API key and endpoint from environment variables
    const apiKey = process.env.VENICE_API_KEY || "";
    const apiEndpoint =
      process.env.VENICE_API_ENDPOINT || "https://api.venice.ai/v1";
    const modelName = process.env.VENICE_MODEL_NAME || "venice-xl";
    const debugMode = process.env.API_DEBUG_MODE === "true";

    // Create the Venice API service instance
    const veniceApi = new VeniceApiService(
      apiKey,
      apiEndpoint,
      modelName,
      debugMode,
    );

    // Return the Cosaint service
    return new CosaintAiService(veniceApi);
  }
}
