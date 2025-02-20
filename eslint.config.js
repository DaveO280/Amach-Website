import { defineConfig } from "eslint-define-config";
import typescriptEslintPlugin from "@typescript-eslint/eslint-plugin";
import typescriptEslintParser from "@typescript-eslint/parser";

export default defineConfig([
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: typescriptEslintParser,
    },
    plugins: {
      "@typescript-eslint": typescriptEslintPlugin,
    },
    rules: {
      // Add your ESLint rules here
    },
  },
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      parser: "espree",
    },
    rules: {
      // Add your JavaScript-specific rules here
    },
  },
]);
