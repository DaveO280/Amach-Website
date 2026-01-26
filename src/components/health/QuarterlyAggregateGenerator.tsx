/**
 * Quarterly Aggregate Generator Component
 *
 * Allows users to generate comprehensive quarterly health summaries
 * with min/max/avg stats for all metrics.
 */

"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { QuarterlyAggregationService } from "@/services/QuarterlyAggregationService";
import { getWalletDerivedEncryptionKey } from "@/utils/walletEncryption";
import { healthDataStore } from "@/data/store/healthDataStore";
import { useState } from "react";
import {
  Calendar,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { MetricSample } from "@/agents/types";
import type { DailyProcessedSleepData } from "@/utils/sleepDataProcessor";

interface QuarterlyAggregateGeneratorProps {
  userAddress: string;
  signMessage: (message: string) => Promise<string>;
}

export function QuarterlyAggregateGenerator({
  userAddress,
  signMessage,
}: QuarterlyAggregateGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleGenerate = async (quarter: 1 | 2 | 3 | 4, year: number) => {
    setIsGenerating(true);
    setStatus(`Generating Q${quarter} ${year}...`);
    setError("");

    try {
      // Get encryption key
      const encryptionKey = await getWalletDerivedEncryptionKey(
        userAddress,
        signMessage,
      );

      // Prefer processed daily aggregates (supports long-range even when raw IndexedDB is trimmed).
      const processed = await healthDataStore.getProcessedData();
      let aggregate;
      if (processed) {
        aggregate =
          await QuarterlyAggregationService.generateQuarterlyAggregateFromProcessed(
            {
              dailyAggregates: processed.dailyAggregates as unknown as Record<
                string,
                Map<string, MetricSample>
              >,
              sleepData: processed.sleepData as DailyProcessedSleepData[],
            },
            quarter,
            year,
          );
      } else {
        // Fallback (older installs): raw health data might be present but limited to a recent window.
        const healthData = await healthDataStore.getHealthData();
        if (!healthData) {
          throw new Error(
            "No health data available. Please upload your Apple Health data first.",
          );
        }
        aggregate =
          await QuarterlyAggregationService.generateQuarterlyAggregate(
            healthData as unknown as Record<
              string,
              Array<{
                startDate: string;
                value: string;
                unit?: string;
                source?: string;
                device?: string;
              }>
            >,
            quarter,
            year,
          );
      }

      // Save to Storj
      await QuarterlyAggregationService.saveToStorj(
        aggregate,
        userAddress,
        encryptionKey,
      );

      setStatus(
        `✅ Q${quarter} ${year} aggregate generated! ${aggregate.summary.activeDays} active days, ${Object.keys(aggregate.metrics).length} metrics`,
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error("[QuarterlyAggregate] Error:", err);
      setError(errorMsg);
      setStatus("");
    } finally {
      setIsGenerating(false);
    }
  };

  const currentQuarter = QuarterlyAggregationService.getQuarter(new Date());
  const lastYear = currentQuarter.year - 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Quarterly Health Aggregates
        </CardTitle>
        <CardDescription>
          Generate comprehensive quarterly summaries with min/max/avg for all
          metrics
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <p className="font-medium text-blue-900 mb-1">
            Why quarterly aggregates?
          </p>
          <ul className="list-disc list-inside text-blue-800 space-y-1">
            <li>Compare seasonal patterns (Winter vs Summer activity)</li>
            <li>Year-over-year trends (Q1 2024 vs Q1 2025)</li>
            <li>Long-term health trajectory</li>
            <li>Efficient storage (one summary per quarter)</li>
          </ul>
        </div>

        {status && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-900">{status}</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-900">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Generate for {currentQuarter.year}:
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {([1, 2, 3, 4] as const).map((q) => (
              <Button
                key={q}
                variant="outline"
                onClick={() => handleGenerate(q, currentQuarter.year)}
                disabled={isGenerating}
                className="flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <TrendingUp className="h-4 w-4" />
                )}
                Q{q} {currentQuarter.year}
              </Button>
            ))}
          </div>

          <h3 className="text-sm font-semibold text-gray-900 pt-2">
            Generate for {lastYear}:
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {([1, 2, 3, 4] as const).map((q) => (
              <Button
                key={`${lastYear}-${q}`}
                variant="outline"
                onClick={() => handleGenerate(q, lastYear)}
                disabled={isGenerating}
                className="flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <TrendingUp className="h-4 w-4" />
                )}
                Q{q} {lastYear}
              </Button>
            ))}
          </div>
        </div>

        <div className="text-xs text-gray-600 mt-4 p-3 bg-amber-50 border border-amber-200 rounded">
          <p className="font-medium text-amber-900">
            <strong>Current quarter:</strong> Q{currentQuarter.quarter}{" "}
            {currentQuarter.year}
          </p>
          <p className="mt-1 text-amber-800">
            Aggregates are stored in Storj and never deleted by pruning.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
