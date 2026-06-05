/**
 * POST /api/gut-health/upload
 *
 * Parses a Tiny Health gut microbiome report from pre-extracted PDF text and
 * stores both data layers to Storj.
 *
 * Layer 1 (gut-health-report): structured metrics JSON — ready for ZK leaf hash.
 * Layer 2 (gut-health-species): full species abundance array.
 *
 * Request body:
 *   {
 *     text:          string               — PDF text extracted client-side via pdfjs
 *     walletAddress: string               — user's wallet address
 *     encryptionKey: WalletEncryptionKey  — wallet-derived encryption key
 *   }
 *
 * Response:
 *   {
 *     success:        boolean
 *     report:         GutHealthReportData (without rawText)
 *     storjUri:       string  — Layer 1 URI
 *     storjSpeciesUri:string  — Layer 2 URI
 *     reportId:       string
 *     confidence:     number
 *     duplicate?:     boolean
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { parseGutHealthReport } from "@/utils/reportParsers/gutHealthParser";
import { getStorjReportService } from "@/storage/StorjReportService";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";

export const runtime = "nodejs";
export const maxDuration = 120;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { text, walletAddress, encryptionKey } = body as {
      text?: string;
      walletAddress?: string;
      encryptionKey?: WalletEncryptionKey;
    };

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Missing required field: text" },
        { status: 400, headers: CORS },
      );
    }

    if (!walletAddress || !encryptionKey) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: walletAddress, encryptionKey",
        },
        { status: 400, headers: CORS },
      );
    }

    // Parse
    const report = parseGutHealthReport(text);
    if (!report) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Text does not appear to be a gut health report. Supported format: Tiny Health.",
        },
        { status: 422, headers: CORS },
      );
    }

    const service = getStorjReportService();

    // Store Layer 1 — structured metrics (excludes rawText and species)
    const layer1 = await service.storeGutHealthReport(
      report,
      walletAddress,
      encryptionKey,
    );

    if (!layer1.success) {
      return NextResponse.json(
        { success: false, error: layer1.error ?? "Failed to store report" },
        { status: 500, headers: CORS },
      );
    }

    // Store Layer 2 — species list
    const layer2 = await service.storeGutHealthSpecies(
      report.species,
      layer1.reportId ?? `gut-${Date.now()}`,
      walletAddress,
      encryptionKey,
    );

    if (!layer2.success) {
      console.warn(
        `⚠️ Layer 1 stored but Layer 2 (species) failed: ${layer2.error}`,
      );
    }

    // Return parsed report without the bulky rawText
    const { rawText: _rawText, ...reportPayload } = report;

    return NextResponse.json(
      {
        success: true,
        report: reportPayload,
        storjUri: layer1.storjUri,
        storjSpeciesUri: layer2.storjUri,
        reportId: layer1.reportId,
        confidence: report.confidence,
        duplicate: layer1.duplicate ?? false,
      },
      { headers: CORS },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("[gut-health/upload] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500, headers: CORS },
    );
  }
}
