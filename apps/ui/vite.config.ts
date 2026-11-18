import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [tailwindcss(), react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replaceAll("\\", "/");
          if (!moduleId.includes("/node_modules/")) return;

          if (/\/\.pnpm\/(react|react-dom|scheduler|use-sync-external-store)@/.test(moduleId)) {
            return "vendor-react";
          }
          if (moduleId.includes("/.pnpm/zod@")) return "vendor-zod";
          if (moduleId.includes("/.pnpm/@dnd-kit+")) return "vendor-dnd";
          if (/\/\.pnpm\/(framer-motion|motion-dom|motion-utils)@/.test(moduleId)) {
            return "vendor-motion";
          }
          if (moduleId.includes("/.pnpm/sonner@")) return "vendor-sonner";
        }
      }
    }
  },
  server: {
    fs: { allow: [workspaceRoot] },
    host: "127.0.0.1",
    port: 5173
  }
});
