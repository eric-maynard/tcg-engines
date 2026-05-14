#!/usr/bin/env bun
/**
 * Two-browser end-to-end test for the Riftbound Play SPA.
 *
 * Verifies that two browsers viewing the SAME session id but with different
 * `?as=` seats see each other's moves live via the new /api/v2/stream SSE
 * Push. Drives the sabotage scenario because it's the most visually
 * Distinctive cross-player effect — A clicks Sabotage, picks Opponent, the
 * Server transitions to pendingChoice (reveal-and-pick), and B's view
 * Updates without any refresh on B's tab.
 *
 * Frames written:
 *   /tmp/2p-A-precast.jpg   — Browser A (player-1 seat) at precast.
 *   /tmp/2p-B-precast.jpg   — Browser B (player-2 seat) — opponent face-down.
 *   /tmp/2p-A-after.jpg     — Browser A after the cast + pick (hand smaller).
 *   /tmp/2p-B-after.jpg     — Browser B AFTER the same move (live-updated).
 *
 * Run:
 *   bun run apps/riftbound-app/scripts/headless-2p.ts
 *
 * Exit non-zero if the live-sync assertion fails.
 */
import puppeteer, { type Page } from "puppeteer-core";

const ORIGIN = process.env.RIFTBOUND_ORIGIN ?? "http://localhost:3000";
const SESSION = `2p-shot-${Date.now()}`;
const VIEWPORT = { height: 1400, width: 1400 } as const;
const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const URL_A = `${ORIGIN}/play/?session=${encodeURIComponent(SESSION)}&as=player-1&realDecks=true`;
const URL_B = `${ORIGIN}/play/?session=${encodeURIComponent(SESSION)}&as=player-2&realDecks=true`;

async function seedSabotage(): Promise<void> {
  const url = `${ORIGIN}/api/v2/scenario/sabotage/${encodeURIComponent(SESSION)}`;
  const r = await fetch(url, {
    body: JSON.stringify({ playerId: "player-1", step: "precast" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!r.ok) {throw new Error(`seed precast failed: HTTP ${r.status}`);}
  const body = (await r.json()) as {
    ok?: boolean;
    seed?: { seeded?: boolean };
  };
  if (!body.ok || !body.seed?.seeded) {
    throw new Error(`seed reported not-seeded: ${JSON.stringify(body)}`);
  }
}

async function waitForPlayPage(page: Page, label: string): Promise<void> {
  await page
    .waitForSelector('[data-testid="play-page"]', { timeout: 10_000 })
    .catch((error) =>
      console.error(`[${label}] play-page selector wait failed:`, (error as Error).message),
    );
  // Give SSE + React a beat to settle.
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

const browser = await puppeteer.launch({
  defaultViewport: VIEWPORT,
  executablePath: CHROME_PATH,
  headless: true,
});

let exitCode = 0;
try {
  await seedSabotage();

  const pageA = await browser.newPage();
  pageA.on("console", (m) =>
    console.error(`[A console]`, m.type(), m.text()),
  );
  pageA.on("pageerror", (e) =>
    console.error(`[A pageerror]`, e.message),
  );
  const pageB = await browser.newPage();
  pageB.on("console", (m) =>
    console.error(`[B console]`, m.type(), m.text()),
  );
  pageB.on("pageerror", (e) =>
    console.error(`[B pageerror]`, e.message),
  );

  await pageA.goto(URL_A, { timeout: 20_000, waitUntil: "networkidle2" });
  await waitForPlayPage(pageA, "A");
  await pageB.goto(URL_B, { timeout: 20_000, waitUntil: "networkidle2" });
  await waitForPlayPage(pageB, "B");

  await snap(pageA, "/tmp/2p-A-precast.jpg", "A precast");
  await snap(pageB, "/tmp/2p-B-precast.jpg", "B precast");

  // Snapshot B's hand-back chip count BEFORE A's move. After A casts
  // Sabotage and picks a card from the revealed hand, B's hand size (and
  // The count of opponent-perspective face-down chips on A's view) should
  // Decrease by 1.
  // From player-2's perspective in browser B: B's *own* hand is the
  // Revealed (data-reveal=true) hand for `player-2`. The seeded scenario
  // Puts the sabotage TARGET (a spell card) in player-2's hand. We count
  // The non-back chips in B's hand for `player-2` and assert it drops
  // After the move.
  const handBChipsBefore = await pageB.$$eval(
    '[data-testid="hand-player-2"] .hand-chip',
    (els) => els.length,
  );
  console.log(`[B] pre-move hand chip count = ${handBChipsBefore}`);

  // --- Drive the move on A ---
  // Click the Sabotage hand chip (stable instance id from seedSabotageState).
  const sabotageSelector =
    '[data-testid="hand-chip-sabotage-demo-player-1"]';
  await pageA
    .waitForSelector(sabotageSelector, { timeout: 5000 })
    .catch((error) =>
      console.error(`[A] sabotage chip not found:`, (error as Error).message),
    );
  await pageA.click(sabotageSelector);
  // Player-target picker should open. Click the Opponent button.
  await pageA
    .waitForSelector('[data-testid="target-picker"]', { timeout: 3000 })
    .catch((error) =>
      console.error(`[A] target-picker did not appear:`, (error as Error).message),
    );
  // The player picker exposes data-testid="target-picker-player-<id>" buttons.
  // Try a few selectors so we tolerate small wording drift.
  const opponentCandidates = [
    '[data-testid="target-option-player-opponent"]',
    '[data-testid="target-picker-player-player-2"]',
    '[data-testid="target-picker-opponent"]',
  ];
  let opponentClicked = false;
  for (const sel of opponentCandidates) {
    const found = await pageA.$(sel);
    if (found) {
      await pageA.click(sel);
      opponentClicked = true;
      console.log(`[A] clicked opponent via ${sel}`);
      break;
    }
  }
  if (!opponentClicked) {
    // Fallback: click a button whose text contains "Opponent".
    const handle = await pageA.evaluateHandle(() => {
      const btns = [...document.querySelectorAll('[data-testid="target-picker"] button')];
      return btns.find((b) =>
        /opponent/i.test((b as HTMLElement).textContent),
      ) ?? null;
    });
    const el = handle.asElement();
    if (el) {
      await (el as unknown as { click: () => Promise<void> }).click();
      opponentClicked = true;
      console.log(`[A] clicked opponent via text fallback`);
    }
  }
  if (!opponentClicked) {
    throw new Error("[A] failed to click Opponent in target picker");
  }

  // After the picker submits, the engine transitions to a reveal-and-pick
  // PendingChoice. The TARGET (player-2's hand) becomes face-up on A's view
  // For the prompter to pick. Wait for the revealed hand to appear, then
  // Click the first pickable revealed chip.
  await pageA.waitForFunction(
    () =>
      document.querySelector(
        '[data-testid="hand-player-2"][data-revealer="true"] .hand-chip-pickable',
      ) !== null,
    { timeout: 5000 },
  ).catch((error) =>
    console.error(`[A] pickable revealed chip wait failed:`, (error as Error).message),
  );
  await pageA.click(
    '[data-testid="hand-player-2"][data-revealer="true"] .hand-chip-pickable',
  );

  // Wait briefly for B to receive the SSE push.
  await new Promise((r) => setTimeout(r, 1500));

  await snap(pageA, "/tmp/2p-A-after.jpg", "A after");
  await snap(pageB, "/tmp/2p-B-after.jpg", "B after");

  // Assert: B's view live-updated. We DID NOT call any reload on pageB.
  const handBChipsAfter = await pageB.$$eval(
    '[data-testid="hand-player-2"] .hand-chip',
    (els) => els.length,
  );
  console.log(`[B] post-move hand chip count = ${handBChipsAfter}`);

  if (handBChipsAfter >= handBChipsBefore) {
    console.error(
      `[FAIL] B's hand did not shrink after A's move (before=${handBChipsBefore}, after=${handBChipsAfter}). SSE live-sync regression?`,
    );
    exitCode = 1;
  } else {
    console.log(
      `[PASS] B's hand shrank (${handBChipsBefore} → ${handBChipsAfter}) without refresh — SSE live-sync OK.`,
    );
  }

  // Bonus assertion: B should currently show the "Waiting for opponent…"
  // Banner since player-1 is active for the whole sabotage flow.
  const waitingBannerB = await pageB.$('[data-testid="waiting-banner"]');
  if (waitingBannerB) {
    console.log(`[PASS] B shows waiting banner (input gating active).`);
  } else {
    console.warn(`[warn] B did NOT show waiting-banner — input gating may be off.`);
  }
} catch (error) {
  console.error("[err]", (error as Error).message);
  exitCode = 1;
} finally {
  await browser.close();
}

process.exit(exitCode);
