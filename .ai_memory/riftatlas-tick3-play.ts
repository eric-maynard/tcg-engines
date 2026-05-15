/**
 * Tick2 RiftAtlas driver — crack the Choose-Battlefield canvas pick.
 * Strategy: the battlefield overlay shows 3 cards roughly at 30%/50%/70% width, ~58% height.
 * Use real page.mouse.click at those coords (canvas-aware), then poll for confirm/next.
 * If we get past it, capture in-match: rune pool, hand, battlefields, log, chain.
 */
import { homedir } from "node:os";
import { mkdirSync, readFileSync } from "node:fs";

const PW = `${homedir()}/code/tcg-engines/node_modules/.bun/playwright-core@1.58.0/node_modules/playwright-core/index.js`;
const EXEC = `${homedir()}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const { chromium } = (await import(PW)) as typeof import("playwright-core");

const OUT = `${homedir()}/code/tcg-engines/.ai_memory/parity-screenshots`;
mkdirSync(OUT, { recursive: true });
const W = 1600, H = 900;

const b = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await b.newContext({ viewport: { height: H, width: W } });
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message.slice(0, 200)}`));

async function shot(name: string) { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("shot", name); }
async function bodyText(): Promise<string> { return page.evaluate(() => document.body.textContent); }
async function dump(name: string) {
  const d = await page.evaluate(() => ({
    bodySnip: document.body.innerText.slice(0, 1500),
    buttons: Array.from(document.querySelectorAll("button")).map(bt => ({ text: (bt as HTMLElement).innerText?.trim().slice(0,60), disabled: (bt as HTMLButtonElement).disabled })).filter(x => x.text),
    url: location.href,
  }));
  await Bun.write(`${OUT}/${name}.json`, JSON.stringify(d, null, 2));
}
async function clickByText(words: string[], exact = false): Promise<string|null> {
  return page.evaluate(({ words, exact }) => {
    const btns = [...document.querySelectorAll('button')] as HTMLButtonElement[];
    for (const t of words) {for (const b of btns) {
      const txt = (b.innerText||"").toUpperCase().trim();
      const ok = exact ? txt === t : txt.includes(t);
      if (ok && !b.disabled && b.offsetParent) { b.click(); return t; }
    }}
    return null;
  }, { exact, words });
}

const deck = readFileSync(`${homedir()}/code/tcg-engines/.ai_memory/parity-decklists-riftatlas.txt`, "utf8");

await page.goto("https://play.riftatlas.com/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await shot("riftatlas-tick3-00-home");

await page.locator('input[placeholder="Your name"]').fill("Tester").catch(()=>{});
await page.waitForTimeout(400);
await page.locator('button:has-text("IMPORT DECK")').first().click().catch(()=>{});
await page.waitForTimeout(1500);
await page.locator('textarea').first().fill(deck).catch(()=>{});
await page.waitForTimeout(2500);
await page.locator('button:has-text("IMPORT DECK"):not([disabled])').last().click({ force: true }).catch(()=>{});
await page.waitForTimeout(2500);

await page.locator('button:has-text("HOST ROOM")').first().click().catch(()=>{});
await page.waitForTimeout(4000);
await page.locator('button:has-text("SINGLE PLAYER")').first().click().catch(()=>{});
await page.waitForTimeout(1200);
await page.locator('button:has-text("START MATCH")').first().click({ force: true }).catch(()=>{});
await page.waitForTimeout(5000);
await page.locator('button:has-text("LOCK IN")').first().click({ force: true }).catch(()=>{});
await page.waitForTimeout(3000);

let bfShot = false, reachedMatch = false;
for (let i = 0; i < 50; i++) {
  await page.waitForTimeout(1200);
  const txt = await bodyText();

  if (txt.includes("CHOOSE BATTLEFIELD")) {
    if (!bfShot) { await shot("riftatlas-tick3-22-choose-bf"); await dump("riftatlas-tick3-22-choose-bf"); bfShot = true; }
    // Canvas-aware: click center card position. Cards ~ at 30/50/70% W, 58% H.
    const positions: [number, number][] = [[W*0.5, H*0.55], [W*0.5, H*0.6], [W*0.5, H*0.5], [W*0.32, H*0.55], [W*0.68, H*0.55]];
    for (const [x, y] of positions) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(700);
      const t2 = await bodyText();
      if (!t2.includes("CHOOSE BATTLEFIELD")) { console.log(`bf pick worked at ${x},${y}`); break; }
      // Maybe it selected; look for confirm
      const c = await clickByText(["CONFIRM","CONTINUE","DONE","READY","SELECT","CHOOSE","LOCK"]);
      if (c) { console.log(`confirm ${c}`); await page.waitForTimeout(1500); const t3 = await bodyText(); if (!t3.includes("CHOOSE BATTLEFIELD")) {break;} }
    }
    continue;
  }

  // Turn order
  if (txt.includes("PLAY FIRST")) {
    const c = await clickByText(["PLAY FIRST"], true);
    if (c) { console.log(`step ${i}: turn-order ${c}`); await page.waitForTimeout(2000); continue; }
  }

  // Mulligan — keep hand
  if (/MULLIGAN|KEEP HAND|KEEP YOUR HAND/i.test(txt)) {
    const c = await clickByText(["KEEP HAND","KEEP YOUR HAND","KEEP","NO MULLIGAN","DONE"]);
    if (c) { console.log(`mulligan ${c}`); await page.waitForTimeout(2000); continue; }
  }

  // Coin / first-second / roll / generic continue (NOT bare "OK" which spams)
  const c = await clickByText(["I'LL GO FIRST","GO FIRST","ROLL","CONTINUE","READY","FINISH","SUBMIT","START GAME"]);
  if (c) { console.log(`step ${i}: clicked ${c}`); await page.waitForTimeout(1500); continue; }

  // Are we in match? heuristic: END TURN button enabled, or "MAIN" phase text + non-pregame
  const inMatch = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')] as HTMLButtonElement[];
    const endTurn = btns.find(b => (b.textContent||"").toUpperCase().includes("END TURN"));
    return Boolean(endTurn && !endTurn.disabled);
  });
  if (inMatch && !txt.includes("CHOOSE BATTLEFIELD")) { reachedMatch = true; console.log(`step ${i}: REACHED MATCH`); break; }
}

await page.waitForTimeout(2000);
await shot(reachedMatch ? "riftatlas-tick3-30-turn1-main" : "riftatlas-tick3-30-stuck");
await dump(reachedMatch ? "riftatlas-tick3-30-turn1-main" : "riftatlas-tick3-30-stuck");

if (reachedMatch) {
  // Capture various in-match states
  await shot("riftatlas-tick3-31-board"); await dump("riftatlas-tick3-31-board");
  // Hover a hand card (bottom-center band) for preview
  await page.mouse.move(W*0.5, H*0.92); await page.waitForTimeout(1200);
  await shot("riftatlas-tick3-32-hand-hover");
  // Click DRAW (D key) to get a card, then screenshot
  await page.keyboard.press("d"); await page.waitForTimeout(1200);
  await shot("riftatlas-tick3-33-after-draw"); await dump("riftatlas-tick3-33-after-draw");
  // Click a hand card
  await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="hand"] [class*="card"], [class*="Hand"] [class*="card"]');
    if (cards.length) {(cards[cards.length-1] as HTMLElement).click();}
  });
  await page.mouse.click(W*0.5, H*0.9); // Also coordinate-click hand area
  await page.waitForTimeout(1500);
  await shot("riftatlas-tick3-34-hand-card-clicked"); await dump("riftatlas-tick3-34-hand-card-clicked");
  // Space to advance phase
  await page.keyboard.press("Space"); await page.waitForTimeout(1500);
  await shot("riftatlas-tick3-35-after-space");
  // Open chain panel (the ▾ button near "Chain")
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')] as HTMLButtonElement[];
    const b = btns.find(b => (b.textContent||"").trim() === "▾"); if (b) {b.click();}
  });
  await page.waitForTimeout(800);
  await shot("riftatlas-tick3-36-chain-panel");
  // Help modal — click the "i" button
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')] as HTMLButtonElement[];
    const b = btns.find(b => (b.textContent||"").trim().toLowerCase() === "i"); if (b) {b.click();}
  });
  await page.waitForTimeout(1200);
  await shot("riftatlas-tick3-37-help-modal");
}

console.log("reachedMatch:", reachedMatch, "errors:", errors.slice(0,5).join(" | "));
await b.close();
