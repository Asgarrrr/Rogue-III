import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import { baseConfig } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config} */
export default defineConfig(
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "quotes": ["error", "double"],
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  }
);