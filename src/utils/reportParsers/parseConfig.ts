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

// When a vision-capable Venice model is configured, PDF pages can be rendered
// to images and sent as multimodal input — capturing chart/gauge values that
// text extraction misses (e.g. the microbiome score donut chart).
export const VENICE_PARSE_VISION_MODEL: string =
  (typeof process !== "undefined" && process.env.VENICE_VISION_MODEL_NAME) ||
  VENICE_PARSE_TEXT_MODEL;
