import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "dist/",
    "coverage/",
    "reports/",
    "src-tauri/",
    ".stryker-tmp/",
    "mutants.out/",
    "mutants.out.old/",
  ]),
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        extraFileExtensions: [".svelte"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.svelte"],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      complexity: ["error", 10],
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
      "svelte/no-at-html-tags": "error",
    },
  },
  {
    files: ["tools/**/*.ts", "*.config.js", "ui/*.config.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
