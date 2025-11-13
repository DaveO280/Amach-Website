// src/services/CosaintAiService.ts
import { randomChoice } from "@/utils/utils";
import { VeniceApiService } from "../api/venice/VeniceApiService";
import { runCoordinatorAnalysis } from "./CoordinatorService";
import CharacteristicsLoader from "../components/ai/characteristicsLoader";
import cosaintCharacteristics from "../components/ai/cosaint";
import type { HealthContextMetrics } from "../types/HealthContext";
import type { HealthDataByType } from "../types/healthData";
import { logger } from "../utils/logger";
import type { CoordinatorResult } from "@/agents/CoordinatorAgent";
import {
  calculateAgeFromBirthDate,
  type NormalizedUserProfile,
} from "@/utils/userProfileUtils";
import type { ParsedReportSummary } from "@/types/reportData";

const RESPONSE_FORMAT_GUIDELINES = `

Response Framework:
1. Open with a warm, one-sentence acknowledgement that thanks the user for investing in their health.
2. Include a "Profile Snapshot:" line that lists age, sex, height, weight, and BMI (or clearly state when a value is unavailable).
3. Provide "Key Health Signals:" as 3-4 concise bullets, each referencing specific metrics (averages, ranges, or trends) and their implications.
4. Provide "Next Steps:" as 2-3 prioritized action bullets that explain the expected impact on other metrics or systems.
5. Close with one encouraging sentence that reinforces partnership and progress.

Tone requirements:
- Address the user directly (use "you/your").
- Be data-forward, neutral, and specific—no filler or generic advice.
- Reference multi-agent insights when available (e.g., sleep, cardiovascular, recovery correlations).
- Highlight missing data or assumptions explicitly.
- Avoid external citations, numbered references, or clinical alarmism.
`;
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
  ): Promise<string> {
    try {
      // Log health data and file status
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

      let coordinatorResult: CoordinatorResult | null = null;
      if (
        useMultiAgent &&
        ((metricData && Object.keys(metricData).length > 0) || reports?.length)
      ) {
        try {
          coordinatorResult = await runCoordinatorAnalysis({
            metricData,
            profile: userProfile,
            reports,
            conversationHistory,
            veniceService: this.veniceApi,
          });
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
      );

      // Log the prompt for debugging (you can remove this in production)
      console.log(
        "[CosaintAiService] Generated prompt:",
        prompt.substring(0, 500) + "...",
      );

      // Always use higher token limit for comprehensive health report analysis
      const hasHealthReport = uploadedFiles && uploadedFiles.length > 0;

      // Generate a response using the Venice API
      const response = await this.veniceApi.generateVeniceResponse(
        prompt,
        hasHealthReport ? 3000 : 1000, // Higher token limit for health report analysis
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
  ): string {
    // Build the system message including character background, health data, file context, and user profile
    let systemMessage = this.buildSystemMessage(healthData, userProfile);
    systemMessage +=
      "\n\nFollow-up instruction: Always address the user's latest question or concern first, use the conversation history to avoid repeating full introductions or already acknowledged profile details, and consolidate duplicate findings instead of listing the same metric multiple times.";

    if (coordinatorResult?.combinedSummary) {
      const summary = coordinatorResult.combinedSummary;
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

    if (reports && reports.length > 0) {
      const reportLines = reports.slice(0, 5).map((summary) => {
        const report = summary.report;
        if (report.type === "dexa") {
          return `- DEXA (${summary.extractedAt}): Total fat ${report.totalBodyFatPercent ?? "n/a"}%, visceral rating ${report.visceralFatRating ?? "n/a"}, regions captured: ${report.regions
            .map((r) => r.region)
            .slice(0, 5)
            .join(", ")}`;
        }
        if (report.type === "bloodwork") {
          const highFlags = report.metrics.filter(
            (metric) => metric.flag && metric.flag !== "normal",
          );
          return `- Bloodwork (${summary.extractedAt}): ${report.metrics.length} metrics, notable flags: ${
            highFlags.length
              ? highFlags
                  .slice(0, 4)
                  .map(
                    (metric) =>
                      `${metric.name}${metric.flag ? ` (${metric.flag})` : ""}`,
                  )
                  .join(", ")
              : "none"
          }`;
        }
        return `- Report (${summary.extractedAt})`;
      });
      systemMessage += `\n\nStructured reports available:\n${reportLines.join("\n")}`;
      if (reports.length > 5) {
        systemMessage += `\n- ...and ${reports.length - 5} more reports`;
      }
    }

    // Add uploaded file summaries if present
    if (uploadedFiles && uploadedFiles.length > 0) {
      systemMessage += `\n\nYou also have access to the following uploaded files for this user:\n`;
      uploadedFiles.forEach((file) => {
        systemMessage += `- ${file.summary}\n`;
        // If the file has parsed content, include it in the context
        if (file.rawData?.content && typeof file.rawData.content === "string") {
          const content = file.rawData.content;

          // Always include maximum content for comprehensive analysis
          const maxLength = 20000; // Increased limit for all health reports
          const preview =
            content.length > maxLength
              ? content.substring(0, maxLength) + "... (truncated)"
              : content;

          let fileInfo = `  File content (${file.rawData.parsedType || "unknown"} format)`;

          // Add PDF-specific information
          if (file.rawData.parsedType === "pdf") {
            fileInfo += ` - ${file.rawData.pageCount || 0} pages`;
            if (
              file.rawData.metadata &&
              typeof file.rawData.metadata === "object" &&
              "title" in file.rawData.metadata
            ) {
              fileInfo += ` - Title: ${(file.rawData.metadata as { title?: string }).title}`;
            }
          }

          // Add instruction for comprehensive analysis of all health reports
          fileInfo += ` - HEALTH REPORT DATA: Please analyze ALL metrics and values found in this report comprehensively`;

          systemMessage += `${fileInfo}:\n${preview}\n\n`;
        }
      });
    }

    // Format the conversation history
    const formattedHistory =
      this.formatConversationHistory(conversationHistory);

    // Combine everything into a single prompt
    return `${systemMessage}

${formattedHistory}

User: ${userMessage}

Please provide a helpful response as Cosaint, keeping in mind the user's health data, profile, and uploaded files if available. Your response should be friendly, empathetic and evidence-informed.`;
  }

  /**
   * Build a system message that includes character background and health data context
   */
  private buildSystemMessage(
    healthData?: HealthContextMetrics,
    userProfile?: NormalizedUserProfile,
  ): string {
    // Start with the character's core identity
    let systemMessage = `You are Cosaint, a holistic health AI companion developed by Amach Health.\n\n${this.characteristics.getBio()}\n\nYour personality is:\n- Empathetic: You genuinely care about the user's wellbeing\n- Evidence-informed: You provide helpful health insights based on research\n- Holistic: You consider the interconnectedness of health factors\n- Practical: You offer actionable suggestions that are realistic to implement

IMPORTANT: Do not include references, citations, or numbered lists at the end of your responses. Keep your responses conversational and natural. If you want to mention research, do so naturally within the conversation without formal citations.

SPECIAL INSTRUCTION FOR HEALTH REPORTS: When analyzing any health report (blood tests, lab results, medical reports, etc.), provide a comprehensive analysis of ALL metrics and values found in the report, not just a summary. List each metric with its value and normal range, and explain what each metric means for the user's health.`;

    // Add user profile context if available
    if (userProfile) {
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
      if (userProfile.birthDate) {
        systemMessage += `\n- Birth date: ${userProfile.birthDate}`;
      }
      if (userProfile.sex) {
        systemMessage += `\n- Sex: ${userProfile.sex}`;
      }
      if (heightDisplay) {
        systemMessage += `\n- Height: ${heightDisplay}`;
      }
      if (typeof userProfile.heightCm === "number") {
        systemMessage += ` (${userProfile.heightCm.toFixed(1)} cm)`;
      }
      if (weightLbs !== undefined) {
        systemMessage += `\n- Weight: ${Math.round(weightLbs)} lbs`;
      }
      if (typeof userProfile.weightKg === "number") {
        systemMessage += ` (${userProfile.weightKg.toFixed(1)} kg)`;
      }
      if (typeof userProfile.bmi === "number") {
        systemMessage += `\n- BMI: ${userProfile.bmi.toFixed(1)}`;
      }
    }

    // Add health data context if available
    if (healthData) {
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
      if (alerts.length > 0) {
        systemMessage += `\n\nAlerts:\n- ` + alerts.join("\n- ");
      }
      systemMessage += `\n\nWhen making recommendations or setting goals, use the user\'s average, high, and low values for each metric to personalize your advice. Suggest realistic improvements based on their current range.`;
    }
    systemMessage += RESPONSE_FORMAT_GUIDELINES;
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
      // eslint-disable-next-line no-console
      console.log(
        "[CosaintAiService] Venice goal generation prompt:\n",
        prompt,
      );
    }

    const response = await this.veniceApi.generateVeniceResponse(prompt, 500);
    return response
      ? response
          .split("\n")
          .map((line) => line.replace(/^[-*]\s*/, "").trim())
          .filter((line) => line.length > 0)
      : [];
  }
}
