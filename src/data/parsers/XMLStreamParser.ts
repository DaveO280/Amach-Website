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
}

// Define interface for parser results
export type XMLParserResults = Record<string, HealthDataPoint[]>;

// Validate the file is likely a Health Export file
export const validateHealthExportFile = (file: File): boolean => {
  // Be tolerant of iOS pickers: name should include export and likely end with .xml
  const lowerName = file.name.toLowerCase();
  if (!lowerName.includes("export") || !lowerName.endsWith(".xml")) {
    return false;
  }

  // iOS often provides empty type; accept empty or xml-like types
  if (file.type && !(file.type === "text/xml" || file.type.includes("xml"))) {
    return false;
  }

  // Basic size sanity check
  if (file.size < 1000) {
    return false;
  }

  return true;
};

// Lightweight pre-scan to detect common pitfalls and surface quick insights before full parse
export async function preScanHealthExport(
  file: File,
  bytesToRead: number = 2 * 1024 * 1024,
): Promise<{
  isZip: boolean;
  isCDA: boolean;
  hasHealthDataTag: boolean;
  recordCountEstimate: number;
  sampleTypes: string[];
}> {
  const slice = file.slice(0, Math.min(file.size, bytesToRead));
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>): void =>
      resolve((e.target?.result as string) || "");
    reader.onerror = (e: ProgressEvent<FileReader>): void => reject(e);
    reader.readAsText(slice);
  });

  // Detect zip via magic header (when provided as text this may not match, but helps with some pickers)
  const isZip = file.name.toLowerCase().endsWith(".zip");

  const isCDA = /<ClinicalDocument[\s>]/.test(text);
  const hasHealthDataTag = /<HealthData[\s>]/.test(text);
  const recordMatches = text.match(/<Record\b/g) || [];
  const typeMatches = text.match(/type="([^"]+)"/g) || [];
  const sampleTypes = Array.from(
    new Set(
      typeMatches
        .map((m) => m.match(/type="([^"]+)"/)?.[1])
        .filter((x): x is string => Boolean(x)),
    ),
  ).slice(0, 20);

  return {
    isZip,
    isCDA,
    hasHealthDataTag,
    recordCountEstimate: recordMatches.length,
    sampleTypes,
  };
}

export class XMLStreamParser {
  private options: XMLParserOptions;
  private recordCount = 0;
  private metricCounts: Record<string, number> = {};
  private dateRange: { startDate: Date; endDate: Date };
  private lastEndDates: Record<string, Record<string, Date>> = {};

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

          // Overlap prevention: skip if startDate <= last endDate for this metric+device
          const lastEnd = this.lastEndDates[type]?.[device || "unknown"];
          if (lastEnd && new Date(startDate) <= lastEnd) {
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

        // Find complete <Record> elements (support self-closing and open/close forms)
        let recordStartIndex = currentBuffer.indexOf("<Record ");
        while (recordStartIndex !== -1) {
          const selfCloseIdx = currentBuffer.indexOf("/>", recordStartIndex);
          const openCloseStart = currentBuffer.indexOf(">", recordStartIndex);
          const closeTagIdx =
            openCloseStart !== -1
              ? currentBuffer.indexOf("</Record>", openCloseStart)
              : -1;

          let recordEndIndex = -1;
          if (
            selfCloseIdx !== -1 &&
            (closeTagIdx === -1 || selfCloseIdx < closeTagIdx)
          ) {
            recordEndIndex = selfCloseIdx + 2;
          } else if (closeTagIdx !== -1) {
            recordEndIndex = closeTagIdx + "</Record>".length;
          }

          if (recordEndIndex === -1) break; // Incomplete record, wait for next chunk

          const recordString = currentBuffer.substring(
            recordStartIndex,
            recordEndIndex,
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
        if (lastRecordStart !== -1) {
          const selfCloseAfter = currentBuffer.indexOf("/>", lastRecordStart);
          const gtAfter = currentBuffer.indexOf(">", lastRecordStart);
          const closeAfter =
            gtAfter !== -1 ? currentBuffer.indexOf("</Record>", gtAfter) : -1;
          const hasCompleteSelf =
            selfCloseAfter !== -1 && selfCloseAfter > lastRecordStart;
          const hasCompleteOpenClose =
            closeAfter !== -1 && closeAfter > lastRecordStart;
          if (!hasCompleteSelf && !hasCompleteOpenClose) {
            currentBuffer = currentBuffer.substring(lastRecordStart);
          } else {
            currentBuffer = "";
          }
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

  // New method: parse XML string directly (for testing)
  parseString(xml: string): XMLParserResults {
    const results: XMLParserResults = {};
    this.options.selectedMetrics.forEach((metric) => {
      results[metric] = [];
    });

    // Regex to match all <Record ... /> elements, robust to whitespace/line breaks
    const recordRegex = /<Record\s+([^>]*)\/>/g;
    let match;
    while ((match = recordRegex.exec(xml)) !== null) {
      const recordStr = `<Record ${match[1]}/>`;
      // Use the same logic as processRecordElement
      try {
        const typeMatch = recordStr.match(/type="([^"]+)"/);
        if (!typeMatch) continue;
        const type = typeMatch[1];
        if (!this.options.selectedMetrics.includes(type)) continue;
        const startDateMatch = recordStr.match(/startDate="([^"]+)"/);
        if (!startDateMatch) continue;
        const startDate = startDateMatch[1];
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
        const endDate = endDateMatch ? endDateMatch[1] : startDate;
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
}
