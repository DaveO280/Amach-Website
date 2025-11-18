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

const DEFAULT_ENDPOINT_PATH = "/api/venice";
const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_CLIENT_TIMEOUT_MS = Number(
  process.env.NEXT_PUBLIC_VENICE_CLIENT_TIMEOUT_MS ?? "130000",
);

export class VeniceApiService {
  private client: AxiosInstance;
  public modelName: string;
  private debugMode: boolean;
  private endpointPath: string;

  constructor(modelName: string, debugMode: boolean = false) {
    this.modelName = modelName;
    this.debugMode = debugMode;

    const rawBaseUrl = process.env.VENICE_API_BASE_URL ?? DEFAULT_BASE_URL;
    const trimmedBaseUrl = rawBaseUrl.replace(/\/$/, "");
    const rawEndpoint =
      process.env.VENICE_API_ENDPOINT ?? DEFAULT_ENDPOINT_PATH;

    // Ensure endpoint always starts with a single leading slash
    this.endpointPath = `/${rawEndpoint.replace(/^\/?/, "")}`;

    const baseURL =
      trimmedBaseUrl === ""
        ? ""
        : this.endpointPath !== DEFAULT_ENDPOINT_PATH &&
            trimmedBaseUrl.endsWith(this.endpointPath)
          ? trimmedBaseUrl.slice(0, -this.endpointPath.length) || ""
          : trimmedBaseUrl;

    // Add better clarity to logs when hitting the proxy vs direct endpoint
    const targetInfo = baseURL || "(relative: /api/venice)";
    if (this.debugMode) {
      logger.info(`VeniceApiService configured with baseURL: ${targetInfo}`);
    }

    // For client-side usage, point to our API route
    this.client = axios.create({
      baseURL,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: DEFAULT_CLIENT_TIMEOUT_MS,
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
    const response = await this.generateCompletion({
      userPrompt: prompt,
      maxTokens,
    });
    return response ?? null;
  }

  async generateCompletion({
    systemPrompt,
    userPrompt,
    temperature = 0.7,
    maxTokens = 2000,
  }: {
    systemPrompt?: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const requestId = Date.now().toString();
    const startTime = Date.now();

    try {
      const messages = [];
      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }
      messages.push({ role: "user", content: userPrompt });

      const requestBody = {
        messages,
        max_tokens: maxTokens,
        temperature,
        model: this.modelName,
        stream: false,
      };

      // Log request size to debug mobile Status 0 errors
      const requestSize = JSON.stringify(requestBody).length;
      console.log(
        `[VeniceApiService] Request size: ${requestSize} bytes (${(requestSize / 1024).toFixed(2)} KB)`,
      );
      if (requestSize > 500000) {
        console.warn(
          `[VeniceApiService] ⚠️ Large request detected (${(requestSize / 1024).toFixed(2)} KB) - may fail on mobile`,
        );
      }

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
        this.client.post(this.endpointPath, requestBody),
      );

      const response = (await Promise.race<AxiosResponse>([
        responsePromise,
        timeoutPromise,
      ])) as AxiosResponse;

      // Enhanced debugging for response structure
      console.log(`[VeniceApiService] Response received [${requestId}]`, {
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - startTime,
        status: response.status,
        hasData: Boolean(response.data),
        hasChoices: Boolean(response.data?.choices),
        choicesLength: response.data?.choices?.length,
        hasFirstChoice: Boolean(response.data?.choices?.[0]),
        hasMessage: Boolean(response.data?.choices?.[0]?.message),
        hasContent: Boolean(response.data?.choices?.[0]?.message?.content),
        contentLength:
          response.data?.choices?.[0]?.message?.content?.length || 0,
        contentPreview:
          response.data?.choices?.[0]?.message?.content?.substring(0, 100),
        rawResponse: JSON.stringify(response.data).substring(0, 500),
      });

      if (response.data?.choices?.[0]?.message?.content) {
        return response.data.choices[0].message.content;
      }
      if (response.data?.error) {
        console.error(
          `[VeniceApiService] API returned error [${requestId}]`,
          response.data.error,
        );
        throw new Error(String(response.data.error));
      }
      console.error(
        `[VeniceApiService] Invalid response format [${requestId}]`,
        {
          data: response.data,
        },
      );
      throw new Error("Invalid response format from Venice API");
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
