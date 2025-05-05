import { HealthDataPoint } from "../types/healthData";

/**
 * Format a value based on its unit
 */
export const formatValue = (value: string, unit: string): string => {
  // Parse the value to a number
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return value;

  // Format based on unit
  switch (unit) {
    case "count/min":
      // Check if this is a respiratory rate value
      if (value.includes("HKQuantityTypeIdentifierRespiratoryRate")) {
        return `${numValue.toFixed(0)} breaths/min`;
      }
      return `${numValue.toFixed(0)} bpm`;

    case "count":
      return numValue.toLocaleString();

    case "kcal":
      return `${numValue.toFixed(1)} kcal`;

    case "min":
      return `${numValue.toFixed(0)} min`;

    case "km/h":
    case "kph":
      return `${numValue.toFixed(1)} km/h`;

    case "ml/kg/min":
      return `${numValue.toFixed(1)} ml/kg/min`;

    case "%":
      return `${numValue.toFixed(1)}%`;

    case "mg/dL":
      return `${numValue.toFixed(0)} mg/dL`;

    default:
      return `${numValue} ${unit}`;
  }
};

/**
 * Format a date string to a user-friendly format
 */
export const formatDateString = (dateString: string): string => {
  const date = new Date(dateString);

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Generate a CSV string from health data
 */
// In formatters.ts
export const generateCSV = (data: ReadonlyArray<HealthDataPoint>): string => {
  // Change this line
  const headers: ReadonlyArray<keyof HealthDataPoint> = [
    "startDate",
    "endDate",
    "value",
    "unit",
    "source",
    "device",
  ];

  const csvRows = [
    headers.join(","),
    ...data.map((record) =>
      headers
        .map((header) => {
          const field = record[header];
          if (!field) return "";
          // Convert to string if it's not already a string
          const fieldStr =
            typeof field === "string" ? field : JSON.stringify(field);
          return fieldStr.includes(",") || fieldStr.includes('"')
            ? `"${fieldStr.replace(/"/g, '""')}"`
            : fieldStr;
        })
        .join(","),
    ),
  ];

  return csvRows.join("\n");
};

/**
 * Create a download for a CSV file
 */
export const downloadCSV = (
  metricName: string,
  data: ReadonlyArray<HealthDataPoint>,
): void => {
  const csvContent = generateCSV(data);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const fileName = metricName.replace(/\s+/g, "_").toLowerCase() + ".csv";

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Format number of records to a user-friendly string
 */
export const formatRecordCount = (count: number): string => {
  if (count === 0) return "No records";
  if (count === 1) return "1 record";
  return `${count.toLocaleString()} records`;
};
