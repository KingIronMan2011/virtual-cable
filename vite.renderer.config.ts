import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Renderer process — standard Vite + React + Tailwind v4.
// Tailwind v4 uses the Vite plugin only; no tailwind.config.js needed.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
