#!/usr/bin/env bun
/**
 * Naive-player monkey. Barely knows the game. Clicks whatever's clickable in
 * the real UI (buttons, cards, drop zones), sometimes drags a card somewhere,
 * sometimes hits a hotkey. After each action: screenshot + full state dump.
 *
 * The expert-watcher agent reads the step log and screenshots and calls out
 * anything the UI/engine did wrong.
 *
 * Also runs a small set of HARD INVARIANTS after every step (things a human
 * playtester notices in seconds but a purely-visual agent misses):
 *   - pendingChoice must gate all other moves and must be visible
 *   - playing a card must deduct ≥ its printed energy cost
 *   - units that just entered a battlefield must be exhausted (rule 143.4)
 *   - "When I move/arrive/play" rulesText must produce a visible consequence
 *   - no console/page errors
 *   - Rewind then Redo (pressed at random moments) lands on the SAME snapshot
 * Violations are written per-step and rolled up at the top of trace.json so
 * the workflow can surface them before any agent review.
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
// /login may auto-login with dev credentials and redirect away before the form is fillable
await p.fill("#loginUser", "dev@riftbound.local", { timeout: 5000 })
  .then(() => p.fill("#loginPass", "dev")).then(() => p.click("#loginBtn")).catch(() => {});
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
  const bfZones = Object.fromEntries(Object.keys(gs?.zones || {}).filter(k => k.startsWith("battlefield-")).map(k => [k, zone(k)]));
  return {
    turn: gs?.turn, status: gs?.status, runePools: gs?.runePools,
    interaction: gs?.interaction, pendingChoice: gs?.pendingChoice,
    battlefields: gs?.battlefields,
    hand: zone("hand"), base: zone("base"), runePool: zone("runePool"),
    trash: zone("trash").length, chain: zone("chain"),
    bfZones,
    moves: ((window as any).__rbAvailableMoves || []).map((m: any) => ({ moveId: m.moveId, params: m.params })),
    // Flat helpers for invariant diffing.
    energy: gs?.runePools?.["player-1"]?.energy ?? 0,
    handIds: zone("hand").map((c: any) => c.id),
    boardById: Object.fromEntries([...zone("base"), ...Object.values(bfZones).flat()].map((c: any) => [c.id, c])),
    // DOM
    dom: {
      handCount: document.querySelectorAll('#player-hand .card').length,
      baseCount: document.querySelectorAll('#player-base .card').length,
      baseExhausted: document.querySelectorAll('#player-base .card.card--exhausted').length,
      bfExhausted: document.querySelectorAll('#battlefieldRow .battlefield .card.card--exhausted').length,
      runeCount: document.querySelectorAll('#player-runePool .card').length,
      runeExhausted: document.querySelectorAll('#player-runePool .card.exhausted').length,
      resourceBar: document.getElementById('resourceBar')?.textContent?.replace(/\s+/g, ' ').trim(),
      actionButtons: [...document.querySelectorAll('#actionsList .action-btn')].map(e => e.textContent?.trim()).slice(0, 20),
      overlays: [...document.querySelectorAll('.visible[id$="Overlay"], .visible[id$="Dialog"]')].map(e => e.id),
      // #cardPreview is an opaque, fixed, z-index:10050 panel that matches neither
      // selector above, so a board-blanketing hover preview used to be invisible to
      // every invariant. Tracked separately: it is NOT a modal (it never satisfies
      // "the prompt is on screen"), it is an obstruction.
      previewVisible: !!document.querySelector('#cardPreview.visible'),
      previewRect: (() => {
        const r = document.querySelector('#cardPreview.visible')?.getBoundingClientRect();
        return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null;
      })(),
      chainVisible: !!document.querySelector('.chain-overlay.visible, #chainOverlay.visible'),
      pendingChoiceVisible: !!document.querySelector('#choiceOverlay.visible[data-mode="pending"], .pending-choice.visible, [data-pending-choice].visible'),
    },
  };
});

const clickables = () => p.evaluate(() => {
  // Stamp a stable data-mkey on every clickable so the driver can address them
  // reliably (avoids nth-of-type mis-hits). Keys restart at 0 each call, so any
  // stamp left over from an earlier step (e.g. a button whose #chainOverlay lost
  // .visible) would collide and loc()'s .first() could resolve to that hidden
  // element -> click timeout. Clear every previous stamp first.
  document.querySelectorAll<HTMLElement>("[data-mkey]").forEach((e) => {
    delete e.dataset.mkey;
  });
  let ord = 0;
  const out: { key: string; kind: string; label: string; cardId?: string }[] = [];
  const push = (els: NodeListOf<Element>, kind: string, labelAttr?: string) => {
    els.forEach((e) => {
      const label = (labelAttr ? e.getAttribute(labelAttr) : e.textContent)?.trim().slice(0, 60) || "";
      if (kind === "action" && /Concede|Leave|Rewind|Redo/i.test(label)) return;
      const key = `mk-${ord++}`;
      (e as HTMLElement).dataset.mkey = key;
      out.push({ key, kind, label, cardId: e.getAttribute("data-card-id") || undefined });
    });
  };
  push(document.querySelectorAll('#actionsList > .action-btn'), "action");
  push(document.querySelectorAll('#actionsList [id^="move-group-"]:not(.hidden) .action-btn'), "sub-action");
  push(document.querySelectorAll('#player-hand .card'), "hand-card", "title");
  push(document.querySelectorAll('#player-base .card'), "base-card", "title");
  push(document.querySelectorAll('#player-runePool .card:not(.exhausted)'), "rune", "title");
  push(document.querySelectorAll('.bf-art, [data-drop-zone]'), "drop-zone", "data-drop-zone");
  push(document.querySelectorAll('#chainOverlay.visible button:not([disabled]), #choiceOverlay.visible .choice-modal-card[data-pick-idx], #choiceOverlay.visible .choice-modal-btn:not([disabled]), #choiceOverlay.visible .choice-modal-cancel, #targetBanner.visible .target-banner-btn, #actionBar:not(.hidden) #actionBarBtns button:not([disabled]), .battlefield__showdown-panel button:not([disabled])'), "modal-btn");
  return out;
});
const loc = (key: string) => p.locator(`[data-mkey="${key}"]`).first();

// ───────────────────────── rewind probe ─────────────────────────
/** The parts of the client snapshot a Rewind→Redo round trip must reproduce exactly (log/seq/dom excluded). */
const coreState = () => p.evaluate(() => {
  const gs = (window as any).__rbGameState;
  if (!gs) return null;
  const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  return JSON.stringify(canon({
    turn: gs.turn, status: gs.status, runePools: gs.runePools, players: gs.players, battlefields: gs.battlefields,
    interaction: gs.interaction, pendingChoice: gs.pendingChoice ?? null, zones: gs.zones, canUndo: gs.canUndo,
  }));
});
/**
 * `coreState()` once the client has stopped moving: a frame the previous step
 * caused (goldfish follow-ups, chain resolution, an AI reply) can still be in
 * flight, and comparing a mid-flight snapshot against a settled one reports a
 * round-trip drift that the server never had.
 */
const settledCoreState = async (ms = 1500) => {
  let prev = await coreState();
  const t = Date.now();
  while (Date.now() - t < ms) {
    await p.waitForTimeout(150);
    const cur = await coreState();
    if (cur === prev) return cur;
    prev = cur;
  }
  return prev;
};
const rewindEnabled = () => p.evaluate(() => { const b = document.getElementById("undoBtn") as HTMLButtonElement | null; return !!b && !b.disabled; });
const redoEnabled = () => p.evaluate(() => { const b = document.getElementById("redoBtn") as HTMLButtonElement | null; return !!b && !b.disabled; });
/** Wait for the client to receive the rewind frame (log sentinel / redo line as newest entry), bounded. */
async function waitNewestLog(text: string, ms = 4000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const newest = await p.evaluate(() => { const l = (window as any).__rbGameState?.log || []; const e = l[l.length - 1]; return typeof e === "string" ? e : e?.text || ""; });
    if (newest === text) return true;
    await p.waitForTimeout(80);
  }
  return false;
}
let pendingRewindViolation: Violation | null = null;

// ───────────────────────── invariants ─────────────────────────
type Violation = { rule: string; detail: string; step: number };
const PENDING_OK = new Set(["resolvePendingChoice", "concede"]);

function checkInvariants(step: number, prev: any, cur: any, action: string, target: string, playedCard: any): Violation[] {
  const v: Violation[] = [];
  const push = (rule: string, detail: string) => v.push({ rule, detail, step });

  // I1. pendingChoice must gate every other move.
  if (cur.pendingChoice) {
    const leaked = [...new Set(cur.moves.map((m: any) => m.moveId).filter((id: string) => !PENDING_OK.has(id)))];
    if (leaked.length) push("pendingChoice-gates-moves", `pendingChoice(${cur.pendingChoice.type}) set but moves offered: ${leaked.join(",")}`);
    // I2. …and must be surfaced to the player.
    if (!cur.dom.pendingChoiceVisible && !cur.dom.chainVisible && !cur.dom.overlays.length)
      push("pendingChoice-visible", `pendingChoice(${cur.pendingChoice.type}) set but no modal/overlay visible`);
  }
  // I3. Energy is never negative.
  if (cur.energy < 0) push("energy-nonneg", `energy=${cur.energy}`);
  // I4. No page/console errors.
  if (cur.errs?.length) push("no-console-errors", cur.errs.slice(0, 3).join(" | "));

  if (!prev) return v;

  // I5. Playing a card deducts at least its printed cost.
  if (playedCard && prev.handIds.includes(playedCard.id) && !cur.handIds.includes(playedCard.id)) {
    const spent = prev.energy - cur.energy;
    if ((playedCard.cost ?? 0) > 0 && spent < playedCard.cost)
      push("cost-paid", `${playedCard.name} cost=${playedCard.cost} but energy ${prev.energy}→${cur.energy} (spent ${spent})`);
  }
  // I6. Units that newly appear on board (base or bf) enter exhausted (rule 143.4).
  for (const [id, c] of Object.entries<any>(cur.boardById)) {
    if (!prev.boardById[id] && c.type === "unit" && c.exhausted !== true)
      push("unit-enters-exhausted", `${c.name} entered ${findZone(cur, id)} with exhausted=${c.exhausted}`);
  }
  // I7. A unit that changed zones and has a "When I move/arrive" trigger must
  // produce a consequence (chain grew, pendingChoice set, hand/trash delta).
  for (const [id, c] of Object.entries<any>(cur.boardById)) {
    const was = prev.boardById[id];
    if (was && findZone(prev, id) !== findZone(cur, id) && /when i (move|arrive)/i.test(c.rulesText || "")) {
      const consequence = (cur.chain?.length || 0) > (prev.chain?.length || 0)
        || (!!cur.pendingChoice && !prev.pendingChoice)
        || cur.trash !== prev.trash
        || cur.handIds.length !== prev.handIds.length;
      if (!consequence) push("move-trigger-fired", `${c.name} moved ("${c.rulesText?.slice(0, 40)}…") but no chain/prompt/zone change`);
    }
  }
  // I8b. The hover preview must never survive a click or a drop. Both gestures start
  // with a pointerdown that hides + latches it, and the cursor comes to rest ON the
  // surface it acted upon, so a panel still up here is one no mouseout will ever
  // clear — an opaque box parked over the board (drop zones, phase strip).
  if (cur.dom.previewVisible && /^(click|drag|intent)/.test(action)) {
    const r = cur.dom.previewRect;
    push("preview-not-stuck", `#cardPreview still visible after ${action}${r ? ` at ${r.x},${r.y} ${r.w}x${r.h}` : ""}`);
  }
  // I8. If the engine exhausts a board card, the DOM must show it tapped.
  const engineTapped = Object.values<any>(cur.boardById).filter(c => c.exhausted).length;
  const domTapped = (cur.dom.baseExhausted || 0) + (cur.dom.bfExhausted || 0);
  if (engineTapped > 0 && domTapped < engineTapped)
    push("exhausted-rendered", `engine has ${engineTapped} exhausted board cards, DOM shows ${domTapped}`);

  return v;
}
function findZone(st: any, id: string) {
  if (st.base.some((c: any) => c.id === id)) return "base";
  for (const [z, cs] of Object.entries<any[]>(st.bfZones)) if (cs.some(c => c.id === id)) return z;
  return "?";
}

const trace: any[] = [];
const allViolations: Violation[] = [];
let stepN = 0;
let prevState: any = null;
async function snap(action: string, target: string, playedCard?: any) {
  const n = String(stepN).padStart(2, "0");
  await p.screenshot({ path: `${OUT}/${n}.png` });
  const st = await readState();
  const errsNow = errs.splice(0);
  const stWithErrs = { ...st, errs: errsNow };
  const invariantViolations = checkInvariants(stepN, prevState, stWithErrs, action, target, playedCard);
  if (pendingRewindViolation) { invariantViolations.push(pendingRewindViolation); pendingRewindViolation = null; }
  allViolations.push(...invariantViolations);
  trace.push({ step: n, action, target, shot: `${n}.png`, errs: errsNow, invariantViolations, ...st });
  const vTag = invariantViolations.length ? ` INV[${invariantViolations.map(v => v.rule).join(",")}]` : "";
  console.log(`→ ${n} ${action} ${target}  t${st.turn?.number}/${st.turn?.phase} e=${st.energy} moves=${st.moves.length}${errsNow.length ? " ERRS=" + errsNow.length : ""}${vTag}`);
  prevState = stWithErrs;
  stepN++;
  return st;
}

await snap("start", "");

// Consequential-sequence bias: after playing a unit, prefer to move it; after
// moving a unit, prefer a showdown/score action. This walks the exact chains a
// human goldfish player tries first.
type Intent = { kind: "move-unit"; cardId: string } | { kind: "score" } | null;
let intent: Intent = null;

for (let i = 0; i < STEPS; i++) {
  const st = prevState;
  if (st.status !== "playing") break;

  const cands = await clickables();
  if (!cands.length) { await snap("stuck", "nothing clickable"); break; }

  const modal = cands.filter(c => c.kind === "modal-btn");
  const subs = cands.filter(c => c.kind === "sub-action");
  const acts = cands.filter(c => c.kind === "action");
  const hands = cands.filter(c => c.kind === "hand-card");
  const runes = cands.filter(c => c.kind === "rune");
  const drops = cands.filter(c => c.kind === "drop-zone");
  const bases = cands.filter(c => c.kind === "base-card");

  // If there is a pendingChoice with no modal, deliberately try a non-choice
  // action once so the invariant/expert can see whether it succeeds.
  const probePending = st.pendingChoice && !modal.length && (acts.length || subs.length) && rand() < 0.5;

  const r = rand();
  let did = "noop", tgt = "", playedCard: any = null;
  try {
    if (modal.length && !probePending) {
      const c = pick(modal); await loc(c.key).click({ timeout: 3000 }); did = "click-modal"; tgt = c.label;
    } else if (intent?.kind === "move-unit" && drops.length) {
      const src = bases.find(b2 => b2.cardId === intent!.cardId) ?? cands.find(c => c.cardId === intent!.cardId);
      if (src) {
        const d = pick(drops.filter(d2 => /battlefield/i.test(d2.label)) .length ? drops.filter(d2 => /battlefield/i.test(d2.label)) : drops);
        await loc(src.key).dragTo(loc(d.key), { timeout: 3000 });
        did = "intent-move"; tgt = `${src.label} → ${d.label}`; intent = { kind: "score" };
      } else intent = null;
    } else if (intent?.kind === "score") {
      const scoreBtn = [...subs, ...acts].find(a => /Score|Showdown|Declare|End Showdown/i.test(a.label));
      if (scoreBtn) { await loc(scoreBtn.key).click({ timeout: 3000 }); did = "intent-score"; tgt = scoreBtn.label; }
      intent = null;
    } else if (r < 0.15 && hands.length && drops.length) {
      const h = pick(hands), d = pick(drops);
      playedCard = st.hand.find((c: any) => c.id === h.cardId) ?? st.hand.find((c: any) => c.name && h.label.includes(c.name));
      await loc(h.key).dragTo(loc(d.key), { timeout: 3000 });
      did = "drag"; tgt = `${h.label} → ${d.label}`;
      if (playedCard?.type === "unit" && rand() < 0.6) intent = { kind: "move-unit", cardId: playedCard.id };
    } else if (r < 0.25 && bases.length && drops.length) {
      const b2 = pick(bases), d = pick(drops);
      await loc(b2.key).dragTo(loc(d.key), { timeout: 3000 });
      did = "drag-base"; tgt = `${b2.label} → ${d.label}`;
      if (rand() < 0.6) intent = { kind: "score" };
    } else if (r < 0.35 && runes.length) {
      const c = pick(runes); await loc(c.key).click({ timeout: 3000 }); did = "click-rune"; tgt = c.label;
    } else if (r < 0.43 && (await rewindEnabled())) {
      // Press Rewind at a random moment; half the time press Redo right after and
      // check the HARD invariant: Rewind→Redo reproduces the pre-rewind snapshot.
      const before = await settledCoreState();
      await p.click("#undoBtn", { timeout: 3000 });
      const gotUndo = await waitNewestLog("Rewound their last action.");
      did = "rewind"; tgt = gotUndo ? "ok" : "no rewind frame";
      if (gotUndo && rand() < 0.5 && (await redoEnabled())) {
        await p.click("#redoBtn", { timeout: 3000 });
        const gotRedo = await waitNewestLog("Move redone.");
        await p.waitForTimeout(200);
        const after = await settledCoreState();
        did = "rewind+redo"; tgt = gotRedo ? "ok" : "no redo frame";
        if (gotRedo && before !== after) {
          pendingRewindViolation = { rule: "undo-redo-roundtrip", detail: `Rewind→Redo changed the snapshot (before ${before?.length}b, after ${after?.length}b)`, step: stepN };
        }
      }
      intent = null;
    } else if (r < 0.60 && subs.length) {
      const c = pick(subs); await loc(c.key).click({ timeout: 3000 }); did = "click-sub"; tgt = c.label;
      const m = c.label.match(/Play (?:Unit|Spell|Gear)[:\s]+(.+)/i);
      if (m) playedCard = st.hand.find((x: any) => x.name && m[1].includes(x.name));
      if (playedCard?.type === "unit" && rand() < 0.6) intent = { kind: "move-unit", cardId: playedCard.id };
    } else if (acts.length) {
      const nonEnd = acts.filter(a => !/End Turn/i.test(a.label));
      const c = pick((nonEnd.length && rand() < 0.75) ? nonEnd : acts);
      await loc(c.key).click({ timeout: 3000 }); did = "click-action"; tgt = c.label;
    } else {
      const c = pick(cands); await loc(c.key).click({ timeout: 3000 }).catch(() => {}); did = "click-any"; tgt = c.label;
    }
  } catch (e) { did = "error"; tgt = String(e).slice(0, 80); intent = null; }

  await p.waitForTimeout(400);
  await snap(did, tgt, playedCard);
}

// Roll up: dedupe violations by rule so the workflow gets a compact list.
const violationsByRule: Record<string, { rule: string; count: number; steps: number[]; sample: string }> = {};
for (const v of allViolations) {
  const e = (violationsByRule[v.rule] ??= { rule: v.rule, count: 0, steps: [], sample: v.detail });
  e.count++; if (!e.steps.includes(v.step)) e.steps.push(v.step);
}

writeFileSync(`${OUT}/trace.json`, JSON.stringify({
  seed: SEED,
  invariants: Object.values(violationsByRule),
  steps: trace,
}, null, 2));
console.log(`\n${trace.length} steps → ${OUT}/trace.json (seed=${SEED})`);
if (allViolations.length) {
  console.log(`  ${allViolations.length} invariant violations across ${Object.keys(violationsByRule).length} rules:`);
  for (const e of Object.values(violationsByRule)) console.log(`    ${e.rule} ×${e.count} @${e.steps.join(",")}: ${e.sample}`);
}
await b.close();
