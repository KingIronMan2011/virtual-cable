import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default tseslint.config(
  // Ignore build output and generated files
  {
    ignores: [".vite/**", "out/**", "node_modules/**", "forge.config.ts"],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  {
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      // React 17+ JSX transform — no need to import React in every file
      "react/react-in-jsx-scope": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Allow _prefixed args to be unused (common pattern in IPC callbacks)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // naudiodon uses 'require' style imports — allow in .ts main-process files
      "@typescript-eslint/no-require-imports": "off",
    },
    settings: {
      react: { version: "detect" },
    },
  },
);
