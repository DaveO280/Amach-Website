// src/api/VeniceApiService.ts

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { logger } from "../utils/logger";

interface RateLimitInfo {
  reset: Date;
  retryAfter: number;
}

export class VeniceApiService {
  private client: AxiosInstance;
  public modelName: string;
  private debugMode: boolean;

  constructor(
    apiKey: string,
    apiEndpoint: string,
    modelName: string,
    debugMode: boolean = false,
  ) {
    this.modelName = modelName;
    this.debugMode = debugMode;

    // For client-side usage, point to your own API endpoint instead of directly to Venice
    // The apiKey parameter is now unused on the client side (it's used server-side)
    this.client = axios.create({
      baseURL: "", // Empty base URL as we'll use relative paths
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 120000, // 120 second timeout
    });

    // Request logging interceptor
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        if (this.debugMode) {
          logger.info(`API Request to ${config.url}`, {
            method: config.method,
            data: config.data,
          });
        }
        return config;
      },
      (error: Error) => {
        logger.error("API Request Error", { error: error.message });
        return Promise.reject(error);
      },
    );

    // Response logging interceptor
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        if (this.debugMode) {
          logger.info(`API Response from ${response.config.url}`, {
            status: response.status,
            data: this.summarizeResponse(response.data),
          });
        }
        return response;
      },
      (error: Error) => {
        this.handleApiError(error as AxiosError);
        return Promise.reject(error);
      },
    );

    // Log initialization
    if (this.debugMode) {
      logger.info("Initialized Venice API service", {
        model: modelName,
        usingProxy: true,
      });
    }
  }

  /**
   * Create a VeniceApiService instance from environment variables
   */
  static fromEnv(): VeniceApiService {
    // Note: These are only used for logging purposes on the client side
    // The actual API key is now only used on the server
    const debugMode = process.env.NODE_ENV === "development";
    const modelName = process.env.LARGE_VENICE_MODEL || "venice-latest";

    return new VeniceApiService(
      "client-side-proxy", // Placeholder as API key is only used server-side now
      "/api/venice", // Point to our proxy endpoint
      modelName,
      debugMode,
    );
  }

  // In your VeniceApiService.generateVeniceResponse method

  async generateVeniceResponse(
    prompt: string,
    maxTokens: number = 280,
  ): Promise<string | null> {
    const requestId = Date.now().toString();

    try {
      // Log the request
      if (this.debugMode) {
        console.log(`Generating Venice response [${requestId}]`, {
          promptLength: prompt.length,
          maxTokens,
          model: this.modelName,
        });
      }

      // Send the request through our proxy endpoint
      const requestBody = {
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        model: this.modelName,
        temperature: 0.7,
      };

      // Log request size for debugging
      console.log("[VeniceApiService] Request details:", {
        promptLength: prompt.length,
        totalSize: JSON.stringify(requestBody).length,
        maxTokens,
      });

      const response = await this.retryOperation(() =>
        this.client.post("/api/venice", requestBody),
      );

      // Process response
      if (response.data?.choices?.[0]?.message?.content) {
        const content = response.data.choices[0].message.content;
        return content;
      } else {
        return null;
      }
    } catch (error) {
      console.error(`Failed to generate Venice response [${requestId}]`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // Other existing methods remain the same
  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error as Error;

        // Extract rate limit info if available
        const rateLimitInfo = this.extractRateLimitInfo(error);

        if (rateLimitInfo) {
          logger.warn(
            `Rate limit detected. Waiting until reset time: ${rateLimitInfo.reset.toLocaleString()}`,
            {
              waitTimeMs: rateLimitInfo.retryAfter,
              attempt,
            },
          );

          // Wait until the rate limit resets
          await new Promise((resolve) =>
            setTimeout(resolve, rateLimitInfo.retryAfter + 1000),
          ); // Add 1 second buffer
        } else {
          // Standard exponential backoff for other errors
          if (attempt < maxAttempts) {
            logger.warn(`Retry attempt ${attempt} failed`, {
              error: (error as Error).message,
              nextAttempt: attempt + 1,
            });

            // Calculate delay with exponential backoff and jitter
            const baseDelay = 1000 * Math.pow(2, attempt - 1); // Start with 1s, then 2s, 4s, etc.
            const jitter = Math.random() * 0.3 * baseDelay; // Add 0-30% jitter
            const delay = Math.floor(baseDelay + jitter);

            logger.info(`Retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
    }

    throw lastError || new Error("Operation failed after multiple attempts");
  }

  private extractRateLimitInfo(error: any): RateLimitInfo | null {
    if (!error.response || !error.response.headers) {
      return null;
    }

    // Most APIs use one of these header patterns
    const resetHeader =
      error.response.headers["x-rate-limit-reset"] ||
      error.response.headers["ratelimit-reset"] ||
      error.response.headers["retry-after"];

    if (resetHeader) {
      const resetTime = new Date(parseInt(resetHeader) * 1000);
      const retryAfter = Math.max(0, resetTime.getTime() - Date.now());

      return {
        reset: resetTime,
        retryAfter: retryAfter,
      };
    }

    return null;
  }

  private handleApiError(error: AxiosError): void {
    if (error.response) {
      logger.error(`API Error: ${error.response.status}`, {
        statusText: error.response.statusText,
        data: error.response.data,
      });

      // Handle specific status codes
      switch (error.response.status) {
        case 401:
          logger.error("Authentication failed. Please check your API keys.");
          break;
        case 429:
          const rateLimitInfo = this.extractRateLimitInfo(error);
          if (rateLimitInfo) {
            logger.error("Rate limit exceeded.", {
              resetAt: rateLimitInfo.reset.toLocaleString(),
              waitTimeMs: rateLimitInfo.retryAfter,
            });
          } else {
            logger.error("Rate limit exceeded. No reset time provided.");
          }
          break;
        case 503:
          logger.error(
            "Service unavailable. The API may be experiencing issues.",
          );
          break;
      }
    } else if (error.request) {
      logger.error("No response received from API", {
        message: error.message,
      });
    } else {
      logger.error("Error setting up request", {
        message: error.message,
      });
    }
  }

  private summarizeResponse(data: any): any {
    // Create a summarized version for logging to avoid large log entries
    const summary: any = { ...data };

    // Truncate long text fields for readability
    if (summary.choices && Array.isArray(summary.choices)) {
      summary.choices = summary.choices.map((choice: any) => {
        if (
          choice.message &&
          choice.message.content &&
          choice.message.content.length > 100
        ) {
          return {
            ...choice,
            message: {
              ...choice.message,
              content: `${choice.message.content.substring(0, 100)}... [truncated, full length: ${choice.message.content.length}]`,
            },
          };
        }
        return choice;
      });
    }

    return summary;
  }
}
