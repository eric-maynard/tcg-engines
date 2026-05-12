/**
 * Tick1 RiftAtlas driver - push past battlefield-select to reach in-match.
 * Builds on riftatlas-play.ts but adds: click battlefield card, click mulligan keep,
 * and capture in-match screenshots.
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
      bodySnip: document.body.innerText.slice(0, 800),
      buttons: Array.from(document.querySelectorAll("button")).map((bt) => ({
        text: vt(bt), disabled: (bt as HTMLButtonElement).disabled,
      })).filter(x => x.text.length > 0 && x.text.length < 60).slice(0, 100),
      headers: Array.from(document.querySelectorAll("h1,h2,h3,h4")).slice(0, 30).map(vt),
      regions: ((): any => {
        const sels: Record<string, string> = {
          handArea: '[class*="hand"], [data-zone="hand"]',
          battlefield: '[class*="battlefield"], [data-zone*="battle"]',
          rune: '[class*="rune"]',
          runePool: '[class*="rune-pool"], [class*="runePool"]',
          log: '[class*="log"]',
          card: '[class*="card"]',
          base: '[class*="base"], [data-zone="base"]',
          phase: '[class*="phase"]',
          chain: '[class*="chain"]',
          sidebar: '[class*="sidebar"], aside',
          chooseBattlefield: 'text=CHOOSE BATTLEFIELD',
        };
        const out: any = {};
        for (const [k, sel] of Object.entries(sels)) {
          try { out[k] = { count: document.querySelectorAll(sel).length }; } catch { out[k] = { count: 0 }; }
        }
        return out;
      })(),
      url: location.href,
    };
  });
  await Bun.write(`${OUT}/${name}.json`, JSON.stringify(d, null, 2));
}

const deck = readFileSync(`${homedir()}/code/tcg-engines/.ai_memory/parity-decklists-riftatlas.txt`, "utf8");

await page.goto("https://play.riftatlas.com/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await shot("riftatlas-tick1-00-home");

await page.locator('input[placeholder="Your name"]').fill("Tester");
await page.waitForTimeout(500);

await page.locator('button:has-text("IMPORT DECK")').first().click();
await page.waitForTimeout(1500);
await page.locator('textarea').first().fill(deck);
await page.waitForTimeout(2500);

const modalImport = page.locator('button:has-text("IMPORT DECK"):not([disabled])').last();
if (await modalImport.count()) {
  await modalImport.click({ force: true });
  await page.waitForTimeout(2500);
}

const hostBtn = page.locator('button:has-text("HOST ROOM")').first();
if (!(await hostBtn.evaluate(b => (b as HTMLButtonElement).disabled).catch(() => true))) {
  await hostBtn.click();
  await page.waitForTimeout(4000);

  await page.locator('button:has-text("SINGLE PLAYER")').first().click().catch(()=>{});
  await page.waitForTimeout(1200);

  const startBtn = page.locator('button:has-text("START MATCH")').first();
  if (!(await startBtn.evaluate(b => (b as HTMLButtonElement).disabled).catch(() => true))) {
    await startBtn.click();
    await page.waitForTimeout(5000);

    await page.locator('button:has-text("LOCK IN")').first().click({ force: true }).catch(() => console.log("no LOCK IN"));
    await page.waitForTimeout(3000);

    // Pregame loop with battlefield-select handling
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(1500);

      // If we see "CHOOSE BATTLEFIELD" overlay text, click one of the battlefield cards
      const onBattlefield = await page.evaluate(() => document.body.innerText.includes("CHOOSE BATTLEFIELD"));

      if (onBattlefield) {
        console.log(`step ${i}: on CHOOSE BATTLEFIELD, attempting card click`);
        if (i === 2) { await shot("riftatlas-tick1-22-pregame-battlefield"); await dump("riftatlas-tick1-22-pregame-battlefield"); }

        // Strategy 1: Click on visible battlefield card elements. The selection cards
        // In the overlay are likely positioned in the center area.
        const clickInfo = await page.evaluate(() => {
          // Find elements that look like clickable battlefield cards in the choose overlay.
          // Filter: elements with images/backgrounds, sized like cards (200x300ish), positioned
          // In the center vertical band of the page.
          const W = window.innerWidth, H = window.innerHeight;
          const all = [...document.querySelectorAll('*')] as HTMLElement[];
          const candidates = all
            .map(el => ({ el, r: el.getBoundingClientRect() }))
            .filter(({ r }) =>
              r.width > 150 && r.width < 350 &&
              r.height > 200 && r.height < 500 &&
              r.top > 100 && r.top < H * 0.7 &&
              r.left > 100 && r.right < W - 100
            )
            // Prefer those with background-image or img child
            .filter(({ el }) => {
              const cs = getComputedStyle(el);
              return cs.backgroundImage !== 'none' || el.querySelector('img');
            });
          // Sort by horizontal position; take 3 distinct columns
          candidates.sort((a, b) => a.r.left - b.r.left);
          const picked = candidates[0];
          if (!picked) {
            return { count: candidates.length, ok: false, sample: null };
          }
          picked.el.click();
          // Also dispatch a mousedown/up for canvas-based handlers
          const {r} = picked;
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          ['mousedown','mouseup','click'].forEach(t => {
            picked.el.dispatchEvent(new MouseEvent(t, { bubbles: true, button: 0, clientX: cx, clientY: cy }));
          });
          return { count: candidates.length, ok: true, sample: { tag: picked.el.tagName, cls: picked.el.className?.slice?.(0,80), w: r.width, h: r.height, top: r.top, left: r.left } };
        });
        console.log(`step ${i}: battlefield click result:`, JSON.stringify(clickInfo));

        // Strategy 2: also try coordinate click on the center battlefield position
        // (based on screenshot: roughly x=800, y=400 with 1600x900 viewport)
        if (!clickInfo.ok) {
          await page.mouse.click(800, 400);
          console.log(`step ${i}: fallback coordinate click at 800,400`);
        }
        await page.waitForTimeout(1500);

        // After click, look for a CONFIRM/CONTINUE/DONE
        const confirmed = await page.evaluate(() => {
          const want = ["CONFIRM", "CONTINUE", "DONE", "READY", "ACCEPT", "OK", "SELECT"];
          const btns = [...document.querySelectorAll('button')] as HTMLButtonElement[];
          for (const t of want) {
            for (const b of btns) {
              if (!b.disabled && b.offsetParent && b.textContent?.toUpperCase().includes(t)) { b.click(); return t; }
            }
          }
          return null;
        });
        console.log(`step ${i}: confirm clicked:`, confirmed);
        if (confirmed) {await page.waitForTimeout(2000);}
      }

      // Mulligan keep
      const mullKeep = await page.evaluate(() => {
        const want = ["KEEP", "MULLIGAN"];
        const btns = [...document.querySelectorAll('button')] as HTMLButtonElement[];
        for (const t of want) {
          for (const b of btns) {
            if (!b.disabled && b.offsetParent && b.textContent?.toUpperCase().trim() === t) { b.click(); return t; }
          }
        }
        return null;
      });
      if (mullKeep) {
        console.log(`step ${i}: mulligan ${mullKeep}`);
        if (mullKeep === "KEEP" && i < 30) { await shot("riftatlas-tick1-23-pregame-mulligan"); await dump("riftatlas-tick1-23-pregame-mulligan"); }
      }

      // General confirm/continue buttons
      const clicked = await page.evaluate(() => {
        const want = ["I'LL GO FIRST", "GO FIRST", "GO SECOND", "ROLL", "CONTINUE", "READY", "DONE", "SUBMIT", "FINISH", "START", "CONFIRM"];
        const btns = [...document.querySelectorAll('button')] as HTMLButtonElement[];
        for (const t of want) {
          for (const b of btns) {
            if (!b.disabled && b.offsetParent && b.textContent?.toUpperCase().includes(t)) { b.click(); return t; }
          }
        }
        return null;
      });
      if (clicked) {console.log(`step ${i}: clicked`, clicked);}
    }

    await page.waitForTimeout(2000);
    await shot("riftatlas-tick1-30-turn1-main"); await dump("riftatlas-tick1-30-turn1-main");

    // Try clicking a card in hand
    await page.evaluate(() => {
      // Search for hand-area cards distinctly
      const cards = document.querySelectorAll('[class*="hand"] [class*="card"]');
      if (cards.length > 0) {(cards[cards.length - 1] as HTMLElement).click();}
    });
    await page.waitForTimeout(1500);
    await shot("riftatlas-tick1-31-card-clicked"); await dump("riftatlas-tick1-31-card-clicked");

    // Space to advance phase
    await page.keyboard.press("Space");
    await page.waitForTimeout(1500);
    await shot("riftatlas-tick1-32-after-space");

    // Take a few more shots advancing turns
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Space");
      await page.waitForTimeout(1200);
    }
    await shot("riftatlas-tick1-40-turn2-area");
    await dump("riftatlas-tick1-40-turn2-area");

    // Help modal
    await page.keyboard.press("?");
    await page.waitForTimeout(1500);
    await shot("riftatlas-tick1-50-help-modal");
  }
}

console.log("errors:", errors.slice(0, 10).join("\n"));
await b.close();
