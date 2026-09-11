import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      /**
       * `useActionState` fixes the shape of a server action — `(state, formData)`
       * — whether or not a given action reads both. Leading underscores mark the
       * ones that are there for the signature alone.
       */
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["app/layout.tsx"],
    rules: {
      /**
       * Material Symbols is an icon font: its glyphs are addressed by ligature,
       * so `display=swap` would paint the words "dashboard" and "warning" across
       * the console until the font arrives. `block` is Google's own guidance for
       * this family, and the App Router has no `_document` to move the tag into.
       */
      "@next/next/google-font-display": "off",
      "@next/next/no-page-custom-font": "off",
    },
  },
]);

export default eslintConfig;
