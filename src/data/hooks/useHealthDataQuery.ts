import { healthDataStore } from "@/data/store/healthDataStore";
import type { HealthMetric } from "@/data/types/healthMetrics";
import type { HealthDataByType, HealthDataPoint } from "@/types/healthData";
import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

async function fetchHealthData(): Promise<HealthDataByType> {
  const data = await healthDataStore.getHealthData();
  if (!data) {
    return {};
  }

  // Convert HealthMetric[] arrays back to HealthDataPoint[] arrays for UI compatibility
  const convertedData: HealthDataByType = {};

  Object.entries(data).forEach(([metricType, metrics]) => {
    convertedData[metricType] = metrics.map(
      (metric: HealthMetric): HealthDataPoint => ({
        startDate: metric.startDate,
        endDate: metric.endDate,
        value: metric.value,
        unit: metric.unit,
        source: metric.source,
        device: metric.device,
        type: metric.type,
      }),
    );
  });

  return convertedData;
}

export function useHealthDataQuery(): UseQueryResult<HealthDataByType, Error> {
  return useQuery<HealthDataByType, Error>({
    queryKey: ["healthData"],
    queryFn: fetchHealthData,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
}
