/**
 * Vite config for the Riftbound Play SPA.
 *
 * - `base: '/play/'` so the build output works when mounted at /play in
 *   production (server.ts fall-through). In dev we hit Vite directly on
 *   :5173/play/, and the dev server proxies `/api` to the Bun server.
 * - `proxy` forwards `/api/*` to localhost:3000 (the Bun server) so the
 *   SPA can talk to the engine without CORS during development.
 */
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/play/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        changeOrigin: true,
        target: "http://localhost:3000",
      },
    },
  },
  build: {
    emptyOutDir: true,
    outDir: "dist",
  },
  // @ts-expect-error — vitest augments defineConfig but triple-slash
  // Types don't fully satisfy the vite overload; runtime is correct.
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
});
