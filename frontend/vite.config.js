// File: vite.config.js
// Language: JavaScript
// Purpose: Vite build config for the Nothing Bandit frontend.
//          Proxies /api requests to the FastAPI backend so the browser never
//          makes cross-origin requests in development (avoids CORS preflight).
// Connects to: FastAPI server on localhost:8000

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // All fetch("/api/...") calls are rewritten to http://localhost:8000/...
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
