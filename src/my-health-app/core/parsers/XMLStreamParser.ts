import { HealthDataPoint, TimeFrame } from "../../types/healthData";

// Define interface for parser options
export interface XMLParserOptions {
  selectedMetrics: string[];
  timeFrame: TimeFrame;
  onProgress: (progress: {
    progress: number;
    recordCount: number;
    metricCounts: Record<string, number>;
  }) => void;
}

// Define interface for parser results
export type XMLParserResults = Record<string, HealthDataPoint[]>;

// Validate the file is likely a Health Export file
export const validateHealthExportFile = (file: File): boolean => {
  console.log("[DEBUG] Validating file:", file.name, file.type, file.size);
  // Basic validation - checking name, size, and type
  if (!file.name.toLowerCase().includes("export")) {
    console.log("[DEBUG] Validation failed: Filename doesn't contain 'export'");
    return false;
  }

  if (file.type !== "text/xml" && !file.type.includes("xml")) {
    console.log("[DEBUG] Validation failed: File type is not XML:", file.type);
    return false;
  }

  // Simple size check to ensure it's not empty or too small to be valid
  if (file.size < 1000) {
    console.log("[DEBUG] Validation failed: File is too small:", file.size);
    return false;
  }

  console.log("[DEBUG] File validation passed");
  return true;
};

export class XMLStreamParser {
  private options: XMLParserOptions;
  private recordCount = 0;
  private metricCounts: Record<string, number> = {};
  private dateRange: { startDate: Date; endDate: Date };

  // Metrics we specifically want to track for debugging
  private debugMetrics = [
    "HKQuantityTypeIdentifierStepCount",
    "HKQuantityTypeIdentifierActiveEnergyBurned",
    "HKQuantityTypeIdentifierAppleExerciseTime",
    "HKCategoryTypeIdentifierSleepAnalysis",
  ];

  constructor(options: XMLParserOptions) {
    this.options = options;
    console.log(
      "[DEBUG] XMLStreamParser initialized with options:",
      JSON.stringify(options, null, 2),
    );

    // Initialize metric counts
    options.selectedMetrics.forEach((metric) => {
      this.metricCounts[metric] = 0;
    });

    // Initialize date range
    this.dateRange = this.getDateRangeFromTimeFrame(options.timeFrame);
    console.log("[DEBUG] Using date range:", this.dateRange);
  }

  // Main method to parse the file
  async parseFile(file: File): Promise<XMLParserResults> {
    this.recordCount = 0;
    const results: XMLParserResults = {};

    // Initialize result arrays for each selected metric
    this.options.selectedMetrics.forEach((metric) => {
      results[metric] = [];
    });

    console.log(
      "[DEBUG] Beginning file parse for metrics:",
      this.options.selectedMetrics,
    );
    console.log("[DEBUG] Using time frame:", this.options.timeFrame);

    try {
      // Process the file in chunks to avoid memory issues
      const chunkSize = 10 * 1024 * 1024; // 10MB chunks
      const fileSize = file.size;
      let processedSize = 0;
      let currentBuffer = "";
      let fileReader = new FileReader();

      // Create a promise to handle the file reading
      const readChunk = (start: number, end: number): Promise<string> => {
        return new Promise((resolve, reject) => {
          const chunk = file.slice(start, end);
          fileReader.onload = (e) =>
            resolve((e.target?.result as string) || "");
          fileReader.onerror = (e) => reject(e);
          fileReader.readAsText(chunk);
        });
      };

      // Function to process a <Record> element string
      const processRecordElement = (recordStr: string) => {
        try {
          // Extract attributes using regex to avoid creating DOM elements
          const typeMatch = recordStr.match(/type="([^"]+)"/);
          if (!typeMatch) return;

          const type = typeMatch[1];
          if (!this.options.selectedMetrics.includes(type)) return;

          const startDateMatch = recordStr.match(/startDate="([^"]+)"/);
          if (!startDateMatch) return;

          const startDate = startDateMatch[1];
          const recordDate = new Date(startDate);

          // Debug output for tracked metrics
          if (this.debugMetrics.includes(type)) {
            console.log(`[DEBUG] Found ${type} record with date: ${startDate}`);
          }

          // Check if record is within our time range
          if (
            !this.isDateInRange(
              recordDate,
              this.dateRange.startDate,
              this.dateRange.endDate,
            )
          ) {
            if (this.debugMetrics.includes(type)) {
              console.log(
                `[DEBUG] ${type} record skipped - outside date range`,
              );
            }
            return;
          }

          // Extract other attributes
          const endDateMatch = recordStr.match(/endDate="([^"]+)"/);
          const endDate = endDateMatch ? endDateMatch[1] : startDate;

          const valueMatch = recordStr.match(/value="([^"]+)"/);
          const value = valueMatch ? valueMatch[1] : "";

          const unitMatch = recordStr.match(/unit="([^"]+)"/);
          const unit = unitMatch ? unitMatch[1] : "";

          const sourceNameMatch = recordStr.match(/sourceName="([^"]+)"/);
          const sourceName = sourceNameMatch ? sourceNameMatch[1] : "";

          const deviceMatch = recordStr.match(/device="([^"]+)"/);
          const device = deviceMatch ? deviceMatch[1] : "";

          // Create data point and add to results
          const dataPoint: HealthDataPoint = {
            startDate,
            endDate,
            value,
            unit,
            source: sourceName,
            device,
          };

          results[type].push(dataPoint);
          this.metricCounts[type]++;
          this.recordCount++;

          // Debug output for tracked metrics
          if (this.debugMetrics.includes(type)) {
            console.log(
              `[DEBUG] Added ${type} record, count now: ${this.metricCounts[type]}`,
            );
            if (this.metricCounts[type] <= 3) {
              console.log(`[DEBUG] ${type} sample record:`, dataPoint);
            }
          }
        } catch (err) {
          console.error("[DEBUG] Error processing record:", err);
        }
      };

      while (processedSize < fileSize) {
        const nextEnd = Math.min(processedSize + chunkSize, fileSize);
        console.log(
          `[DEBUG] Reading chunk: ${processedSize} - ${nextEnd} of ${fileSize}`,
        );

        const chunkData = await readChunk(processedSize, nextEnd);
        currentBuffer += chunkData;

        // Find complete <Record> elements
        let recordStartIndex = currentBuffer.indexOf("<Record ");
        while (recordStartIndex !== -1) {
          const recordEndIndex = currentBuffer.indexOf("/>", recordStartIndex);
          if (recordEndIndex === -1) break; // Incomplete record, wait for next chunk

          const recordString = currentBuffer.substring(
            recordStartIndex,
            recordEndIndex + 2,
          );
          processRecordElement(recordString);

          // Move past this record
          recordStartIndex = currentBuffer.indexOf("<Record ", recordEndIndex);

          // Update progress based on processed records
          if (this.recordCount % 1000 === 0) {
            const progress = Math.round((processedSize / fileSize) * 100);
            this.options.onProgress({
              progress,
              recordCount: this.recordCount,
              metricCounts: { ...this.metricCounts },
            });
          }
        }

        // Keep any partial record at the end for the next chunk
        const lastRecordStart = currentBuffer.lastIndexOf("<Record ");
        if (
          lastRecordStart !== -1 &&
          currentBuffer.indexOf("/>", lastRecordStart) === -1
        ) {
          currentBuffer = currentBuffer.substring(lastRecordStart);
        } else {
          currentBuffer = "";
        }

        processedSize = nextEnd;

        // Update progress
        const progress = Math.round((processedSize / fileSize) * 100);
        this.options.onProgress({
          progress,
          recordCount: this.recordCount,
          metricCounts: { ...this.metricCounts },
        });
      }

      // Final debug logs for tracked metrics
      console.log("[DEBUG] Parse complete. Results for tracked metrics:");
      for (const metric of this.debugMetrics) {
        const count = this.metricCounts[metric] || 0;
        console.log(`[DEBUG] - ${metric}: ${count} records found`);
        if (count > 0 && count <= 5) {
          console.log(
            `[DEBUG] - ${metric} sample records:`,
            results[metric].slice(0, 5),
          );
        }
      }

      return results;
    } catch (error) {
      console.error("[DEBUG] Error parsing file:", error);
      throw error;
    }
  }

  // Helper to get date range from time frame
  private getDateRangeFromTimeFrame(timeFrame: TimeFrame): {
    startDate: Date;
    endDate: Date;
  } {
    const endDate = new Date(); // Current date
    let startDate = new Date();

    // Calculate start date based on time frame
    switch (timeFrame) {
      case "3mo":
        startDate.setMonth(endDate.getMonth() - 3);
        break;
      case "6mo":
        startDate.setMonth(endDate.getMonth() - 6);
        break;
      case "1yr":
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      case "2yr":
        startDate.setFullYear(endDate.getFullYear() - 2);
        break;
      default:
        // Default to 1 year if unknown time frame
        startDate.setFullYear(endDate.getFullYear() - 1);
    }

    console.log(
      `[DEBUG] Date range for ${timeFrame}: ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );

    return { startDate, endDate };
  }

  // Helper to check if a date is within range
  private isDateInRange(date: Date, startDate: Date, endDate: Date): boolean {
    return date >= startDate && date <= endDate;
  }
}
