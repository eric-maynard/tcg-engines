/**
 * RiftAtlas: paste a deck directly into the lobby textarea, then HOST ROOM.
 * No login needed if paste-deck + host-room works anonymously.
 */
import { homedir } from "node:os";
import { mkdirSync, readFileSync } from "node:fs";

const PW = `${homedir()}/code/tcg-engines/node_modules/.bun/playwright-core@1.58.0/node_modules/playwright-core/index.js`;
const EXEC = `${homedir()}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const { chromium } = (await import(PW)) as typeof import("playwright-core");

const OUT = `${homedir()}/code/tcg-engines/.ai_memory/parity-screenshots`;
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await b.newContext({ viewport: { height: 1100, width: 1600 } });
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") {errors.push(`[console.error] ${m.text().slice(0, 200)}`);} });

async function shot(name: string) { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("shot", name); }
async function inv(name: string) {
  const d = await page.evaluate(() => {
    const vt = (el: Element) => (el as HTMLElement).textContent?.trim().slice(0, 80) ?? "";
    return {
      bodyLen: document.body.innerText.length,
      buttons: Array.from(document.querySelectorAll("button")).map((bt, i) => ({
        i, text: vt(bt), disabled: (bt as HTMLButtonElement).disabled,
        cls: (bt as HTMLElement).className?.toString().slice(0, 50) ?? "",
      })).filter(x => x.text.length > 0).slice(0, 80),
      headers: Array.from(document.querySelectorAll("h1,h2,h3")).slice(0, 20).map(vt),
      inputs: Array.from(document.querySelectorAll("input,textarea")).map(i => ({
        tag: i.tagName, type: (i as HTMLInputElement).type, placeholder: (i as HTMLInputElement).placeholder, name: (i as HTMLInputElement).name,
      })),
      url: location.href,
    };
  });
  await Bun.write(`${OUT}/${name}.json`, JSON.stringify(d, null, 2));
}

await page.goto("https://play.riftatlas.com/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

// Fill the deck-paste textarea — convert our decklist into RiftAtlas's expected format.
// RiftAtlas import format: typically each line is "<count> <name>" with section headers like
// "Battlefields:" "Runes:". Try the raw cards-only block first.
const deckPath = `${homedir()}/code/tcg-engines/.ai_memory/parity-decklists.txt`;
const decktxt = readFileSync(deckPath, "utf8");
// Extract Deck 1 block from "Legend:" to end-of-tokens
const d1 = decktxt.split("DECK 1")[1]?.split("DECK 2")[0] ?? "";
console.log("deck block length:", d1.length);

const ta = page.locator('textarea').first();
if (await ta.count()) {
  await ta.click();
  await ta.fill(d1);
  await page.waitForTimeout(1500);
  console.log("filled textarea");
} else {
  console.log("no textarea found");
}
await shot("riftatlas-deck-pasted"); await inv("riftatlas-deck-pasted");

// Type a player name if there's a name input
const nameInp = page.locator('input[placeholder*="name" i], input[name*="name" i]').first();
if (await nameInp.count()) {
  await nameInp.fill("Tester");
  await page.waitForTimeout(500);
}

// Click HOST ROOM
const hostBtn = page.locator('button:has-text("HOST ROOM")').first();
const hostDisabled = await hostBtn.evaluate((b) => (b as HTMLButtonElement).disabled).catch(() => null);
console.log("host disabled?", hostDisabled);
if (!hostDisabled) {
  await hostBtn.click({ timeout: 8000 }).catch(error => console.log("hostroom err:", error.message));
  await page.waitForTimeout(5000);
  await shot("riftatlas-after-host"); await inv("riftatlas-after-host");
  await page.waitForTimeout(3000);
  await shot("riftatlas-after-host-2");
} else {
  console.log("HOST ROOM is disabled — likely needs valid deck or login");
}

console.log("errors:", errors.slice(0, 10).join("\n"));
await b.close();
