/**
 * Convert Bloodwork report data to/from FHIR format
 * FHIR R4 resources:
 * - DiagnosticReport: overall lab report
 * - Observation: individual lab results
 *
 * We do not assume LOINC availability for each metric; we store metric names as custom codes.
 */

import type {
  BloodworkFlag,
  BloodworkMetric,
  BloodworkReportData,
} from "@/types/reportData";
import type { FhirDiagnosticReport, FhirObservation } from "./dexaToFhir";

function slugifyCode(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug.length > 0 ? slug : "unknown";
}

function flagToInterpretation(
  flag?: BloodworkFlag,
): FhirObservation["interpretation"] | undefined {
  if (!flag) return undefined;

  // HL7 v3 ObservationInterpretation
  const system =
    "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation";

  const map: Record<BloodworkFlag, { code: string; display: string }> = {
    normal: { code: "N", display: "Normal" },
    low: { code: "L", display: "Low" },
    high: { code: "H", display: "High" },
    "critical-low": { code: "LL", display: "Critically low" },
    "critical-high": { code: "HH", display: "Critically high" },
  };

  const entry = map[flag];
  return [
    {
      coding: [{ system, code: entry.code, display: entry.display }],
    },
  ];
}

/**
 * Convert Bloodwork report to FHIR DiagnosticReport with embedded Observations
 */
export function convertBloodworkToFhir(
  bloodworkReport: BloodworkReportData,
  patientId?: string,
  practitionerId?: string,
): FhirDiagnosticReport {
  const observations: FhirObservation[] = [];
  const observationRefs: Array<{ reference: string }> = [];

  let observationCounter = 1;
  const getObservationId = (): string => `obs-${observationCounter++}`;

  const effective =
    bloodworkReport.reportDate ||
    bloodworkReport.metrics.find((m) => m.collectedAt)?.collectedAt ||
    undefined;

  const addMetricObservation = (metric: BloodworkMetric): void => {
    const obsId = getObservationId();

    const codeDisplay = metric.name || "Lab result";
    const code = slugifyCode(codeDisplay);

    const obs: FhirObservation & {
      referenceRange?: Array<{ text?: string }>;
    } = {
      resourceType: "Observation",
      id: obsId,
      status: "final",
      category: [
        {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "laboratory",
              display: "Laboratory",
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: "http://amach.health/fhir/lab-test",
            code,
            display: codeDisplay,
          },
        ],
      },
      subject: patientId ? { reference: `Patient/${patientId}` } : undefined,
      effectiveDateTime: metric.collectedAt || effective,
      interpretation: flagToInterpretation(metric.flag),
    };

    if (metric.value !== undefined && Number.isFinite(metric.value)) {
      obs.valueQuantity = {
        value: metric.value,
        unit: metric.unit || "",
        system: metric.unit ? "http://unitsofmeasure.org" : undefined,
        code: metric.unit ? metric.unit : undefined,
      };
    } else if (metric.valueText) {
      obs.valueString = metric.valueText;
    }

    if (metric.referenceRange) {
      obs.referenceRange = [{ text: metric.referenceRange }];
    }

    observations.push(obs);
    observationRefs.push({ reference: `#${obsId}` });
  };

  bloodworkReport.metrics.forEach(addMetricObservation);

  const reportId = `bloodwork-${bloodworkReport.reportDate || Date.now()}`;

  const diagnostic: FhirDiagnosticReport = {
    resourceType: "DiagnosticReport",
    id: reportId,
    status: "final",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v2-0074",
            code: "LAB",
            display: "Laboratory",
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: "http://loinc.org",
          code: "11502-2",
          display: "Laboratory report",
        },
      ],
    },
    subject: patientId ? { reference: `Patient/${patientId}` } : undefined,
    performer: practitionerId
      ? [{ reference: `Practitioner/${practitionerId}` }]
      : undefined,
    effectiveDateTime: effective,
    issued: new Date().toISOString(),
    result: observationRefs,
    contained: observations,
    conclusion: bloodworkReport.laboratory
      ? `Bloodwork report from ${bloodworkReport.laboratory}.`
      : "Bloodwork report.",
  };

  return diagnostic;
}

/**
 * Convert FHIR DiagnosticReport back to BloodworkReportData
 * (Best-effort; uses embedded contained observations)
 */
export function convertFhirToBloodwork(
  fhirReport: FhirDiagnosticReport,
  rawText?: string,
  sourceName?: string,
): BloodworkReportData | null {
  if (fhirReport.resourceType !== "DiagnosticReport") return null;

  const metrics: BloodworkMetric[] = [];

  const contained = fhirReport.contained ?? [];
  for (const obs of contained) {
    if (obs.resourceType !== "Observation") continue;

    const name =
      obs.code?.coding?.[0]?.display ||
      obs.code?.coding?.[0]?.code ||
      "Unknown";

    const value =
      obs.valueQuantity?.value !== undefined
        ? obs.valueQuantity.value
        : undefined;
    const unit = obs.valueQuantity?.unit || undefined;
    const valueText =
      obs.valueString || (value !== undefined ? String(value) : undefined);

    // Try to reconstruct flag from interpretation
    const interpCode = obs.interpretation?.[0]?.coding?.[0]?.code;
    const flag: BloodworkFlag | undefined =
      interpCode === "N"
        ? "normal"
        : interpCode === "L"
          ? "low"
          : interpCode === "H"
            ? "high"
            : interpCode === "LL"
              ? "critical-low"
              : interpCode === "HH"
                ? "critical-high"
                : undefined;

    const referenceRange =
      (obs as unknown as { referenceRange?: Array<{ text?: string }> })
        .referenceRange?.[0]?.text || undefined;

    metrics.push({
      name,
      value,
      valueText,
      unit,
      referenceRange,
      collectedAt: obs.effectiveDateTime,
      flag,
    });
  }

  const panels: Record<string, BloodworkMetric[]> = {};
  for (const m of metrics) {
    const panel = m.panel || "general";
    panels[panel] = panels[panel] || [];
    panels[panel].push(m);
  }

  const reportDate = fhirReport.effectiveDateTime;

  return {
    type: "bloodwork",
    source: sourceName,
    reportDate,
    laboratory: undefined,
    panels,
    metrics,
    notes: [],
    rawText: rawText || "",
    confidence: 0.8,
  };
}
