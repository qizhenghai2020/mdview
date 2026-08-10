import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue(), react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    watch: {
      // Wails regenerates these bridge files during development. They remain
      // importable, but must not participate in Vite's HMR file watcher.
      ignored: ["**/wailsjs/**"],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = String(id || "").replace(/\\/g, "/");
          if (!normalizedId.includes("/node_modules/")) {
            return undefined;
          }

          if (
            normalizedId.includes("/react/") ||
            normalizedId.includes("/react-dom/") ||
            normalizedId.includes("/@do-md/core-react/") ||
            normalizedId.includes("/prismjs/")
          ) {
            return "vendor-live-editor";
          }

          if (
            normalizedId.includes("/marked/") ||
            normalizedId.includes("/highlight.js/")
          ) {
            return "vendor-markdown";
          }

          return undefined;
        },
      },
    },
  },
});
