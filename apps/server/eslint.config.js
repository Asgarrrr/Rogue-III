import { baseConfig } from "@repo/eslint-config/base";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

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
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
);
