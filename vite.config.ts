import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const MDMBOX_URL = process.env.MDMBOX_URL || "http://localhost:3003";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      treeshake: {
        moduleSideEffects: (id) => {
          if (id.includes("@health-samurai/react-components")) return false;
          return true;
        },
      },
    },
  },
  server: {
    port: 3002,
    proxy: {
      "/api": {
        target: MDMBOX_URL,
        changeOrigin: true,
      },
      "/fhir-server-api": {
        target: MDMBOX_URL,
        changeOrigin: true,
      },
    },
  },
});
