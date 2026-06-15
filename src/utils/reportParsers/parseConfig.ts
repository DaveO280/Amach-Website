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
// openai-gpt-4o-mini: fast (~8s), reliable JSON output, supports multiple images.
// kimi-k2-5 and e2ee-qwen3-vl-30b-a3b-p both fail on these PDF pages.
// Override via VENICE_VISION_MODEL_NAME env var.
export const VENICE_PARSE_VISION_MODEL: string =
  (typeof process !== "undefined" && process.env.VENICE_VISION_MODEL_NAME) ||
  "openai-gpt-4o-mini-2024-07-18";
