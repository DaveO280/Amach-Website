/**
 * Register all built-in report types.
 *
 * Import order = detection priority. Gut health is checked first because
 * its markers are distinct and don't overlap with DEXA or bloodwork.
 */

import { registerReportType } from "../index";
import { gutHealthDefinition } from "./gutHealth";
import { dexaDefinition } from "./dexa";
import { bloodworkDefinition } from "./bloodwork";

registerReportType(gutHealthDefinition);
registerReportType(dexaDefinition);
registerReportType(bloodworkDefinition);

export { gutHealthDefinition, dexaDefinition, bloodworkDefinition };
