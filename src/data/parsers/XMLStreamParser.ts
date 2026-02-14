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
  existingData?: Record<string, HealthDataPoint[]>; // Optional: previous data for overlap prevention
  /**
   * When true, captures ALL metric types for Storj backup (not just selectedMetrics)
   * The full data is available via getAllMetricsData() after parsing
   */
  captureAllForStorj?: boolean;
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
  private lastEndDates: Record<string, Record<string, Date>> = {};

  /**
   * When captureAllForStorj is enabled, this stores ALL metrics encountered
   * (not just selectedMetrics) for comprehensive Storj backup
   */
  private allMetricsData: Record<string, HealthDataPoint[]> = {};
  private allMetricsCounts: Record<string, number> = {};

  constructor(options: XMLParserOptions) {
    this.options = options;

    // Initialize metric counts
    options.selectedMetrics.forEach((metric) => {
      this.metricCounts[metric] = 0;
    });

    // Initialize date range
    this.dateRange = this.getDateRangeFromTimeFrame(options.timeFrame);

    // Build lastEndDates map if existingData is provided
    if (options.existingData) {
      for (const metric of Object.keys(options.existingData)) {
        for (const dp of options.existingData[metric] as HealthDataPoint[]) {
          const dpTyped: HealthDataPoint = dp;
          const device = dpTyped.device || "unknown";
          const endDate = new Date(dpTyped.endDate);
          if (!this.lastEndDates[metric]) this.lastEndDates[metric] = {};
          if (
            !this.lastEndDates[metric][device] ||
            endDate > this.lastEndDates[metric][device]
          ) {
            this.lastEndDates[metric][device] = endDate;
          }
        }
      }
    }
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
          const isSelectedMetric = this.options.selectedMetrics.includes(type);
          const captureForStorj = this.options.captureAllForStorj;

          // Skip if not a selected metric AND not capturing for Storj
          if (!isSelectedMetric && !captureForStorj) return;

          const startDateMatch = recordStr.match(/startDate="([^"]+)"/);
          if (!startDateMatch) return;

          const rawStartDate = startDateMatch[1];
          // Normalize date for iOS Safari compatibility
          const startDate = this.normalizeDate(rawStartDate);
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
          // Normalize end date for iOS Safari compatibility
          const endDate = endDateMatch
            ? this.normalizeDate(endDateMatch[1])
            : startDate;

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

          // Overlap prevention: skip if startDate <= last endDate for this metric+device
          const deviceKey = device || "unknown";
          const lastEnd = this.lastEndDates[type]?.[deviceKey];
          if (
            this.options.existingData &&
            lastEnd &&
            new Date(startDate) <= lastEnd
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

          // Add to selected metrics results (for UI)
          if (isSelectedMetric) {
            results[type].push(dataPoint);
            this.metricCounts[type]++;
            this.recordCount++;
          }

          // Add to allMetricsData for Storj (captures ALL metrics)
          if (captureForStorj) {
            if (!this.allMetricsData[type]) {
              this.allMetricsData[type] = [];
              this.allMetricsCounts[type] = 0;
            }
            this.allMetricsData[type].push(dataPoint);
            this.allMetricsCounts[type]++;
          }

          // Update lastEndDates so subsequent records in this run can detect overlaps
          const endDateObj = new Date(endDate);
          if (!this.lastEndDates[type]) {
            this.lastEndDates[type] = {};
          }
          const lastEndForDevice = this.lastEndDates[type][deviceKey];
          if (!lastEndForDevice || endDateObj > lastEndForDevice) {
            this.lastEndDates[type][deviceKey] = endDateObj;
          }
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
          const openTagEnd = currentBuffer.indexOf(">", recordStartIndex);
          if (openTagEnd === -1) {
            // Incomplete opening tag – wait for next chunk
            break;
          }

          const isSelfClosing = currentBuffer[openTagEnd - 1] === "/";

          let recordBoundary = -1;

          if (isSelfClosing) {
            recordBoundary = openTagEnd + 1; // Include the closing '>'
          } else {
            const closingTagIndex = currentBuffer.indexOf(
              "</Record>",
              openTagEnd,
            );
            if (closingTagIndex === -1) {
              // Incomplete record – wait for next chunk
              break;
            }
            recordBoundary = closingTagIndex + "</Record>".length;
          }

          const recordString = currentBuffer.slice(
            recordStartIndex,
            recordBoundary,
          );
          processRecordElement(recordString);

          // Update progress based on processed records
          if (this.recordCount % 1000 === 0) {
            this.options.onProgress({
              progress: Math.round((processedSize / fileSize) * 100),
              recordCount: this.recordCount,
              metricCounts: { ...this.metricCounts },
            });
          }

          // Remove the processed record from the buffer
          currentBuffer = currentBuffer.slice(recordBoundary);
          recordStartIndex = currentBuffer.indexOf("<Record ");
        }

        // currentBuffer now contains only the leftover (possibly incomplete) data

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

  // New method: parse XML string directly (for testing)
  parseString(xml: string): XMLParserResults {
    const results: XMLParserResults = {};
    this.options.selectedMetrics.forEach((metric) => {
      results[metric] = [];
    });

    // Regex to match all <Record> elements (both self-closing and regular closing)
    // Pattern 1: Self-closing <Record ... />
    const selfClosingRegex = /<Record\s+([^>]*)\/>/g;
    // Pattern 2: Regular closing <Record ...></Record>
    const regularClosingRegex = /<Record\s+([^>]*)>.*?<\/Record>/gs;

    // Process self-closing records
    let match;
    while ((match = selfClosingRegex.exec(xml)) !== null) {
      const recordStr = `<Record ${match[1]}/>`;
      // Use the same logic as processRecordElement
      try {
        const typeMatch = recordStr.match(/type="([^"]+)"/);
        if (!typeMatch) continue;
        const type = typeMatch[1];
        if (!this.options.selectedMetrics.includes(type)) continue;
        const startDateMatch = recordStr.match(/startDate="([^"]+)"/);
        if (!startDateMatch) continue;
        const rawStartDate = startDateMatch[1];
        // Normalize date for iOS Safari compatibility
        const startDate = this.normalizeDate(rawStartDate);
        const recordDate = new Date(startDate);
        if (
          !this.isDateInRange(
            recordDate,
            this.dateRange.startDate,
            this.dateRange.endDate,
          )
        )
          continue;
        const endDateMatch = recordStr.match(/endDate="([^"]+)"/);
        // Normalize end date for iOS Safari compatibility
        const endDate = endDateMatch
          ? this.normalizeDate(endDateMatch[1])
          : startDate;
        const valueMatch = recordStr.match(/value="([^"]+)"/);
        const value = valueMatch ? valueMatch[1] : "";
        const unitMatch = recordStr.match(/unit="([^"]+)"/);
        const rawUnit = unitMatch ? unitMatch[1] : "";
        const standardizedUnit = this.standardizeUnit(type, rawUnit);
        const sourceNameMatch = recordStr.match(/sourceName="([^"]+)"/);
        const sourceName = sourceNameMatch ? sourceNameMatch[1] : "";
        const deviceMatch = recordStr.match(/device="([^"]+)"/);
        const device = deviceMatch ? deviceMatch[1] : "";
        // Skip Pillow app data
        if (
          sourceName.toLowerCase().includes("pillow") ||
          device.toLowerCase().includes("pillow")
        )
          continue;
        // Overlap prevention: skip if startDate <= last endDate for this metric+device
        const lastEnd = this.lastEndDates[type]?.[device || "unknown"];
        if (lastEnd && new Date(startDate) <= lastEnd) continue;
        // Create data point with standardized unit
        const dataPoint: HealthDataPoint = {
          startDate,
          endDate,
          value,
          unit: standardizedUnit,
          source: sourceName,
          device,
          type,
        };
        results[type].push(dataPoint);
      } catch (err) {}
    }

    // Process regular closing records (<Record ...></Record>)
    regularClosingRegex.lastIndex = 0; // Reset regex
    while ((match = regularClosingRegex.exec(xml)) !== null) {
      // Extract attributes from the opening tag
      const attributes = match[1];
      const recordStr = `<Record ${attributes}/>`;
      // Use the same logic as processRecordElement
      try {
        const typeMatch = recordStr.match(/type="([^"]+)"/);
        if (!typeMatch) continue;
        const type = typeMatch[1];
        if (!this.options.selectedMetrics.includes(type)) continue;
        const startDateMatch = recordStr.match(/startDate="([^"]+)"/);
        if (!startDateMatch) continue;
        const rawStartDate = startDateMatch[1];
        // Normalize date for iOS Safari compatibility
        const startDate = this.normalizeDate(rawStartDate);
        const recordDate = new Date(startDate);
        if (
          !this.isDateInRange(
            recordDate,
            this.dateRange.startDate,
            this.dateRange.endDate,
          )
        )
          continue;
        const endDateMatch = recordStr.match(/endDate="([^"]+)"/);
        // Normalize end date for iOS Safari compatibility
        const endDate = endDateMatch
          ? this.normalizeDate(endDateMatch[1])
          : startDate;
        const valueMatch = recordStr.match(/value="([^"]+)"/);
        const value = valueMatch ? valueMatch[1] : "";
        const unitMatch = recordStr.match(/unit="([^"]+)"/);
        const rawUnit = unitMatch ? unitMatch[1] : "";
        const standardizedUnit = this.standardizeUnit(type, rawUnit);
        const sourceNameMatch = recordStr.match(/sourceName="([^"]+)"/);
        const sourceName = sourceNameMatch ? sourceNameMatch[1] : "";
        const deviceMatch = recordStr.match(/device="([^"]+)"/);
        const device = deviceMatch ? deviceMatch[1] : "";
        // Skip Pillow app data
        if (
          sourceName.toLowerCase().includes("pillow") ||
          device.toLowerCase().includes("pillow")
        )
          continue;
        // Overlap prevention: skip if startDate <= last endDate for this metric+device
        const lastEnd = this.lastEndDates[type]?.[device || "unknown"];
        if (lastEnd && new Date(startDate) <= lastEnd) continue;
        // Create data point with standardized unit
        const dataPoint: HealthDataPoint = {
          startDate,
          endDate,
          value,
          unit: standardizedUnit,
          source: sourceName,
          device,
          type,
        };
        results[type].push(dataPoint);
      } catch (err) {}
    }
    return results;
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

  /**
   * Normalize date string to iOS-compatible ISO 8601 format
   * iOS Safari is strict about date formats
   * Converts "2025-08-17 17:38:00 -0400" to "2025-08-17T17:38:00-04:00"
   * Only normalizes if the date fails to parse initially (preserves valid dates)
   */
  private normalizeDate(dateStr: string): string {
    try {
      // First, test if the date already parses correctly
      const testOriginal = new Date(dateStr);
      if (!isNaN(testOriginal.getTime())) {
        // Date is valid, return as-is (preserves desktop functionality)
        return dateStr;
      }

      // Date failed to parse, try normalization for mobile Safari
      let normalized = dateStr;

      // Replace first space with T (date and time separator) if not already present
      if (!normalized.includes("T")) {
        normalized = normalized.replace(" ", "T");
      }

      // Fix timezone format: handle multiple cases
      // Only modify timezone if it doesn't already have a colon
      if (!/[+-]\d{2}:\d{2}$/.test(normalized)) {
        // Case 1: " -0400" -> "-04:00" (space before timezone, no colon)
        normalized = normalized.replace(/ ([+-])(\d{2})(\d{2})$/, "$1$2:$3");
        // Case 2: "-0400" -> "-04:00" (no space, no colon) - only if Case 1 didn't match
        if (!/[+-]\d{2}:\d{2}$/.test(normalized)) {
          normalized = normalized.replace(/([+-])(\d{2})(\d{2})$/, "$1$2:$3");
        }
      }

      // Test if normalized version parses correctly
      const testNormalized = new Date(normalized);
      if (!isNaN(testNormalized.getTime())) {
        return normalized;
      }

      // If normalization didn't work, return original (might work on some browsers)
      return dateStr;
    } catch {
      // On any error, return original to preserve functionality
      return dateStr;
    }
  }

  /**
   * Get ALL metrics captured during parsing (when captureAllForStorj is enabled)
   * Returns empty object if captureAllForStorj was not enabled
   */
  getAllMetricsData(): Record<string, HealthDataPoint[]> {
    return this.allMetricsData;
  }

  /**
   * Get counts for ALL metrics captured (when captureAllForStorj is enabled)
   */
  getAllMetricsCounts(): Record<string, number> {
    return this.allMetricsCounts;
  }

  /**
   * Check if any Storj data was captured
   */
  hasStorjData(): boolean {
    return Object.keys(this.allMetricsData).length > 0;
  }
}
