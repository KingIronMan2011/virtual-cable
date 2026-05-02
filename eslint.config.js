import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Ignore build output and generated files
  {
    ignores: ["dist/**", "node_modules/**", "src-tauri/target/**"],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
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
