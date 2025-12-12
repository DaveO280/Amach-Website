/**
 * Health Event Types and Definitions
 *
 * Predefined event types with suggested fields, plus support for custom events
 */

export enum HealthEventType {
  // Medications
  MEDICATION_STARTED = "MEDICATION_STARTED",
  MEDICATION_STOPPED = "MEDICATION_STOPPED",
  MEDICATION_DOSAGE_CHANGED = "MEDICATION_DOSAGE_CHANGED",

  // Conditions & Diagnoses
  CONDITION_DIAGNOSED = "CONDITION_DIAGNOSED",
  CONDITION_RESOLVED = "CONDITION_RESOLVED",
  CONDITION_IMPROVED = "CONDITION_IMPROVED",

  // Injuries & Accidents
  INJURY_OCCURRED = "INJURY_OCCURRED",
  INJURY_HEALED = "INJURY_HEALED",

  // Illnesses
  ILLNESS_STARTED = "ILLNESS_STARTED",
  ILLNESS_RESOLVED = "ILLNESS_RESOLVED",

  // Procedures
  SURGERY_COMPLETED = "SURGERY_COMPLETED",
  PROCEDURE_COMPLETED = "PROCEDURE_COMPLETED",

  // Allergies
  ALLERGY_ADDED = "ALLERGY_ADDED",
  ALLERGY_REACTION = "ALLERGY_REACTION",

  // Measurements
  WEIGHT_RECORDED = "WEIGHT_RECORDED",
  HEIGHT_RECORDED = "HEIGHT_RECORDED",
  BLOOD_PRESSURE_RECORDED = "BLOOD_PRESSURE_RECORDED",

  // General
  METRIC_SNAPSHOT = "METRIC_SNAPSHOT",
  GENERAL_NOTE = "GENERAL_NOTE",

  // Custom
  CUSTOM = "CUSTOM",
}

export interface EventTypeDefinition {
  type: HealthEventType;
  label: string;
  category:
    | "medication"
    | "condition"
    | "injury"
    | "illness"
    | "procedure"
    | "allergy"
    | "measurement"
    | "general"
    | "custom";
  icon?: string;
  suggestedFields: Array<{
    key: string;
    label: string;
    type: "text" | "number" | "date" | "select";
    placeholder?: string;
    options?: string[];
    required?: boolean;
  }>;
  description?: string;
}

export const EVENT_TYPE_DEFINITIONS: Record<
  HealthEventType,
  EventTypeDefinition
> = {
  // Medications
  [HealthEventType.MEDICATION_STARTED]: {
    type: HealthEventType.MEDICATION_STARTED,
    label: "Medication Started",
    category: "medication",
    icon: "💊",
    description: "Record when you start taking a new medication",
    suggestedFields: [
      {
        key: "medication",
        label: "Medication Name",
        type: "text",
        placeholder: "e.g., Enclomiphene",
        required: true,
      },
      {
        key: "dosage",
        label: "Dosage",
        type: "text",
        placeholder: "e.g., 12.5mg",
      },
      {
        key: "frequency",
        label: "Frequency",
        type: "select",
        options: ["Daily", "Twice Daily", "Weekly", "As Needed"],
        placeholder: "Select frequency",
      },
      {
        key: "prescribedBy",
        label: "Prescribed By",
        type: "text",
        placeholder: "Doctor name",
      },
      {
        key: "reason",
        label: "Reason",
        type: "text",
        placeholder: "Why you're taking this",
      },
    ],
  },
  [HealthEventType.MEDICATION_STOPPED]: {
    type: HealthEventType.MEDICATION_STOPPED,
    label: "Medication Stopped",
    category: "medication",
    icon: "🚫",
    description: "Record when you stop taking a medication",
    suggestedFields: [
      {
        key: "medication",
        label: "Medication Name",
        type: "text",
        required: true,
      },
      {
        key: "reason",
        label: "Reason",
        type: "text",
        placeholder: "Why you stopped",
      },
    ],
  },
  [HealthEventType.MEDICATION_DOSAGE_CHANGED]: {
    type: HealthEventType.MEDICATION_DOSAGE_CHANGED,
    label: "Medication Dosage Changed",
    category: "medication",
    icon: "📊",
    description: "Record a change in medication dosage",
    suggestedFields: [
      {
        key: "medication",
        label: "Medication Name",
        type: "text",
        required: true,
      },
      { key: "oldDosage", label: "Old Dosage", type: "text" },
      { key: "newDosage", label: "New Dosage", type: "text", required: true },
      { key: "reason", label: "Reason", type: "text" },
    ],
  },

  // Conditions & Diagnoses
  [HealthEventType.CONDITION_DIAGNOSED]: {
    type: HealthEventType.CONDITION_DIAGNOSED,
    label: "Condition Diagnosed",
    category: "condition",
    icon: "🏥",
    description: "Record a new health condition or diagnosis",
    suggestedFields: [
      {
        key: "condition",
        label: "Condition Name",
        type: "text",
        placeholder: "e.g., Hypertension",
        required: true,
      },
      {
        key: "diagnosedBy",
        label: "Diagnosed By",
        type: "text",
        placeholder: "Doctor name",
      },
      {
        key: "severity",
        label: "Severity",
        type: "select",
        options: ["Mild", "Moderate", "Severe"],
        placeholder: "Select severity",
      },
      {
        key: "notes",
        label: "Notes",
        type: "text",
        placeholder: "Additional information",
      },
    ],
  },
  [HealthEventType.CONDITION_RESOLVED]: {
    type: HealthEventType.CONDITION_RESOLVED,
    label: "Condition Resolved",
    category: "condition",
    icon: "✅",
    description: "Record when a condition is resolved",
    suggestedFields: [
      {
        key: "condition",
        label: "Condition Name",
        type: "text",
        required: true,
      },
      {
        key: "resolvedBy",
        label: "Resolved By",
        type: "text",
        placeholder: "Doctor name",
      },
      { key: "notes", label: "Notes", type: "text" },
    ],
  },
  [HealthEventType.CONDITION_IMPROVED]: {
    type: HealthEventType.CONDITION_IMPROVED,
    label: "Condition Improved",
    category: "condition",
    icon: "📈",
    description: "Record improvement in a condition",
    suggestedFields: [
      {
        key: "condition",
        label: "Condition Name",
        type: "text",
        required: true,
      },
      {
        key: "improvement",
        label: "Improvement",
        type: "text",
        placeholder: "Describe the improvement",
      },
    ],
  },

  // Injuries
  [HealthEventType.INJURY_OCCURRED]: {
    type: HealthEventType.INJURY_OCCURRED,
    label: "Injury Occurred",
    category: "injury",
    icon: "🩹",
    description: "Record an injury or accident",
    suggestedFields: [
      {
        key: "injury",
        label: "Injury Type",
        type: "text",
        placeholder: "e.g., Sprained ankle",
        required: true,
      },
      {
        key: "location",
        label: "Location",
        type: "text",
        placeholder: "Body part affected",
      },
      {
        key: "severity",
        label: "Severity",
        type: "select",
        options: ["Minor", "Moderate", "Severe"],
        placeholder: "Select severity",
      },
      {
        key: "treatedBy",
        label: "Treated By",
        type: "text",
        placeholder: "Doctor/ER name",
      },
      { key: "notes", label: "Notes", type: "text" },
    ],
  },
  [HealthEventType.INJURY_HEALED]: {
    type: HealthEventType.INJURY_HEALED,
    label: "Injury Healed",
    category: "injury",
    icon: "✨",
    description: "Record when an injury has healed",
    suggestedFields: [
      { key: "injury", label: "Injury Type", type: "text", required: true },
      {
        key: "healingTime",
        label: "Healing Time",
        type: "text",
        placeholder: "e.g., 2 weeks",
      },
    ],
  },

  // Illnesses
  [HealthEventType.ILLNESS_STARTED]: {
    type: HealthEventType.ILLNESS_STARTED,
    label: "Illness Started",
    category: "illness",
    icon: "🤒",
    description: "Record the start of an illness",
    suggestedFields: [
      {
        key: "illness",
        label: "Illness Type",
        type: "text",
        placeholder: "e.g., Flu, Cold",
        required: true,
      },
      {
        key: "symptoms",
        label: "Symptoms",
        type: "text",
        placeholder: "Describe symptoms",
      },
      {
        key: "severity",
        label: "Severity",
        type: "select",
        options: ["Mild", "Moderate", "Severe"],
        placeholder: "Select severity",
      },
    ],
  },
  [HealthEventType.ILLNESS_RESOLVED]: {
    type: HealthEventType.ILLNESS_RESOLVED,
    label: "Illness Resolved",
    category: "illness",
    icon: "😊",
    description: "Record when an illness is resolved",
    suggestedFields: [
      { key: "illness", label: "Illness Type", type: "text", required: true },
      {
        key: "duration",
        label: "Duration",
        type: "text",
        placeholder: "e.g., 5 days",
      },
    ],
  },

  // Procedures
  [HealthEventType.SURGERY_COMPLETED]: {
    type: HealthEventType.SURGERY_COMPLETED,
    label: "Surgery Completed",
    category: "procedure",
    icon: "🏥",
    description: "Record a completed surgery",
    suggestedFields: [
      {
        key: "surgery",
        label: "Surgery Type",
        type: "text",
        placeholder: "e.g., Appendectomy",
        required: true,
      },
      {
        key: "surgeon",
        label: "Surgeon",
        type: "text",
        placeholder: "Surgeon name",
      },
      {
        key: "hospital",
        label: "Hospital",
        type: "text",
        placeholder: "Hospital name",
      },
      { key: "notes", label: "Notes", type: "text" },
    ],
  },
  [HealthEventType.PROCEDURE_COMPLETED]: {
    type: HealthEventType.PROCEDURE_COMPLETED,
    label: "Procedure Completed",
    category: "procedure",
    icon: "🔬",
    description: "Record a medical procedure",
    suggestedFields: [
      {
        key: "procedure",
        label: "Procedure Type",
        type: "text",
        required: true,
      },
      {
        key: "performedBy",
        label: "Performed By",
        type: "text",
        placeholder: "Doctor name",
      },
      {
        key: "location",
        label: "Location",
        type: "text",
        placeholder: "Hospital/clinic name",
      },
    ],
  },

  // Allergies
  [HealthEventType.ALLERGY_ADDED]: {
    type: HealthEventType.ALLERGY_ADDED,
    label: "Allergy Added",
    category: "allergy",
    icon: "⚠️",
    description: "Record a new allergy",
    suggestedFields: [
      {
        key: "allergen",
        label: "Allergen",
        type: "text",
        placeholder: "e.g., Penicillin, Peanuts",
        required: true,
      },
      {
        key: "severity",
        label: "Severity",
        type: "select",
        options: ["Mild", "Moderate", "Severe", "Life-threatening"],
        placeholder: "Select severity",
      },
      {
        key: "reaction",
        label: "Reaction",
        type: "text",
        placeholder: "Describe reaction",
      },
    ],
  },
  [HealthEventType.ALLERGY_REACTION]: {
    type: HealthEventType.ALLERGY_REACTION,
    label: "Allergy Reaction",
    category: "allergy",
    icon: "🚨",
    description: "Record an allergic reaction",
    suggestedFields: [
      { key: "allergen", label: "Allergen", type: "text", required: true },
      { key: "reaction", label: "Reaction", type: "text", required: true },
      {
        key: "severity",
        label: "Severity",
        type: "select",
        options: ["Mild", "Moderate", "Severe", "Life-threatening"],
        placeholder: "Select severity",
      },
      {
        key: "treated",
        label: "Treated",
        type: "text",
        placeholder: "How it was treated",
      },
    ],
  },

  // Measurements
  [HealthEventType.WEIGHT_RECORDED]: {
    type: HealthEventType.WEIGHT_RECORDED,
    label: "Weight Recorded",
    category: "measurement",
    icon: "⚖️",
    description: "Record your weight",
    suggestedFields: [
      {
        key: "weight",
        label: "Weight",
        type: "number",
        placeholder: "Weight in lbs or kg",
        required: true,
      },
      {
        key: "unit",
        label: "Unit",
        type: "select",
        options: ["lbs", "kg"],
        placeholder: "Select unit",
      },
      { key: "notes", label: "Notes", type: "text" },
    ],
  },
  [HealthEventType.HEIGHT_RECORDED]: {
    type: HealthEventType.HEIGHT_RECORDED,
    label: "Height Recorded",
    category: "measurement",
    icon: "📏",
    description: "Record your height",
    suggestedFields: [
      {
        key: "height",
        label: "Height",
        type: "number",
        placeholder: "Height in inches or cm",
        required: true,
      },
      {
        key: "unit",
        label: "Unit",
        type: "select",
        options: ["inches", "cm"],
        placeholder: "Select unit",
      },
    ],
  },
  [HealthEventType.BLOOD_PRESSURE_RECORDED]: {
    type: HealthEventType.BLOOD_PRESSURE_RECORDED,
    label: "Blood Pressure Recorded",
    category: "measurement",
    icon: "🩺",
    description: "Record blood pressure reading",
    suggestedFields: [
      {
        key: "systolic",
        label: "Systolic",
        type: "number",
        placeholder: "Top number",
        required: true,
      },
      {
        key: "diastolic",
        label: "Diastolic",
        type: "number",
        placeholder: "Bottom number",
        required: true,
      },
      {
        key: "pulse",
        label: "Pulse",
        type: "number",
        placeholder: "Heart rate",
      },
    ],
  },

  // General
  [HealthEventType.METRIC_SNAPSHOT]: {
    type: HealthEventType.METRIC_SNAPSHOT,
    label: "Health Snapshot",
    category: "general",
    icon: "📊",
    description: "Record a snapshot of multiple health metrics",
    suggestedFields: [
      {
        key: "metrics",
        label: "Metrics",
        type: "text",
        placeholder: "Comma-separated metrics",
        required: true,
      },
      { key: "notes", label: "Notes", type: "text" },
    ],
  },
  [HealthEventType.GENERAL_NOTE]: {
    type: HealthEventType.GENERAL_NOTE,
    label: "General Note",
    category: "general",
    icon: "📝",
    description: "Record a general health note",
    suggestedFields: [
      {
        key: "note",
        label: "Note",
        type: "text",
        placeholder: "Your note",
        required: true,
      },
    ],
  },

  // Custom
  [HealthEventType.CUSTOM]: {
    type: HealthEventType.CUSTOM,
    label: "Custom Event",
    category: "custom",
    icon: "➕",
    description: "Create a custom event with your own fields",
    suggestedFields: [],
  },
};

/**
 * Get event type definition
 */
export function getEventTypeDefinition(
  type: HealthEventType | string,
): EventTypeDefinition {
  if (type === HealthEventType.CUSTOM || !(type in EVENT_TYPE_DEFINITIONS)) {
    return EVENT_TYPE_DEFINITIONS[HealthEventType.CUSTOM];
  }
  return EVENT_TYPE_DEFINITIONS[type as HealthEventType];
}

/**
 * Get all event types grouped by category
 */
export function getEventTypesByCategory(): Record<
  string,
  EventTypeDefinition[]
> {
  const categories: Record<string, EventTypeDefinition[]> = {};

  Object.values(EVENT_TYPE_DEFINITIONS).forEach((def) => {
    if (!categories[def.category]) {
      categories[def.category] = [];
    }
    categories[def.category].push(def);
  });

  return categories;
}

/**
 * Format event type for display
 */
export function formatEventType(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
