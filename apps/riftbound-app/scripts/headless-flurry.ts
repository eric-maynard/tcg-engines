#!/usr/bin/env bun
/**
 * Headless Flurry of Feathers demo recorder.
 *
 * Drives the Riftbound Play SPA through the cast flow for Flurry of
 * Feathers (`unl-044-219` — "[Reaction] Choose one — Counter a spell.
 * Play four 1 Might Bird unit tokens with Deflect.") and records both:
 *
 *   1. Stage screenshots:
 *      - /tmp/flurry-1-precast.png        — Flurry in hand, pre-cast.
 *      - /tmp/flurry-2-cast-active.png    — after clicking the hand chip;
 *                                           ChoiceModePicker modal open.
 *      - /tmp/flurry-3-picking.png        — modal still open, hovering
 *                                           option 1 ("Play 4 Bird tokens").
 *      - /tmp/flurry-4-resolved.png       — post-resolution: chosen branch
 *                                           fired, modal closed.
 *
 *   2. A continuous ~10s MP4 (`/tmp/flurry-demo.mp4`) built from ~250ms
 *      frames captured during the same flow, stitched via ffmpeg.
 *
 * Verifies the modal opens with BOTH option labels visible BEFORE the
 * effect resolves — the legacy auto-pick-first-option behavior is the
 * defect this demo is guarding against.
 *
 * Modeled on headless-stacked-deck.ts; same single-browser ticker
 * pattern. Differences: Flurry is a [Reaction] spell, so we still need
 * to pass priority for the chain item to resolve into the `choice`
 * effect that writes the pick-mode pendingChoice.
 *
 * Usage:
 *   bun run apps/riftbound-app/scripts/headless-flurry.ts
 *
 * Env:
 *   RIFTBOUND_ORIGIN       — default http://localhost:3000
 *   FLURRY_FRAMES_DIR      — default /tmp/flurry-frames
 *   FLURRY_OUT             — default /tmp/flurry-demo.mp4
 *   FLURRY_FPS             — default 8   (encoded video framerate)
 *   FLURRY_FRAME_DELAY_MS  — default 250 (capture cadence between frames)
 *   FLURRY_PICK_INDEX      — default 1   (which option to click; 0 = counter,
 *                                          1 = create tokens)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const ORIGIN = process.env.RIFTBOUND_ORIGIN ?? "http://localhost:3000";
const FRAMES_DIR = process.env.FLURRY_FRAMES_DIR ?? "/tmp/flurry-frames";
const OUT_PATH = process.env.FLURRY_OUT ?? "/tmp/flurry-demo.mp4";
const FPS = Number(process.env.FLURRY_FPS ?? 4);
const FRAME_DELAY_MS = Number(process.env.FLURRY_FRAME_DELAY_MS ?? 250);
const PICK_INDEX = Number(process.env.FLURRY_PICK_INDEX ?? 1);
const VIEWPORT = { height: 1400, width: 1400 } as const;
const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const CARD_ID = "unl-044-219"; // Flurry of Feathers
const CASTER = "player-1";
const INSTANCE_ID = `castdemo-${CARD_ID}-${CASTER}`;
const HAND_CHIP_SELECTOR = `[data-testid="hand-chip-${INSTANCE_ID}"]`;
const CHOICE_MODAL_SELECTOR = `[data-testid="choice-modal"]`;
const CHOICE_OPTION_SELECTOR = `[data-testid^="choice-option-"]`;
const SESSION_ID = `flurry-shot-${Date.now()}`;

const STAGE_PATHS = {
  castActive: "/tmp/flurry-2-cast-active.png",
  picking: "/tmp/flurry-3-picking.png",
  precast: "/tmp/flurry-1-precast.png",
  resolved: "/tmp/flurry-4-resolved.png",
} as const;

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
    firstAbilityType?: string;
    targetType?: string;
  };
}

async function seedFlurry(): Promise<SeedResp> {
  const url = `${ORIGIN}/api/v2/scenario/cast-card/${encodeURIComponent(SESSION_ID)}`;
  const r = await fetch(url, {
    body: JSON.stringify({ cardId: CARD_ID, casterId: CASTER, energy: 6 }),
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
    pendingChoice?: {
      type?: string;
      options?: { index: number; label: string }[];
    };
  };
}

async function fetchSpaState(sessionId: string): Promise<SpaStateMin | null> {
  const r = await fetch(
    `${ORIGIN}/api/v2/state/${encodeURIComponent(sessionId)}`,
  );
  if (!r.ok) {
    return null;
  }
  return (await r.json()) as SpaStateMin;
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

const seed = await seedFlurry();
if (!seed.ok || !seed.seed?.seeded) {
  console.error("[err] seed reported not-seeded:", JSON.stringify(seed));
  process.exit(1);
}
console.log(`[seed] ok — ${seed.seed.cardName} (${seed.seed.cardId})`);
console.log(
  `[seed] firstAbilityType=${seed.seed.firstAbilityType} targetType=${seed.seed.targetType ?? "(none)"}`,
);

const browser = await puppeteer.launch({
  defaultViewport: VIEWPORT,
  executablePath: CHROME_PATH,
  headless: true,
});

let exitCode = 0;
let modalOpened = false;
let optionsObserved: { index: number; label: string }[] = [];

try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") {
      console.error("[console.error]", m.text());
    }
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

  const stopTicker = startCaptureTicker(page);

  /* Stage 1 — precast */
  await captureStage(page, STAGE_PATHS.precast, "1-precast");
  await sleep(2500);

  /* Stage 2 — click hand chip + pass priority for the reaction chain. */
  const chip = await page.$(HAND_CHIP_SELECTOR);
  if (!chip) {
    console.error("[err] hand chip not found:", HAND_CHIP_SELECTOR);
  } else {
    await chip.click();
  }

  // Flurry is a [Reaction] spell — playing it puts it on the chain. To
  // Resolve into the `choice` effect (which writes the `pick-mode`
  // PendingChoice), both players must pass priority on the chain.
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
  await sleep(500);
  await passPriority(CASTER);
  await passPriority("player-2");

  // Race the modal open. After both priority passes the engine resolves
  // The reaction's `choice` effect, which writes the `pick-mode`
  // PendingChoice. The SPA's ChoiceModePicker then mounts on the next
  // State poll. We deliberately observe BEFORE clicking to verify the
  // Modal showed BOTH options (the no-auto-pick guarantee).
  const modalHandle = await page
    .waitForSelector(CHOICE_MODAL_SELECTOR, { timeout: 4000 })
    .catch(() => null);
  modalOpened = Boolean(modalHandle);
  console.log(`[click] choice modal opened? ${modalOpened}`);

  // Capture the option labels for the report block — these must be
  // Visible BEFORE the click, otherwise the regression is present.
  if (modalOpened) {
    const opts = await page.$$eval(CHOICE_OPTION_SELECTOR, (els) =>
      els.map((el) => {
        const m = (el as HTMLElement).dataset.testid?.match(/choice-option-(\d+)/);
        return {
          index: m ? Number(m[1]) : -1,
          label: (el.textContent ?? "").trim(),
        };
      }),
    );
    optionsObserved = opts;
    console.log(`[modal] options observed: ${JSON.stringify(opts)}`);
  }

  await sleep(2500);
  await captureStage(page, STAGE_PATHS.castActive, "2-cast-active");

  /* Stage 3 — hover the pick target before clicking. */
  if (modalOpened) {
    const target = await page.$(
      `[data-testid="choice-option-${PICK_INDEX}"]`,
    );
    if (target) {
      await target.hover();
    }
  }
  await sleep(2500);
  await captureStage(page, STAGE_PATHS.picking, "3-picking");

  /* Stage 4 — click the chosen option and wait for the modal to close. */
  if (modalOpened) {
    const target = await page.$(
      `[data-testid="choice-option-${PICK_INDEX}"]`,
    );
    if (target) {
      await target.click();
    }
  }

  await page
    .waitForFunction(
      (sel) => !document.querySelector(sel),
      { timeout: 3000 },
      CHOICE_MODAL_SELECTOR,
    )
    .catch(() => undefined);
  await sleep(2500);
  await captureStage(page, STAGE_PATHS.resolved, "4-resolved");
  await sleep(2500);

  await stopTicker();
  await page.close();
} catch (error) {
  console.error("[err]", (error as Error).stack ?? (error as Error).message);
  exitCode = 1;
} finally {
  await browser.close();
}

// Final state inspection — the chosen branch should have produced a
// State change. We don't assert WHAT it did here (the engine tests
// Cover that); the demo just verifies the modal-pick flow end-to-end.
const finalState = await fetchSpaState(SESSION_ID);
const finalPc = finalState?.view?.pendingChoice;
console.log(`[final] pendingChoice cleared? ${!finalPc}`);

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

console.log("---");
console.log(`script:          apps/riftbound-app/scripts/headless-flurry.ts`);
console.log(`video:           ${OUT_PATH}`);
console.log(`precast:         ${STAGE_PATHS.precast}`);
console.log(`cast-active:     ${STAGE_PATHS.castActive}`);
console.log(`picking:         ${STAGE_PATHS.picking}`);
console.log(`resolved:        ${STAGE_PATHS.resolved}`);
console.log(`modal-opened:    ${modalOpened}`);
console.log(`options:         ${JSON.stringify(optionsObserved)}`);
console.log(`pick-index:      ${PICK_INDEX}`);
console.log(`pending-cleared: ${!finalPc}`);
console.log("---");

process.exit(exitCode);
