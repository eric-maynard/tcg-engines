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
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    // Iter-S: the engine-assert harness imports `EngineSession` (which pulls
    // In @tcg/core → zod). Vitest 2.1.9 mis-handles zod 4's named re-export
    // (`import * as z from "./v4/classic/external.js"; export { z }`) — the
    // `{ z }` named import arrives as `undefined`, tripping `z.object is
    // Not a function` from validation.ts. We alias `zod` (only inside the
    // Test runner) to a tiny shim that rebuilds `z` from the namespace.
    alias: {
      zod: resolve(__dirname, "src/__tests__/zod-shim.ts"),
    },
    server: {
      deps: {
        inline: [/@tcg\//, /riftbound-app\/lib/, /packages\//],
      },
    },
  },
});
