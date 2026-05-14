#!/usr/bin/env bun
/**
 * Slice 2 e2e — 2-browser lobby flow.
 *
 * Scenario:
 *   - Browser A (host) opens /play/lobby/, clicks Create Room → /play/lobby/<code>
 *   - Browser B (guest) opens /play/lobby/, types the code, clicks Join → same /lobby/<code>
 *   - Both pick decks via the per-row deck-select
 *   - A clicks "Start Game" → both browsers redirect to /play/?session=<id>&as=...
 *
 * Frames written:
 *   /tmp/lobby-A-empty.jpg     Browser A on /lobby/ before clicking Create
 *   /tmp/lobby-A-room.jpg      Browser A inside the room (waiting on guest)
 *   /tmp/lobby-B-room.jpg      Browser B inside the same room after joining
 *   /tmp/lobby-A-play.jpg      Browser A on /play/ after Start
 *   /tmp/lobby-B-play.jpg      Browser B on /play/ after Start
 *
 * Exit non-zero on any failure. Prerequisites: dev server running at $RIFTBOUND_ORIGIN
 * (default http://localhost:3000), with DEFAULT_USERNAME/DEFAULT_PASSWORD env set so
 * we can auto-create two accounts for the test.
 */
import puppeteer, { type Browser, type Page } from "puppeteer-core";

const ORIGIN = process.env.RIFTBOUND_ORIGIN ?? "http://localhost:3000";
const VIEWPORT = { height: 900, width: 1280 } as const;
const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function snap(page: Page, file: string, label: string): Promise<void> {
  await page.screenshot({ fullPage: true, path: file, quality: 80, type: "jpeg" });
  console.log(`[ok] ${label} → ${file}`);
}

/** Register a brand-new test account in the given browser context. */
async function registerInBrowser(browser: Browser, username: string): Promise<{ page: Page; userId: string; deckId: string }> {
  const page = await browser.newPage();
  page.on("console", (m) => console.error(`[${username} console]`, m.type(), m.text()));
  page.on("pageerror", (e) => console.error(`[${username} pageerror]`, e.message));

  // Need an origin for relative fetch() to resolve — load the app first.
  await page.goto(`${ORIGIN}/play/`, { timeout: 20_000, waitUntil: "domcontentloaded" });

  // Register a fresh user. The auth API sets a Set-Cookie that puppeteer
  // Tracks per-context.
  const registerResp = await page.evaluate(async (u: string) => {
    const r = await fetch("/api/auth/register", {
      body: JSON.stringify({ password: "test1234", username: u }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    return { body: (await r.json()) as { user?: { id: string } }, ok: r.ok };
  }, username);
  if (!registerResp.ok || !registerResp.body.user) {
    throw new Error(`register failed for ${username}: ${JSON.stringify(registerResp.body)}`);
  }
  const userId = registerResp.body.user.id;

  // Create a deck so the user can pick one in the room.
  const deckResp = await page.evaluate(async () => {
    const r = await fetch("/api/decks", {
      body: JSON.stringify({
        cards: [{ cardId: "ogn-046-094", quantity: 2, zone: "main" }],
        championId: "ogn-046-094",
        legendId: "ogn-001-001",
        name: "Test Deck",
      }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    return (await r.json()) as { id: string };
  });

  return { deckId: deckResp.id, page, userId };
}

const browser = await puppeteer.launch({
  args: ["--no-sandbox"],
  defaultViewport: VIEWPORT,
  executablePath: CHROME_PATH,
  headless: true,
  protocolTimeout: 120_000,
});

let exitCode = 0;
try {
  // Each player needs an isolated browser context (cookies don't leak).
  const ctxA = await browser.createBrowserContext();
  const ctxB = await browser.createBrowserContext();
  const ts = Date.now();

  const aliceUsername = `alice-e2e-${ts}`;
  const bobUsername = `bob-e2e-${ts}`;

  const aliceCtxBrowser = ctxA as unknown as Browser;
  const bobCtxBrowser = ctxB as unknown as Browser;

  const alice = await registerInBrowser(aliceCtxBrowser, aliceUsername);
  const bob = await registerInBrowser(bobCtxBrowser, bobUsername);

  // --- A opens lobby
  await alice.page.goto(`${ORIGIN}/play/lobby/`, { timeout: 20_000, waitUntil: "domcontentloaded" });
  await alice.page.waitForSelector('[data-testid="lobby-page"]', { timeout: 10_000 });
  await snap(alice.page, "/tmp/lobby-A-empty.jpg", "A empty lobby");

  // Click Create Room → URL becomes /play/lobby/<code>.
  await alice.page.click('[data-testid="lobby-create-button"]');
  await alice.page.waitForSelector('[data-testid="room-page"]', { timeout: 10_000 });
  const code = await alice.page.$eval(
    '[data-testid="room-code"]',
    (el) => (el.textContent ?? "").trim(),
  );
  if (!/^[A-Z2-9]{6}$/.test(code)) {throw new Error(`bad code: ${code}`);}
  console.log(`[A] room code = ${code}`);
  await snap(alice.page, "/tmp/lobby-A-room.jpg", "A room (waiting)");

  // --- B joins via the lobby join-flow
  await bob.page.goto(`${ORIGIN}/play/lobby/`, { timeout: 20_000, waitUntil: "domcontentloaded" });
  await bob.page.waitForSelector('[data-testid="lobby-page"]', { timeout: 10_000 });
  await bob.page.type('[data-testid="lobby-join-input"]', code);
  await bob.page.click('[data-testid="lobby-join-button"]');
  await bob.page.waitForSelector('[data-testid="room-page"]', { timeout: 10_000 });
  // Wait for B to render the room.
  await bob.page.waitForSelector('[data-testid="room-guest-name"]', { timeout: 5000 });

  // --- Both pick decks
  await alice.page.waitForSelector('[data-testid="room-host-deck-select"]', { timeout: 5000 });
  await alice.page.select('[data-testid="room-host-deck-select"]', alice.deckId);
  await bob.page.waitForSelector('[data-testid="room-guest-deck-select"]', { timeout: 5000 });
  await bob.page.select('[data-testid="room-guest-deck-select"]', bob.deckId);

  // Give the SSE push (or 2s polling fallback) time to propagate.
  await new Promise((r) => setTimeout(r, 2500));

  await snap(alice.page, "/tmp/lobby-A-room.jpg", "A room (after picks)");
  await snap(bob.page, "/tmp/lobby-B-room.jpg", "B room (after picks)");

  // --- A clicks Start Game
  await alice.page.waitForFunction(
    () => {
      const btn = document.querySelector('[data-testid="room-start-button"]') as HTMLButtonElement | null;
      return Boolean(btn) && !btn?.disabled;
    },
    { timeout: 5000 },
  );
  await alice.page.click('[data-testid="room-start-button"]');

  // Both should redirect to /play/?session=<id>&as=player-1|2 via the
  // Auto-redirect effect in RoomPage.
  await alice.page.waitForFunction(
    () => window.location.pathname === "/play/" && window.location.search.includes("session="),
    { timeout: 10_000 },
  );
  await bob.page.waitForFunction(
    () => window.location.pathname === "/play/" && window.location.search.includes("session="),
    { timeout: 10_000 },
  );

  const aUrl = alice.page.url();
  const bUrl = bob.page.url();
  console.log(`[A] redirected to ${aUrl}`);
  console.log(`[B] redirected to ${bUrl}`);

  const aSession = new URL(aUrl).searchParams.get("session");
  const bSession = new URL(bUrl).searchParams.get("session");
  if (!aSession || !bSession || aSession !== bSession) {
    throw new Error(`session id mismatch: A=${aSession}, B=${bSession}`);
  }
  const aAs = new URL(aUrl).searchParams.get("as");
  const bAs = new URL(bUrl).searchParams.get("as");
  if (aAs !== "player-1" || bAs !== "player-2") {
    throw new Error(`bad seats: A=${aAs}, B=${bAs}`);
  }
  console.log(`[PASS] both browsers share session=${aSession} with correct seats`);

  await snap(alice.page, "/tmp/lobby-A-play.jpg", "A on /play");
  await snap(bob.page, "/tmp/lobby-B-play.jpg", "B on /play");
} catch (error) {
  console.error("[err]", (error as Error).message);
  console.error((error as Error).stack);
  exitCode = 1;
} finally {
  await browser.close();
}

process.exit(exitCode);
