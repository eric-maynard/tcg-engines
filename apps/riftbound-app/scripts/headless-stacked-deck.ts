#!/usr/bin/env bun
/**
 * Headless Stacked Deck demo recorder.
 *
 * Drives the Riftbound Play SPA through the cast flow for Stacked Deck
 * (`ogn-183-298` — "[Action] Look at the top 3 cards of your Main Deck.
 * Put 1 into your hand and recycle the rest.") and records both:
 *
 *   1. Stage screenshots:
 *      - /tmp/stacked-1-precast.png       — Stacked Deck in hand, pre-cast.
 *      - /tmp/stacked-2-cast-active.png   — after clicking the hand chip
 *                                           (picker — if any — open).
 *      - /tmp/stacked-3-picking.png       — picker still open, hovering an
 *                                           option (or, if no picker exists,
 *                                           the in-flight state right before
 *                                           resolution).
 *      - /tmp/stacked-4-resolved.png      — post-resolution: hand & deck
 *                                           sizes updated (or unchanged if
 *                                           the engine `look` effect is a
 *                                           no-op stub — see the report).
 *
 *   2. A continuous ~10s MP4 (`/tmp/stacked-deck-demo.mp4`) built from
 *      ~250ms frames captured during the same flow, stitched via ffmpeg.
 *
 * Single shared session: we seed once via `/api/v2/scenario/cast-card` and
 * drive a single page through every stage so the video is continuous and
 * the "deck count went down" observation lines up across the screenshots.
 *
 * Usage:
 *   bun run apps/riftbound-app/scripts/headless-stacked-deck.ts
 *
 * Env:
 *   RIFTBOUND_ORIGIN       — default http://localhost:3000
 *   STACKED_FRAMES_DIR     — default /tmp/stacked-deck-frames
 *   STACKED_OUT            — default /tmp/stacked-deck-demo.mp4
 *   STACKED_FPS            — default 8   (encoded video framerate)
 *   STACKED_FRAME_DELAY_MS — default 250 (capture cadence between frames)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const ORIGIN = process.env.RIFTBOUND_ORIGIN ?? "http://localhost:3000";
const FRAMES_DIR = process.env.STACKED_FRAMES_DIR ?? "/tmp/stacked-deck-frames";
const OUT_PATH = process.env.STACKED_OUT ?? "/tmp/stacked-deck-demo.mp4";
const FPS = Number(process.env.STACKED_FPS ?? 4);
const FRAME_DELAY_MS = Number(process.env.STACKED_FRAME_DELAY_MS ?? 250);
const VIEWPORT = { height: 1400, width: 1400 } as const;
const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const CARD_ID = "ogn-183-298"; // Stacked Deck
const CASTER = "player-1";
const INSTANCE_ID = `castdemo-${CARD_ID}-${CASTER}`;
const HAND_CHIP_SELECTOR = `[data-testid="hand-chip-${INSTANCE_ID}"]`;
const TARGET_PICKER_SELECTOR = `[data-testid="target-picker"]`;
const SESSION_ID = `stacked-shot-${Date.now()}`;

const STAGE_PATHS = {
  castActive: "/tmp/stacked-2-cast-active.png",
  picking: "/tmp/stacked-3-picking.png",
  precast: "/tmp/stacked-1-precast.png",
  resolved: "/tmp/stacked-4-resolved.png",
} as const;

// Reset frames dir.
fs.rmSync(FRAMES_DIR, { force: true, recursive: true });
fs.mkdirSync(FRAMES_DIR, { recursive: true });

interface SeedResp {
  ok?: boolean;
  seed?: {
    seeded?: boolean;
    instanceId?: string;
    cardId?: string;
    cardName?: string;
    cardType?: string;
    targetType?: string;
    firstAbilityType?: string;
  };
}

async function seedStackedDeck(): Promise<SeedResp> {
  const url = `${ORIGIN}/api/v2/scenario/cast-card/${encodeURIComponent(SESSION_ID)}`;
  const r = await fetch(url, {
    body: JSON.stringify({ cardId: CARD_ID, casterId: CASTER, energy: 5 }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!r.ok) {
    throw new Error(`seed cast-card failed: HTTP ${r.status}`);
  }
  return (await r.json()) as SeedResp;
}

interface SpaStateMin {
  view?: {
    players?: { id: string; deckSize?: number; handSize?: number; trashSize?: number }[];
  };
  hand?: Record<string, unknown[]>;
}

async function fetchSpaState(sessionId: string): Promise<SpaStateMin | null> {
  const r = await fetch(
    `${ORIGIN}/api/v2/state/${encodeURIComponent(sessionId)}`,
  );
  if (!r.ok) {return null;}
  return (await r.json()) as SpaStateMin;
}

function pickPlayer(state: SpaStateMin | null, playerId: string) {
  return state?.view?.players?.find((p) => p.id === playerId);
}

async function snapshot(sessionId: string, playerId: string): Promise<{
  deckSize: number | null;
  handSize: number | null;
  trashSize: number | null;
}> {
  const s = await fetchSpaState(sessionId);
  const p = pickPlayer(s, playerId);
  // Hand list is in top-level `hand` map; handSize on player is canonical.
  return {
    deckSize: p?.deckSize ?? null,
    handSize: p?.handSize ?? s?.hand?.[playerId]?.length ?? null,
    trashSize: p?.trashSize ?? null,
  };
}

let frameCounter = 0;
async function captureFrame(page: Page): Promise<void> {
  frameCounter += 1;
  const name = `frame-${String(frameCounter).padStart(4, "0")}.png`;
  await page
    .screenshot({ path: path.join(FRAMES_DIR, name), type: "png" })
    .catch((error) => console.error(`[frame] ${name} screenshot failed`, error));
}

async function captureStage(page: Page, stagePath: string, label: string): Promise<void> {
  await page.screenshot({ path: stagePath, type: "png" });
  console.log(`[stage] ${label} -> ${stagePath}`);
}

// Run a background capture ticker; returns a stop fn.
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

const seed = await seedStackedDeck();
if (!seed.ok || !seed.seed?.seeded) {
  console.error("[err] seed reported not-seeded:", JSON.stringify(seed));
  process.exit(1);
}
console.log(`[seed] ok — ${seed.seed.cardName} (${seed.seed.cardId})`);
console.log(`[seed] firstAbilityType=${seed.seed.firstAbilityType} targetType=${seed.seed.targetType ?? "(none)"}`);

const initial = await snapshot(SESSION_ID, CASTER);
console.log(`[seed] initial deckSize=${initial.deckSize} handSize=${initial.handSize} trashSize=${initial.trashSize}`);

const browser = await puppeteer.launch({
  defaultViewport: VIEWPORT,
  executablePath: CHROME_PATH,
  headless: true,
});

let exitCode = 0;
let pickerOpened = false;

try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") {console.error("[console.error]", m.text());}
  });

  const url = `${ORIGIN}/play/?session=${encodeURIComponent(SESSION_ID)}&as=${CASTER}&realDecks=true`;
  console.log(`[goto] ${url}`);
  await page.goto(url, { timeout: 20_000, waitUntil: "networkidle2" });
  await page
    .waitForSelector(`[data-testid="play-page"]`, { timeout: 8000 })
    .catch((error) => console.error("[wait] play-page", error.message));
  await page
    .waitForSelector(HAND_CHIP_SELECTOR, { timeout: 5000 })
    .catch((error) => console.error("[wait] hand-chip", error.message));
  await sleep(1500);

  // Start the background capture ticker — runs through the whole flow so
  // The video is continuous (~10s at FRAME_DELAY_MS = 250 → 40 frames).
  const stopTicker = startCaptureTicker(page);

  /* Stage 1 — precast */
  await captureStage(page, STAGE_PATHS.precast, "1-precast");
  await sleep(2500); // Dwell on the precast view so admin can see Stacked Deck in hand

  /* Stage 2 — click the hand chip */
  const chip = await page.$(HAND_CHIP_SELECTOR);
  if (!chip) {
    console.error("[err] hand chip not found:", HAND_CHIP_SELECTOR);
  } else {
    await chip.click();
  }

  // Stacked Deck is a spell: clicking the hand chip dispatches `playSpell`,
  // Which puts the spell on the chain rather than resolving it. To make
  // The `look` effect actually fire (writing the `look-and-pick`
  // PendingChoice), both players must pass priority. The single-browser
  // Demo simulates the opponent by issuing the priority-pass moves
  // Directly via the v2 move API.
  async function passPriority(playerId: string): Promise<void> {
    const r = await fetch(
      `${ORIGIN}/api/v2/move/${encodeURIComponent(SESSION_ID)}`,
      {
        body: JSON.stringify({
          moveId: "passChainPriority",
          params: { playerId },
          playerId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    if (!r.ok) {
      console.error(`[priority] ${playerId} pass failed: HTTP ${r.status}`);
    }
  }
  // Brief wait for the playSpell move to land before passing priority.
  await sleep(500);
  await passPriority(CASTER);
  await passPriority("player-2");

  // Race a picker open. After both priority passes the engine resolves the
  // Spell, executes the `look` effect, and writes the `look-and-pick`
  // PendingChoice. The SPA's LookPicker (data-testid="target-picker",
  // Data-variant="look-and-pick") then mounts on the next state poll.
  const pickerHandle = await page
    .waitForSelector(TARGET_PICKER_SELECTOR, { timeout: 3000 })
    .catch(() => null);
  pickerOpened = Boolean(pickerHandle);
  console.log(`[click] picker opened? ${pickerOpened}`);

  await sleep(2500);
  await captureStage(page, STAGE_PATHS.castActive, "2-cast-active");

  /* Stage 3 — picking */
  // If a picker is open: hover the first option (no click — we want the
  // Hovered state captured before commitment). If not: just dwell so the
  // Video shows the auto-resolved transition. The LookPicker variant emits
  // `look-option-*` testids (one per revealed card); the legacy
  // TargetPicker emits `target-option-*`. We try both so this script
  // Survives changes to picker emission ids.
  const OPTION_SELECTOR =
    `${TARGET_PICKER_SELECTOR} button[data-testid^="look-option-"], ` +
    `${TARGET_PICKER_SELECTOR} button[data-testid^="target-option-"]`;
  if (pickerOpened) {
    const firstOption = await page.$(OPTION_SELECTOR);
    if (firstOption) {
      await firstOption.hover();
    }
  }
  await sleep(2500);
  await captureStage(page, STAGE_PATHS.picking, "3-picking");

  // If picker is open, confirm the first option (or skip).
  if (pickerOpened) {
    const firstOption = await page.$(OPTION_SELECTOR);
    if (firstOption) {
      await firstOption.click();
    } else {
      // Card-in-deck variant: no options surfaced — click Skip so the
      // Engine auto-resolves on the server side.
      const skip = await page.$(`${TARGET_PICKER_SELECTOR} [data-testid="target-skip"]`);
      if (skip) {await skip.click();}
    }
  }

  // Wait for any picker to close + state to settle.
  await page
    .waitForFunction(
      (sel) => !document.querySelector(sel),
      { timeout: 3000 },
      TARGET_PICKER_SELECTOR,
    )
    .catch(() => undefined);
  await sleep(2500); // Dwell on the post-resolution state

  /* Stage 4 — resolved */
  await captureStage(page, STAGE_PATHS.resolved, "4-resolved");
  await sleep(2500); // Longer dwell on the final state for the video

  await stopTicker();
  await page.close();
} catch (error) {
  console.error("[err]", (error as Error).stack ?? (error as Error).message);
  exitCode = 1;
} finally {
  await browser.close();
}

const final = await snapshot(SESSION_ID, CASTER);
console.log(`[final] deckSize=${final.deckSize} handSize=${final.handSize} trashSize=${final.trashSize}`);
const delta = (a: number | null, b: number | null) =>
  a != null && b != null ? a - b : "n/a";
const deckDelta = delta(final.deckSize, initial.deckSize);
const handDelta = delta(final.handSize, initial.handSize);
const trashDelta = delta(final.trashSize, initial.trashSize);
console.log(`[diff]  deck Δ=${deckDelta} hand Δ=${handDelta} trash Δ=${trashDelta}`);
console.log(`[done] captured ${frameCounter} frames in ${FRAMES_DIR}`);

if (frameCounter < 5) {
  console.error(`[fail] not enough frames captured (${frameCounter})`);
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

// Summary block — easy for the parent harness to grep.
console.log("---");
console.log(`script:        apps/riftbound-app/scripts/headless-stacked-deck.ts`);
console.log(`video:         ${OUT_PATH}`);
console.log(`precast:       ${STAGE_PATHS.precast}`);
console.log(`cast-active:   ${STAGE_PATHS.castActive}`);
console.log(`picking:       ${STAGE_PATHS.picking}`);
console.log(`resolved:      ${STAGE_PATHS.resolved}`);
console.log(`picker-opened: ${pickerOpened}`);
console.log(`deck-delta:    ${deckDelta}`);
console.log(`hand-delta:    ${handDelta}`);
console.log(`trash-delta:   ${trashDelta}`);
console.log("---");

process.exit(exitCode);
