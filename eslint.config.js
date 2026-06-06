//  @ts-check

import eslint from "@eslint/js";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["scripts/*.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: [
      "*.config.js",
      "*.config.ts",
      "*.config.cjs",
      "*.config.mjs",
      "dist/",
      "node_modules/",
      "**/__tests__/**",
      "src/test/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      // Unused imports - auto-remove
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],

      // TypeScript strict
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        { ignoreArrowShorthand: true },
      ],

      // General
      "no-console": ["warn", { allow: ["info", "warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
);
