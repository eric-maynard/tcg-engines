/**
 * Final RiftAtlas driver: name → host → single-player → import valid deck → start → capture.
 */
import { homedir } from "node:os";
import { mkdirSync, readFileSync } from "node:fs";

const PW = `${homedir()}/code/tcg-engines/node_modules/.bun/playwright-core@1.58.0/node_modules/playwright-core/index.js`;
const EXEC = `${homedir()}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const { chromium } = (await import(PW)) as typeof import("playwright-core");

const OUT = `${homedir()}/code/tcg-engines/.ai_memory/parity-screenshots`;
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await b.newContext({ viewport: { height: 900, width: 1600 } });
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message.slice(0, 200)}`));

async function shot(name: string) { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("shot", name); }
async function dump(name: string) {
  const d = await page.evaluate(() => {
    const vt = (el: Element) => (el as HTMLElement).textContent?.trim().slice(0, 80) ?? "";
    return {
      url: location.href,
      bodySnip: document.body.textContent.slice(0, 500),
      headers: [...document.querySelectorAll('h1,h2,h3,h4')].slice(0, 30).map(vt),
      buttons: [...document.querySelectorAll('button')].map((bt) => ({
        disabled: (bt as HTMLButtonElement).disabled, text: vt(bt),
      })).filter(x => x.text.length > 0 && x.text.length < 60).slice(0, 100),
      // Game UI hunting
      regions: ((): any => {
        const sels: Record<string, string> = {
          base: '[class*="base"], [data-zone="base"]',
          battlefield: '[class*="battlefield"], [data-zone*="battle"]',
          card: '[class*="card"]',
          chain: '[class*="chain"]',
          handArea: '[class*="hand"], [data-zone="hand"]',
          log: '[class*="log"]',
          phase: '[class*="phase"]',
          rune: '[class*="rune"]',
          runePool: '[class*="rune-pool"], [class*="runePool"]',
          sidebar: '[class*="sidebar"], aside',
        };
        const out: any = {};
        for (const [k, sel] of Object.entries(sels)) {
          const els = document.querySelectorAll(sel);
          out[k] = { count: els.length };
        }
        return out;
      })(),
    };
  });
  await Bun.write(`${OUT}/${name}.json`, JSON.stringify(d, null, 2));
}

const deck = readFileSync(`${homedir()}/code/tcg-engines/.ai_memory/parity-decklists-riftatlas.txt`, "utf8");

await page.goto("https://play.riftatlas.com/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await shot("riftatlas-00-home");

// Fill name + import deck on the lobby BEFORE hosting (so deck is set before HOST)
await page.locator('input[placeholder="Your name"]').fill("Tester");
await page.waitForTimeout(500);

// Import deck on the LOBBY (not in-room) — same import flow
await page.locator('button:has-text("IMPORT DECK")').first().click();
await page.waitForTimeout(1500);
await shot("riftatlas-01-import-modal");
await page.locator('textarea').first().fill(deck);
await page.waitForTimeout(2500);
await shot("riftatlas-02-import-validated");

// Click the modal's IMPORT DECK (primary action)
const modalImport = page.locator('button:has-text("IMPORT DECK"):not([disabled])').last();
if (await modalImport.count()) {
  await modalImport.click({ force: true });
  console.log("clicked modal IMPORT DECK");
  await page.waitForTimeout(2500);
}
await shot("riftatlas-03-after-import"); await dump("riftatlas-03-after-import");

// Now HOST ROOM
const hostBtn = page.locator('button:has-text("HOST ROOM")').first();
const hostDis = await hostBtn.evaluate(b => (b as HTMLButtonElement).disabled).catch(() => true);
console.log("HOST disabled after import?", hostDis);
if (!hostDis) {
  await hostBtn.click();
  await page.waitForTimeout(4000);
  await shot("riftatlas-10-room"); await dump("riftatlas-10-room");

  // SINGLE PLAYER mode
  await page.locator('button:has-text("SINGLE PLAYER")').first().click().catch(()=>{});
  await page.waitForTimeout(1200);
  await shot("riftatlas-11-single-player");

  // START MATCH
  const startBtn = page.locator('button:has-text("START MATCH")').first();
  const stDis = await startBtn.evaluate(b => (b as HTMLButtonElement).disabled).catch(() => true);
  console.log("START disabled?", stDis);
  if (!stDis) {
    await startBtn.click();
    await page.waitForTimeout(5000);
    await shot("riftatlas-20-match-loading"); await dump("riftatlas-20-match-loading");

    // First: lock in sideboard/champion selection
    await page.locator('button:has-text("LOCK IN")').first().click({ force: true }).catch(() => console.log("no LOCK IN"));
    await page.waitForTimeout(3000);
    await shot("riftatlas-20b-locked-in");

    // Pregame loop — auto-click action buttons to advance through dice/battlefield-select/mulligan
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1500);
      const clicked = await page.evaluate(() => {
        const want = ["ROLL", "CONTINUE", "CONFIRM", "ACCEPT", "KEEP", "READY", "DONE", "I'LL GO FIRST", "GO FIRST", "SUBMIT", "FINISH", "LOCK IN", "START"];
        const btns = [...document.querySelectorAll('button')] as HTMLButtonElement[];
        for (const t of want) {
          for (const b of btns) {
            if (!b.disabled && b.offsetParent && b.textContent?.toUpperCase().includes(t)) {
              b.click(); return t;
            }
          }
        }
        return null;
      });
      if (clicked) {console.log(`step ${i}: clicked`, clicked);}
      if (i === 2) { await shot("riftatlas-21-pregame-dice"); }
      if (i === 6) { await shot("riftatlas-22-pregame-battlefield"); await dump("riftatlas-22-pregame-battlefield"); }
      if (i === 12) { await shot("riftatlas-23-pregame-mulligan"); await dump("riftatlas-23-pregame-mulligan"); }
    }

    await page.waitForTimeout(2000);
    await shot("riftatlas-30-turn1-main"); await dump("riftatlas-30-turn1-main");

    // Try clicking a card in hand
    await page.evaluate(() => {
      const handCards = document.querySelectorAll('[class*="hand"] [class*="card"], [class*="Hand"] [class*="Card"]');
      if (handCards.length > 0) {(handCards[0] as HTMLElement).click();}
    });
    await page.waitForTimeout(1500);
    await shot("riftatlas-31-card-clicked"); await dump("riftatlas-31-card-clicked");

    // End turn / pass (Space hotkey)
    await page.keyboard.press("Space");
    await page.waitForTimeout(2000);
    await shot("riftatlas-32-after-space");

    // Open help modal to capture sidebar features
    await page.keyboard.press("?");
    await page.waitForTimeout(1500);
    await shot("riftatlas-33-help-modal");
  }
}

console.log("errors:", errors.slice(0, 10).join("\n"));
await b.close();
