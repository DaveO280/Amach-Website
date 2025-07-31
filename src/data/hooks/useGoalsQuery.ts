import { useQuery } from "@tanstack/react-query";
import type { HealthGoal } from "../../types/HealthContext";
import { healthDataStore } from "../store/healthDataStore";

export function useGoalsQuery(): ReturnType<typeof useQuery<HealthGoal[]>> {
  return useQuery<HealthGoal[]>({
    queryKey: ["goals"],
    queryFn: () => healthDataStore.getGoals(),
    initialData: [],
  });
}
