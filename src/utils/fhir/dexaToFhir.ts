/**
 * Convert DEXA report data to FHIR format
 * FHIR R4 resources for DEXA scans:
 * - DiagnosticReport: The overall DEXA scan report
 * - Observation: Individual measurements (BMD, body fat %, etc.)
 * - ImagingStudy: The scan itself (optional)
 */

import type { DexaReportData, DexaRegionMetrics } from "@/types/reportData";

/**
 * FHIR DiagnosticReport for DEXA scan
 * https://www.hl7.org/fhir/diagnosticreport.html
 */
export interface FhirDiagnosticReport {
  resourceType: "DiagnosticReport";
  id?: string;
  status:
    | "final"
    | "preliminary"
    | "registered"
    | "partial"
    | "amended"
    | "corrected"
    | "appended"
    | "cancelled"
    | "entered-in-error"
    | "unknown";
  category?: Array<{
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  }>;
  code: {
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  };
  subject?: {
    reference?: string;
  };
  effectiveDateTime?: string;
  issued?: string;
  performer?: Array<{
    reference?: string;
  }>;
  result?: Array<{
    reference: string; // Reference to Observation resources
  }>;
  conclusion?: string;
  contained?: FhirObservation[]; // Embed observations in the report
}

/**
 * FHIR Observation for individual measurements
 * https://www.hl7.org/fhir/observation.html
 */
export interface FhirObservation {
  resourceType: "Observation";
  id?: string;
  status:
    | "final"
    | "preliminary"
    | "registered"
    | "amended"
    | "corrected"
    | "cancelled"
    | "entered-in-error"
    | "unknown";
  category?: Array<{
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  }>;
  code: {
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  };
  subject?: {
    reference?: string;
  };
  effectiveDateTime?: string;
  valueQuantity?: {
    value: number;
    unit: string;
    system?: string;
    code?: string;
  };
  valueString?: string;
  component?: Array<{
    code: {
      coding: Array<{
        system: string;
        code: string;
        display: string;
      }>;
    };
    valueQuantity?: {
      value: number;
      unit: string;
      system?: string;
      code?: string;
    };
  }>;
  interpretation?: Array<{
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  }>;
}

/**
 * Convert DEXA report to FHIR DiagnosticReport with embedded Observations
 * This is the most efficient format for FHIR - single bundle with all data
 */
export function convertDexaToFhir(
  dexaReport: DexaReportData,
  patientId?: string,
  practitionerId?: string,
): FhirDiagnosticReport {
  const observations: FhirObservation[] = [];
  const observationRefs: Array<{ reference: string }> = [];

  // Generate unique IDs for observations
  let observationCounter = 1;
  const getObservationId = (): string => `obs-${observationCounter++}`;

  // 1. Total Body Fat Percentage
  if (dexaReport.totalBodyFatPercent !== undefined) {
    const obsId = getObservationId();
    observations.push({
      resourceType: "Observation",
      id: obsId,
      status: "final",
      category: [
        {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "vital-signs",
              display: "Vital Signs",
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "41982-7", // Body fat percentage
            display: "Body fat percentage",
          },
        ],
      },
      subject: patientId ? { reference: `Patient/${patientId}` } : undefined,
      effectiveDateTime: dexaReport.scanDate,
      valueQuantity: {
        value: dexaReport.totalBodyFatPercent,
        unit: "%",
        system: "http://unitsofmeasure.org",
        code: "%",
      },
    });
    observationRefs.push({ reference: `#${obsId}` });
  }

  // 2. Total Lean Mass
  if (dexaReport.totalLeanMassKg !== undefined) {
    const obsId = getObservationId();
    observations.push({
      resourceType: "Observation",
      id: obsId,
      status: "final",
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "73708-0", // Lean body mass
            display: "Lean body mass",
          },
        ],
      },
      subject: patientId ? { reference: `Patient/${patientId}` } : undefined,
      effectiveDateTime: dexaReport.scanDate,
      valueQuantity: {
        value: dexaReport.totalLeanMassKg,
        unit: "kg",
        system: "http://unitsofmeasure.org",
        code: "kg",
      },
    });
    observationRefs.push({ reference: `#${obsId}` });
  }

  // 3. Bone Mineral Density (Total Body)
  if (dexaReport.boneDensityTotal?.bmd !== undefined) {
    const obsId = getObservationId();
    const components: FhirObservation["component"] = [];

    components.push({
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "24701-4", // Bone density
            display: "Bone density",
          },
        ],
      },
      valueQuantity: {
        value: dexaReport.boneDensityTotal.bmd,
        unit: "g/cm²",
        system: "http://unitsofmeasure.org",
        code: "g/cm2",
      },
    });

    if (dexaReport.boneDensityTotal.tScore !== undefined) {
      components.push({
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "24702-2", // T-score
              display: "T-score",
            },
          ],
        },
        valueQuantity: {
          value: dexaReport.boneDensityTotal.tScore,
          unit: "SD",
        },
      });
    }

    if (dexaReport.boneDensityTotal.zScore !== undefined) {
      components.push({
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "24703-0", // Z-score
              display: "Z-score",
            },
          ],
        },
        valueQuantity: {
          value: dexaReport.boneDensityTotal.zScore,
          unit: "SD",
        },
      });
    }

    observations.push({
      resourceType: "Observation",
      id: obsId,
      status: "final",
      category: [
        {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "imaging",
              display: "Imaging",
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "24701-4", // Bone mineral density DEXA
            display: "Bone mineral density DEXA",
          },
        ],
      },
      subject: patientId ? { reference: `Patient/${patientId}` } : undefined,
      effectiveDateTime: dexaReport.scanDate,
      component: components,
    });
    observationRefs.push({ reference: `#${obsId}` });
  }

  // 4. Regional BMD Observations
  dexaReport.regions.forEach((region) => {
    if (region.boneDensityGPerCm2 !== undefined) {
      const obsId = getObservationId();
      const components: FhirObservation["component"] = [
        {
          code: {
            coding: [
              {
                system: "http://loinc.org",
                code: "24701-4",
                display: "Bone density",
              },
            ],
          },
          valueQuantity: {
            value: region.boneDensityGPerCm2,
            unit: "g/cm²",
            system: "http://unitsofmeasure.org",
            code: "g/cm2",
          },
        },
      ];

      if (region.tScore !== undefined) {
        components.push({
          code: {
            coding: [
              {
                system: "http://loinc.org",
                code: "24702-2",
                display: "T-score",
              },
            ],
          },
          valueQuantity: {
            value: region.tScore,
            unit: "SD",
          },
        });
      }

      if (region.zScore !== undefined) {
        components.push({
          code: {
            coding: [
              {
                system: "http://loinc.org",
                code: "24703-0",
                display: "Z-score",
              },
            ],
          },
          valueQuantity: {
            value: region.zScore,
            unit: "SD",
          },
        });
      }

      observations.push({
        resourceType: "Observation",
        id: obsId,
        status: "final",
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "24701-4",
              display: `Bone mineral density DEXA - ${region.region}`,
            },
          ],
        },
        subject: patientId ? { reference: `Patient/${patientId}` } : undefined,
        effectiveDateTime: dexaReport.scanDate,
        component: components,
        valueString: region.region, // Body region
      });
      observationRefs.push({ reference: `#${obsId}` });
    }

    // 5. Regional Body Composition (Fat %, Lean Mass, Fat Mass)
    if (
      region.bodyFatPercent !== undefined ||
      region.leanMassKg !== undefined ||
      region.fatMassKg !== undefined
    ) {
      const obsId = getObservationId();
      const components: FhirObservation["component"] = [];

      if (region.bodyFatPercent !== undefined) {
        components.push({
          code: {
            coding: [
              {
                system: "http://loinc.org",
                code: "41982-7",
                display: "Body fat percentage",
              },
            ],
          },
          valueQuantity: {
            value: region.bodyFatPercent,
            unit: "%",
            system: "http://unitsofmeasure.org",
            code: "%",
          },
        });
      }

      if (region.leanMassKg !== undefined) {
        components.push({
          code: {
            coding: [
              {
                system: "http://loinc.org",
                code: "73708-0",
                display: "Lean body mass",
              },
            ],
          },
          valueQuantity: {
            value: region.leanMassKg,
            unit: "kg",
            system: "http://unitsofmeasure.org",
            code: "kg",
          },
        });
      }

      if (region.fatMassKg !== undefined) {
        components.push({
          code: {
            coding: [
              {
                system: "http://loinc.org",
                code: "41981-9", // Body fat mass
                display: "Body fat mass",
              },
            ],
          },
          valueQuantity: {
            value: region.fatMassKg,
            unit: "kg",
            system: "http://unitsofmeasure.org",
            code: "kg",
          },
        });
      }

      if (components.length > 0) {
        observations.push({
          resourceType: "Observation",
          id: obsId,
          status: "final",
          code: {
            coding: [
              {
                system: "http://loinc.org",
                code: "41982-7",
                display: `Body composition - ${region.region}`,
              },
            ],
          },
          subject: patientId
            ? { reference: `Patient/${patientId}` }
            : undefined,
          effectiveDateTime: dexaReport.scanDate,
          component: components,
          valueString: region.region,
        });
        observationRefs.push({ reference: `#${obsId}` });
      }
    }
  });

  // 6. Visceral Fat
  if (
    dexaReport.visceralFatVolumeCm3 !== undefined ||
    dexaReport.visceralFatAreaCm2 !== undefined ||
    dexaReport.visceralFatRating !== undefined
  ) {
    const obsId = getObservationId();
    const components: FhirObservation["component"] = [];

    if (dexaReport.visceralFatVolumeCm3 !== undefined) {
      components.push({
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "82810-3", // Visceral fat volume
              display: "Visceral fat volume",
            },
          ],
        },
        valueQuantity: {
          value: dexaReport.visceralFatVolumeCm3,
          unit: "cm³",
          system: "http://unitsofmeasure.org",
          code: "cm3",
        },
      });
    }

    if (dexaReport.visceralFatAreaCm2 !== undefined) {
      components.push({
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "82811-1", // Visceral fat area
              display: "Visceral fat area",
            },
          ],
        },
        valueQuantity: {
          value: dexaReport.visceralFatAreaCm2,
          unit: "cm²",
          system: "http://unitsofmeasure.org",
          code: "cm2",
        },
      });
    }

    if (dexaReport.visceralFatRating !== undefined) {
      components.push({
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "82812-9", // Visceral fat rating
              display: "Visceral fat rating",
            },
          ],
        },
        valueQuantity: {
          value: dexaReport.visceralFatRating,
          unit: "lbs",
          system: "http://unitsofmeasure.org",
          code: "[lb_av]",
        },
      });
    }

    if (components.length > 0) {
      observations.push({
        resourceType: "Observation",
        id: obsId,
        status: "final",
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "82810-3",
              display: "Visceral adipose tissue",
            },
          ],
        },
        subject: patientId ? { reference: `Patient/${patientId}` } : undefined,
        effectiveDateTime: dexaReport.scanDate,
        component: components,
      });
      observationRefs.push({ reference: `#${obsId}` });
    }
  }

  // 7. Android/Gynoid Ratio
  if (dexaReport.androidGynoidRatio !== undefined) {
    const obsId = getObservationId();
    observations.push({
      resourceType: "Observation",
      id: obsId,
      status: "final",
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "82813-7", // Android/Gynoid ratio
            display: "Android/Gynoid ratio",
          },
        ],
      },
      subject: patientId ? { reference: `Patient/${patientId}` } : undefined,
      effectiveDateTime: dexaReport.scanDate,
      valueQuantity: {
        value: dexaReport.androidGynoidRatio,
        unit: "ratio",
      },
    });
    observationRefs.push({ reference: `#${obsId}` });
  }

  // Create the DiagnosticReport
  const diagnosticReport: FhirDiagnosticReport = {
    resourceType: "DiagnosticReport",
    status: "final",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v2-0074",
            code: "RAD",
            display: "Radiology",
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: "http://loinc.org",
          code: "38269-7", // DEXA scan
          display: "DXA Bone density",
        },
      ],
    },
    subject: patientId ? { reference: `Patient/${patientId}` } : undefined,
    effectiveDateTime: dexaReport.scanDate,
    issued: new Date().toISOString(),
    performer: practitionerId
      ? [{ reference: `Practitioner/${practitionerId}` }]
      : undefined,
    result: observationRefs,
    conclusion: `DEXA scan report${dexaReport.source ? ` from ${dexaReport.source}` : ""}. Confidence: ${(dexaReport.confidence * 100).toFixed(0)}%`,
    contained: observations, // Embed all observations in the report for efficiency
  };

  return diagnosticReport;
}

/**
 * Convert FHIR DiagnosticReport back to DexaReportData
 * Useful for retrieving data from FHIR systems or Storj storage
 */
export function convertFhirToDexa(
  fhirReport: FhirDiagnosticReport,
  rawText?: string,
  sourceName?: string,
): DexaReportData | null {
  if (fhirReport.resourceType !== "DiagnosticReport") {
    return null;
  }

  const observations = fhirReport.contained || [];
  const regions: DexaRegionMetrics[] = [];
  let totalBodyFatPercent: number | undefined;
  let totalLeanMassKg: number | undefined;
  let visceralFatVolumeCm3: number | undefined;
  let visceralFatAreaCm2: number | undefined;
  let visceralFatRating: number | undefined;
  let androidGynoidRatio: number | undefined;
  let bmd: number | undefined;
  let tScore: number | undefined;
  let zScore: number | undefined;

  // Process all observations
  for (const obs of observations) {
    if (obs.resourceType !== "Observation") continue;

    const code = obs.code?.coding?.[0]?.code;
    const value = obs.valueQuantity?.value;
    const components = obs.component || [];

    // Total Body Fat Percentage
    if (code === "41982-7" && !obs.component && value !== undefined) {
      totalBodyFatPercent = value;
    }

    // Total Lean Mass
    if (code === "73708-0" && !obs.component && value !== undefined) {
      totalLeanMassKg = value;
    }

    // Bone Mineral Density (Total Body) - only if no valueString (not a regional observation)
    if (code === "24701-4" && obs.component && !obs.valueString) {
      for (const comp of components) {
        const compCode = comp.code?.coding?.[0]?.code;
        const compValue = comp.valueQuantity?.value;

        if (compCode === "24701-4" && compValue !== undefined) {
          bmd = compValue;
        } else if (compCode === "24702-2" && compValue !== undefined) {
          tScore = compValue;
        } else if (compCode === "24703-0" && compValue !== undefined) {
          zScore = compValue;
        }
      }
    }

    // Regional BMD or Body Composition
    if (obs.valueString) {
      const regionName = obs.valueString.toLowerCase();
      let region = regions.find((r) => r.region === regionName);

      if (!region) {
        region = { region: regionName };
        regions.push(region);
      }

      // Check if this is a BMD observation
      if (code === "24701-4" && obs.component) {
        for (const comp of components) {
          const compCode = comp.code?.coding?.[0]?.code;
          const compValue = comp.valueQuantity?.value;

          if (compCode === "24701-4" && compValue !== undefined) {
            region.boneDensityGPerCm2 = compValue;
          } else if (compCode === "24702-2" && compValue !== undefined) {
            region.tScore = compValue;
          } else if (compCode === "24703-0" && compValue !== undefined) {
            region.zScore = compValue;
          }
        }
      }

      // Check if this is a body composition observation
      if (code === "41982-7" && obs.component) {
        for (const comp of components) {
          const compCode = comp.code?.coding?.[0]?.code;
          const compValue = comp.valueQuantity?.value;

          if (compCode === "41982-7" && compValue !== undefined) {
            region.bodyFatPercent = compValue;
          } else if (compCode === "73708-0" && compValue !== undefined) {
            region.leanMassKg = compValue;
          } else if (compCode === "41981-9" && compValue !== undefined) {
            region.fatMassKg = compValue;
          }
        }
      }
    }

    // Visceral Fat
    if (code === "82810-3" && obs.component) {
      for (const comp of components) {
        const compCode = comp.code?.coding?.[0]?.code;
        const compValue = comp.valueQuantity?.value;

        if (compCode === "82810-3" && compValue !== undefined) {
          visceralFatVolumeCm3 = compValue;
        } else if (compCode === "82811-1" && compValue !== undefined) {
          visceralFatAreaCm2 = compValue;
        } else if (compCode === "82812-9" && compValue !== undefined) {
          visceralFatRating = compValue;
        }
      }
    }

    // Android/Gynoid Ratio
    if (code === "82813-7" && value !== undefined) {
      androidGynoidRatio = value;
    }
  }

  // Build the DexaReportData
  const dexaReport: DexaReportData = {
    type: "dexa",
    source: sourceName,
    scanDate: fhirReport.effectiveDateTime,
    totalBodyFatPercent,
    totalLeanMassKg,
    visceralFatRating,
    visceralFatAreaCm2,
    visceralFatVolumeCm3,
    androidGynoidRatio,
    boneDensityTotal:
      bmd !== undefined || tScore !== undefined || zScore !== undefined
        ? { bmd, tScore, zScore }
        : undefined,
    regions,
    notes: fhirReport.conclusion ? [fhirReport.conclusion] : [],
    rawText: rawText || "",
    confidence: regions.length > 0 ? Math.min(1, regions.length / 6) : 0.1,
  };

  return dexaReport;
}
