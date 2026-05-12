import { homedir } from "node:os";
import { mkdirSync, readFileSync } from "node:fs";
const PW = `${homedir()}/code/tcg-engines/node_modules/.bun/playwright-core@1.58.0/node_modules/playwright-core/index.js`;
const EXEC = `${homedir()}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const { chromium } = (await import(PW)) as typeof import("playwright-core");
const OUT = `${homedir()}/code/tcg-engines/.ai_memory/parity-screenshots`;
mkdirSync(OUT, { recursive: true });
const W = 1600, H = 900;
const deck = readFileSync(`${homedir()}/code/tcg-engines/.ai_memory/parity-decklists-riftatlas.txt`, "utf8").trim();
const b = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await b.newContext({ viewport: { height: H, width: W } });
const page = await ctx.newPage();
async function shot(n: string) { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); }
async function bodyText() { return page.evaluate(() => document.body.textContent); }
async function clickByText(texts: string[], exact = false) {
  return page.evaluate(({ texts, exact }) => {
    const btns = [...document.querySelectorAll('button')] as HTMLButtonElement[];
    for (const t of texts) {
      const b = btns.find(b => { const it = (b.textContent||"").trim().toUpperCase(); return exact ? it === t.toUpperCase() : it.includes(t.toUpperCase()); });
      if (b && !b.disabled) { b.click(); return t; }
    }
    return null;
  }, { exact, texts });
}
await page.goto("https://play.riftatlas.com/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await shot("riftatlas-tick4-00-home");
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
let reachedMatch = false;
for (let i = 0; i < 50; i++) {
  await page.waitForTimeout(1200);
  const txt = await bodyText();
  if (txt.includes("CHOOSE BATTLEFIELD")) {
    for (const [x, y] of [[W*0.5, H*0.55], [W*0.5, H*0.6], [W*0.32, H*0.55], [W*0.68, H*0.55]] as [number,number][]) {
      await page.mouse.click(x, y); await page.waitForTimeout(700);
      const t2 = await bodyText(); if (!t2.includes("CHOOSE BATTLEFIELD")) {break;}
      const c = await clickByText(["CONFIRM","CONTINUE","DONE","READY"]); if (c) { await page.waitForTimeout(1500); const t3 = await bodyText(); if (!t3.includes("CHOOSE BATTLEFIELD")) {break;} }
    }
    continue;
  }
  if (txt.includes("PLAY FIRST")) { const c = await clickByText(["PLAY FIRST"], true); if (c) { await page.waitForTimeout(2000); continue; } }
  if (/MULLIGAN|KEEP HAND/i.test(txt)) { const c = await clickByText(["KEEP HAND","KEEP YOUR HAND","KEEP"]); if (c) { await page.waitForTimeout(2000); continue; } }
  const c = await clickByText(["GO FIRST","ROLL","CONTINUE","READY","START GAME"]); if (c) { await page.waitForTimeout(1500); continue; }
  const inMatch = await page.evaluate(() => { const btns = [...document.querySelectorAll('button')] as HTMLButtonElement[]; const e = btns.find(b => (b.textContent||"").toUpperCase().includes("END TURN")); return Boolean(e && !e.disabled); });
  if (inMatch && !txt.includes("CHOOSE BATTLEFIELD")) { reachedMatch = true; break; }
}
await page.waitForTimeout(2000);
await shot(reachedMatch ? "riftatlas-tick4-30-turn1-main" : "riftatlas-tick4-30-stuck");
if (reachedMatch) {
  await shot("riftatlas-tick4-31-board");
  // Extract DOM geometry of player info / nameplate / rune pool
  const geo = await page.evaluate(() => {
    function info(sel: string) { const el = document.querySelector(sel) as HTMLElement|null; if (!el) {return null;} const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { bg: cs.backgroundColor, color: cs.color, font: cs.fontFamily, fontSize: cs.fontSize, h: Math.round(r.height), sel, w: Math.round(r.width), x: Math.round(r.x), y: Math.round(r.y) }; }
    // RA uses obfuscated class names; gather all elements near bottom-left and bottom-center
    const all = [...document.querySelectorAll('*')] as HTMLElement[];
    const candidates = all.filter(e => { const r = e.getBoundingClientRect(); return r.width > 20 && r.width < 400 && r.height > 14 && r.height < 200 && r.x < 250 && r.y > 650; }).map(e => { const r = e.getBoundingClientRect(); return { cls: e.className?.toString().slice(0,40), h: Math.round(r.height), tag: e.tagName, txt: e.innerText?.slice(0,30), w: Math.round(r.width), x: Math.round(r.x), y: Math.round(r.y) }; });
    return { bodyFont: getComputedStyle(document.body).fontFamily, candidates: candidates.slice(0, 30) };
  });
  await Bun.write(`${OUT}/riftatlas-tick4-geo.json`, JSON.stringify(geo, null, 2));
}
console.log("reachedMatch:", reachedMatch);
await b.close();
