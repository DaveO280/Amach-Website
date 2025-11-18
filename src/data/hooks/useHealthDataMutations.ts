import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { healthDataStore } from "../store/healthDataStore";
import type {
  HealthDataResults,
  HealthMetric,
  MetricType,
} from "../types/healthMetrics";

// Save/replace all health data
export function useSaveHealthDataMutation(): UseMutationResult<
  void,
  unknown,
  HealthDataResults
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: HealthDataResults) => {
      console.log(
        "🔧 [Mutation Debug] useSaveHealthDataMutation called with:",
        {
          metrics: Object.keys(data),
          recordCounts: Object.entries(data).map(
            ([k, v]) => `${k}: ${v.length}`,
          ),
        },
      );
      return healthDataStore.saveHealthData(data);
    },
    onSuccess: () => {
      console.log("✅ [Mutation Debug] Save successful, invalidating queries");
      queryClient.invalidateQueries({ queryKey: ["healthData"] });
    },
    onError: (error) => {
      console.error("❌ [Mutation Debug] Save failed:", error);
    },
  });
}

// Update a single metric
export function useUpdateMetricMutation(): UseMutationResult<
  void,
  unknown,
  { metricType: MetricType; data: HealthMetric[] }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      metricType,
      data,
    }: {
      metricType: MetricType;
      data: HealthMetric[];
    }) => healthDataStore.updateMetricData(metricType, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["healthData"] });
    },
  });
}

// Clear all health data
export function useClearHealthDataMutation(): UseMutationResult<
  void,
  unknown,
  void
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => healthDataStore.clearHealthData(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["healthData"] });
    },
  });
}
