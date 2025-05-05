import { useHealthData } from "@/my-health-app/store/healthDataStore/provider";
import { extractDatePart } from "@/my-health-app/utils/dataDeduplicator";
import { processSleepData } from "@/my-health-app/utils/sleepDataProcessor";
import { useMemo } from "react";

interface ProfileData {
  age: number;
  sex: "male" | "female";
  height: number;
  weight: number;
}

interface SleepData {
  sleepDuration: number;
  metrics: {
    sleepEfficiency: number;
  };
}

interface DailyData {
  day: string;
  date: Date;
  value?: number;
  count?: number;
  values: number[];
  avg?: number;
  min?: number;
  max?: number;
}

interface HealthScores {
  overall: number;
  activity: number;
  sleep: number;
  heart: number;
  energy: number;
}

export function useHealthScoreCalculator(
  profileData: ProfileData,
): HealthScores | undefined {
  const { metricData } = useHealthData();

  // Process sleep data
  const processedSleepData = useMemo(() => {
    const sleepData = metricData["HKCategoryTypeIdentifierSleepAnalysis"] || [];
    return processSleepData(sleepData);
  }, [metricData]);

  // Calculate metrics using the same format as HealthStatCards
  const metrics = useMemo(() => {
    const stepsData = metricData["HKQuantityTypeIdentifierStepCount"] || [];
    const exerciseData =
      metricData["HKQuantityTypeIdentifierAppleExerciseTime"] || [];
    const heartRateData = metricData["HKQuantityTypeIdentifierHeartRate"] || [];
    const hrvData =
      metricData["HKQuantityTypeIdentifierHeartRateVariabilitySDNN"] || [];
    const restingHRData =
      metricData["HKQuantityTypeIdentifierRestingHeartRate"] || [];
    const respiratoryData =
      metricData["HKQuantityTypeIdentifierRespiratoryRate"] || [];
    const activeEnergyData =
      metricData["HKQuantityTypeIdentifierActiveEnergyBurned"] || [];

    // Process each metric type
    const processNumericData = (
      data: { startDate: string; value: string }[],
      transform: (value: number) => number = (v) => v,
    ): DailyData[] => {
      const dailyData: Record<
        string,
        { total: number; count: number; values: number[] }
      > = {};

      data.forEach((point) => {
        try {
          const dayKey = extractDatePart(point.startDate);
          const value = parseFloat(point.value);

          if (!isNaN(value)) {
            if (!dailyData[dayKey]) {
              dailyData[dayKey] = { total: 0, count: 0, values: [] };
            }
            dailyData[dayKey].total += transform(value);
            dailyData[dayKey].count += 1;
            dailyData[dayKey].values.push(value);
          }
        } catch (e) {
          console.error("Error processing data point:", e);
        }
      });

      return Object.entries(dailyData)
        .map(([day, data]) => ({
          day,
          date: new Date(day + "T12:00:00"),
          value: Math.round(data.total),
          count: data.count,
          values: data.values,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    };

    const processHeartRateData = (
      data: { startDate: string; value: string }[],
    ): DailyData[] => {
      const dailyData: Record<
        string,
        { values: number[]; min: number; max: number }
      > = {};

      data.forEach((point) => {
        try {
          const dayKey = extractDatePart(point.startDate);
          const value = parseFloat(point.value);

          if (!isNaN(value)) {
            if (!dailyData[dayKey]) {
              dailyData[dayKey] = {
                values: [],
                min: Number.MAX_SAFE_INTEGER,
                max: Number.MIN_SAFE_INTEGER,
              };
            }
            dailyData[dayKey].values.push(value);
            dailyData[dayKey].min = Math.min(dailyData[dayKey].min, value);
            dailyData[dayKey].max = Math.max(dailyData[dayKey].max, value);
          }
        } catch (e) {
          console.error("Error processing heart rate data point:", e);
        }
      });

      return Object.entries(dailyData)
        .map(([day, data]) => ({
          day,
          date: new Date(day + "T12:00:00"),
          avg: Math.round(
            data.values.reduce((sum: number, val: number) => sum + val, 0) /
              data.values.length,
          ),
          min: Math.round(data.min),
          max: Math.round(data.max),
          count: data.values.length,
          values: data.values,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    };

    // Process each metric
    const steps = processNumericData(stepsData);
    const exercise = processNumericData(exerciseData);
    const heartRate = processHeartRateData(heartRateData);
    const hrv = processHeartRateData(hrvData);
    const restingHR = processNumericData(restingHRData);
    const respiratory = processNumericData(respiratoryData);
    const activeEnergy = processNumericData(activeEnergyData);

    return {
      steps: {
        average:
          steps.length > 0
            ? Math.round(
                steps.reduce((sum, day) => sum + (day.value ?? 0), 0) /
                  steps.length,
              )
            : 0,
        high: Math.max(...steps.map((day: DailyData) => day.value ?? 0)),
        low: Math.min(...steps.map((day: DailyData) => day.value ?? 0)),
      },
      exercise: {
        average:
          exercise.length > 0
            ? Math.round(
                exercise.reduce((sum, day) => sum + (day.value ?? 0), 0) /
                  exercise.length,
              )
            : 0,
        high: Math.max(...exercise.map((day: DailyData) => day.value ?? 0)),
        low: Math.min(...exercise.map((day: DailyData) => day.value ?? 0)),
      },
      heartRate: {
        average:
          heartRate.length > 0
            ? Math.round(
                heartRate.reduce(
                  (sum: number, day: DailyData) => sum + (day.avg ?? 0),
                  0,
                ) / heartRate.length,
              )
            : 0,
        total:
          heartRate.length > 0
            ? heartRate.reduce(
                (sum: number, day: DailyData) => sum + (day.avg ?? 0),
                0,
              )
            : 0,
        high:
          heartRate.length > 0
            ? Math.max(...heartRate.map((day: DailyData) => day.max ?? 0))
            : 0,
        low:
          heartRate.length > 0
            ? Math.min(...heartRate.map((day: DailyData) => day.min ?? 0))
            : 0,
      },
      hrv: {
        average:
          hrv.length > 0
            ? Math.round(
                hrv.reduce(
                  (sum: number, day: DailyData) => sum + (day.avg ?? 0),
                  0,
                ) / hrv.length,
              )
            : 0,
        total:
          hrv.length > 0
            ? hrv.reduce(
                (sum: number, day: DailyData) => sum + (day.avg ?? 0),
                0,
              )
            : 0,
        high:
          hrv.length > 0
            ? Math.max(...hrv.map((day: DailyData) => day.max ?? 0))
            : 0,
        low:
          hrv.length > 0
            ? Math.min(...hrv.map((day: DailyData) => day.min ?? 0))
            : 0,
      },
      restingHR: {
        average:
          restingHR.length > 0
            ? Math.round(
                restingHR.reduce((sum, day) => sum + (day.value ?? 0), 0) /
                  restingHR.length,
              )
            : 0,
        high: Math.max(...restingHR.map((day: DailyData) => day.value ?? 0)),
        low: Math.min(...restingHR.map((day: DailyData) => day.value ?? 0)),
      },
      respiratory: {
        average:
          respiratory.length > 0
            ? Math.round(
                respiratory.reduce(
                  (sum: number, day: DailyData) =>
                    sum +
                    day.values.reduce((s: number, v: number) => s + v, 0) /
                      day.values.length,
                  0,
                ) / respiratory.length,
              )
            : 0,
        high: Math.max(
          ...respiratory.map((day: DailyData) => Math.max(...day.values)),
        ),
        low: Math.min(
          ...respiratory.map((day: DailyData) => Math.min(...day.values)),
        ),
        total: respiratory.reduce(
          (sum: number, day: DailyData) =>
            sum + day.values.reduce((s: number, v: number) => s + v, 0),
          0,
        ),
      },
      activeEnergy: {
        average:
          activeEnergy.length > 0
            ? Math.round(
                activeEnergy.reduce((sum, day) => sum + (day.value ?? 0), 0) /
                  activeEnergy.length,
              )
            : 0,
        high: Math.max(...activeEnergy.map((day: DailyData) => day.value ?? 0)),
        low: Math.min(...activeEnergy.map((day: DailyData) => day.value ?? 0)),
      },
      sleep:
        processedSleepData.length > 0
          ? {
              average: Math.round(
                processedSleepData.reduce(
                  (sum: number, day: SleepData) => sum + day.sleepDuration,
                  0,
                ) / processedSleepData.length,
              ),
              efficiency: Math.round(
                processedSleepData.reduce(
                  (sum: number, day: SleepData) =>
                    sum + day.metrics.sleepEfficiency,
                  0,
                ) / processedSleepData.length,
              ),
              high: Math.max(
                ...processedSleepData.map(
                  (day: SleepData) => day.sleepDuration,
                ),
              ),
              low: Math.min(
                ...processedSleepData.map(
                  (day: SleepData) => day.sleepDuration,
                ),
              ),
            }
          : { average: 0, efficiency: 0, high: 0, low: 0 },
    };
  }, [metricData, processedSleepData]);

  // Calculate scores
  const scores = useMemo(() => {
    if (!profileData) return undefined;

    // Calculate Sleep Quality Score (SQS)
    const sleepDurationScore = 0.7 * (metrics.sleep.average / 60 / 8);
    const sleepEfficiencyScore = 0.3 * (metrics.sleep.efficiency / 100);
    const sleepQualityScore =
      Math.min(1, sleepDurationScore + sleepEfficiencyScore) * 100;

    // Calculate Heart Health Score (HHS)
    const normalizeHRV = (hrv: number, age: number, sex: string): number => {
      const ageRanges = {
        "20-30": { min: 55, max: 105 },
        "31-40": { min: 45, max: 95 },
        "41-50": { min: 35, max: 85 },
        "51-60": { min: 25, max: 75 },
        "61+": { min: 15, max: 65 },
      };
      const ageGroup =
        age <= 30
          ? "20-30"
          : age <= 40
            ? "31-40"
            : age <= 50
              ? "41-50"
              : age <= 60
                ? "51-60"
                : "61+";
      const { min, max } = ageRanges[ageGroup];
      const sexAdjustment = sex === "female" ? 7.5 : 0;
      return Math.min(
        100,
        Math.max(
          0,
          ((hrv - (min + sexAdjustment)) /
            (max + sexAdjustment - (min + sexAdjustment))) *
            100,
        ),
      );
    };

    const normalizeRestingHR = (
      rhr: number,
      age: number,
      sex: string,
    ): number => {
      const ageRanges = {
        "20-30": { min: 55, max: 85 },
        "31-40": { min: 57, max: 87 },
        "41-50": { min: 60, max: 90 },
        "51-60": { min: 62, max: 92 },
        "61+": { min: 65, max: 95 },
      };
      const ageGroup =
        age <= 30
          ? "20-30"
          : age <= 40
            ? "31-40"
            : age <= 50
              ? "41-50"
              : age <= 60
                ? "51-60"
                : "61+";
      const { min, max } = ageRanges[ageGroup];
      const sexAdjustment = sex === "female" ? 4 : 0;
      return Math.min(
        100,
        Math.max(
          0,
          ((max + sexAdjustment - rhr) /
            (max + sexAdjustment - (min + sexAdjustment))) *
            100,
        ),
      );
    };

    const normalizeHRVariability = (
      avgHR: number,
      rhr: number,
      age: number,
    ): number => {
      const hrRange = avgHR - rhr;
      const ageFactor = Math.max(0.7, 1 - (age - 30) * 0.005);
      const optimalRange = rhr * 0.5 * ageFactor;
      return Math.min(
        100,
        Math.max(
          0,
          ((optimalRange - Math.abs(hrRange - optimalRange)) / optimalRange) *
            100,
        ),
      );
    };

    const heartHealthScore = Math.min(
      100,
      Math.max(
        0,
        normalizeHRV(metrics.hrv.average, profileData.age, profileData.sex) *
          0.4 +
          normalizeRestingHR(
            metrics.restingHR.average,
            profileData.age,
            profileData.sex,
          ) *
            0.3 +
          normalizeHRVariability(
            metrics.heartRate.average,
            metrics.restingHR.average,
            profileData.age,
          ) *
            0.3,
      ),
    );

    // Calculate Physical Activity Score (PAS)
    const normalizeSteps = (
      steps: number,
      age: number,
      sex: string,
    ): number => {
      const ageFactor = Math.max(0.7, 1 - (age - 30) * 0.005);
      const sexFactor = sex === "female" ? 0.9 : 1.0;
      const targetSteps = 10000 * ageFactor * sexFactor;
      return Math.min(100, Math.max(0, (steps / targetSteps) * 100));
    };

    const normalizeExercise = (minutes: number, age: number): number => {
      const ageFactor = Math.max(0.7, 1 - (age - 30) * 0.005);
      const targetMinutes = 60 * ageFactor;
      return Math.min(100, Math.max(0, (minutes / targetMinutes) * 100));
    };

    const normalizeRespiratory = (
      rate: number,
      age: number,
      sex: string,
    ): number => {
      const ageFactor = Math.max(0.8, 1 - (age - 30) * 0.003);
      const sexFactor = sex === "female" ? 1.05 : 1.0;
      const optimalRate = 16 * ageFactor * sexFactor;
      const range = 4 * ageFactor;
      return Math.min(
        100,
        Math.max(0, ((range - Math.abs(rate - optimalRate)) / range) * 100),
      );
    };

    const getActivityLevelMultiplier = (
      activeEnergy: number,
      age: number,
      sex: string,
    ): number => {
      const ranges = {
        male: {
          low: { min: 0, max: 300, multiplier: 0.2 },
          moderate: { min: 301, max: 500, multiplier: 0.4 },
          average: { min: 501, max: 800, multiplier: 0.6 },
          high: { min: 801, max: 1100, multiplier: 0.8 },
          elite: { min: 1101, max: Infinity, multiplier: 1.0 },
        },
        female: {
          low: { min: 0, max: 250, multiplier: 0.2 },
          moderate: { min: 251, max: 400, multiplier: 0.4 },
          average: { min: 401, max: 650, multiplier: 0.6 },
          high: { min: 651, max: 900, multiplier: 0.8 },
          elite: { min: 901, max: Infinity, multiplier: 1.0 },
        },
      };

      const ageAdjustment = age < 30 ? 1.0 : age < 50 ? 0.9 : 0.8;
      const adjustedRanges = sex === "male" ? ranges.male : ranges.female;

      for (const [, range] of Object.entries(adjustedRanges)) {
        if (
          activeEnergy >= range.min * ageAdjustment &&
          activeEnergy <= range.max * ageAdjustment
        ) {
          return range.multiplier;
        }
      }

      return 0.2;
    };

    const physicalActivityScore = Math.min(
      100,
      Math.max(
        0,
        normalizeSteps(
          metrics.steps.average,
          profileData.age,
          profileData.sex,
        ) *
          0.3 +
          normalizeExercise(metrics.exercise.average, profileData.age) * 0.2 +
          getActivityLevelMultiplier(
            metrics.activeEnergy.average,
            profileData.age,
            profileData.sex,
          ) *
            100 *
            0.3 +
          normalizeRespiratory(
            metrics.respiratory.average,
            profileData.age,
            profileData.sex,
          ) *
            0.2,
      ),
    );

    // Calculate Energy Balance Score (EBS)
    const calculateEnergyTarget = (
      weightLbs: number,
      heightFeet: number,
      age: number,
      sex: string,
      activityLevel: number,
    ): number => {
      // Using the Mifflin-St Jeor Equation with imperial units
      const heightInches = heightFeet * 12;
      const bmr =
        sex === "male"
          ? 4.536 * weightLbs + 15.88 * heightInches - 5 * age + 5
          : 4.536 * weightLbs + 15.88 * heightInches - 5 * age - 161;

      const baseActiveTarget = bmr * 0.5;
      const scaledActivity = 0.5 + activityLevel;

      return baseActiveTarget * scaledActivity;
    };

    const energyBalanceScore = Math.min(
      100,
      Math.max(
        0,
        (1 -
          Math.abs(
            metrics.activeEnergy.average -
              calculateEnergyTarget(
                profileData.weight,
                profileData.height,
                profileData.age,
                profileData.sex,
                getActivityLevelMultiplier(
                  metrics.activeEnergy.average,
                  profileData.age,
                  profileData.sex,
                ),
              ),
          ) /
            1000) *
          100,
      ),
    );

    // Calculate Overall Health Score (OHS)
    const overallHealthScore =
      0.25 * physicalActivityScore +
      0.25 * sleepQualityScore +
      0.25 * heartHealthScore +
      0.25 * energyBalanceScore;

    return {
      overall: Math.round(overallHealthScore),
      activity: Math.round(physicalActivityScore),
      sleep: Math.round(sleepQualityScore),
      heart: Math.round(heartHealthScore),
      energy: Math.round(energyBalanceScore),
    };
  }, [metrics, profileData]);

  return scores;
}
