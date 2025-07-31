import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { HealthGoal } from "../../types/HealthContext";
import { healthDataStore } from "../store/healthDataStore";

export function useSaveGoalsMutation(): UseMutationResult<
  void,
  unknown,
  HealthGoal[]
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (goals: HealthGoal[]) => healthDataStore.saveGoals(goals),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}
