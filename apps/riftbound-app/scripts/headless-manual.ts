#!/usr/bin/env bun
/**
 * Headless demo for "Manual" mode (admin / power-user override).
 *
 * Walks through:
 *   1. Toggle the top-nav "Manual" button so manualMode === true.
 *   2. Spawn a Bird Token in player-1's base via /api/v2/manual/spawn-token.
 *   3. Right-click that token to reveal the unit context menu.
 *   4. Screenshot the context menu visible.
 *
 * Frames written:
 *   /tmp/manual-mode-board.jpg         — board after spawning a Bird Token
 *   /tmp/manual-mode-context-menu.jpg  — right-click context menu visible
 *
 * Usage:
 *   bun run apps/riftbound-app/scripts/headless-manual.ts
 *   RIFTBOUND_ORIGIN=http://localhost:3000 bun run …  # default
 */
import puppeteer, { type Page } from "puppeteer-core";

const ORIGIN = process.env.RIFTBOUND_ORIGIN ?? "http://localhost:3000";
const SESSION = `manual-demo-${Date.now()}`;
const VIEWPORT = { height: 1400, width: 1400 } as const;
const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const URL = `${ORIGIN}/play/?session=${encodeURIComponent(SESSION)}&as=player-1`;

async function waitForPlayPage(page: Page): Promise<void> {
  await page
    .waitForSelector('[data-testid="play-page"]', { timeout: 10_000 })
    .catch((error) =>
      console.error("[wait] play-page selector wait failed:", (error as Error).message),
    );
  await new Promise((r) => setTimeout(r, 600));
}

async function snap(page: Page, file: string, label: string): Promise<void> {
  await page.screenshot({
    fullPage: true,
    path: file,
    quality: 80,
    type: "jpeg",
  });
  console.log(`[ok] ${label} → ${file}`);
}

async function spawnBirdToken(): Promise<string | undefined> {
  const url = `${ORIGIN}/api/v2/manual/spawn-token/${encodeURIComponent(SESSION)}`;
  const r = await fetch(url, {
    body: JSON.stringify({
      controller: "player-1",
      tokenSpec: { name: "Bird Token", might: 1 },
      zone: "base",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!r.ok) {throw new Error(`spawn-token failed: HTTP ${r.status}`);}
  const body = (await r.json()) as { ok: boolean; cardId?: string };
  if (!body.ok) {throw new Error("spawn-token returned ok=false");}
  return body.cardId;
}

const browser = await puppeteer.launch({
  defaultViewport: VIEWPORT,
  executablePath: CHROME_PATH,
  headless: true,
  protocolTimeout: 120_000,
});

let exitCode = 0;
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));

  await page.goto(URL, { timeout: 20_000, waitUntil: "domcontentloaded" });
  await waitForPlayPage(page);

  // Step 1: enable Manual mode via the top-nav button.
  await page.click('[data-testid="nav-manual"]');
  console.log("[step] Manual mode toggled ON");
  await new Promise((r) => setTimeout(r, 200));

  // Step 2: spawn a Bird Token via the manual API (the same call the
  // "Spawn Bird Token" context-menu item makes).
  const tokenId = await spawnBirdToken();
  console.log("[step] spawned token:", tokenId);
  await new Promise((r) => setTimeout(r, 600));
  await snap(page, "/tmp/manual-mode-board.jpg", "board with token");

  // Step 3: right-click the token to open the context menu. We dispatch a
  // Synthetic `contextmenu` event on the DOM element carrying the matching
  // `data-card-id` (Puppeteer's page.click doesn't support button: "right"
  // Reliably across versions, and we want a precise cursor anchor).
  if (tokenId) {
    await page.evaluate((id) => {
      const el = document.querySelector(`[data-card-id="${id}"]`) as
        | HTMLElement
        | null;
      if (!el) {throw new Error(`no DOM element for card ${id}`);}
      const rect = el.getBoundingClientRect();
      el.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          button: 2,
          cancelable: true,
          clientX: rect.left + 8,
          clientY: rect.top + 8,
        }),
      );
    }, tokenId);
    await new Promise((r) => setTimeout(r, 400));
    await snap(page, "/tmp/manual-mode-context-menu.jpg", "context menu");
  }
} catch (error) {
  console.error("[fatal]", error);
  exitCode = 1;
} finally {
  await browser.close();
}

process.exit(exitCode);
