#!/usr/bin/env bun
/**
 * Naive-player monkey. Barely knows the game. Clicks whatever's clickable in
 * the real UI (buttons, cards, drop zones), sometimes drags a card somewhere,
 * sometimes hits a hotkey. After each action: screenshot + full state dump.
 *
 * The expert-watcher agent reads the step log and screenshots and calls out
 * anything the UI/engine did wrong.
 *
 *   bun monkey-drive.ts --steps 40 --seed <s> --out /tmp/monkey
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const OUT = arg("--out", "/tmp/monkey");
const STEPS = parseInt(arg("--steps", "40"), 10);
const SEED = arg("--seed", String(Date.now() % 100000));
mkdirSync(OUT, { recursive: true });

function mulberry(seed: string) {
  let a = 0; for (const c of seed) a = (a * 31 + c.charCodeAt(0)) | 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = mulberry(SEED);
const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs: string[] = [];
p.on("console", m => { if (m.type() === "error") errs.push(`[console] ${m.text()}`); });
p.on("pageerror", e => errs.push(`[pageerror] ${String(e)}`));

// Get to the board (login → goldfish → play → keep)
await p.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await p.fill("#loginUser", "dev@riftbound.local"); await p.fill("#loginPass", "dev"); await p.click("#loginBtn");
await p.waitForTimeout(600);
await p.goto("http://localhost:3000/play?cb=" + Date.now(), { waitUntil: "domcontentloaded" });
await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await p.goto("http://localhost:3000/play?cb=" + Date.now(), { waitUntil: "networkidle" });
await p.click('.mode-card:has-text("Goldfish")');
await p.waitForTimeout(400);
// Pick a random saved deck (or default) so different cards get exercised
const nOpts = await p.locator('#soloDeckSelect option').count();
await p.selectOption('#soloDeckSelect', { index: Math.floor(rand() * Math.max(1, nOpts)) }).catch(() => {});
await p.click('#soloDeckPicker button.start-btn');
await p.waitForSelector('#pregameOverlay.visible, #player-hand .card', { timeout: 10000 }).catch(() => {});
for (let i = 0; i < 12; i++) {
  if (!(await p.$('#pregameOverlay.visible, #coinOverlay.visible'))) break;
  const btns = await p.locator('#pregameOverlay button:not([disabled]), .mulligan-btn-keep, .bf-choice').all();
  if (btns.length) { await pick(btns).click().catch(() => {}); await p.waitForTimeout(800); } else await p.waitForTimeout(400);
}
await p.waitForSelector('#player-hand .card', { timeout: 10000 }).catch(() => {});
await p.waitForTimeout(600);

const readState = () => p.evaluate(() => {
  const gs = (window as any).__rbGameState;
  const zone = (z: string) => (gs?.zones?.[z] || []).map((c: any) => ({
    id: c.id, def: c.definitionId, name: c.name, type: c.cardType, cost: c.energyCost,
    might: c.might, exhausted: c.meta?.exhausted, damage: c.meta?.damage, rulesText: c.rulesText,
  }));
  return {
    turn: gs?.turn, status: gs?.status, runePools: gs?.runePools,
    interaction: gs?.interaction, pendingChoice: gs?.pendingChoice,
    battlefields: gs?.battlefields,
    hand: zone("hand"), base: zone("base"), runePool: zone("runePool"),
    trash: zone("trash").length, chain: zone("chain"),
    bfZones: Object.fromEntries(Object.keys(gs?.zones || {}).filter(k => k.startsWith("battlefield-")).map(k => [k, zone(k)])),
    moves: ((window as any).__rbAvailableMoves || []).map((m: any) => ({ moveId: m.moveId, params: m.params })),
    // DOM
    dom: {
      handCount: document.querySelectorAll('#player-hand .card').length,
      baseCount: document.querySelectorAll('#player-base .card').length,
      baseExhausted: document.querySelectorAll('#player-base .card.card--exhausted').length,
      runeCount: document.querySelectorAll('#player-runePool .card').length,
      runeExhausted: document.querySelectorAll('#player-runePool .card.exhausted').length,
      resourceBar: document.getElementById('resourceBar')?.textContent?.replace(/\s+/g, ' ').trim(),
      actionButtons: [...document.querySelectorAll('#actionsList .action-btn')].map(e => e.textContent?.trim()).slice(0, 20),
      overlays: [...document.querySelectorAll('.visible[id$="Overlay"], .visible[id$="Dialog"]')].map(e => e.id),
      chainVisible: !!document.querySelector('.chain-overlay.visible, #chainOverlay.visible'),
    },
  };
});

const clickables = () => p.evaluate(() => {
  // Stamp a stable data-mkey on every clickable so the driver can address them
  // reliably (avoids nth-of-type mis-hits).
  let ord = 0;
  const out: { key: string; kind: string; label: string }[] = [];
  const push = (els: NodeListOf<Element>, kind: string, labelAttr?: string) => {
    els.forEach((e) => {
      const label = (labelAttr ? e.getAttribute(labelAttr) : e.textContent)?.trim().slice(0, 60) || "";
      if (kind === "action" && /Concede|Leave|Rewind|Redo/i.test(label)) return;
      const key = `mk-${ord++}`;
      (e as HTMLElement).dataset.mkey = key;
      out.push({ key, kind, label });
    });
  };
  push(document.querySelectorAll('#actionsList > .action-btn'), "action");
  push(document.querySelectorAll('#actionsList [id^="move-group-"]:not(.hidden) .action-btn'), "sub-action");
  push(document.querySelectorAll('#player-hand .card'), "hand-card", "title");
  push(document.querySelectorAll('#player-base .card'), "base-card", "title");
  push(document.querySelectorAll('#player-runePool .card:not(.exhausted)'), "rune", "title");
  push(document.querySelectorAll('.bf-art, [data-drop-zone]'), "drop-zone", "data-drop-zone");
  push(document.querySelectorAll('.chain-overlay button:not([disabled]), #chainOverlay button:not([disabled]), .pending-choice button, #pendingChoice button'), "modal-btn");
  return out;
});
const loc = (key: string) => p.locator(`[data-mkey="${key}"]`).first();

const trace: any[] = [];
let stepN = 0;
async function snap(action: string, target: string) {
  const n = String(stepN++).padStart(2, "0");
  await p.screenshot({ path: `${OUT}/${n}.png` });
  const st = await readState();
  const errsNow = errs.splice(0);
  trace.push({ step: n, action, target, shot: `${n}.png`, errs: errsNow, ...st });
  console.log(`→ ${n} ${action} ${target}  t${st.turn?.number}/${st.turn?.phase} e=${st.runePools?.["player-1"]?.energy} moves=${st.moves.length} ${errsNow.length ? "ERRS=" + errsNow.length : ""}`);
}

await snap("start", "");

for (let i = 0; i < STEPS; i++) {
  const st = await readState();
  if (st.status !== "playing") break;

  // What can I click?
  const cands = await clickables();
  if (!cands.length) { await snap("stuck", "nothing clickable"); break; }

  // Weighted-random: prefer sub-actions and modal buttons (they advance state);
  // sometimes drag a hand card to a drop zone; sometimes just poke a card.
  const modal = cands.filter(c => c.kind === "modal-btn");
  const subs = cands.filter(c => c.kind === "sub-action");
  const acts = cands.filter(c => c.kind === "action");
  const hands = cands.filter(c => c.kind === "hand-card");
  const runes = cands.filter(c => c.kind === "rune");
  const drops = cands.filter(c => c.kind === "drop-zone");
  const bases = cands.filter(c => c.kind === "base-card");

  const r = rand();
  let did = "noop", tgt = "";
  try {
    if (modal.length) {
      const c = pick(modal); await loc(c.key).click({ timeout: 3000 }); did = "click-modal"; tgt = c.label;
    } else if (r < 0.15 && hands.length && drops.length) {
      const h = pick(hands), d = pick(drops);
      await loc(h.key).dragTo(loc(d.key), { timeout: 3000 });
      did = "drag"; tgt = `${h.label} → ${d.label}`;
    } else if (r < 0.25 && bases.length && drops.length) {
      const b2 = pick(bases), d = pick(drops);
      await loc(b2.key).dragTo(loc(d.key), { timeout: 3000 });
      did = "drag-base"; tgt = `${b2.label} → ${d.label}`;
    } else if (r < 0.35 && runes.length) {
      const c = pick(runes); await loc(c.key).click({ timeout: 3000 }); did = "click-rune"; tgt = c.label;
    } else if (r < 0.60 && subs.length) {
      const c = pick(subs); await loc(c.key).click({ timeout: 3000 }); did = "click-sub"; tgt = c.label;
    } else if (acts.length) {
      const nonEnd = acts.filter(a => !/End Turn/i.test(a.label));
      const c = pick((nonEnd.length && rand() < 0.75) ? nonEnd : acts);
      await loc(c.key).click({ timeout: 3000 }); did = "click-action"; tgt = c.label;
    } else {
      const c = pick(cands); await loc(c.key).click({ timeout: 3000 }).catch(() => {}); did = "click-any"; tgt = c.label;
    }
  } catch (e) { did = "error"; tgt = String(e).slice(0, 80); }

  await p.waitForTimeout(400);
  await snap(did, tgt);
}

writeFileSync(`${OUT}/trace.json`, JSON.stringify({ seed: SEED, steps: trace }, null, 2));
console.log(`\n${trace.length} steps → ${OUT}/trace.json (seed=${SEED})`);
await b.close();
