import { HealthDataPoint, TimeFrame } from "../../types/healthData";
import { MetricType, SUPPORTED_METRICS } from "../types/healthMetrics";

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
  // Basic validation - checking name, size, and type
  if (!file.name.toLowerCase().includes("export")) {
    return false;
  }

  if (file.type !== "text/xml" && !file.type.includes("xml")) {
    return false;
  }

  // Simple size check to ensure it's not empty or too small to be valid
  if (file.size < 1000) {
    return false;
  }

  return true;
};

export class XMLStreamParser {
  private options: XMLParserOptions;
  private recordCount = 0;
  private metricCounts: Record<string, number> = {};
  private dateRange: { startDate: Date; endDate: Date };

  constructor(options: XMLParserOptions) {
    this.options = options;

    // Initialize metric counts
    options.selectedMetrics.forEach((metric) => {
      this.metricCounts[metric] = 0;
    });

    // Initialize date range
    this.dateRange = this.getDateRangeFromTimeFrame(options.timeFrame);
  }

  private standardizeUnit(type: string, rawUnit: string): string {
    const metricType = type as MetricType;
    if (SUPPORTED_METRICS[metricType]) {
      const standardizedUnit = SUPPORTED_METRICS[metricType].unit;
      if (rawUnit !== standardizedUnit) {
      }
      return standardizedUnit;
    }
    return rawUnit; // Fallback to raw unit if metric type not found
  }

  // Main method to parse the file
  async parseFile(file: File): Promise<XMLParserResults> {
    this.recordCount = 0;
    const results: XMLParserResults = {};

    // Initialize result arrays for each selected metric
    this.options.selectedMetrics.forEach((metric) => {
      results[metric] = [];
    });

    try {
      // Process the file in chunks to avoid memory issues
      const chunkSize = 10 * 1024 * 1024; // 10MB chunks
      const fileSize = file.size;
      let processedSize = 0;
      let currentBuffer = "";
      let fileReader = new FileReader();

      // Function to process a <Record> element string
      const processRecordElement: (recordStr: string) => void = (recordStr) => {
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

          // Check if record is within our time range
          if (
            !this.isDateInRange(
              recordDate,
              this.dateRange.startDate,
              this.dateRange.endDate,
            )
          ) {
            return;
          }

          // Extract other attributes
          const endDateMatch = recordStr.match(/endDate="([^"]+)"/);
          const endDate = endDateMatch ? endDateMatch[1] : startDate;

          const valueMatch = recordStr.match(/value="([^"]+)"/);
          const value = valueMatch ? valueMatch[1] : "";

          const unitMatch = recordStr.match(/unit="([^"]+)"/);
          const rawUnit = unitMatch ? unitMatch[1] : "";

          // Standardize the unit based on metric type
          const standardizedUnit = this.standardizeUnit(type, rawUnit);

          const sourceNameMatch = recordStr.match(/sourceName="([^"]+)"/);
          const sourceName = sourceNameMatch ? sourceNameMatch[1] : "";

          const deviceMatch = recordStr.match(/device="([^"]+)"/);
          const device = deviceMatch ? deviceMatch[1] : "";

          // Skip Pillow app data
          if (
            sourceName.toLowerCase().includes("pillow") ||
            device.toLowerCase().includes("pillow")
          ) {
            return;
          }

          // Create data point with standardized unit
          const dataPoint: HealthDataPoint = {
            startDate,
            endDate,
            value,
            unit: standardizedUnit,
            source: sourceName,
            device,
            type, // Add type to help with later processing
          };

          results[type].push(dataPoint);
          this.metricCounts[type]++;
          this.recordCount++;
        } catch (err) {}
      };

      // Create a promise to handle the file reading
      const readChunk: (start: number, end: number) => Promise<string> = (
        start,
        end,
      ) => {
        return new Promise((resolve, reject) => {
          const chunk = file.slice(start, end);
          fileReader.onload = (e: ProgressEvent<FileReader>): void =>
            resolve((e.target?.result as string) || "");
          fileReader.onerror = (e: ProgressEvent<FileReader>): void =>
            reject(e);
          fileReader.readAsText(chunk);
        });
      };

      while (processedSize < fileSize) {
        const nextEnd = Math.min(processedSize + chunkSize, fileSize);

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
            this.options.onProgress({
              progress: Math.round((processedSize / fileSize) * 100),
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
        this.options.onProgress({
          progress: Math.round((processedSize / fileSize) * 100),
          recordCount: this.recordCount,
          metricCounts: { ...this.metricCounts },
        });
      }

      return results;
    } catch (error) {
      throw error;
    }
  }

  private getDateRangeFromTimeFrame(timeFrame: TimeFrame): {
    startDate: Date;
    endDate: Date;
  } {
    const endDate = new Date();
    const startDate = new Date();

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
        startDate.setMonth(endDate.getMonth() - 3); // Default to 3 months
    }

    return { startDate, endDate };
  }

  private isDateInRange(date: Date, startDate: Date, endDate: Date): boolean {
    return date >= startDate && date <= endDate;
  }
}
