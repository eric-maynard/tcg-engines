import { homedir } from "node:os";
const PW = `${homedir()}/code/tcg-engines/node_modules/.bun/playwright-core@1.58.0/node_modules/playwright-core/index.js`;
const EXEC = `${homedir()}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const { chromium } = (await import(PW)) as typeof import("playwright-core");
const OUT = `${homedir()}/code/tcg-engines/.ai_memory/parity-screenshots`;
const b = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await b.newContext({ viewport: { height: 900, width: 1600 } });
const page = await ctx.newPage();
page.on("pageerror", e=>console.log("[pageerr]", e.message));
await page.goto("http://localhost:3000/gameplay.html", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);
await page.locator('#sandboxOption').first().click();
await page.waitForTimeout(1500);
await page.selectOption("#deckSelect", "default").catch(()=>{});
await page.waitForTimeout(1000);
await page.waitForSelector("#lobbyStartBtn:not(.hidden)", { timeout: 8000 }).catch(()=>{});
await page.locator("#lobbyStartBtn").click().catch(()=>{});
await page.waitForTimeout(2500);
for (let i=0;i<60;i++){
  await page.waitForTimeout(400);
  const coin = page.locator("#coinChoose button").first();
  if ((await coin.count()) && await coin.isVisible().catch(()=>false)) { await coin.click(); continue; }
  const bf = page.locator("#pregameContent .bf-choice").first();
  if ((await bf.count()) && await bf.isVisible().catch(()=>false)) { await bf.click(); await page.waitForTimeout(500); continue; }
  const keep = page.locator("button.mulligan-btn-keep");
  if ((await keep.count()) && await keep.first().isVisible().catch(()=>false)) { await keep.first().click(); continue; }
  const p = await page.evaluate(()=>({ phase: (gameState as any)?.turn?.phase, pregame: (gameState as any)?.interaction?.pregame?.phase, ready: typeof gameState!=='undefined'&&!!gameState }));
  if (p.ready && !p.pregame && p.phase) {break;}
}
await page.waitForTimeout(1200);
// Lobby zoom — go back? just screenshot whole, then crop regions via clip
async function clip(name:string, sel:string){ const el = page.locator(sel).first(); if (await el.count()){ const box = await el.boundingBox(); if (box){ await page.screenshot({ clip:{ x:Math.max(0,box.x-10), y:Math.max(0,box.y-30), width:Math.min(1600,box.width+200), height:Math.min(900,box.height+60) }, path:`${OUT}/${name}.png` }); console.log("clip",name); return; } } console.log("no",sel); }
await clip("ours-tick4-40c-runepool-zoom", "#player-runePool");
await clip("ours-tick4-41c-playerinfo-zoom", "#playerInfo");
await clip("ours-tick4-42c-opponentinfo-zoom", "#opponentInfo");
await clip("ours-tick4-43c-sidebar-zoom", "#gameSidebar");
await clip("ours-tick4-44c-battlefield-zoom", "#battlefieldRow");
// Hover a hand card to show playable glow
const hc = page.locator("#player-hand .card").first();
if (await hc.count()){ await hc.hover().catch(()=>{}); await page.waitForTimeout(500); }
await clip("ours-tick4-45c-hand-hover-zoom", "#player-hand");
// Click a hand card to show selected glow
if (await hc.count()){ await hc.click().catch(()=>{}); await page.waitForTimeout(700); }
await clip("ours-tick4-46c-hand-selected-zoom", "#player-hand");
await b.close();
console.log("done");
