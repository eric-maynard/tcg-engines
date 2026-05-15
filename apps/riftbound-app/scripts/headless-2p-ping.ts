#!/usr/bin/env bun
/**
 * Slice 5 (UX affordances) — two-browser ping verification.
 *
 * Verifies that a right-click on a hand chip in browser A triggers a
 * `ping-pulse` CSS class on the same chip in browser B, proving the
 * /api/v2/ping endpoint + SSE `ping` event fan-out works end-to-end.
 *
 * Frames written:
 *   /tmp/2p-ping-A.jpg   — Browser A immediately after triggering the ping.
 *   /tmp/2p-ping-B.jpg   — Browser B during the pulse animation.
 *   /tmp/2p-ping-combat.jpg — Combat panel screenshot showing smart assist.
 *
 * Run:
 *   bun run apps/riftbound-app/scripts/headless-2p-ping.ts
 */
import puppeteer, { type Page } from "puppeteer-core";

const ORIGIN = process.env.RIFTBOUND_ORIGIN ?? "http://localhost:3000";
const SESSION = `2p-ping-${Date.now()}`;
const VIEWPORT = { height: 1400, width: 1400 } as const;
const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const URL_A = `${ORIGIN}/play/?session=${encodeURIComponent(SESSION)}&as=player-1&realDecks=true`;
const URL_B = `${ORIGIN}/play/?session=${encodeURIComponent(SESSION)}&as=player-2&realDecks=true`;

async function waitForPlayPage(page: Page, label: string): Promise<void> {
  await page
    .waitForSelector('[data-testid="play-page"]', { timeout: 10_000 })
    .catch((error) =>
      console.error(`[${label}] play-page selector wait failed:`, (error as Error).message),
    );
  await new Promise((r) => setTimeout(r, 800));
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

async function seedMidCombat(): Promise<void> {
  const url = `${ORIGIN}/api/v2/scenario/mid-combat/${encodeURIComponent(SESSION)}`;
  const r = await fetch(url, {
    body: JSON.stringify({ playerId: "player-1" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!r.ok) {throw new Error(`seed mid-combat failed: HTTP ${r.status}`);}
}

const browser = await puppeteer.launch({
  defaultViewport: VIEWPORT,
  executablePath: CHROME_PATH,
  headless: true,
  protocolTimeout: 120_000,
});

let exitCode = 0;
try {
  // First, seed the session so both browsers have a populated board with
  // Active combat (so the smart-assist block has data to render).
  await seedMidCombat();

  const pageA = await browser.newPage();
  pageA.on("pageerror", (e) => console.error(`[A pageerror]`, e.message));
  const pageB = await browser.newPage();
  pageB.on("pageerror", (e) => console.error(`[B pageerror]`, e.message));

  await pageA.goto(URL_A, { timeout: 20_000, waitUntil: "domcontentloaded" });
  await waitForPlayPage(pageA, "A");
  await pageB.goto(URL_B, { timeout: 20_000, waitUntil: "domcontentloaded" });
  await waitForPlayPage(pageB, "B");

  // Find a hand chip on A — the first one with data-card-id will do.
  const targetCardId = await pageA.evaluate(() => {
    const el = document.querySelector(
      '[data-testid="hand-player-1"] [data-card-id]',
    ) as HTMLElement | null;
    return el?.getAttribute("data-card-id") ?? null;
  });

  if (!targetCardId) {
    console.warn("[A] no hand chip with data-card-id found — falling back to a BF unit");
  }

  const pingTargetId = targetCardId
    ?? (await pageA.evaluate(() => {
      const el = document.querySelector("[data-card-id]") as HTMLElement | null;
      return el?.getAttribute("data-card-id") ?? null;
    }));

  if (!pingTargetId) {
    throw new Error("[A] no element with data-card-id found anywhere — can't ping");
  }
  console.log(`[A] pinging card-id ${pingTargetId}`);

  // Hit the ping endpoint directly — replicates what the right-click
  // Handler would do and is more deterministic than synthesizing a
  // Contextmenu MouseEvent across the puppeteer/CDP boundary.
  const pingResp = await fetch(`${ORIGIN}/api/v2/ping/${encodeURIComponent(SESSION)}`, {
    body: JSON.stringify({
      playerId: "player-1",
      targetId: pingTargetId,
      targetType: "card",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  console.log(`[ping] HTTP ${pingResp.status}`);

  // Give SSE 500ms to deliver the ping event to B.
  await new Promise((r) => setTimeout(r, 500));

  // Verify B has the pulse class on the same id.
  const bHasPulse = await pageB.evaluate((id) => {
    const el = document.querySelector(`[data-card-id="${id}"]`);
    return el?.classList.contains("ping-pulse") ?? false;
  }, pingTargetId);
  console.log(`[B] ping-pulse class present on card ${pingTargetId}: ${bHasPulse}`);

  await snap(pageA, "/tmp/2p-ping-A.jpg", "A ping");
  await snap(pageB, "/tmp/2p-ping-B.jpg", "B ping");
  // Combat shot — single screenshot of A's view showing the assist block.
  await snap(pageA, "/tmp/2p-ping-combat.jpg", "A combat panel w/ smart assist");

  if (!bHasPulse) {
    console.error("[FAIL] B did not pick up the ping-pulse class — SSE ping channel broken");
    exitCode = 1;
  } else {
    console.log("[PASS] cross-browser ping pulse confirmed.");
  }
} catch (error) {
  console.error("[err]", (error as Error).message);
  exitCode = 1;
} finally {
  await browser.close();
}

process.exit(exitCode);
