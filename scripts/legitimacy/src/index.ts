/**
 * Public entrypoint for the @amach/legitimacy package.
 *
 * Re-exports the pipeline, formatters, and the synthetic data generator so
 * downstream consumers (Layer 2 circuit work, dry-run runner, future
 * dashboards) can pull in just the pieces they need without reaching into
 * src/.
 */

export * from "./types";
export {
  AmachLeafV2 as _AmachLeafV2Type
} from "./types";
export {
  hashLeaf,
  hashLeafV1,
  hashLeafV2,
  chunksV1,
  chunksV2,
  serializeLeafV2,
  deserializeLeafV2,
  validateLeafEnvelopeV2,
  buildLeafV2,
  V1_LEAF_BYTES,
  V2_LEAF_BYTES,
  V2_VERSION_BYTE,
  V2_LEAF_TYPE_DAILY_SUMMARY,
  V2_SCHEMA_VERSION_DAILY_SUMMARY,
  BN128_FIELD_SIZE
} from "./leaf";
export {
  buildMerkleTree,
  getMerklePath,
  verifyMerklePath,
  parseRoot,
  nextPowerOf2,
  ZERO_LEAF
} from "./merkle";
export { runCategoryA } from "./checks/categoryA";
export { runCategoryB } from "./checks/categoryB";
export { runCategoryC } from "./checks/categoryC";
export { runCategoryD } from "./checks/categoryD";
export { runCategoryE } from "./checks/categoryE";
export { score } from "./checks/categoryF";
export { runLegitimacyPipeline } from "./pipeline";
export { formatJson } from "./formatters/json";
export { formatMarkdown } from "./formatters/markdown";
export { DEFAULT_CONFIG } from "./config";
export {
  generateSeries,
  walletFromSeed,
  sourceHashFor,
  SeededRandom
} from "./generator/synthetic";
export type {
  GeneratorConfig,
  GeneratorOutput,
  Sex,
  FitnessLevel,
  DeviceProfile,
  NoiseProfile,
  DailyMetricKey
} from "./generator/synthetic";
