import { getMetricName } from "../core/metricDefinitions";
import { HealthDataPoint } from "../types/healthData";

/**
 * Escapes a field value for CSV format
 */
function escapeCSVField(field: string | number | undefined): string {
  if (field === undefined || field === null) return "";

  const stringValue = String(field);
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/**
 * Simplifies metric ID to a more readable format
 */
function simplifyMetricId(metricId: string): string {
  let simplified = metricId;
  simplified = simplified.replace("HKQuantityTypeIdentifier", "");
  simplified = simplified.replace("HKCategoryTypeIdentifier", "");
  return simplified;
}

/**
 * Generates and downloads a CSV file for a specific health metric
 *
 * @param metric - Metric ID
 * @param data - Array of health data points
 * @returns Promise that resolves when the download is complete
 */
export const generateAndDownloadCSV = async (
  metric: string,
  data: ReadonlyArray<HealthDataPoint>,
): Promise<void> => {
  if (!data || data.length === 0) {
    console.warn(`No data to export for metric: ${metric}`);
    return;
  }

  // Define CSV headers
  const headers = ["Date", "Value", "Unit", "Source", "Device"];

  // Generate CSV rows
  const rows = data.map((record) =>
    [
      record.startDate,
      record.value,
      record.unit,
      record.source,
      record.device,
    ].map(escapeCSVField),
  );

  // Combine headers and rows
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  // Create a simplified filename
  const metricName = getMetricName(metric) || simplifyMetricId(metric);
  const simpleFilename = metricName.replace(/\s+/g, ""); // Remove any spaces

  // Create blob and download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.setAttribute("href", url);
  link.setAttribute("download", `${simpleFilename}.csv`);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up
  URL.revokeObjectURL(url);

  console.log(`CSV generated for ${metricName} with ${data.length} records`);
};

/**
 * Exports all health data to a single ZIP file containing multiple CSVs
 *
 * @param metricData - Map of metric IDs to health data arrays
 * @returns Promise that resolves when the download is complete
 */
export const exportAllDataToZip = async (
  metricData: Record<string, HealthDataPoint[]>,
): Promise<void> => {
  // This is a placeholder for future implementation
  // Would require a ZIP library like JSZip
  console.log("ZIP export not yet implemented");

  // Example implementation would:
  // 1. Create a new JSZip instance
  // 2. For each metric, generate a CSV and add it to the ZIP
  // 3. Generate the ZIP file and trigger download
};

/**
 * Validates if a file is a valid health export file
 *
 * @param file - File to validate
 * @returns Boolean indicating if the file is valid
 */
export const validateExportFile = (file: File): boolean => {
  if (!file) return false;

  // Check file extension
  if (!file.name.toLowerCase().endsWith(".xml")) {
    return false;
  }

  // Check file size (arbitrary limit of 500MB)
  if (file.size > 500 * 1024 * 1024) {
    return false;
  }

  return true;
};

/**
 * Generates and downloads a combined CSV file for all health metrics
 */
export function generateAndDownloadCombinedCSV(
  metricData: Record<string, HealthDataPoint[]>,
): void {
  if (!metricData || Object.keys(metricData).length === 0) {
    console.warn("No data to export");
    return;
  }

  // Define CSV headers
  const headers = ["Date", "Metric", "Value", "Unit", "Source", "Device"];

  // Generate CSV rows for all metrics
  const rows = Object.entries(metricData).flatMap(([metricId, data]) => {
    // Get a simplified metric name for the CSV
    const simplifiedMetricId = simplifyMetricId(metricId);

    return data.map((record) =>
      [
        record.startDate,
        simplifiedMetricId, // Use simplified metric name in the CSV data too
        record.value,
        record.unit,
        record.source,
        record.device,
      ].map(escapeCSVField),
    );
  });

  // Combine headers and rows
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  // Create blob and download with simplified name
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", "HealthData.csv");
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up
  URL.revokeObjectURL(url);

  console.log(
    `Combined CSV generated with data from ${Object.keys(metricData).length} metrics`,
  );
}
