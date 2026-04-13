import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const AIDBOX_URL = process.env.AIDBOX_URL || "http://localhost:8888";
const AIDBOX_AUTH = process.env.AIDBOX_AUTH || "Basic YmFzaWM6c2VjcmV0";
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
      "/mdm-api": {
        target: MDMBOX_URL,
        rewrite: (path) => path.replace(/^\/mdm-api/, ""),
        changeOrigin: true,
      },
      "/fhir": {
        target: AIDBOX_URL,
        changeOrigin: true,
        headers: {
          Authorization: AIDBOX_AUTH,
        },
      },
      "/$query": {
        target: AIDBOX_URL,
        changeOrigin: true,
        headers: {
          Authorization: AIDBOX_AUTH,
        },
      },
    },
  },
});
