import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// During dev, Vite serves on :5173 and proxies /api, /scene, /scenes/stop,
// /tripars, /atomic, /fog, /blackout, /ws to FastAPI on :8000.
// Production: `npm run build` writes to web/dist, FastAPI serves it.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api":      "http://localhost:8000",
      "/scene":    "http://localhost:8000",
      "/tripars":  "http://localhost:8000",
      "/atomic":   "http://localhost:8000",
      "/fog":      "http://localhost:8000",
      "/blackout": "http://localhost:8000",
      "/ws":       { target: "ws://localhost:8000", ws: true },
    },
  },
});
