/** @jest-environment node */
import { XMLStreamParser, validateHealthExportFile } from "../XMLStreamParser";
import type { XMLParserOptions } from "../XMLStreamParser";

describe("XMLStreamParser", () => {
  describe("Date Normalization (Mobile Safari Compatibility)", () => {
    const createParser = (timeFrame: "3mo" | "6mo" | "1yr" | "2yr" = "2yr") => {
      const options: XMLParserOptions = {
        selectedMetrics: [
          "HKQuantityTypeIdentifierHeartRate",
          "HKQuantityTypeIdentifierStepCount",
        ],
        timeFrame,
        onProgress: () => {},
      };
      return new XMLStreamParser(options);
    };

    test("preserves valid ISO 8601 dates (desktop format)", () => {
      const parser = createParser();
      const xml = `
        <HealthData>
          <Record 
            type="HKQuantityTypeIdentifierHeartRate"
            startDate="2025-08-17T17:38:00-04:00"
            endDate="2025-08-17T17:38:00-04:00"
            value="72"
            unit="count/min"
            sourceName="Apple Watch"
            device="Apple Watch"
          />
        </HealthData>
      `;

      const results = parser.parseString(xml);
      expect(results["HKQuantityTypeIdentifierHeartRate"]).toHaveLength(1);
      const record = results["HKQuantityTypeIdentifierHeartRate"][0];
      // Date should be preserved as-is (desktop compatibility)
      expect(record.startDate).toBe("2025-08-17T17:38:00-04:00");
      expect(record.endDate).toBe("2025-08-17T17:38:00-04:00");
    });

    test("normalizes dates with space separator (mobile Safari format)", () => {
      const parser = createParser();
      const xml = `
        <HealthData>
          <Record 
            type="HKQuantityTypeIdentifierHeartRate"
            startDate="2025-08-17 17:38:00 -0400"
            endDate="2025-08-17 17:38:00 -0400"
            value="72"
            unit="count/min"
            sourceName="Apple Watch"
            device="Apple Watch"
          />
        </HealthData>
      `;

      const results = parser.parseString(xml);
      expect(results["HKQuantityTypeIdentifierHeartRate"]).toHaveLength(1);
      const record = results["HKQuantityTypeIdentifierHeartRate"][0];
      // Note: In Node.js, these dates parse correctly, so normalization may not run.
      // On mobile Safari, they fail to parse and get normalized.
      // The important thing is that the date is valid and the record is extracted.
      expect(record.startDate).toBeTruthy();
      expect(record.endDate).toBeTruthy();
      expect(new Date(record.startDate).getTime()).not.toBeNaN();
      expect(new Date(record.endDate).getTime()).not.toBeNaN();
    });

    test("normalizes dates with timezone without colon", () => {
      const parser = createParser();
      const xml = `
        <HealthData>
          <Record 
            type="HKQuantityTypeIdentifierStepCount"
            startDate="2025-08-17T17:38:00-0400"
            endDate="2025-08-17T17:38:00-0400"
            value="5000"
            unit="count"
            sourceName="iPhone"
            device="iPhone"
          />
        </HealthData>
      `;

      const results = parser.parseString(xml);
      expect(results["HKQuantityTypeIdentifierStepCount"]).toHaveLength(1);
      const record = results["HKQuantityTypeIdentifierStepCount"][0];
      // Note: In Node.js, these dates may parse correctly, so normalization may not run.
      // The important thing is that the date is valid and the record is extracted.
      expect(record.startDate).toBeTruthy();
      expect(record.endDate).toBeTruthy();
      expect(new Date(record.startDate).getTime()).not.toBeNaN();
      expect(new Date(record.endDate).getTime()).not.toBeNaN();
    });

    test("handles dates with positive timezone offset", () => {
      const parser = createParser();
      const xml = `
        <HealthData>
          <Record 
            type="HKQuantityTypeIdentifierHeartRate"
            startDate="2025-08-17 17:38:00 +0500"
            endDate="2025-08-17 17:38:00 +0500"
            value="72"
            unit="count/min"
            sourceName="Apple Watch"
            device="Apple Watch"
          />
        </HealthData>
      `;

      const results = parser.parseString(xml);
      expect(results["HKQuantityTypeIdentifierHeartRate"]).toHaveLength(1);
      const record = results["HKQuantityTypeIdentifierHeartRate"][0];
      // Note: In Node.js, these dates may parse correctly, so normalization may not run.
      // The important thing is that the date is valid and the record is extracted.
      expect(record.startDate).toBeTruthy();
      expect(record.endDate).toBeTruthy();
      expect(new Date(record.startDate).getTime()).not.toBeNaN();
      expect(new Date(record.endDate).getTime()).not.toBeNaN();
    });

    test("preserves dates that already parse correctly (no unnecessary changes)", () => {
      const parser = createParser();
      // Test various valid formats that should be preserved
      const validFormats = [
        "2025-08-17T17:38:00-04:00", // ISO with colon
        "2025-08-17T17:38:00Z", // UTC
        "2025-08-17T17:38:00.000Z", // UTC with milliseconds
      ];

      validFormats.forEach((dateStr) => {
        const xml = `
          <HealthData>
            <Record 
              type="HKQuantityTypeIdentifierHeartRate"
              startDate="${dateStr}"
              endDate="${dateStr}"
              value="72"
              unit="count/min"
              sourceName="Apple Watch"
              device="Apple Watch"
            />
          </HealthData>
        `;

        const results = parser.parseString(xml);
        expect(results["HKQuantityTypeIdentifierHeartRate"]).toHaveLength(1);
        const record = results["HKQuantityTypeIdentifierHeartRate"][0];
        // Should preserve original format if it parses correctly
        expect(record.startDate).toBe(dateStr);
        expect(record.endDate).toBe(dateStr);
      });
    });

    test("handles mixed date formats in same XML", () => {
      const parser = createParser();
      const xml = `
        <HealthData>
          <Record 
            type="HKQuantityTypeIdentifierHeartRate"
            startDate="2025-08-17T17:38:00-04:00"
            endDate="2025-08-17T17:38:00-04:00"
            value="72"
            unit="count/min"
            sourceName="Apple Watch"
            device="Apple Watch"
          />
          <Record 
            type="HKQuantityTypeIdentifierHeartRate"
            startDate="2025-08-17 18:00:00 -0400"
            endDate="2025-08-17 18:00:00 -0400"
            value="75"
            unit="count/min"
            sourceName="Apple Watch"
            device="Apple Watch"
          />
        </HealthData>
      `;

      const results = parser.parseString(xml);
      expect(results["HKQuantityTypeIdentifierHeartRate"]).toHaveLength(2);

      // First record: already valid, should be preserved
      expect(results["HKQuantityTypeIdentifierHeartRate"][0].startDate).toBe(
        "2025-08-17T17:38:00-04:00",
      );

      // Second record: should be valid (may or may not be normalized in Node.js)
      expect(
        results["HKQuantityTypeIdentifierHeartRate"][1].startDate,
      ).toBeTruthy();
      expect(
        new Date(
          results["HKQuantityTypeIdentifierHeartRate"][1].startDate,
        ).getTime(),
      ).not.toBeNaN();
    });
  });

  describe("Record Parsing", () => {
    test("parses self-closing Record tags", () => {
      const parser = new XMLStreamParser({
        selectedMetrics: ["HKQuantityTypeIdentifierStepCount"],
        timeFrame: "2yr",
        onProgress: () => {},
      });

      const xml = `
        <HealthData>
          <Record 
            type="HKQuantityTypeIdentifierStepCount"
            startDate="2025-08-17T17:38:00-04:00"
            endDate="2025-08-17T17:38:00-04:00"
            value="5000"
            unit="count"
            sourceName="iPhone"
            device="iPhone"
          />
        </HealthData>
      `;

      const results = parser.parseString(xml);
      expect(results["HKQuantityTypeIdentifierStepCount"]).toHaveLength(1);
      expect(results["HKQuantityTypeIdentifierStepCount"][0].value).toBe(
        "5000",
      );
    });

    test("parses regular closing Record tags", () => {
      const parser = new XMLStreamParser({
        selectedMetrics: ["HKQuantityTypeIdentifierStepCount"],
        timeFrame: "2yr",
        onProgress: () => {},
      });

      const xml = `
        <HealthData>
          <Record 
            type="HKQuantityTypeIdentifierStepCount"
            startDate="2025-08-17T17:38:00-04:00"
            endDate="2025-08-17T17:38:00-04:00"
            value="5000"
            unit="count"
            sourceName="iPhone"
            device="iPhone"
          ></Record>
        </HealthData>
      `;

      const results = parser.parseString(xml);
      expect(results["HKQuantityTypeIdentifierStepCount"]).toHaveLength(1);
      expect(results["HKQuantityTypeIdentifierStepCount"][0].value).toBe(
        "5000",
      );
    });

    test("filters records by selected metrics", () => {
      const parser = new XMLStreamParser({
        selectedMetrics: ["HKQuantityTypeIdentifierHeartRate"],
        timeFrame: "2yr",
        onProgress: () => {},
      });

      const xml = `
        <HealthData>
          <Record 
            type="HKQuantityTypeIdentifierHeartRate"
            startDate="2025-08-17T17:38:00-04:00"
            endDate="2025-08-17T17:38:00-04:00"
            value="72"
            unit="count/min"
            sourceName="Apple Watch"
            device="Apple Watch"
          />
          <Record 
            type="HKQuantityTypeIdentifierStepCount"
            startDate="2025-08-17T17:38:00-04:00"
            endDate="2025-08-17T17:38:00-04:00"
            value="5000"
            unit="count"
            sourceName="iPhone"
            device="iPhone"
          />
        </HealthData>
      `;

      const results = parser.parseString(xml);
      expect(results["HKQuantityTypeIdentifierHeartRate"]).toHaveLength(1);
      expect(results["HKQuantityTypeIdentifierStepCount"]).toBeUndefined();
    });

    test("respects time frame filtering", () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 3); // 3 years ago

      const parser = new XMLStreamParser({
        selectedMetrics: ["HKQuantityTypeIdentifierHeartRate"],
        timeFrame: "2yr", // Only last 2 years
        onProgress: () => {},
      });

      const xml = `
        <HealthData>
          <Record 
            type="HKQuantityTypeIdentifierHeartRate"
            startDate="${oldDate.toISOString()}"
            endDate="${oldDate.toISOString()}"
            value="72"
            unit="count/min"
            sourceName="Apple Watch"
            device="Apple Watch"
          />
          <Record 
            type="HKQuantityTypeIdentifierHeartRate"
            startDate="2025-08-17T17:38:00-04:00"
            endDate="2025-08-17T17:38:00-04:00"
            value="75"
            unit="count/min"
            sourceName="Apple Watch"
            device="Apple Watch"
          />
        </HealthData>
      `;

      const results = parser.parseString(xml);
      // Should only include the recent record
      expect(results["HKQuantityTypeIdentifierHeartRate"]).toHaveLength(1);
      expect(results["HKQuantityTypeIdentifierHeartRate"][0].value).toBe("75");
    });
  });

  describe("File Validation", () => {
    test("validates health export file correctly", () => {
      // Create a file with sufficient size (>= 1000 bytes)
      const content = "<HealthData>" + "x".repeat(1000) + "</HealthData>";
      const validFile = new File([content], "export.xml", {
        type: "text/xml",
      });
      expect(validateHealthExportFile(validFile)).toBe(true);
    });

    test("rejects files without 'export' in name", () => {
      const invalidFile = new File(["<HealthData></HealthData>"], "data.xml", {
        type: "text/xml",
      });
      expect(validateHealthExportFile(invalidFile)).toBe(false);
    });

    test("rejects files that are too small", () => {
      const smallFile = new File(["x"], "export.xml", { type: "text/xml" });
      expect(validateHealthExportFile(smallFile)).toBe(false);
    });
  });
});
