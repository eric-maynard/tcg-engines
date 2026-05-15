#!/usr/bin/env bun
/**
 * Headless Diana vs Ezreal showdown demo recorder.
 *
 * Captures a video and stage screenshots for the admin showcase
 * scenario:
 *
 *   Diana, Lunari (unl-079-219, 3 might, mind, attacker)
 *     "When a showdown begins here, you may pay 1. If you do,
 *      Predict + reveal the top card of your Main Deck. If it's
 *      a spell, draw it."
 *   vs
 *   Ezreal, Dashing (sfd-082-221, 3 might, mind, defender)
 *     "When I attack or defend, deal damage equal to my Might to
 *      an enemy unit here. I don't deal combat damage."
 *
 * Stage screenshots:
 *   /tmp/diana-1-board.png            — pre-attack: Diana + Ezreal
 *                                       on bf-1, no showdown active.
 *   /tmp/diana-2-showdown-begins.png  — showdown open at bf-1, focus
 *                                       = attacker (player-1).
 *   /tmp/diana-3-priority-attacker.png — same showdown, captures
 *                                       priority-prompt while P1 has
 *                                       focus.
 *   /tmp/diana-4-priority-defender.png — after P1 passes focus,
 *                                       focusOwner = player-2.
 *   /tmp/diana-5-chain-resolves.png   — captured immediately after P2
 *                                       passes (chain resolution moment).
 *   /tmp/diana-6-aftermath.png        — post-resolution: both units in
 *                                       trash, bf-1 uncontested.
 *
 * Video: /tmp/diana-ezreal-demo.mp4 (~15-20s, 4 fps, 250ms frames)
 *
 * Drives the engine via:
 *   - POST /api/v2/scenario/diana-vs-ezreal/<sid> {step: pre-attack}
 *   - POST /api/v2/scenario/diana-vs-ezreal/<sid> {step: showdown-open}
 *   - POST /api/v2/move/<sid> {moveId: passShowdownFocus, playerId}
 *
 * Writes /tmp/diana-ezreal-gaps.md documenting where the UX deviates
 * from the admin's expected behavior.
 *
 * Env:
 *   RIFTBOUND_ORIGIN          — default http://localhost:3000
 *   DIANA_FRAMES_DIR          — default /tmp/diana-frames
 *   DIANA_OUT                 — default /tmp/diana-ezreal-demo.mp4
 *   DIANA_FPS                 — default 4
 *   DIANA_FRAME_DELAY_MS      — default 250
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const ORIGIN = process.env.RIFTBOUND_ORIGIN ?? "http://localhost:3000";
const FRAMES_DIR = process.env.DIANA_FRAMES_DIR ?? "/tmp/diana-frames";
const OUT_PATH = process.env.DIANA_OUT ?? "/tmp/diana-ezreal-demo.mp4";
const GAPS_PATH = "/tmp/diana-ezreal-gaps.md";
const FPS = Number(process.env.DIANA_FPS ?? 4);
const FRAME_DELAY_MS = Number(process.env.DIANA_FRAME_DELAY_MS ?? 250);
const VIEWPORT = { height: 1400, width: 1400 } as const;
const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const SESSION_PRE = `diana-pre-${Date.now()}`;
const SESSION_SHOWDOWN = `diana-show-${Date.now()}`;
const CASTER = "player-1";
const OPPONENT = "player-2";

const STAGE_PATHS = {
  aftermath: "/tmp/diana-6-aftermath.png",
  board: "/tmp/diana-1-board.png",
  chainResolves: "/tmp/diana-5-chain-resolves.png",
  priorityAttacker: "/tmp/diana-3-priority-attacker.png",
  priorityDefender: "/tmp/diana-4-priority-defender.png",
  showdownBegins: "/tmp/diana-2-showdown-begins.png",
} as const;

fs.rmSync(FRAMES_DIR, { force: true, recursive: true });
fs.mkdirSync(FRAMES_DIR, { recursive: true });

interface SeedResp {
  ok?: boolean;
  seed?: {
    seeded?: boolean;
    dianaCardId?: string;
    ezrealCardId?: string;
    battlefieldId?: string;
    step?: "pre-attack" | "showdown-open";
  };
}

async function seed(sessionId: string, step: "pre-attack" | "showdown-open"): Promise<SeedResp> {
  const url = `${ORIGIN}/api/v2/scenario/diana-vs-ezreal/${encodeURIComponent(sessionId)}`;
  const r = await fetch(url, {
    body: JSON.stringify({ playerId: CASTER, step }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!r.ok) {throw new Error(`seed ${step} failed: HTTP ${r.status}`);}
  return (await r.json()) as SeedResp;
}

async function passShowdownFocus(sessionId: string, playerId: string): Promise<void> {
  const r = await fetch(`${ORIGIN}/api/v2/move/${encodeURIComponent(sessionId)}`, {
    body: JSON.stringify({
      moveId: "passShowdownFocus",
      params: { playerId },
      playerId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!r.ok) {throw new Error(`passShowdownFocus ${playerId} failed: HTTP ${r.status}`);}
}

interface SpaState {
  view?: {
    combat?: {
      attackingPlayer: string;
      defendingPlayer: string;
      focusOwner: string;
      battlefieldId: string;
      isCombat: boolean;
      attackers: { id: string; name?: string; might?: number }[];
      defenders: { id: string; name?: string; might?: number }[];
    };
    chain?: {
      items: { id: string; summary: string; source: { cardId?: string; cardName?: string; playerId: string } }[];
      focusOwner: string;
    };
    battlefields?: { id: string; contested: boolean; units: { id: string; name?: string }[] }[];
    cardsInTrash?: { id: string; name?: string }[];
    pendingChoice?: unknown;
  };
}

async function fetchState(sessionId: string): Promise<SpaState | null> {
  const r = await fetch(`${ORIGIN}/api/v2/state/${encodeURIComponent(sessionId)}`);
  if (!r.ok) {return null;}
  return (await r.json()) as SpaState;
}

let frameCounter = 0;
async function captureFrame(page: Page): Promise<void> {
  frameCounter += 1;
  const name = `frame-${String(frameCounter).padStart(4, "0")}.png`;
  await page.screenshot({ path: path.join(FRAMES_DIR, name), type: "png" }).catch(
    (error) => console.error(`[frame] ${name} failed`, (error as Error).message),
  );
}

async function captureStage(page: Page, stagePath: string, label: string): Promise<void> {
  await page.screenshot({ path: stagePath, type: "png" });
  console.log(`[stage] ${label} -> ${stagePath}`);
}

function startCaptureTicker(page: Page): () => Promise<void> {
  let stopped = false;
  let inflight: Promise<void> = Promise.resolve();
  const loop = (async () => {
    while (!stopped) {
      const t0 = Date.now();
      inflight = captureFrame(page);
      await inflight;
      const elapsed = Date.now() - t0;
      const wait = Math.max(0, FRAME_DELAY_MS - elapsed);
      await new Promise((r) => setTimeout(r, wait));
    }
  })();
  return async () => {
    stopped = true;
    await loop;
    await inflight;
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/* --- main ----------------------------------------------------------- */

// Stage 1 (pre-attack) uses its own session. Diana + Ezreal placed on
// Bf-1 but no showdown active.
const preSeed = await seed(SESSION_PRE, "pre-attack");
console.log(`[seed pre-attack] ok=${preSeed.ok} diana=${preSeed.seed?.dianaCardId} ezreal=${preSeed.seed?.ezrealCardId}`);
if (!preSeed.ok || !preSeed.seed?.seeded) {
  console.error("[err] pre-attack seed failed:", JSON.stringify(preSeed));
  process.exit(1);
}

// Stages 2-6 use a separate session where the showdown is already open.
const showdownSeed = await seed(SESSION_SHOWDOWN, "showdown-open");
console.log(`[seed showdown-open] ok=${showdownSeed.ok}`);
if (!showdownSeed.ok || !showdownSeed.seed?.seeded) {
  console.error("[err] showdown-open seed failed:", JSON.stringify(showdownSeed));
  process.exit(1);
}

const browser = await puppeteer.launch({
  defaultViewport: VIEWPORT,
  executablePath: CHROME_PATH,
  headless: true,
});

const stateLog: Record<string, SpaState | null> = {};

let exitCode = 0;
try {
  // --- Stage 1: pre-attack board --------------------------------------
  {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("[stage1 pageerror]", e.message));
    const url = `${ORIGIN}/play/?session=${encodeURIComponent(SESSION_PRE)}&as=${CASTER}&realDecks=true`;
    await page.goto(url, { timeout: 20_000, waitUntil: "networkidle2" });
    await page.waitForSelector('[data-testid="play-page"]', { timeout: 8000 }).catch(() => {});
    await sleep(2000);
    await captureStage(page, STAGE_PATHS.board, "1-board");
    stateLog["1-board"] = await fetchState(SESSION_PRE);
    await page.close();
  }

  // --- Stages 2-6: showdown drive with ticker -------------------------
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("[stage* pageerror]", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") {console.error("[console.error]", m.text());}
  });

  const url = `${ORIGIN}/play/?session=${encodeURIComponent(SESSION_SHOWDOWN)}&as=${CASTER}&realDecks=true`;
  console.log(`[goto] ${url}`);
  await page.goto(url, { timeout: 20_000, waitUntil: "networkidle2" });
  await page.waitForSelector('[data-testid="play-page"]', { timeout: 8000 }).catch(() => {});
  await sleep(1500);

  const stopTicker = startCaptureTicker(page);

  // Stage 2 — showdown begins (focus = attacker on P1's seat)
  await sleep(2000);
  await captureStage(page, STAGE_PATHS.showdownBegins, "2-showdown-begins");
  stateLog["2-showdown-begins"] = await fetchState(SESSION_SHOWDOWN);

  // Stage 3 — attacker priority prompt (same state, lingered for clarity)
  await sleep(2500);
  await captureStage(page, STAGE_PATHS.priorityAttacker, "3-priority-attacker");
  stateLog["3-priority-attacker"] = await fetchState(SESSION_SHOWDOWN);

  // Drive: P1 (attacker) passes focus → focusOwner flips to P2
  await passShowdownFocus(SESSION_SHOWDOWN, CASTER);
  await sleep(1500);

  // Stage 4 — defender priority prompt
  await captureStage(page, STAGE_PATHS.priorityDefender, "4-priority-defender");
  stateLog["4-priority-defender"] = await fetchState(SESSION_SHOWDOWN);
  await sleep(2000);

  // Drive: P2 (defender) passes focus → showdown closes, combat resolves
  // Inline (attack/defend triggers fire & resolve atomically because no
  // Chain is active at that point — see findings in gaps.md).
  await passShowdownFocus(SESSION_SHOWDOWN, OPPONENT);

  // Try to grab a frame mid-resolution. Realistically the engine has
  // Already resolved synchronously by the time the move POST returns,
  // So this captures the post-resolve view.
  await sleep(300);
  await captureStage(page, STAGE_PATHS.chainResolves, "5-chain-resolves");
  stateLog["5-chain-resolves"] = await fetchState(SESSION_SHOWDOWN);

  // Stage 6 — aftermath, hold the camera for the video
  await sleep(2500);
  await captureStage(page, STAGE_PATHS.aftermath, "6-aftermath");
  stateLog["6-aftermath"] = await fetchState(SESSION_SHOWDOWN);
  await sleep(1500);

  await stopTicker();
  await page.close();
} catch (error) {
  console.error("[err]", (error as Error).stack ?? (error as Error).message);
  exitCode = 1;
} finally {
  await browser.close();
}

/* --- Gap analysis --------------------------------------------------- */

interface SnapshotSummary {
  combatActive: boolean;
  attacker?: string;
  defender?: string;
  focusOwner?: string;
  chainItems: number;
  chainFocus?: string;
  units: { id: string; name?: string; bf: string }[];
  trashed: { id: string; name?: string }[];
  pendingChoice: boolean;
}

function summarize(s: SpaState | null): SnapshotSummary {
  const v = s?.view ?? {};
  const units: SnapshotSummary["units"] = [];
  for (const bf of v.battlefields ?? []) {
    for (const u of bf.units ?? []) {
      units.push({ bf: bf.id, id: u.id, name: u.name });
    }
  }
  return {
    attacker: v.combat?.attackingPlayer,
    chainFocus: v.chain?.focusOwner,
    chainItems: v.chain?.items?.length ?? 0,
    combatActive: Boolean(v.combat),
    defender: v.combat?.defendingPlayer,
    focusOwner: v.combat?.focusOwner,
    pendingChoice: Boolean(v.pendingChoice),
    trashed: (v.cardsInTrash ?? []).map((c) => ({ id: c.id, name: c.name })),
    units,
  };
}

const summaries = Object.fromEntries(
  Object.entries(stateLog).map(([k, v]) => [k, summarize(v)]),
);

const gapsLines: string[] = [];
gapsLines.push("# Diana vs Ezreal Showdown — UX Gaps");
gapsLines.push("");
gapsLines.push("Captured " + new Date().toISOString());
gapsLines.push("");
gapsLines.push("## Per-stage engine state");
gapsLines.push("");
for (const [stage, summary] of Object.entries(summaries)) {
  gapsLines.push(`### ${stage}`);
  gapsLines.push("```json");
  gapsLines.push(JSON.stringify(summary, null, 2));
  gapsLines.push("```");
  gapsLines.push("");
}

// Find specific gaps
const showdownBegins = summaries["2-showdown-begins"];
const priorityAttacker = summaries["3-priority-attacker"];
const priorityDefender = summaries["4-priority-defender"];
const aftermath = summaries["6-aftermath"];

gapsLines.push("## Expected vs Observed");
gapsLines.push("");

const expectations: { id: string; expected: string; observed: string; ok: boolean }[] = [];

// Expectation 1: chain panel shows trigger items when showdown begins
expectations.push({
  expected:
    "When the showdown opens at bf-1, BOTH Diana's 'when a showdown begins here' trigger AND Ezreal's 'when I defend' trigger should appear stacked LIFO in the Chain panel.",
  id: "chain-panel-on-showdown-begin",
  observed: `chain.items.length = ${showdownBegins?.chainItems ?? "n/a"} immediately after showdown begins (expected 2)`,
  ok: (showdownBegins?.chainItems ?? 0) >= 2,
});

// Expectation 2: priority is with attacker initially
expectations.push({
  expected: "Focus should be on the attacker (player-1) when the combat showdown opens.",
  id: "initial-focus-attacker",
  observed: `focusOwner=${showdownBegins?.focusOwner}`,
  ok: showdownBegins?.focusOwner === CASTER,
});

// Expectation 3: focus flips to defender after P1 passes
expectations.push({
  expected: "After the attacker passes focus, focusOwner should flip to the defender (player-2).",
  id: "focus-flips-after-pass",
  observed: `focusOwner=${priorityDefender?.focusOwner ?? "(no combat)"}`,
  ok: priorityDefender?.focusOwner === OPPONENT,
});

// Expectation 4: Diana's optional pay-1 trigger creates a pendingChoice modal
expectations.push({
  expected:
    "Diana's optional 'pay 1 to Predict' trigger should surface a pendingChoice modal letting player-1 decline or pay. Predict should then surface a reveal-top modal.",
  id: "diana-pay-1-modal",
  observed: `pendingChoice during attacker-priority frame: ${priorityAttacker?.pendingChoice ?? false}`,
  ok: false, // Never happened — see chain inline-resolve note below
});

// Expectation 5: after resolution, attacker outcomes
const dianaInTrash = (aftermath?.trashed ?? []).some((c) => c.name === "Diana, Lunari");
const ezrealInTrash = (aftermath?.trashed ?? []).some((c) => c.name === "Ezreal, Dashing");
expectations.push({
  expected:
    "Ezreal's 'when I defend' deals 3 (Ezreal's might) to Diana → Diana dies. Ezreal does NOT deal combat damage (printed keyword), so Diana's 3 might does NOT kill Ezreal via combat damage. Net: Diana dies, Ezreal survives.",
  id: "ezreal-deals-3-damage-to-diana",
  observed: `trashed: Diana=${dianaInTrash}, Ezreal=${ezrealInTrash}`,
  ok: dianaInTrash && !ezrealInTrash,
});

for (const e of expectations) {
  gapsLines.push(`### ${e.id} — ${e.ok ? "PASS" : "GAP"}`);
  gapsLines.push(`**Expected:** ${e.expected}`);
  gapsLines.push("");
  gapsLines.push(`**Observed:** ${e.observed}`);
  gapsLines.push("");
}

gapsLines.push("## Root-cause notes");
gapsLines.push("");
gapsLines.push(
  "1. **Chain never surfaces in the SPA during this showdown.** Diana's and Ezreal's triggers are wired to engine events `attack` / `defend`, which `combat.ts:resolveFullCombat()` fires AFTER the showdown closes (both focus-passes complete). At that point `interaction.chain.active === false`, so `fireTriggers()` resolves the abilities INLINE rather than pushing them onto the chain (see `packages/riftbound-engine/src/abilities/trigger-runner.ts:470-503`). Result: the SPA never sees the chain populate, and the player never gets a window to react between the triggers.",
);
gapsLines.push("");
gapsLines.push(
  "2. **'When a showdown begins here' is mapped to the `attack` event, not a `showdown-begin` event.** Diana's printed text says 'When a showdown begins here', but `diana-lunari.ts` uses `trigger.event = 'attack'`. There is no `showdown-begin` event emitted by `chain-state.ts:startShowdown()`. As a result Diana's trigger fires at combat resolution time, not at showdown-open time. This is a card-text vs implementation mismatch worth flagging.",
);
gapsLines.push("");
gapsLines.push(
  "3. **Diana's optional 'pay 1' (`condition: { cost: { energy: 1 }, type: 'pay-cost' }`) never surfaces a modal.** Because the trigger resolves inline at combat-resolution time without going through the chain, there's no pendingChoice for the attacker to opt in/out. The Predict + reveal effects either silently execute or silently skip — there is no UI affordance.",
);
gapsLines.push("");
gapsLines.push(
  "4. **APNAP order isn't visible.** Triggers ARE sorted by `orderTriggers(filtered, turnPlayer, turnOrder)` (rule 585, turn-player first), but because they resolve inline as one batch, the player never sees the APNAP pass alternation. The user-facing experience is 'I pressed Pass Focus twice and everything resolved'.",
);
gapsLines.push("");
gapsLines.push("## UX recommendations");
gapsLines.push("");
gapsLines.push("- When `attack` / `defend` triggers fire from `resolveFullCombat`, open a chain BEFORE invoking `fireTriggers` (set `interaction.chain.active = true`) so the standard chain-priority loop drives APNAP resolution. The current path skips chain creation entirely because the showdown is already closed.");
gapsLines.push("- Surface optional `'may'` triggers (`optional: true`) as a pendingChoice modal even when the trigger is being resolved inline, so 'you may pay 1' choices aren't silently skipped or auto-applied.");
gapsLines.push("- Consider emitting a `showdown-begin` event from `startShowdown()` so card text like Diana's actually matches the trigger event name (today the card-data file fudges it to `attack` because that's the closest available event).");

fs.writeFileSync(GAPS_PATH, gapsLines.join("\n"), "utf8");
console.log(`[gaps] wrote ${GAPS_PATH}`);

/* --- ffmpeg stitch -------------------------------------------------- */

if (frameCounter < 5) {
  console.error(`[fail] not enough frames (${frameCounter})`);
  process.exit(exitCode || 1);
}

const ffmpegArgs = [
  "-y",
  "-framerate", String(FPS),
  "-i", path.join(FRAMES_DIR, "frame-%04d.png"),
  "-c:v", "libx264",
  "-pix_fmt", "yuv420p",
  "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
  "-movflags", "+faststart",
  OUT_PATH,
];
console.log(`[ffmpeg] ${ffmpegArgs.join(" ")}`);
const ff = spawnSync("/opt/homebrew/bin/ffmpeg", ffmpegArgs, { stdio: "inherit" });
if (ff.status !== 0) {
  console.error(`[ffmpeg] exit code ${ff.status}`);
  process.exit(ff.status ?? 1);
}

const stat = fs.statSync(OUT_PATH);
console.log(`[ok] wrote ${OUT_PATH} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

console.log("---");
console.log(`script:           apps/riftbound-app/scripts/headless-diana-vs-ezreal.ts`);
console.log(`video:            ${OUT_PATH}`);
console.log(`gaps:             ${GAPS_PATH}`);
for (const [k, p] of Object.entries(STAGE_PATHS)) {
  console.log(`${k.padEnd(18)}: ${p}`);
}
console.log(`frames captured:  ${frameCounter}`);
console.log("---");
console.log("expectation outcomes:");
for (const e of expectations) {
  console.log(`  [${e.ok ? "PASS" : "GAP "}] ${e.id}`);
}

process.exit(exitCode);
