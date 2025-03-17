import { useCallback, useMemo, useState } from "react";
import CharacteristicsLoader from "../../../components/ai/characteristicsLoader";
import cosaintCharacteristics from "../../../components/ai/cosaint";
import { HealthDataPoint } from "../../../my-health-app/types/healthData";

// Types for Venice API integration
export interface VeniceMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface MetricContext {
  metricId: string;
  displayName: string;
  recentData: HealthDataPoint[];
  trend: "increasing" | "decreasing" | "stable" | "fluctuating";
  summary?: {
    mean: number;
    min: number;
    max: number;
    stdDev: number;
  };
}

export interface ChatContext {
  metrics: MetricContext[];
  timeframe: string;
  previousMessages: VeniceMessage[];
}

export const useCosaintAgent = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const characteristics = useMemo(
    () => new CharacteristicsLoader(cosaintCharacteristics),
    [],
  );

  // Initialize Venice API chat context
  const initializeContext = useCallback(
    (metrics: MetricContext[]): ChatContext => {
      return {
        metrics,
        timeframe: "30d", // default timeframe
        previousMessages: [
          {
            role: "system",
            content: `You are Cosaint, a holistic health companion. ${characteristics.getBio()}
                 Current context: Analyzing health data for metrics: ${metrics.map((m) => m.displayName).join(", ")}.
                 Use your characteristics to provide insights while maintaining your personality.`,
          },
        ],
      };
    },
    [characteristics],
  );

  // Prepare metric data for API context
  const prepareMetricContext = useCallback(
    (
      metricId: string,
      displayName: string,
      data: HealthDataPoint[],
    ): MetricContext => {
      // Calculate basic statistics and determine trend
      const values = data
        .map((d) => parseFloat(d.value))
        .filter((v) => !isNaN(v));
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const trend = determineTrend(values); // You'll need to implement this

      return {
        metricId,
        displayName,
        recentData: data.slice(-30), // Last 30 data points
        trend,
        summary: {
          mean,
          min: Math.min(...values),
          max: Math.max(...values),
          stdDev: calculateStdDev(values, mean),
        },
      };
    },
    [],
  );

  // Send message to Venice API
  const sendMessage = useCallback(
    async (
      message: string,
      context: ChatContext,
    ): Promise<{ content: string; context: ChatContext } | null> => {
      setIsLoading(true);
      setError(null);

      try {
        // TODO: Implement Venice API call here
        // const response = await veniceApi.chat({
        //   messages: [...context.previousMessages, { role: 'user', content: message }],
        //   context: {
        //     metrics: context.metrics,
        //     timeframe: context.timeframe
        //   }
        // });

        // For now, return a mock response using characteristics
        const response = characteristics.getDefaultResponse();

        // Ensure we return a properly typed context
        const newContext: ChatContext = {
          ...context,
          previousMessages: [
            ...context.previousMessages,
            { role: "user" as const, content: message },
            { role: "assistant" as const, content: response },
          ],
        };

        return {
          content: response,
          context: newContext,
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to get response");
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [characteristics],
  );

  // Helper function to calculate standard deviation
  const calculateStdDev = (values: number[], mean: number): number => {
    const squareDiffs = values.map((value) => Math.pow(value - mean, 2));
    const avgSquareDiff =
      squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
  };

  // Helper function to determine trend
  const determineTrend = (
    values: number[],
  ): "increasing" | "decreasing" | "stable" | "fluctuating" => {
    if (values.length < 3) return "stable";

    // Simple linear regression slope
    const xMean = (values.length - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / values.length;

    const slope =
      values.reduce((acc, y, x) => {
        return acc + (x - xMean) * (y - yMean);
      }, 0) /
      values.reduce((acc, _, x) => {
        return acc + Math.pow(x - xMean, 2);
      }, 0);

    const variance =
      values.reduce((acc, val) => acc + Math.pow(val - yMean, 2), 0) /
      values.length;
    const threshold = yMean * 0.1; // 10% of mean as threshold

    if (variance > Math.pow(threshold, 2)) return "fluctuating";
    if (Math.abs(slope) < threshold / values.length) return "stable";
    return slope > 0 ? "increasing" : "decreasing";
  };

  return {
    isLoading,
    error,
    sendMessage,
    initializeContext,
    prepareMetricContext,
    characteristics,
  };
};
