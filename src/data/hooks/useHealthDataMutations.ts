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
    mutationFn: (data: HealthDataResults) =>
      healthDataStore.saveHealthData(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["healthData"] });
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
