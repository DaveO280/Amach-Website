// src/utils/ai/useHealthDataForAi.ts
import { useHealthData } from "../../my-health-app/store/healthDataStore";
import { useSelection } from "../../my-health-app/store/selectionStore";

interface HealthMetricSummary {
  metricName: string;
  displayName: string;
  dataPoints: number;
  average: number | null;
  trend: "increasing" | "decreasing" | "stable" | "unknown";
  unit: string;
}

export function useHealthDataForAi() {
  const healthData = useHealthData();
  const selection = useSelection();

  const getMetricsSummary = (): HealthMetricSummary[] => {
    const summaries: HealthMetricSummary[] = [];

    // This assumes your health data store has methods to access the data
    // You'll need to adjust this based on your actual store structure
    selection.selectedMetrics.forEach((metricId) => {
      const data = healthData.metricData[metricId];

      if (data && data.length > 0) {
        // Calculate average
        const numericValues = data
          .map((item) => parseFloat(item.value))
          .filter((val) => !isNaN(val));

        const average =
          numericValues.length > 0
            ? numericValues.reduce((sum, val) => sum + val, 0) /
              numericValues.length
            : null;

        // Determine trend (very simple algorithm)
        let trend: "increasing" | "decreasing" | "stable" | "unknown" =
          "unknown";

        if (numericValues.length >= 3) {
          const firstHalf = numericValues.slice(
            0,
            Math.floor(numericValues.length / 2),
          );
          const secondHalf = numericValues.slice(
            Math.ceil(numericValues.length / 2),
          );

          const firstAvg =
            firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
          const secondAvg =
            secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

          const percentChange = ((secondAvg - firstAvg) / firstAvg) * 100;

          if (percentChange > 5) trend = "increasing";
          else if (percentChange < -5) trend = "decreasing";
          else trend = "stable";
        }

        // Get display name and unit from metadata if available
        const displayName = getMetricDisplayName(metricId);
        const unit = getMetricUnit(metricId);

        summaries.push({
          metricName: metricId,
          displayName,
          dataPoints: data.length,
          average,
          trend,
          unit,
        });
      }
    });

    return summaries;
  };

  // Helper to convert technical metric IDs to readable names
  const getMetricDisplayName = (metricId: string): string => {
    // Map of metric IDs to display names
    const metricNames: { [key: string]: string } = {
      HKQuantityTypeIdentifierStepCount: "Step Count",
      HKQuantityTypeIdentifierHeartRate: "Heart Rate",
      HKCategoryTypeIdentifierSleepAnalysis: "Sleep Analysis",
      HKQuantityTypeIdentifierActiveEnergyBurned: "Active Energy",
      // Add more mappings as needed
    };

    return metricNames[metricId] || metricId;
  };

  // Helper to get appropriate units for metrics
  const getMetricUnit = (metricId: string): string => {
    // Map of metric IDs to units
    const metricUnits: { [key: string]: string } = {
      HKQuantityTypeIdentifierStepCount: "steps",
      HKQuantityTypeIdentifierHeartRate: "bpm",
      HKQuantityTypeIdentifierActiveEnergyBurned: "kcal",
      // Add more mappings as needed
    };

    return metricUnits[metricId] || "";
  };

  return {
    hasHealthData: selection.selectedMetrics.length > 0,
    getMetricsSummary,
    // Add more utility methods as needed
  };
}
