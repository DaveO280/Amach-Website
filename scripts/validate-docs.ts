#!/usr/bin/env tsx
/**
 * Documentation Validation & Auto-Cleanup Script
 *
 * Validates that only "living" documentation exists in the repository.
 * Automatically identifies and removes stale debug/analysis/migration docs.
 *
 * Usage:
 *   pnpm exec tsx scripts/validate-docs.ts              # Check for stale docs
 *   pnpm exec tsx scripts/validate-docs.ts --fix        # Auto-remove stale docs
 *   pnpm exec tsx scripts/validate-docs.ts --no-confirm # Auto-remove without confirmation
 */

import fs from "fs";
import path from "path";

interface DocsConfig {
  livingDocs: { files: string[] };
  staleDocs: { patterns: string[] };
  exceptions: { files: string[] };
  autoClean: {
    enabled: boolean;
    confirmBeforeDelete: boolean;
    maxAgeInDays: number | null;
  };
}

const CONFIG_PATH = path.join(process.cwd(), ".docs-config.json");
const ROOT_DIR = process.cwd();

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function loadConfig(): DocsConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    log(`❌ Config file not found: ${CONFIG_PATH}`, colors.red);
    process.exit(1);
  }

  try {
    const configData = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(configData) as DocsConfig;
  } catch (error) {
    log(`❌ Failed to parse config file: ${error}`, colors.red);
    process.exit(1);
  }
}

function getAllMarkdownFiles(): string[] {
  const files = fs.readdirSync(ROOT_DIR);
  return files.filter((file) => file.endsWith(".md"));
}

function matchesPattern(filename: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    // Simple glob pattern matching
    const regex = new RegExp(
      "^" +
        pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".") +
        "$",
    );
    return regex.test(filename);
  });
}

function isStaleDoc(
  filename: string,
  config: DocsConfig,
): { isStale: boolean; reason: string } {
  // Check if it's a living doc
  if (config.livingDocs.files.includes(filename)) {
    return { isStale: false, reason: "Living documentation" };
  }

  // Check if it's in exceptions
  if (config.exceptions.files.includes(filename)) {
    return { isStale: false, reason: "Exception (explicitly kept)" };
  }

  // Check if it matches stale patterns
  if (matchesPattern(filename, config.staleDocs.patterns)) {
    return { isStale: true, reason: "Matches stale pattern" };
  }

  // Unknown doc (not in living docs, not matching stale patterns)
  return { isStale: false, reason: "Unknown (requires manual review)" };
}

function getFileAge(filepath: string): number {
  const stats = fs.statSync(filepath);
  const ageMs = Date.now() - stats.mtimeMs;
  return Math.floor(ageMs / (1000 * 60 * 60 * 24)); // Convert to days
}

function validateDocs(options: { fix: boolean; confirm: boolean }) {
  log("\n📚 Documentation Validation\n", colors.blue);

  const config = loadConfig();
  const allMarkdownFiles = getAllMarkdownFiles();

  const livingDocs: string[] = [];
  const staleDocs: string[] = [];
  const unknownDocs: string[] = [];

  // Categorize all markdown files
  for (const file of allMarkdownFiles) {
    const { isStale, reason } = isStaleDoc(file, config);

    if (config.livingDocs.files.includes(file)) {
      livingDocs.push(file);
    } else if (isStale) {
      // Check age if maxAgeInDays is set
      if (config.autoClean.maxAgeInDays !== null) {
        const filepath = path.join(ROOT_DIR, file);
        const ageInDays = getFileAge(filepath);
        if (ageInDays >= config.autoClean.maxAgeInDays) {
          staleDocs.push(file);
        } else {
          unknownDocs.push(file);
        }
      } else {
        staleDocs.push(file);
      }
    } else if (reason === "Unknown (requires manual review)") {
      unknownDocs.push(file);
    }
  }

  // Display results
  log(`✅ Living docs (${livingDocs.length}):`, colors.green);
  livingDocs.forEach((file) => log(`   ${file}`, colors.gray));

  if (staleDocs.length > 0) {
    log(`\n🗑️  Stale docs found (${staleDocs.length}):`, colors.yellow);
    staleDocs.forEach((file) => {
      const filepath = path.join(ROOT_DIR, file);
      const ageInDays = getFileAge(filepath);
      log(`   ${file} (${ageInDays} days old)`, colors.gray);
    });
  }

  if (unknownDocs.length > 0) {
    log(`\n❓ Unknown docs (${unknownDocs.length}):`, colors.blue);
    unknownDocs.forEach((file) => log(`   ${file}`, colors.gray));
    log(
      "   ℹ️  These files don't match living or stale patterns. Add them to .docs-config.json",
      colors.gray,
    );
  }

  // Handle cleanup
  if (staleDocs.length > 0) {
    if (options.fix) {
      if (options.confirm) {
        log(
          `\n⚠️  About to delete ${staleDocs.length} stale documentation files.`,
          colors.yellow,
        );
        log(
          "   Run with --no-confirm to skip this prompt in CI/CD.\n",
          colors.gray,
        );

        // In a real implementation, you'd use readline or prompts library
        // For now, we'll just delete if --no-confirm is passed
        return;
      }

      log(`\n🧹 Deleting ${staleDocs.length} stale docs...`, colors.yellow);
      let deleted = 0;
      for (const file of staleDocs) {
        try {
          const filepath = path.join(ROOT_DIR, file);
          fs.unlinkSync(filepath);
          log(`   ✓ Deleted ${file}`, colors.gray);
          deleted++;
        } catch (error) {
          log(`   ✗ Failed to delete ${file}: ${error}`, colors.red);
        }
      }
      log(`\n✅ Cleaned up ${deleted}/${staleDocs.length} files`, colors.green);
    } else {
      log(
        `\n💡 Run with --fix to automatically remove stale docs`,
        colors.blue,
      );
      process.exit(1);
    }
  } else {
    log(`\n✨ No stale documentation found!`, colors.green);
  }

  // Summary
  log(`\n📊 Summary:`, colors.blue);
  log(`   Living docs: ${livingDocs.length}`, colors.gray);
  log(`   Stale docs: ${staleDocs.length}`, colors.gray);
  log(`   Unknown docs: ${unknownDocs.length}`, colors.gray);

  if (unknownDocs.length > 0) {
    log(
      `\n⚠️  Review unknown docs and update .docs-config.json`,
      colors.yellow,
    );
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  fix: args.includes("--fix"),
  confirm: !args.includes("--no-confirm"),
};

validateDocs(options);
