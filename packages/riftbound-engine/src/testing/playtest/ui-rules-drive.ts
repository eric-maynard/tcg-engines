#!/usr/bin/env bun
/**
 * Rules-correctness UI driver.
 *
 * Drives a real game by reading window.__rbAvailableMoves and calling the
 * page's executeMove() directly (same WS path a user click takes). Captures
 * {step, action, screenshot, gameState, availableMoves, ui} at each step so
 * observers can verify rules ↔ server ↔ UI consistency.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = process.env.SHOTS_DIR || "/tmp/rules-shots";
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 810 } });
p.on("console", m => { if (m.type() === "error") console.log("[page]", m.text()); });

let step = 0;
const trace: any[] = [];

const readState = () => p.evaluate(() => {
  const gs = (window as any).__rbGameState;
  const vp = (window as any).__rbViewingPlayer;
  const am = (window as any).__rbAvailableMoves || [];
  return {
    state: gs ? {
      turn: gs.turn, status: gs.status, runePools: gs.runePools, battlefields: gs.battlefields,
      players: Object.fromEntries(Object.entries(gs.players || {}).map(([k,v]: any) => [k, {vp: v.victoryPoints}])),
      zones: Object.fromEntries(Object.entries(gs.zones || {}).map(([k,v]: any) => [k, (v as any[]).map((c:any)=>({id:c.id,def:c.definitionId,name:c.name,type:c.cardType,cost:c.energyCost,might:c.might,exhausted:c.meta?.exhausted,damage:c.meta?.damage}))])),
      pendingChoice: gs.pendingChoice, interaction: gs.interaction,
    } : null,
    moves: am.map((m:any)=>({moveId:m.moveId,params:m.params,playerId:m.playerId})),
    viewingPlayer: vp,
    ui: {
      turnLabel: document.querySelector('#turnPhase, .turn-label')?.textContent?.trim(),
      actionButtons: [...document.querySelectorAll('#actionsList .action-btn')].map(e=>e.textContent?.trim()).slice(0,20),
      handCount: document.querySelectorAll('#player-hand .card').length,
      baseCount: document.querySelectorAll('#player-base .card').length,
      baseExhausted: document.querySelectorAll('#player-base .card.card--exhausted').length,
      runePoolCount: document.querySelectorAll('#player-runePool .card').length,
      exhaustedRunes: document.querySelectorAll('#player-runePool .card.exhausted, #player-runePool .card.card--exhausted').length,
      energyDisplay: document.querySelector('.rb-value')?.textContent?.trim(),
      resourceBarText: document.getElementById('resourceBar')?.textContent?.replace(/\s+/g,' ').trim(),
      bfUnits: Object.fromEntries([...document.querySelectorAll('[id^="bf-zone-"]')].map(z=>[z.id, z.querySelectorAll('.card').length])),
      pregameVisible: document.getElementById("pregameOverlay")?.classList.contains("visible"),
      peekVisible: document.getElementById("peekOverlay")?.classList.contains("visible"),
      hoverPreviewShown: !!document.querySelector('.card-preview.visible'),
    },
  };
});

const doMove = async (moveId: string, filter?: (m:any)=>boolean) => {
  const st = await readState();
  const cands = st.moves.filter((m:any) => m.moveId === moveId && (!filter || filter(m)));
  if (!cands.length) return { ok:false, reason:`no ${moveId} in availableMoves`, avail:[...new Set(st.moves.map((m:any)=>m.moveId))] };
  const m = cands[0];
  await p.evaluate(([mid, params, pid]) => (window as any).executeMove?.(mid, params, pid), [m.moveId, m.params, m.playerId||st.viewingPlayer]);
  await p.waitForTimeout(500);
  return { ok:true, move:m };
};

async function snap(label: string, action: string, result?: any) {
  const n = String(step++).padStart(2, "0");
  const path = `${OUT}/${n}-${label}.png`;
  await p.screenshot({ path });
  const st = await readState();
  trace.push({ step: n, label, action, result, shot: path, ...st });
  const rp = st.state?.runePools?.[st.viewingPlayer];
  console.log(`→ ${n}-${label}  t${st.state?.turn?.number}/${st.state?.turn?.phase}  e=${rp?.energy}  runes=${(st.state?.zones?.runePool||[]).length}  hand=${st.ui.handCount}  base=${st.ui.baseCount}  moves=[${[...new Set(st.moves.map((m:any)=>m.moveId))].join(',')}]  ${result?.ok===false?'FAIL:'+result.reason:''}`);
}

// === Setup: login → goldfish → deck → start → mulligan ===
await p.goto("http://localhost:3000/login", { waitUntil: "networkidle", timeout: 15000 });
await p.fill('#loginUser', "dev@riftbound.local");
await p.fill('#loginPass', "dev");
await p.click('#loginBtn');
await p.waitForTimeout(800);
await p.goto("http://localhost:3000/play", { waitUntil: "domcontentloaded" });
await p.evaluate(() => { localStorage.removeItem("rb_session"); localStorage.removeItem("rb_lobby"); sessionStorage.clear(); });
await p.goto("http://localhost:3000/play", { waitUntil: "networkidle" });
await p.click('.mode-card:has-text("Goldfish")');
await p.waitForTimeout(400);
await p.selectOption('#soloDeckSelect', { index: 1 }).catch(()=>{});
await p.click('#soloDeckPicker button:has-text("Play")');
await p.waitForSelector('#pregameOverlay.visible, #player-hand .card', { timeout: 10000 }).catch(()=>{});
await snap("pregame-0", "pregame first shown");
for (let i=0;i<12;i++) {
  if (!(await p.$('#pregameOverlay.visible, #coinOverlay.visible'))) break;
  const keep = await p.$('.mulligan-btn-keep, button:has-text("Keep")');
  if (keep) { await snap(`mulligan-${i}`, "mulligan visible"); await keep.click(); await p.waitForTimeout(1200); continue; }
  const bfc = await p.$('.bf-choice:not(.selected)');
  if (bfc) { await snap(`bf-select-${i}`, "battlefield selection"); await bfc.click(); await p.waitForTimeout(600); continue; }
  const btn = await p.$('#pregameOverlay button:not([disabled])');
  if (btn) { await btn.click(); await p.waitForTimeout(600); continue; }
  await p.waitForTimeout(400);
}
await p.waitForSelector('#player-hand .card', { timeout: 10000 }).catch(()=>{});
await p.waitForTimeout(800);

// === Rules-driven play sequence ===
await snap("start", "game started");

// Turn 1: exhaust runes → energy accrues, playUnit enumerates
let r = await doMove("exhaustRune"); await snap("exhaust1", "exhaustRune", r);
r = await doMove("exhaustRune"); await snap("exhaust2", "exhaustRune", r);

// Play a unit → base gains card, energy drops
r = await doMove("playUnit"); await snap("play-unit", "playUnit", r);

// Resolve any chain from on-play trigger
for (let i=0;i<4;i++) {
  const rr = await doMove("passChainPriority");
  if (!rr.ok) break;
  await snap(`pass${i}`, "passChainPriority", rr);
}

// standardMove → showdown opens
r = await doMove("standardMove"); await snap("std-move", "standardMove", r);
for (let i=0;i<4;i++) { const rr = await doMove("passShowdownFocus"); if (!rr.ok) break; await snap(`focus${i}`, "passShowdownFocus", rr); }
for (let i=0;i<4;i++) { const rr = await doMove("passChainPriority"); if (!rr.ok) break; }

// End turn → runePool empties, turn advances, next player channels
r = await doMove("endTurn"); await snap("t1-end", "endTurn", r);
await p.waitForTimeout(1000);
await snap("t2-goldfish", "goldfish auto-turn");

// If it's back to us (t3): more runes should be in pool now
r = await doMove("exhaustRune"); await snap("t3-exhaust1", "exhaustRune", r);
r = await doMove("exhaustRune"); await snap("t3-exhaust2", "exhaustRune", r);
r = await doMove("exhaustRune"); await snap("t3-exhaust3", "exhaustRune", r);
r = await doMove("exhaustRune"); await snap("t3-exhaust4", "exhaustRune", r);

r = await doMove("playUnit"); await snap("t3-play", "playUnit", r);
for (let i=0;i<4;i++) { const rr = await doMove("passChainPriority"); if (!rr.ok) break; }

r = await doMove("recycleRune"); await snap("t3-recycle", "recycleRune", r);

r = await doMove("endTurn"); await snap("t3-end", "endTurn", r);
await p.waitForTimeout(1000);
await snap("t4", "after t3 end");

r = await doMove("activateAbility"); await snap("t5-activate", "activateAbility", r);

writeFileSync(`${OUT}/trace.json`, JSON.stringify(trace, null, 2));
console.log(`\n${trace.length} steps → ${OUT}/trace.json`);
await b.close();
