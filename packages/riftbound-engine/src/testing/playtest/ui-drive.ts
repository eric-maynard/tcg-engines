import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/ui-shots";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
const p = await ctx.newPage();
p.on("console", (m) => console.log("[page]", m.type(), m.text()));
p.on("pageerror", (e) => console.log("[err]", e.message));

const shot = async (name: string) => {
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`→ ${name}.png`);
};

await p.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await shot("00-login");
await p.fill("#loginUser", "dev@riftbound.local");
await p.fill("#loginPass", "dev");
await p.click("#loginBtn");
await p.waitForTimeout(800);
await shot("01-after-login");

// Clear any stale lobby/session state so we always land on the fresh menu
await p.goto("http://localhost:3000/play", { waitUntil: "domcontentloaded" });
await p.evaluate(() => { localStorage.removeItem("rb_session"); localStorage.removeItem("rb_lobby"); sessionStorage.clear(); });
await p.goto("http://localhost:3000/play", { waitUntil: "networkidle" });
await shot("02-lobby");

await p.getByRole('button', { name: 'Goldfish', exact: true }).click();
await p.waitForTimeout(800);
await shot("03-goldfish-lobby");

// Select first deck from dropdown
await p.selectOption('select', { index: 1 });
await p.waitForTimeout(500);
await shot("04-deck-selected");

// Start game
await p.locator('button:visible', { hasText: 'Start Game' }).click();
// Wait for turn-order choice buttons (roll animation ~1.5s)
await p.waitForSelector('#coinChoose[style*="block"], #coinChoose:not([style*="none"]), .coin-choose-btn:visible', { state: 'visible', timeout: 15000 });
await shot("05a-turn-order");
await p.click('.coin-choose-btn'); // "I'll go first"
// coin overlay dismisses via a 1.5s setTimeout, then game WS connects and pregame renders
await p.waitForSelector('#coinOverlay:not(.visible)', { timeout: 8000 }).catch(() => {});
await p.waitForSelector('#pregameOverlay.visible, .mulligan-hand, #player-hand .card', { timeout: 10000 }).catch(() => {});
await shot("05b-after-choose-first");

// Drive pregame: bf select → mulligan → board
for (let i = 0; i < 12; i++) {
  const overlayVisible = await p.$('#pregameOverlay.visible, #coinOverlay.visible');
  if (!overlayVisible) break;
  const keep = await p.$('.mulligan-btn-keep, button:has-text("Keep")');
  if (keep) {
    const card = await p.$(".mulligan-hand .card");
    if (card) { await card.hover(); await p.waitForTimeout(400); await shot("06b-mulligan-hover"); }
    await keep.click(); await p.waitForTimeout(1500); await shot("06c-after-keep"); continue;
  }
  const bf = await p.$('.bf-choice:not(.selected)');
  if (bf) { await bf.click(); await p.waitForTimeout(800); continue; }
  const anyBtn = await p.$('#pregameOverlay button:not([disabled])');
  if (anyBtn) { await anyBtn.click(); await p.waitForTimeout(800); continue; }
  await p.waitForTimeout(600);
}
await p.waitForTimeout(1000);
await shot("07-board");

// Hover a hand card on the board
const hcard = await p.$("#player-hand .card, .hand-zone .card");
if (hcard) { await hcard.hover(); await p.waitForTimeout(400); await shot("08-hand-hover"); }

// Check the decks page too
await p.goto("http://localhost:3000/decks", { waitUntil: "networkidle" });
await shot("09-decks");

await b.close();
console.log("done → " + OUT);
