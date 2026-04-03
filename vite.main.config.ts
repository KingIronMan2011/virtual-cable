import { defineConfig } from "vite";

// Main process config — compiled to CommonJS for Electron.
// naudiodon and electron must be external: they are native/built-in
// and cannot be bundled by Rollup.
export default defineConfig({
  build: {
    rollupOptions: {
      external: ["electron", "naudiodon"],
    },
  },
});
