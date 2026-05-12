import { homedir } from "node:os";
const PW = `${homedir()}/code/tcg-engines/node_modules/.bun/playwright-core@1.58.0/node_modules/playwright-core/index.js`;
const EXEC = `${homedir()}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const { chromium } = (await import(PW)) as typeof import("playwright-core");
const OUT = `${homedir()}/code/tcg-engines/.ai_memory/parity-screenshots`;

const b = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await b.newContext({ viewport: { height: 1400, width: 1600 } });
const page = await ctx.newPage();
await page.goto("https://play.riftatlas.com/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

// Find all elements containing "Goldfish"/"Solo"/etc anywhere in their text
const matches = await page.evaluate(() => {
  const out: any[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  while (walker.nextNode()) {
    const t = walker.currentNode.textContent?.trim() ?? "";
    if (/goldfish|solo|practice|sealed|sandbox/i.test(t)) {
      const el = walker.currentNode.parentElement as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        out.push({
          cls: el.className?.toString().slice(0, 100), h: Math.round(r.height), parentRole: el.parentElement?.getAttribute("role"),
          parentTag: el.parentElement?.tagName, tag: el.tagName, text: t.slice(0, 200), w: Math.round(r.width),
          x: Math.round(r.x), y: Math.round(r.y),
        });
      }
    }
  }
  return out;
});
console.log(JSON.stringify(matches, null, 2));

// Try clicking host room first to see lobby
await page.screenshot({ fullPage: true, path: `${OUT}/riftatlas-lobby-tall.png` });

await b.close();
