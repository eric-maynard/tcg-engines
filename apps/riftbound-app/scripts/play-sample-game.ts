#!/usr/bin/env bun
/**
 * Play-sample-game — runs a deterministic bot-vs-bot match and writes a
 * single self-contained HTML page showing the final game view + full move
 * trail. Demonstrates the engine→view→HTML binding end-to-end.
 *
 * Usage:
 *   bun run apps/riftbound-app/scripts/play-sample-game.ts [--turns=30] [--out=path]
 *
 * Output: writes to apps/riftbound-app/public/sample-game.html by default
 * (so the existing static server can serve it at /sample-game.html).
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BotDriver } from "../lib/bot-driver";
import { EngineSession } from "../lib/engine-session";
import { renderPageHtml } from "../lib/render-view";

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) {args.set(m[1], m[2] ?? "true");}
}

const turnCap = Number(args.get("turns") ?? "30");
const seed = args.get("seed") ?? "sample";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const outPath =
  args.get("out") ??
  path.resolve(SCRIPT_DIR, "..", "public", "sample-game.html");

const realDecks = args.get("realDecks") === "true" || args.has("realDecks");
const session = new EngineSession({ realDecks, seed });
const bot1 = new BotDriver("player-1", { seed: `${seed}-b1` });
const bot2 = new BotDriver("player-2", { seed: `${seed}-b2` });

let moves = 0;
let turnsObserved = 0;
let lastTurn = -1;
const MOVE_CAP = 5000;

while (!session.isGameOver() && moves < MOVE_CAP) {
  const view = session.getView();
  if (view.turn.number !== lastTurn) {
    lastTurn = view.turn.number;
    turnsObserved++;
    if (turnsObserved > turnCap) {break;}
  }
  const active = view.turn.activePlayer;
  const driver = active === "player-1" ? bot1 : bot2;
  const step = driver.step(session);
  if (!step) {
    const fb = session.applyMove(active, {
      moveId: "endTurn",
      params: { playerId: active },
    });
    if (!fb.success) {break;}
  }
  moves++;
}

const html = renderPageHtml({
  title: `Riftbound sample game — seed "${seed}" (${moves} moves, ${turnsObserved} turns)`,
  trail: session.getTrail(),
  view: session.getView(),
});

writeFileSync(outPath, html, "utf8");

const final = session.getView();
console.log(
  `Wrote ${outPath} — ${moves} moves, ${turnsObserved} turns, status=${final.status}, winner=${final.winner ?? "none"}`,
);
