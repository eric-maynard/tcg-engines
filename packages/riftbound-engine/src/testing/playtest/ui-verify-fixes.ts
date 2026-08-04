#!/usr/bin/env bun
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("/tmp/vf", { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on("pageerror", e => console.log("PAGE ERROR:", String(e)));
await p.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await p.fill("#loginUser", "dev@riftbound.local"); await p.fill("#loginPass", "dev"); await p.click("#loginBtn");
await p.waitForTimeout(600);
await p.goto("http://localhost:3000/play?cb="+Date.now(), { waitUntil: "domcontentloaded" });
await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await p.goto("http://localhost:3000/play?cb="+Date.now(), { waitUntil: "networkidle" });
await p.click('.mode-card:has-text("Goldfish")');
await p.waitForTimeout(400);
await p.selectOption('#soloDeckSelect', { index: 1 }).catch(()=>{});
await p.click('#soloDeckPicker button.start-btn');
await p.waitForSelector('#pregameOverlay.visible, #player-hand .card', { timeout: 10000 });
await p.waitForTimeout(1000);
// Skip mulligan
for (let i=0;i<10;i++) {
  if (!(await p.$('#pregameOverlay.visible'))) break;
  const k = await p.$('button:has-text("Keep")'); if (k) { await k.click(); await p.waitForTimeout(1000); }
  else { const b2 = await p.$('#pregameOverlay button:not([disabled])'); if (b2) { await b2.click(); await p.waitForTimeout(600); } }
}
await p.waitForTimeout(800);

// Board — check rune count + size
const t1 = await p.evaluate(() => {
  const gs = (window as any).__rbGameState;
  return {
    turn: gs?.turn,
    runePool: (gs?.zones?.runePool||[]).filter((c:any)=>c.id.startsWith("player-1")).map((c:any)=>({id:c.id,def:c.definitionId})),
    runeCardW: getComputedStyle(document.querySelector('.rune-stack .card')||document.body).width,
    preloaded: (window as any)._imagesPreloaded,
  };
});
console.log("T1:", JSON.stringify(t1, null, 2));
await p.screenshot({ path: "/tmp/vf/01-board-t1.png" });

// Hover a hand card
const hc = await p.$('#player-hand .card'); if (hc) { await hc.hover(); await p.waitForTimeout(400); }
await p.screenshot({ path: "/tmp/vf/02-hover.png" });
const hoverInfo = await p.evaluate(() => ({
  previewVisible: document.getElementById("cardPreview")?.classList.contains("visible"),
  previewNameShown: getComputedStyle(document.querySelector(".preview-name")||document.body).display,
  previewImgW: getComputedStyle(document.getElementById("previewImg")||document.body).width,
}));
console.log("hover:", hoverInfo);

// End turn twice → t3, check rune count
await p.mouse.move(5,5);
const doMove = async (mid:string) => p.evaluate(m => {
  const am=(window as any).__rbAvailableMoves||[]; const mv=am.find((x:any)=>x.moveId===m);
  if(mv) (window as any).executeMove(m, mv.params, mv.playerId||"player-1"); return !!mv;
}, mid);
// Play a unit and check exhausted rendering
await doMove("exhaustRune"); await p.waitForTimeout(300);
await doMove("exhaustRune"); await p.waitForTimeout(300);
await doMove("playUnit"); await p.waitForTimeout(600);
const played = await p.evaluate(() => {
  const bc = document.querySelector('#player-base .card');
  const gs=(window as any).__rbGameState;
  const baseCard = (gs?.zones?.base||[]).find((c:any)=>c.id.startsWith("player-1"));
  return {
    baseCardId: baseCard?.id, meta_exhausted: baseCard?.meta?.exhausted,
    domClasses: bc?.className, hasExhaustedClass: bc?.classList.contains("card--exhausted"),
  };
});
console.log("played unit:", JSON.stringify(played));
await p.screenshot({ path: "/tmp/vf/02b-unit-in-base.png" });
await doMove("passChainPriority"); await p.waitForTimeout(300);
await doMove("endTurn"); await p.waitForTimeout(1200);
const t3 = await p.evaluate(() => {
  const gs=(window as any).__rbGameState;
  return { turn:gs?.turn?.number, p1runes:(gs?.zones?.runePool||[]).filter((c:any)=>c.id.startsWith("player-1")).length };
});
console.log("T3:", t3);
await p.screenshot({ path: "/tmp/vf/03-board-t3.png" });

await b.close();
