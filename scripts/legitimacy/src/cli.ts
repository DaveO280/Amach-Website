#!/usr/bin/env node
/**
 * CLI entrypoint for `amach-legitimacy-check`.
 *
 *   amach-legitimacy-check \
 *     --data ./participant-data.json \
 *     --root 0xabc... \
 *     --network zksync-sepolia \
 *     --output ./report.md \
 *     --format markdown \
 *     --leaf-version 2
 *
 * Flags:
 *   --data         path to participant input JSON (required)
 *   --root         expected on-chain Merkle root, hex or decimal (overrides
 *                  the value in the data file if both are present)
 *   --network      network identifier label, written into the report
 *   --output       path to write the report. If omitted, output goes to
 *                  stdout.
 *   --format       json | markdown | both (default: markdown)
 *   --leaf-version 1 | 2 (default 2; v1 is rejected by the rest of the
 *                  pipeline since it has no VO2 max field)
 *   --verbose      log additional diagnostic info to stderr
 *   --help         print this help text
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

import { runLegitimacyPipeline } from "./pipeline";
import { formatJson } from "./formatters/json";
import { formatMarkdown } from "./formatters/markdown";
import type { ParticipantInput } from "./types";

interface ParsedArgs {
  data?: string;
  root?: string;
  network?: string;
  output?: string;
  format?: "json" | "markdown" | "both";
  leafVersion?: number;
  verbose?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[i + 1];
      if (v === undefined) {
        throw new Error(`Missing value for ${a}`);
      }
      i++;
      return v;
    };
    switch (a) {
      case "--data":
      case "-d":
        out.data = next();
        break;
      case "--root":
      case "-r":
        out.root = next();
        break;
      case "--network":
      case "-n":
        out.network = next();
        break;
      case "--output":
      case "-o":
        out.output = next();
        break;
      case "--format":
      case "-f": {
        const f = next() as "json" | "markdown" | "both";
        if (f !== "json" && f !== "markdown" && f !== "both") {
          throw new Error(`--format must be json, markdown, or both (got "${f}")`);
        }
        out.format = f;
        break;
      }
      case "--leaf-version": {
        const v = parseInt(next(), 10);
        if (!Number.isFinite(v) || (v !== 1 && v !== 2)) {
          throw new Error(`--leaf-version must be 1 or 2`);
        }
        out.leafVersion = v;
        break;
      }
      case "--verbose":
      case "-v":
        out.verbose = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        throw new Error(`Unknown flag: ${a}`);
    }
  }
  return out;
}

const HELP = `
amach-legitimacy-check — open-source verification for Amach Health committed
v2 leaves.

  amach-legitimacy-check --data <path> [options]

Required:
  --data, -d <path>            JSON file with participant leaves and the
                               on-chain commitment context

Optional:
  --root, -r <hex|dec>         override the expectedRoot in the data file
  --network, -n <name>         network label written into the report
  --output, -o <path>          report destination (default: stdout)
  --format, -f json|markdown|both
                               output format (default: markdown)
  --leaf-version <1|2>         leaf format (default: 2)
  --verbose, -v                emit extra diagnostic info to stderr
  --help, -h                   print this help

The participant input JSON should look like:
  {
    "walletAddress": "0x…",
    "expectedRoot": "0x…",
    "expectedLeafCount": 90,
    "expectedStartDayId": 19000,
    "expectedEndDayId": 19089,
    "leaves": ["<248-hex-chars>", ...]   // or structured AmachLeafV2 objects
  }
`;

export async function runCli(argv: string[]): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`Error: ${(e as Error).message}\n${HELP}`);
    return 2;
  }

  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }

  if (!args.data) {
    process.stderr.write(`Error: --data is required.\n${HELP}`);
    return 2;
  }

  const leafVersion = args.leafVersion ?? 2;
  if (leafVersion !== 2) {
    process.stderr.write(
      `Error: --leaf-version 1 is not supported by this script (Spring Push uses v2 only).\n`
    );
    return 2;
  }

  const dataPath = path.resolve(args.data);
  let raw: string;
  try {
    raw = await fs.readFile(dataPath, "utf8");
  } catch (e) {
    process.stderr.write(`Error reading ${dataPath}: ${(e as Error).message}\n`);
    return 1;
  }

  let data: ParticipantInput;
  try {
    data = JSON.parse(raw) as ParticipantInput;
  } catch (e) {
    process.stderr.write(
      `Error parsing ${dataPath} as JSON: ${(e as Error).message}\n`
    );
    return 1;
  }

  if (args.root) data.expectedRoot = args.root;
  if (args.network) data.network = args.network;

  if (args.verbose) {
    process.stderr.write(
      `Read ${data.leaves?.length ?? 0} leaf entries from ${dataPath}.\n`
    );
  }

  const report = runLegitimacyPipeline(data);
  const format = args.format ?? "markdown";
  const md = format === "markdown" || format === "both" ? formatMarkdown(report) : null;
  const js = format === "json" || format === "both" ? formatJson(report) : null;

  if (args.output) {
    const outPath = path.resolve(args.output);
    if (format === "both") {
      const dir = path.dirname(outPath);
      const base = path.basename(outPath, path.extname(outPath));
      await fs.writeFile(path.join(dir, `${base}.md`), md ?? "", "utf8");
      await fs.writeFile(path.join(dir, `${base}.json`), js ?? "", "utf8");
      if (args.verbose) {
        process.stderr.write(
          `Wrote ${path.join(dir, base + ".md")} and ${path.join(dir, base + ".json")}.\n`
        );
      }
    } else {
      await fs.writeFile(outPath, format === "markdown" ? (md ?? "") : (js ?? ""), "utf8");
      if (args.verbose) process.stderr.write(`Wrote ${outPath}.\n`);
    }
  } else {
    if (format === "both") {
      process.stdout.write(`---\n# Markdown report\n---\n${md}\n`);
      process.stdout.write(`\n---\n# JSON report\n---\n${js}\n`);
    } else if (format === "markdown") {
      process.stdout.write(`${md}\n`);
    } else {
      process.stdout.write(`${js}\n`);
    }
  }

  return report.recommendation === "pass" ? 0 : 1;
}

if (require.main === module) {
  runCli(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      process.stderr.write(`Unhandled error: ${(e as Error).stack ?? e}\n`);
      process.exit(1);
    });
}
