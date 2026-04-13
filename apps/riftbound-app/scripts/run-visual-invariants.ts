/**
 * CI entrypoint: boot the Riftbound server, run the visual invariants test
 * against it, then shut the server down. Exits with the test's exit code so
 * turbo's test task picks up failures.
 *
 * Usage (CI and local):
 *   bun run apps/riftbound-app/scripts/run-visual-invariants.ts
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const APP_DIR = path.resolve(import.meta.dir, "..");
const SERVER_PATH = path.join(APP_DIR, "server.ts");
const TEST_PATH = path.join(APP_DIR, "scripts", "visual-invariants.ts");
const PORT = Number(process.env.PORT ?? "3000");
const BASE_URL = `http://localhost:${PORT}`;

// Find a headless Chrome binary. The visual-invariants.ts script also checks
// CHROMIUM_PATH so we forward it directly.
function findChrome(): string | null {
  const candidates = [
    process.env.CHROMIUM_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter((p): p is string => Boolean(p));
  for (const c of candidates) {
    if (existsSync(c)) {return c;}
  }
  return null;
}

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) {return true;}
    } catch {
      // Connection refused — server still starting
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function main(): Promise<void> {
  const chrome = findChrome();
  if (!chrome) {
    // In CI environments without a Chromium binary, skip rather than fail.
    // Set SKIP_VISUAL_TEST=0 to force failure when Chromium is missing.
    if (process.env.SKIP_VISUAL_TEST !== "0") {
      console.log(
        "[visual-invariants] SKIP: no Chromium binary found " +
          "(set CHROMIUM_PATH or install google-chrome to run this test).",
      );
      process.exit(0);
    }
    console.error(
      "No Chromium binary found. Set CHROMIUM_PATH or install google-chrome / chromium-browser.",
    );
    process.exit(2);
  }
  console.log(`Using Chromium: ${chrome}`);

  // Boot the server as a subprocess
  console.log(`Starting server: bun run ${SERVER_PATH}`);
  const server = spawn("bun", ["run", SERVER_PATH], {
    cwd: APP_DIR,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Mirror server stderr but buffer stdout so we can dump it on failure
  const serverOut: string[] = [];
  server.stdout.on("data", (chunk: Buffer) => {
    serverOut.push(chunk.toString());
  });
  server.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(`[server] ${chunk}`);
  });

  let serverExited = false;
  let serverExitCode: number | null = null;
  server.on("exit", (code) => {
    serverExited = true;
    serverExitCode = code;
  });

  // Wait up to 30 seconds for the server to come up
  const ready = await waitForServer(BASE_URL, 30_000);
  if (!ready || serverExited) {
    console.error("Server failed to come up within 30s");
    console.error(serverOut.join("").slice(-2000));
    if (!serverExited) {server.kill("SIGTERM");}
    process.exit(2);
  }
  console.log("Server is ready");

  // Run the visual invariants test
  const test = spawn("bun", ["run", TEST_PATH], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      CHROMIUM_PATH: chrome,
      RIFTBOUND_URL: BASE_URL,
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  const testExitCode: number = await new Promise((resolve) => {
    test.on("exit", (code) => resolve(code ?? 1));
  });

  // Shut down the server
  if (!serverExited) {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 250));
    if (!serverExited) {server.kill("SIGKILL");}
  }

  console.log(
    `\nDone. test=${testExitCode} server=${serverExitCode ?? "killed"}`,
  );
  process.exit(testExitCode);
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(2);
});
