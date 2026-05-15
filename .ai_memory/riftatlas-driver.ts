/**
 * RiftAtlas driver — visits play.riftatlas.com, finds the goldfish path,
 * captures screenshots at equivalent checkpoints. No login needed.
 *
 * We use headed-ish Chromium with a real viewport so layout/scale matches what users see.
 */
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";

const PW = `${homedir()}/code/tcg-engines/node_modules/.bun/playwright-core@1.58.0/node_modules/playwright-core/index.js`;
const EXEC = `${homedir()}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const { chromium } = (await import(PW)) as typeof import("playwright-core");

const OUT = `${homedir()}/code/tcg-engines/.ai_memory/parity-screenshots`;
mkdirSync(OUT, { recursive: true });
const URL_BASE = "https://play.riftatlas.com";

const b = await chromium.launch({
  args: ["--disable-blink-features=AutomationControlled"],
  executablePath: EXEC,
  headless: true,
});
const ctx = await b.newContext({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.96 Safari/537.36",
  viewport: { width: 1600, height: 900 },
});
const page = await ctx.newPage();
page.on("console", (m) => console.log(`[pageconsole][${m.type()}] ${m.text().slice(0, 200)}`));
page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));

async function shot(name: string) {
  await page.screenshot({ fullPage: false, path: `${OUT}/${name}.png` });
  console.log("shot", name);
}
async function inv(name: string) {
  // Inventory the body for diagnostics: visible buttons, headers, structure
  const data = await page.evaluate(() => {
    const visText = (el: Element) => (el as HTMLElement).textContent?.trim().slice(0, 80) ?? "";
    const buttons = [...document.querySelectorAll('button, [role=button], a')].slice(0, 60).map((b, i) => ({
      cls: (b as HTMLElement).className?.toString().slice(0, 60) ?? "",
      i,
      tag: b.tagName,
      text: visText(b),
    }));
    const headers = [...document.querySelectorAll('h1,h2,h3')].slice(0, 20).map((h) => visText(h));
    return { bodyTextLen: document.body.innerText.length, buttons, headers, title: document.title, url: location.href };
  });
  await Bun.write(`${OUT}/${name}.json`, JSON.stringify(data, null, 2));
  console.log("inv", name, "->", data.headers.slice(0, 3).join(" | "));
  return data;
}

console.log("nav home");
await page.goto(URL_BASE + "/", { timeout: 30000, waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await shot("riftatlas-00-home"); await inv("riftatlas-00-home");

// Try /game
console.log("nav /game");
await page.goto(URL_BASE + "/game", { timeout: 30000, waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await shot("riftatlas-01-game"); const gameInv = await inv("riftatlas-01-game");

// Look for goldfish / solo / practice button
const candidates = ["Goldfish", "Solo", "Practice", "Sandbox", "Single Player"];
for (const cand of candidates) {
  const loc = page.locator(`text=/${cand}/i`).first();
  const cnt = await loc.count();
  if (cnt) {
    console.log(`found candidate: ${cand}, count=${cnt}`);
  }
}

await b.close();
console.log("done");
