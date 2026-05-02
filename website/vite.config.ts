import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";
import { resolve } from "pathe";

const rootPackageJson = JSON.parse(
  readFileSync(resolve(__dirname, "../package.json"), "utf-8"),
);

export default defineConfig({
  base: "/",
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPackageJson.version),
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom")) {
              return "vendor";
            }
            if (id.includes("lucide-react") || id.includes("react-icons")) {
              return "icons";
            }
          }
        },
      },
    },
  },
});
