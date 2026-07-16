/**
 * Venice model configuration for report parsing — thin re-export of the central
 * registry's parse tiers (src/config/aiModels.ts).
 *
 * NOTE: report parsing uses `response_format` (JSON mode), which Venice's TEE
 * enclave models reject (HTTP 400). So these tiers stay on non-enclave models.
 * Moving report parsing into the enclave requires dropping response_format and
 * re-verifying against the report fixtures — tracked as a follow-up.
 */

import { getPrimaryModel } from "@/config/aiModels";

export const VENICE_PARSE_TEXT_MODEL: string = getPrimaryModel("parseText");

// Vision model for PDF page rendering passes (gauge/chart extraction).
// Override via VENICE_VISION_MODEL_NAME (honored by the registry parseVision tier).
export const VENICE_PARSE_VISION_MODEL: string = getPrimaryModel("parseVision");
