/**
 * Centralized Venice model configuration for report parsing.
 *
 * Text model: used for all LLM-based extraction from PDF text.
 * Vision model: reserved for when PDF → image → vision becomes available.
 */

export const VENICE_PARSE_TEXT_MODEL: string =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_VENICE_MODEL_NAME ||
      process.env.VENICE_MODEL_NAME)) ||
  "zai-org-glm-4.7";

// Vision model for PDF page rendering passes (gauge/chart extraction).
// e2ee-qwen3-vl-30b-a3b-p is the default — available and responsive.
// Override via VENICE_VISION_MODEL_NAME env var.
export const VENICE_PARSE_VISION_MODEL: string =
  (typeof process !== "undefined" && process.env.VENICE_VISION_MODEL_NAME) ||
  "e2ee-qwen3-vl-30b-a3b-p";
