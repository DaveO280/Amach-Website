// Utility to build the Venice AI prompt for health analysis sections

type Metrics = {
  steps: { average: number; total?: number; high: number; low: number };
  exercise: { average: number; total?: number; high: number; low: number };
  heartRate: { average: number; total?: number; high: number; low: number };
  hrv: { average: number; total?: number; high: number; low: number };
  restingHR: { average: number; total?: number; high: number; low: number };
  respiratory: { average: number; total?: number; high: number; low: number };
  activeEnergy: { average: number; total?: number; high: number; low: number };
  sleep: {
    average: string | number;
    efficiency: number;
    high: string | number;
    low: string | number;
  };
};

type HealthScoreKey = "overall" | "activity" | "sleep" | "heart" | "energy";

export function buildHealthAnalysisPrompt(
  section: HealthScoreKey,
  metrics: Metrics,
  healthScoresObj: Record<string, number>,
  userProfile: {
    age: number;
    sex: string;
    height: number;
    weight: number;
  } | null,
): string {
  const hasProfile = !!userProfile;
  const weightLbs = hasProfile
    ? Math.round(userProfile!.weight) // Weight is already in pounds
    : "N/A";
  const formatHeight = (heightInFeet: number): string => {
    const feet = Math.floor(heightInFeet);
    const inches = Math.round((heightInFeet - feet) * 12);
    return `${feet}'${inches}"`;
  };
  const formattedHeight = hasProfile
    ? formatHeight(userProfile!.height) // Height is already in feet
    : "N/A";

  const sectionPrompts: Record<HealthScoreKey, string> = {
    overall: hasProfile
      ? `You are a health companion. Write a single, fluid, conversational paragraph that explains the overall health score of ${healthScoresObj.overall} for a ${userProfile!.age}-year-old ${userProfile!.sex} (${formattedHeight}, ${weightLbs}lbs). Start the paragraph with the exact phrase "Overall snapshot:" and ensure it flows naturally into the rest of the paragraph. Seamlessly weave in the following metrics as part of the narrative, not as a list: sleep duration (${metrics.sleep.average}), exercise time (${metrics.exercise.average} min/day), active energy (${metrics.activeEnergy.average} calories/day), resting heart rate (${metrics.restingHR?.average || "N/A"} BPM), respiratory rate (${metrics.respiratory?.average || "N/A"} breaths/min), heart rate (${metrics.heartRate?.average || "N/A"} BPM), heart rate variability (${metrics.hrv?.average || "N/A"} ms), and steps (${metrics.steps.average} steps/day). Do not use bullet points, asterisks, or lists. Make the paragraph warm, encouraging, and easy to read, with all data flowing naturally in the text.`
      : "Profile incomplete.",
    activity: hasProfile
      ? `Write a single, fluid, conversational paragraph that analyzes the activity score of ${healthScoresObj.activity} for a ${userProfile!.age}-year-old ${userProfile!.sex} (${formattedHeight}, ${weightLbs}lbs). Start the paragraph with the exact phrase "Movement momentum:" and ensure it flows naturally into the rest of the paragraph. Seamlessly include steps (${metrics.steps.average} steps/day), exercise time (${metrics.exercise.average} min/day), and active energy (${metrics.activeEnergy.average} calories/day) as part of the narrative. Do not use bullet points, asterisks, or lists. Make the paragraph warm, encouraging, and easy to read, with all data flowing naturally in the text. Use different language and transitions than in the other sections to keep the report engaging and avoid repetition.`
      : "Profile incomplete.",
    sleep: hasProfile
      ? `Write a single, fluid, conversational paragraph that analyzes the sleep score of ${healthScoresObj.sleep} for a ${userProfile!.age}-year-old ${userProfile!.sex} (${formattedHeight}, ${weightLbs}lbs). Start the paragraph with the exact phrase "Sleep rhythm:" and ensure it flows naturally into the rest of the paragraph. Seamlessly include sleep duration (${metrics.sleep.average}) and sleep efficiency (${metrics.sleep.efficiency}%) as part of the narrative. Do not use bullet points, asterisks, or lists. Make the paragraph warm, encouraging, and easy to read, with all data flowing naturally in the text. Use different language and transitions than in the other sections to keep the report engaging and avoid repetition.`
      : "Profile incomplete.",
    heart: hasProfile
      ? `Write a single, fluid, conversational paragraph that analyzes the heart health score of ${healthScoresObj.heart} for a ${userProfile!.age}-year-old ${userProfile!.sex} (${formattedHeight}, ${weightLbs}lbs). Start the paragraph with the exact phrase "Cardio check-in:" and ensure it flows naturally into the rest of the paragraph. Seamlessly include heart rate (${metrics.heartRate?.average || "N/A"} BPM), heart rate variability (${metrics.hrv?.average || "N/A"} ms), resting heart rate (${metrics.restingHR?.average || "N/A"} BPM), and respiratory rate (${metrics.respiratory?.average || "N/A"} breaths/min) as part of the narrative. Do not use bullet points, asterisks, or lists. Make the paragraph warm, encouraging, and easy to read, with all data flowing naturally in the text. Use different language and transitions than in the other sections to keep the report engaging and avoid repetition.`
      : "Profile incomplete.",
    energy: hasProfile
      ? `Write a single, fluid, conversational paragraph that analyzes the energy balance score of ${healthScoresObj.energy} for a ${userProfile!.age}-year-old ${userProfile!.sex} (${formattedHeight}, ${weightLbs}lbs). Start the paragraph with the exact phrase "Energy pulse:" and ensure it flows naturally into the rest of the paragraph. Seamlessly include active energy (${metrics.activeEnergy.average} calories/day), exercise time (${metrics.exercise.average} min/day), steps (${metrics.steps.average} steps/day), and sleep duration (${metrics.sleep.average}) as part of the narrative. Do not use bullet points, asterisks, or lists. Make the paragraph warm, encouraging, and easy to read, with all data flowing naturally in the text. Use different language and transitions than in the other sections to keep the report engaging and avoid repetition.`
      : "Profile incomplete.",
  };

  return `As Cosaint, your holistic health companion, provide a single, concise paragraph analysis of the following health metric:

${sectionPrompts[section]}

Rules:
- Return ONLY the final paragraph. Do NOT include analysis, planning, constraint checklists, or any other meta text.
- Do NOT use bullet points, numbered lists, or headings.
- Keep it under 900 characters.
- Do NOT include <think> tags.`;
}
