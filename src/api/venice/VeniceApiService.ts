// src/api/VeniceApiService.ts

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { logger } from "../../utils/logger";

interface RateLimitInfo {
  reset: Date;
  retryAfter: number;
}

export class VeniceApiService {
  private client: AxiosInstance;
  public modelName: string;
  private debugMode: boolean;

  constructor(modelName: string, debugMode: boolean = false) {
    this.modelName = modelName;
    this.debugMode = debugMode;

    // For client-side usage, point to our API route
    this.client = axios.create({
      baseURL: "", // Remove baseURL to use absolute path
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 120000, // 120 second timeout to match serverless function
    });

    // Request logging interceptor
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        if (this.debugMode) {
          logger.info(`API Request to ${config.url}`, {
            method: config.method,
            data: config.data,
            fullUrl: config.url,
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
      (error: AxiosError) => {
        this.handleApiError(error);
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
    const debugMode = process.env.NODE_ENV === "development";
    const modelName = process.env.VENICE_MODEL_NAME || "llama-3.1-405b";
    return new VeniceApiService(modelName, debugMode);
  }

  async generateVeniceResponse(
    prompt: string,
    maxTokens: number = 2000,
  ): Promise<string | null> {
    const requestId = Date.now().toString();
    const startTime = Date.now();

    try {
      // Send the request through our proxy endpoint
      const requestBody = {
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7,
        model: this.modelName,
        stream: false,
      };

      // Add timeout handling
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Request timed out after ${this.client.defaults.timeout}ms`,
            ),
          );
        }, this.client.defaults.timeout);
      });

      const responsePromise = this.retryOperation(() =>
        this.client.post("/api/venice", requestBody),
      );

      const response = (await Promise.race<AxiosResponse>([
        responsePromise,
        timeoutPromise,
      ])) as AxiosResponse;

      // Process response
      if (response.data?.choices?.[0]?.message?.content) {
        return response.data.choices[0].message.content;
      } else if (response.data?.error) {
        throw new Error(String(response.data.error));
      } else {
        throw new Error("Invalid response format from Venice API");
      }
    } catch (error) {
      console.error(`[VeniceApiService] Request failed [${requestId}]`, {
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        isTimeout:
          error instanceof Error && error.message.includes("timed out"),
      });
      throw error;
    }
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 2,
    initialDelay: number = 1000,
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await operation();

        // Check if the response contains an error
        if (response && typeof response === "object" && "error" in response) {
          const errorMessage =
            typeof response.error === "string"
              ? response.error
              : JSON.stringify(response.error);
          throw new Error(errorMessage);
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on 4xx errors (except 429)
        if (axios.isAxiosError(error) && error.response?.status) {
          const status = error.response.status;
          if (status >= 400 && status < 500 && status !== 429) {
            throw error;
          }
        }

        if (attempt === maxRetries) {
          throw lastError;
        }

        logger.warn(`Retry attempt ${attempt} failed`, {
          error: lastError.message,
          attempt,
          maxRetries,
        });

        logger.info(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }

    throw lastError;
  }

  private extractRateLimitInfo(error: unknown): RateLimitInfo | null {
    if (
      !error ||
      typeof error !== "object" ||
      error === null ||
      !("response" in error) ||
      typeof (error as { response?: unknown }).response !== "object" ||
      (error as { response?: unknown }).response === null ||
      !("headers" in (error as { response: { headers?: unknown } }).response)
    ) {
      return null;
    }
    const response = (
      error as { response: { headers: Record<string, string> } }
    ).response;
    // Most APIs use one of these header patterns
    const resetHeader =
      response.headers["x-rate-limit-reset"] ||
      response.headers["ratelimit-reset"] ||
      response.headers["retry-after"];

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

  private summarizeResponse(data: unknown): unknown {
    if (typeof data !== "object" || data === null) return data;
    // Create a summarized version for logging to avoid large log entries
    const summary: Record<string, unknown> = { ...(data as object) };

    // Truncate long text fields for readability
    if (summary.choices && Array.isArray(summary.choices)) {
      summary.choices = (summary.choices as Array<Record<string, unknown>>).map(
        (choice) => {
          if (
            choice.message &&
            typeof choice.message === "object" &&
            choice.message !== null &&
            "content" in choice.message &&
            typeof (choice.message as { content?: unknown }).content ===
              "string" &&
            (choice.message as { content: string }).content.length > 100
          ) {
            const content = (choice.message as { content: string }).content;
            return {
              ...choice,
              message: {
                ...choice.message,
                content: `${content.substring(0, 100)}... [truncated, full length: ${content.length}]`,
              },
            };
          }
          return choice;
        },
      );
    }

    return summary;
  }
}
