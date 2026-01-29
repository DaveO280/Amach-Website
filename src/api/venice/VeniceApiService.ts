// src/api/VeniceApiService.ts

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { logger } from "../../utils/logger";

interface RateLimitInfo {
  reset: Date;
  retryAfter: number;
}

const DEFAULT_ENDPOINT_PATH = "/api/venice";
// Use empty string for relative URLs in browser (like useVeniceAI does)
// Only use localhost if explicitly set via env var
const DEFAULT_BASE_URL = "";
// Remove artificial timeout limits - let Venice API handle its own timeouts
// Only use timeout if explicitly set in environment variable
const DEFAULT_CLIENT_TIMEOUT_MS = process.env
  .NEXT_PUBLIC_VENICE_CLIENT_TIMEOUT_MS
  ? Number(process.env.NEXT_PUBLIC_VENICE_CLIENT_TIMEOUT_MS)
  : undefined; // No timeout by default

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

    // Check if VENICE_API_ENDPOINT is a full URL (starts with http:// or https://)
    const isFullUrl = /^https?:\/\//.test(rawEndpoint);

    let baseURL: string;
    if (isFullUrl) {
      // If endpoint is a full URL, parse it and use the host as baseURL
      // This allows direct API calls without going through the Next.js proxy
      const endpointUrl = new URL(rawEndpoint);
      baseURL = `${endpointUrl.protocol}//${endpointUrl.host}`;
      this.endpointPath = endpointUrl.pathname;
    } else {
      // Ensure endpoint always starts with a single leading slash
      this.endpointPath = `/${rawEndpoint.replace(/^\/?/, "")}`;

      // Use baseURL logic for relative endpoints
      baseURL =
        trimmedBaseUrl === ""
          ? ""
          : this.endpointPath !== DEFAULT_ENDPOINT_PATH &&
              trimmedBaseUrl.endsWith(this.endpointPath)
            ? trimmedBaseUrl.slice(0, -this.endpointPath.length) || ""
            : trimmedBaseUrl;
    }

    // Add better clarity to logs when hitting the proxy vs direct endpoint
    const targetInfo = baseURL || "(relative: /api/venice)";
    if (this.debugMode) {
      logger.info(`VeniceApiService configured with baseURL: ${targetInfo}`);
    }

    // For client-side usage, point to our API route
    // Only set timeout if explicitly configured
    const axiosConfig: AxiosRequestConfig = {
      baseURL,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    // If calling Venice API directly (not through Next.js proxy), add API key
    // Check if we're calling the Venice API directly (baseURL contains api.venice.ai)
    if (baseURL.includes("api.venice.ai")) {
      const apiKey = process.env.VENICE_API_KEY;
      if (apiKey) {
        axiosConfig.headers = {
          ...axiosConfig.headers,
          Authorization: `Bearer ${apiKey}`,
        };
        if (this.debugMode) {
          logger.info(
            "VeniceApiService: Added API key for direct Venice API call",
          );
        }
      } else {
        logger.warn(
          "VeniceApiService: VENICE_API_KEY not found, direct API calls will fail",
        );
      }
    }

    if (DEFAULT_CLIENT_TIMEOUT_MS !== undefined) {
      axiosConfig.timeout = DEFAULT_CLIENT_TIMEOUT_MS;
    }

    this.client = axios.create(axiosConfig);

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
   * Uses NEXT_PUBLIC_ prefix for client-side access
   */
  static fromEnv(): VeniceApiService {
    const debugMode = process.env.NODE_ENV === "development";
    const modelName =
      process.env.NEXT_PUBLIC_VENICE_MODEL_NAME || "zai-org-glm-4.7";
    return new VeniceApiService(modelName, debugMode);
  }

  async generateVeniceResponse(
    prompt: string,
    maxTokens: number = 2000,
    veniceParameters?: Record<string, unknown>,
  ): Promise<string | null> {
    const response = await this.generateCompletion({
      userPrompt: prompt,
      maxTokens,
      veniceParameters,
    });
    return response ?? null;
  }

  async generateCompletion({
    systemPrompt,
    userPrompt,
    temperature = 0.7,
    maxTokens = 2000,
    veniceParameters,
  }: {
    systemPrompt?: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
    veniceParameters?: Record<string, unknown>;
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
        ...(veniceParameters ? { venice_parameters: veniceParameters } : {}),
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

      // Use native fetch on mobile Safari instead of axios for better compatibility
      const isMobile =
        typeof navigator !== "undefined" &&
        /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile) {
        console.log(
          `[VeniceApiService] Using native fetch for mobile (Safari compatibility)`,
        );
        return await this.generateCompletionWithFetch(
          requestBody,
          requestId,
          startTime,
        );
      }

      // Remove artificial timeout - let the request complete naturally
      // Only use timeout if explicitly configured in axios client
      const responsePromise = this.retryOperation(() =>
        this.client.post(this.endpointPath, requestBody),
      );

      const response = await responsePromise;

      // Enhanced debugging for response structure
      const firstChoice = response.data?.choices?.[0];
      const message = firstChoice?.message;
      const content = message?.content;
      const reasoningContent = message?.reasoning_content;

      console.log(`[VeniceApiService] Response received [${requestId}]`, {
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - startTime,
        status: response.status,
        hasData: Boolean(response.data),
        hasChoices: Boolean(response.data?.choices),
        choicesLength: response.data?.choices?.length,
        hasFirstChoice: Boolean(firstChoice),
        firstChoiceType: typeof firstChoice,
        firstChoiceKeys: firstChoice ? Object.keys(firstChoice) : [],
        hasMessage: Boolean(message),
        messageType: typeof message,
        messageKeys: message ? Object.keys(message) : [],
        hasContent: Boolean(content),
        contentType: typeof content,
        contentLength: content?.length || 0,
        contentValue: content,
        contentPreview: content?.substring?.(0, 100),
        hasReasoningContent: Boolean(reasoningContent),
        reasoningContentType: typeof reasoningContent,
        reasoningContentLength: reasoningContent?.length || 0,
        reasoningContentPreview: reasoningContent?.substring?.(0, 100),
        rawResponse: JSON.stringify(response.data).substring(0, 1000),
      });

      // GLM 4.7 workaround: Model puts meta-analysis in reasoning_content
      // With increased token limit (900 -> 1500), it should complete the response
      // Just return reasoning_content if content is empty
      if (
        typeof reasoningContent === "string" &&
        reasoningContent.length > 100
      ) {
        const c = String(content || "");
        if (c.trim().length === 0) {
          console.log(
            "✅ [VeniceApiService] Using reasoning_content (content field empty)",
          );
          return reasoningContent;
        }
      }

      // Handle different response formats
      // Standard format: choices[0].message.content
      if (content !== undefined && content !== null) {
        // If content is empty but reasoning_content exists, prefer reasoning_content.
        const c = String(content);
        if (c.trim().length === 0 && typeof reasoningContent === "string") {
          const r = String(reasoningContent);
          if (r.trim().length > 0) return r;
        }
        return c;
      }

      // Alternative format: choices[0].text (some models use 'text' instead of 'message.content')
      if (firstChoice?.text !== undefined && firstChoice?.text !== null) {
        return String(firstChoice.text);
      }

      // Alternative format: choices[0].delta?.content (streaming format, but we're not streaming)
      if (
        firstChoice?.delta?.content !== undefined &&
        firstChoice?.delta?.content !== null
      ) {
        return String(firstChoice.delta.content);
      }

      // Check for error in response
      if (response.data?.error) {
        console.error(
          `[VeniceApiService] API returned error [${requestId}]`,
          response.data.error,
        );
        throw new Error(String(response.data.error));
      }

      // Log full structure for debugging
      console.error(
        `[VeniceApiService] Invalid response format [${requestId}]`,
        {
          data: response.data,
          firstChoice: firstChoice,
          message: message,
          content: content,
          fullResponse: JSON.stringify(response.data, null, 2).substring(
            0,
            2000,
          ),
        },
      );
      throw new Error(
        "Invalid response format from Venice API: missing content in choices[0]",
      );
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

  /**
   * Native fetch implementation for mobile Safari compatibility
   * Bypasses axios entirely to avoid XMLHttpRequest issues
   */
  private async generateCompletionWithFetch(
    requestBody: {
      messages: Array<{ role: string; content: string }>;
      max_tokens: number;
      temperature: number;
      model: string;
      stream: boolean;
    },
    _requestId: string,
    startTime: number,
  ): Promise<string> {
    try {
      // Construct full URL
      const baseURL =
        typeof window !== "undefined" ? window.location.origin : "";
      const url = `${baseURL}${this.endpointPath}`;

      console.log(`[VeniceApiService] Native fetch request to: ${url}`);

      // Use native fetch without artificial timeout limits
      // Only add timeout if explicitly configured
      const fetchOptions: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(requestBody),
      };

      // If calling Venice API directly (not through Next.js proxy), add API key
      if (baseURL.includes("api.venice.ai") || url.includes("api.venice.ai")) {
        const apiKey = process.env.VENICE_API_KEY;
        if (apiKey) {
          (fetchOptions.headers as Record<string, string>).Authorization =
            `Bearer ${apiKey}`;
        }
      }

      // Only add abort signal if timeout is configured
      let timeoutId: NodeJS.Timeout | undefined;
      if (DEFAULT_CLIENT_TIMEOUT_MS !== undefined) {
        const controller = new AbortController();
        timeoutId = setTimeout(
          () => controller.abort(),
          DEFAULT_CLIENT_TIMEOUT_MS,
        );
        fetchOptions.signal = controller.signal;
      }

      let response: Response;
      try {
        response = await fetch(url, fetchOptions);
        if (timeoutId) clearTimeout(timeoutId);
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        throw error;
      }

      console.log(`[VeniceApiService] Native fetch response received`, {
        status: response.status,
        ok: response.ok,
        elapsedMs: Date.now() - startTime,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[VeniceApiService] Fetch error response:`, {
          status: response.status,
          statusText: response.statusText,
          errorText,
        });
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      // Same response validation as axios version
      if (data?.choices?.[0]?.message?.content) {
        console.log(`[VeniceApiService] ✅ Fetch successful`, {
          elapsedMs: Date.now() - startTime,
          contentLength: data.choices[0].message.content.length,
        });
        return data.choices[0].message.content;
      }

      if (data?.error) {
        console.error(`[VeniceApiService] API returned error`, data.error);
        throw new Error(String(data.error));
      }

      console.error(`[VeniceApiService] Invalid response format`, { data });
      throw new Error("Invalid response format from Venice API");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Request timed out after 180000ms");
      }
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
          // For client or upstream timeout (504), another full retry just doubles latency
          // without much chance of success. Surface the error immediately.
          if (status === 504) {
            throw error;
          }
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
