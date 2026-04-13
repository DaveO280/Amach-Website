/**
 * AI-powered generic medical record parser using Venice AI.
 *
 * This is the last-resort parser: any health PDF that is not recognized as
 * DEXA or bloodwork falls through here so the user always gets at least an
 * AI-generated summary and the raw text.
 */

import type { MedicalRecordData } from "@/types/reportData";
import { callVenice as callVeniceClient } from "./veniceClient";

function stripMarkdownFences(text: string): string {
  return text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
}

function extractJsonObject(text: string): string | null {
  // Find the first balanced top-level { ... } in the text.
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Parse any medical document using AI to extract structured data.
 */
export async function parseMedicalRecordWithAI(
  rawText: string,
  sourceName?: string,
): Promise<MedicalRecordData | null> {
  if (!rawText || rawText.trim().length === 0) {
    return null;
  }

  // Truncate very long documents while keeping start + end.
  const MAX = 24000;
  let textToParse = rawText;
  if (rawText.length > MAX) {
    const head = rawText.slice(0, 12000);
    const tail = rawText.slice(-12000);
    textToParse = `${head}\n\n[...TRUNCATED... keeping start+end of document]\n\n${tail}`;
  }

  const systemPrompt = `You are a medical document analyser. Given the raw text of a health-related PDF, extract structured information and return ONLY valid JSON with this exact structure:
{
  "documentType": "imaging" | "discharge-summary" | "prescription" | "lab-panel" | "referral" | "surgical-report" | "other",
  "title": "Short descriptive title for this document",
  "reportDate": "YYYY-MM-DD or MM/DD/YYYY or null",
  "source": "Provider or facility name or null",
  "summary": "A concise 2-4 sentence summary of the document contents",
  "keyFindings": ["finding 1", "finding 2"],
  "medications": ["medication 1 with dosage if available"],
  "diagnoses": ["diagnosis 1", "diagnosis 2"]
}

Rules:
- documentType: choose the BEST fit from the options above
- title: a short human-readable title (e.g. "Chest X-Ray Report", "Hospital Discharge Summary")
- summary: concise clinical summary written for a health-conscious patient
- keyFindings: important clinical observations, results, or recommendations
- medications: any medications mentioned with dosage/frequency if available
- diagnoses: any diagnoses, conditions, or impressions mentioned
- Use empty arrays [] when no items found for keyFindings, medications, diagnoses
- Use null for missing scalar fields
- Output ONLY valid JSON. No narrative, no markdown, no explanations.`;

  const userPrompt = `Analyse this medical document and extract structured data as JSON:\n\n${textToParse}`;

  try {
    console.log(
      "[AIMedicalRecordParser] Sending document text to AI for parsing...",
    );

    const modelName =
      process.env.NEXT_PUBLIC_VENICE_MODEL_NAME || "zai-org-glm-4.7";

    const messages: Array<{ role: "system" | "user"; content: string }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const data = (await callVeniceClient({
      messages,
      max_tokens: 4000,
      temperature: 0,
      model: modelName,
      stream: false,
      response_format: { type: "json_object" },
    })) as Record<string, unknown>;

    const choices = data?.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as
      | Record<string, unknown>
      | undefined;
    const fullText = ((message?.content as string)?.trim() ||
      (message?.reasoning_content as string)?.trim() ||
      "") as string;

    if (!fullText) {
      console.error("[AIMedicalRecordParser] Empty response from AI");
      return null;
    }

    // Parse JSON from response
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(fullText);
    } catch {
      const cleaned = stripMarkdownFences(fullText);
      const extracted = extractJsonObject(cleaned);
      if (!extracted) {
        console.error(
          "[AIMedicalRecordParser] No JSON object found in AI response",
        );
        return null;
      }
      try {
        parsed = JSON.parse(extracted);
      } catch (parseErr) {
        console.error("[AIMedicalRecordParser] JSON parse error:", parseErr);
        return null;
      }
    }

    const toStringOrUndefined = (v: unknown): string | undefined =>
      typeof v === "string" && v.trim() ? v.trim() : undefined;

    const toStringArray = (v: unknown): string[] => {
      if (!Array.isArray(v)) return [];
      return v
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);
    };

    const report: MedicalRecordData = {
      type: "medical-record",
      source: toStringOrUndefined(parsed.source) || sourceName,
      reportDate: toStringOrUndefined(parsed.reportDate),
      documentType: toStringOrUndefined(parsed.documentType) || "other",
      title: toStringOrUndefined(parsed.title),
      summary: toStringOrUndefined(parsed.summary),
      keyFindings: toStringArray(parsed.keyFindings),
      medications: toStringArray(parsed.medications),
      diagnoses: toStringArray(parsed.diagnoses),
      rawText,
      confidence: 0.7, // AI-only parse, reasonable default
    };

    // Boost confidence if we got rich data
    const hasFindings = (report.keyFindings?.length ?? 0) > 0;
    const hasMeds = (report.medications?.length ?? 0) > 0;
    const hasDiagnoses = (report.diagnoses?.length ?? 0) > 0;
    if (hasFindings && (hasMeds || hasDiagnoses)) {
      report.confidence = 0.85;
    } else if (hasFindings || hasMeds || hasDiagnoses) {
      report.confidence = 0.75;
    }

    console.log(
      `[AIMedicalRecordParser] Extracted: type=${report.documentType}, ` +
        `findings=${report.keyFindings?.length ?? 0}, ` +
        `medications=${report.medications?.length ?? 0}, ` +
        `diagnoses=${report.diagnoses?.length ?? 0}, ` +
        `confidence=${report.confidence}`,
    );

    return report;
  } catch (error) {
    console.error("[AIMedicalRecordParser] Error parsing with AI:", error);
    return null;
  }
}

/**
 * Create a minimal medical record with just raw text (when AI fails entirely).
 */
export function createFallbackMedicalRecord(
  rawText: string,
  sourceName?: string,
): MedicalRecordData {
  return {
    type: "medical-record",
    source: sourceName,
    documentType: "other",
    title: "Unprocessed Medical Document",
    summary: undefined,
    keyFindings: [],
    medications: [],
    diagnoses: [],
    rawText,
    confidence: 0.1,
  };
}
