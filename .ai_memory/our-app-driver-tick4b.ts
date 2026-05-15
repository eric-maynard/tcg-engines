/**
 * Simple driver for apps/riftbound-app goldfish mode.
 * Uses playwright-core@1.58 + the installed full chromium-1223 via executablePath.
 * Marches our app through pregame -> turn 1 -> first play -> end turn, screenshotting
 * each checkpoint to .ai_memory/parity-screenshots/ours-NN-<label>.png
 */
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";

const PW = `${homedir()}/code/tcg-engines/node_modules/.bun/playwright-core@1.58.0/node_modules/playwright-core/index.js`;
const EXEC = `${homedir()}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const { chromium } = (await import(PW)) as typeof import("playwright-core");

const OUT = `${homedir()}/code/tcg-engines/.ai_memory/parity-screenshots`;
mkdirSync(OUT, { recursive: true });
const URL = "http://localhost:3000/gameplay.html";

const b = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await b.newContext({ viewport: { height: 900, width: 1600 } });
const page = await ctx.newPage();
const logs: string[] = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.addScriptTag({
  content: `setInterval(() => { try {
    window.__gs = typeof gameState !== 'undefined' ? gameState : null;
    window.__vp = typeof viewingPlayer !== 'undefined' ? viewingPlayer : null;
  } catch(e){} }, 100);`,
});
await page.waitForTimeout(600);

async function shot(name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot", name);
}
async function dump(name: string) {
  const d = await page.evaluate(() => {
    const gs = (window as any).__gs;
    const q = (s: string) => {
      const el = document.querySelector(s) as HTMLElement | null;
      if (!el) {return { present: false };}
      const r = el.getBoundingClientRect();
      return { children: el.childElementCount, h: Math.round(r.height), htmlLen: el.innerHTML.length, present: true, vis: r.width > 0 && r.height > 0, w: Math.round(r.width) };
    };
    return {
      phase: gs?.turn?.phase, pregame: gs?.interaction?.pregame?.phase, regions: Object.fromEntries(["#phaseBar","#battlefieldRow","#opponent-hand","#opponent-runePool","#opponent-decks","#opponent-legendChampion","#opponent-base","#player-base","#resourceBar","#player-runePool","#player-hand","#player-decks","#player-legendChampion","#actionBar","#gameLog","#gameSidebar","#opponentInfo","#playerInfo","#sidebarHeader","#logEntries","#actionsList","#hover-preview"].map(s => [s, q(s)])),
      turnNum: gs?.turn?.number,
    };
  });
  await Bun.write(`${OUT}/${name}.json`, JSON.stringify(d, null, 2));
}

// C0 lobby
await shot("ours-tick4-10-lobby-after"); await dump("ours-tick4-00-lobby");

// Goldfish — sandboxOption is now itself the button
await page.locator('#sandboxOption').first().click();
await page.waitForTimeout(1500);
await page.selectOption("#deckSelect", "default").catch(()=>{});
await page.waitForTimeout(1000);
await page.waitForSelector("#lobbyStartBtn:not(.hidden)", { timeout: 8000 }).catch(()=>{});
await page.locator("#lobbyStartBtn").click().catch(()=>{});
await page.waitForTimeout(2500);

const dumped = new Set<string>();
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(500);
  const p = await page.evaluate(() => {
    const gs = (window as any).__gs;
    return { phase: gs?.turn?.phase, pregame: gs?.interaction?.pregame?.phase, ready: !!gs };
  });
  if (p.pregame === "battlefield_select" && !dumped.has("bf")) { await shot("ours-tick4-11-bf-select-after"); await dump("ours-tick4-01-battlefield-select"); dumped.add("bf"); }
  if (p.pregame === "mulligan" && !dumped.has("mull")) { await shot("ours-tick4-12-mulligan-after"); await dump("ours-tick4-02-mulligan"); dumped.add("mull"); }

  const coinBtn = page.locator("#coinChoose button").first();
  if ((await coinBtn.count()) && await coinBtn.isVisible().catch(()=>false)) { await coinBtn.click(); continue; }
  const bf = page.locator("#pregameContent .bf-choice").first();
  if ((await bf.count()) && await bf.isVisible().catch(()=>false)) { await bf.click(); await page.waitForTimeout(600); continue; }
  const keep = page.locator("button.mulligan-btn-keep");
  if ((await keep.count()) && await keep.first().isVisible().catch(()=>false)) { await keep.first().click(); continue; }
  if (p.ready && !p.pregame && p.phase) {break;}
}

await page.waitForTimeout(1000);
await shot("ours-tick4-13-turn1-main-after"); await dump("ours-tick4-03-turn1-main");

// Try to play first card in hand
const played = await page.evaluate(() => {
  const c = document.querySelector("#player-hand .card") as HTMLElement | null;
  if (!c) {return false;} c.click(); return true;
}).catch(()=>false);
if (played) { await page.waitForTimeout(1500); await shot("ours-tick4-14-after-play-after"); await dump("ours-tick4-04-after-first-play"); }

// End turn
const endTurn = page.locator('button:has-text("End Turn"), #endTurnBtn, [data-move="endTurn"]').first();
if ((await endTurn.count()) && await endTurn.isVisible().catch(()=>false)) {
  await endTurn.click(); await page.waitForTimeout(1500); await shot("ours-tick4-18-endphase-after"); await dump("ours-tick4-08-endphase");
}

await Bun.write(`${OUT}/ours-tick4-console.log`, logs.join("\n"));
await b.close();
console.log("done");
