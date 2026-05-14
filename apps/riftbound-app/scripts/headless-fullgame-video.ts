#!/usr/bin/env bun
/**
 * Headless full-game video recorder for the Riftbound Play SPA.
 *
 * Drives a goldfish session (player-1 = human, player-2 = bot) through a
 * complete game and records the SPA's view as a series of PNG frames, then
 * stitches them into an MP4 via ffmpeg.
 *
 * Driving model:
 *   - Player-2 advances via POST /api/v2/step/:id (BotDriver under the hood).
 *   - Player-1 ALSO advances via a server-side BotDriver — to do that
 *     without the goldfish guard, we hit /api/v2/move/:id directly with
 *     endTurn (and occasionally a `playFromHand` attempt) for the human seat.
 *
 * The browser is purely an observer (just watches SSE state push from the
 * server). This avoids the UI-input-gating headaches of clicking the actual
 * "End Turn" button when phase rules are not satisfied — the engine accepts
 * endTurn at any time and auto-rolls through phases.
 *
 * Usage:
 *   bun run apps/riftbound-app/scripts/headless-fullgame-video.ts
 *
 * Env:
 *   RIFTBOUND_ORIGIN      — default http://localhost:3000
 *   FULLGAME_FRAMES_DIR   — default /tmp/fullgame-frames
 *   FULLGAME_OUT          — default /tmp/fullgame.mp4
 *   FULLGAME_MAX_MOVES    — default 400 (safety cap)
 *   FULLGAME_FRAME_DELAY  — default 350 (ms between moves / screenshots)
 *   FULLGAME_FPS          — default 6   (encoded video framerate)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const ORIGIN = process.env.RIFTBOUND_ORIGIN ?? "http://localhost:3000";
const FRAMES_DIR = process.env.FULLGAME_FRAMES_DIR ?? "/tmp/fullgame-frames";
const OUT_PATH = process.env.FULLGAME_OUT ?? "/tmp/fullgame.mp4";
const MAX_MOVES = Number(process.env.FULLGAME_MAX_MOVES ?? 400);
const FRAME_DELAY_MS = Number(process.env.FULLGAME_FRAME_DELAY ?? 350);
const FPS = Number(process.env.FULLGAME_FPS ?? 6);
const VIEWPORT = { height: 800, width: 1280 } as const;
const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Reset frames dir.
fs.rmSync(FRAMES_DIR, { force: true, recursive: true });
fs.mkdirSync(FRAMES_DIR, { recursive: true });

interface GoldfishStartResp {
  sessionId: string;
  deckId: string | null;
  mode: string;
}

interface HandCard {
  id: string;
  cardType?: string;
  name?: string;
  energyCost?: number;
}
interface SpaState {
  isGameOver?: boolean;
  whoseTurnNow?: string;
  hand?: Record<string, HandCard[]>;
  actionsLegal?: Record<string, boolean>;
  view?: {
    status?: string;
    winner?: string | null;
    turn?: { number?: number; activePlayer?: string; phase?: string; phaseLabel?: string };
  };
  [k: string]: unknown;
}

async function startGoldfish(): Promise<string> {
  const r = await fetch(`${ORIGIN}/api/goldfish/start`, {
    body: JSON.stringify({ deckId: null }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!r.ok) {throw new Error(`goldfish/start failed: HTTP ${r.status}`);}
  return ((await r.json()) as GoldfishStartResp).sessionId;
}

async function getState(sessionId: string): Promise<SpaState> {
  const r = await fetch(`${ORIGIN}/api/v2/state/${encodeURIComponent(sessionId)}`);
  if (!r.ok) {throw new Error(`state failed: HTTP ${r.status}`);}
  return (await r.json()) as SpaState;
}

async function postMove(
  sessionId: string,
  playerId: string,
  moveId: string,
  extra: Record<string, unknown> = {},
): Promise<{ ok?: boolean; error?: string } & SpaState> {
  const r = await fetch(`${ORIGIN}/api/v2/move/${encodeURIComponent(sessionId)}`, {
    body: JSON.stringify({ moveId, playerId, ...extra }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return (await r.json()) as { ok?: boolean; error?: string } & SpaState;
}

async function stepBot(sessionId: string): Promise<{
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
} & SpaState> {
  const r = await fetch(`${ORIGIN}/api/v2/step/${encodeURIComponent(sessionId)}`, {
    body: "{}",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return (await r.json()) as {
    ok?: boolean;
    skipped?: boolean;
    reason?: string;
  } & SpaState;
}

function getActiveAndTurn(s: SpaState): {
  active: string | null;
  turn: number | null;
  step: string | null;
  isGameOver: boolean;
  winner: string | null;
} {
  const t = s.view?.turn;
  const active = t?.activePlayer ?? null;
  const turn = typeof t?.number === "number" ? t.number : null;
  const step = t?.phaseLabel ?? t?.phase ?? null;
  const isGameOver =
    s.isGameOver === true ||
    s.view?.status === "complete" ||
    s.view?.status === "ended" ||
    Boolean(s.view?.winner);
  return { active, isGameOver, step, turn, winner: s.view?.winner ?? null };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let frameCounter = 0;
async function snap(page: Page, label: string): Promise<void> {
  const file = path.join(
    FRAMES_DIR,
    `frame-${String(frameCounter).padStart(4, "0")}.png`,
  );
  await page.screenshot({ path: file, type: "png" });
  frameCounter += 1;
  if (frameCounter % 10 === 0) {
    console.log(`[frame ${frameCounter}] ${label} → ${path.basename(file)}`);
  }
}

const sessionId = await startGoldfish();
console.log(`[setup] goldfish session = ${sessionId}`);

const URL = `${ORIGIN}/play/?session=${encodeURIComponent(sessionId)}&as=player-1&mode=goldfish`;
console.log(`[setup] play URL = ${URL}`);

const browser = await puppeteer.launch({
  defaultViewport: VIEWPORT,
  executablePath: CHROME_PATH,
  headless: true,
  protocolTimeout: 120_000,
});

let exitCode = 0;
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error(`[pageerror]`, e.message));
  await page.goto(URL, { timeout: 20_000, waitUntil: "domcontentloaded" });
  await page
    .waitForSelector('[data-testid="play-page"]', { timeout: 10_000 })
    .catch((error) =>
      console.error(`[wait]`, (error as Error).message),
    );
  // Settle SSE + React initial render.
  await sleep(800);
  await snap(page, "initial");
  await sleep(400);
  await snap(page, "initial-hold");

  let lastTurn: number | null = null;
  let lastActive: string | null = null;
  let consecutiveSkip = 0;
  for (let move = 0; move < MAX_MOVES; move++) {
    const st = await getState(sessionId);
    const info = getActiveAndTurn(st);

    if (info.turn !== lastTurn || info.active !== lastActive) {
      console.log(
        `[move ${move}] turn=${info.turn ?? "?"} step=${info.step ?? "?"} active=${info.active ?? "?"} gameOver=${info.isGameOver}`,
      );
      lastTurn = info.turn;
      lastActive = info.active;
    }
    if (info.isGameOver) {
      console.log(`[move ${move}] GAME OVER — winner=${info.winner ?? "none"}`);
      // Hold final frame a bit longer.
      for (let i = 0; i < 8; i++) {
        await sleep(150);
        await snap(page, "game-over-hold");
      }
      break;
    }

    if (info.active === "player-2") {
      // Bot's turn — let the step endpoint advance it.
      const r = await stepBot(sessionId);
      if (r.skipped) {
        consecutiveSkip += 1;
      } else {
        consecutiveSkip = 0;
      }
    } else if (info.active === "player-1") {
      // Player-1 (the "human" seat in goldfish). To make the video
      // Visually interesting, try to play cards from hand before passing.
      // The engine has many phases (Channel / Main / Combat / End); we
      // Just keep firing playFromHand for each hand card; whichever
      // Succeeds advances the game. If none do, we endTurn.
      const hand = st.hand?.["player-1"] ?? [];
      let didPlay = false;
      for (const card of hand) {
        const r = await postMove(sessionId, "player-1", "playFromHand", {
          cardId: card.id,
        });
        if (r.ok) {
          didPlay = true;
          break;
        }
      }
      if (!didPlay) {
        // Try a no-arg generic step too — channelRunes is a common pre-Main
        // Phase action. If that fails, endTurn.
        const r1 = await postMove(sessionId, "player-1", "channelRunes", {
          params: { playerId: "player-1" },
        });
        if (!r1.ok) {
          const r2 = await postMove(sessionId, "player-1", "endTurn", {
            params: { playerId: "player-1" },
          });
          if (!r2.ok) {
            console.warn(`[move ${move}] player-1 endTurn failed: ${r2.error}`);
            consecutiveSkip += 1;
          } else {
            consecutiveSkip = 0;
          }
        } else {
          consecutiveSkip = 0;
        }
      } else {
        consecutiveSkip = 0;
      }
    } else {
      console.warn(`[move ${move}] no active player resolvable; state.active=${info.active}`);
      consecutiveSkip += 1;
    }

    if (consecutiveSkip >= 10) {
      console.warn(`[move ${move}] ${consecutiveSkip} consecutive skips — bailing.`);
      break;
    }

    // Wait for SSE to push the new state to the browser, then snap.
    await sleep(FRAME_DELAY_MS);
    await snap(page, "tick");
  }

  console.log(`[done] captured ${frameCounter} frames in ${FRAMES_DIR}`);
} catch (error) {
  console.error("[err]", (error as Error).stack ?? (error as Error).message);
  exitCode = 1;
} finally {
  await browser.close();
}

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

const probe = spawnSync(
  "/opt/homebrew/bin/ffprobe",
  [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=codec_name,width,height,r_frame_rate",
    "-of", "default=noprint_wrappers=1",
    OUT_PATH,
  ],
  { encoding: "utf8" },
);
console.log("[ffprobe]");
console.log(probe.stdout);

process.exit(exitCode);
