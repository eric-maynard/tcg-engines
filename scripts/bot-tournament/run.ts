/**
 * Bot-vs-bot tournament harness — Phase B batch 20 QQ.
 *
 * Runs N matches between two `BotDriver`s on fresh `EngineSession`s with
 * varied seeds, captures win/loss/match-length stats, and emits:
 *   - a per-match CSV at /tmp/bot-tournament/tournament-<ts>.csv
 *   - a summary markdown at /tmp/bot-tournament/tournament-<ts>-summary.md
 *
 * The bots and the session come from the existing app library; we don't
 * modify either — this script is a pure orchestrator + reporter.
 *
 * Usage:
 *   bun scripts/bot-tournament/run.ts                                # 100 matches default
 *   bun scripts/bot-tournament/run.ts --matches 50 --turnCap 20
 *   bun scripts/bot-tournament/run.ts --bot1 '{"seed":"foo"}' --bot2 '{"seed":"bar"}'
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BotDriver, type BotDriverOptions } from "../../apps/riftbound-app/lib/bot-driver";
import { EngineSession } from "../../apps/riftbound-app/lib/engine-session";

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
interface CliOptions {
  matches: number;
  turnCap: number;
  bot1: BotDriverOptions;
  bot2: BotDriverOptions;
  realDecks: boolean;
  outDir: string;
}

function parseBotConfig(raw: string | undefined, fallbackSeed: string): BotDriverOptions {
  if (!raw) {return { seed: fallbackSeed };}
  // JSON literal or filepath
  if (raw.startsWith("{")) {
    try {
      return JSON.parse(raw) as BotDriverOptions;
    } catch (error) {
      throw new Error(`--bot config not valid JSON: ${(error as Error).message}`, { cause: e });
    }
  }
  if (existsSync(raw)) {
    return JSON.parse(readFileSync(raw, "utf8")) as BotDriverOptions;
  }
  throw new Error(`--bot config not JSON and not a readable file: ${raw}`);
}

function parseArgs(argv: string[]): CliOptions {
  let matches = 100;
  let turnCap = 30;
  let bot1Raw: string | undefined;
  let bot2Raw: string | undefined;
  let realDecks = false;
  let outDir = `/tmp/bot-tournament`;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--matches" && argv[i + 1]) {
      matches = Number(argv[++i]);
    } else if ((a === "--turnCap" || a === "--turns") && argv[i + 1]) {
      turnCap = Number(argv[++i]);
    } else if (a === "--bot1" && argv[i + 1]) {
      bot1Raw = argv[++i];
    } else if (a === "--bot2" && argv[i + 1]) {
      bot2Raw = argv[++i];
    } else if (a === "--realDecks") {
      realDecks = true;
    } else if (a === "--outDir" && argv[i + 1]) {
      outDir = argv[++i]!;
    }
  }
  return {
    bot1: parseBotConfig(bot1Raw, "bot1-default"),
    bot2: parseBotConfig(bot2Raw, "bot2-default"),
    matches,
    outDir,
    realDecks,
    turnCap,
  };
}

// ---------------------------------------------------------------------------
// Per-match result
// ---------------------------------------------------------------------------
interface MatchResult {
  matchId: number;
  gameSeed: string;
  shuffleSeed: number;
  winner: string | null;
  totalTurns: number;
  totalMoves: number;
  cardsPlayed: number;
  p1Deck: string;
  p2Deck: string;
  finalStatus: string;
  reason: "winner" | "turnCap" | "stalled";
  moveCounts: Record<string, number>;
  durationMs: number;
}

const CARD_PLAY_IDS = new Set(["standardMove", "playUnit", "playSpell", "playGear", "playEquipment", "playFromHand"]);

// ---------------------------------------------------------------------------
// Mulberry32 RNG for deterministic seed derivation
// ---------------------------------------------------------------------------
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function hashSeed(seed: string): number {
  let h = 0x81_1c_9d_c5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01_00_01_93);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// One match
// ---------------------------------------------------------------------------
function runMatch(
  matchId: number,
  opts: CliOptions,
  matchRng: () => number,
): MatchResult {
  const t0 = Date.now();
  const gameSeed = `tourney-${matchId}-${Math.floor(matchRng() * 1e9).toString(36)}`;
  const shuffleSeed = Math.floor(matchRng() * 0xFFFFFFFF) >>> 0;

  const session = new EngineSession({
    realDecks: opts.realDecks,
    seed: gameSeed,
  });

  // Each match also gets per-match unique bot seeds so tied bots break
  // Different ways on the same starting state.
  const bot1Opts: BotDriverOptions = {
    ...opts.bot1,
    seed: `${opts.bot1.seed ?? "bot1"}-m${matchId}`,
  };
  const bot2Opts: BotDriverOptions = {
    ...opts.bot2,
    seed: `${opts.bot2.seed ?? "bot2"}-m${matchId}`,
  };
  const bot1 = new BotDriver("player-1", bot1Opts);
  const bot2 = new BotDriver("player-2", bot2Opts);

  // Deck labels — best-effort. Synthetic mode = "synthetic", real = the
  // Labels from real-decks.ts. We don't have direct access to the deck
  // Label here without poking at internals, so use a heuristic.
  const p1Deck = opts.realDecks ? "Fury/Chaos" : "synthetic";
  const p2Deck = opts.realDecks ? "Calm/Mind" : "synthetic";

  const MOVE_CAP = 2000;
  let moves = 0;
  let cardsPlayed = 0;
  let lastTurn = -1;
  let turnsObserved = 0;
  const moveCounts: Record<string, number> = {};
  let stalled = false;

  while (!session.isGameOver() && moves < MOVE_CAP) {
    const view = session.getView();

    if (view.turn.number !== lastTurn) {
      lastTurn = view.turn.number;
      turnsObserved++;
      if (turnsObserved > opts.turnCap) {break;}
    }

    const active = view.turn.activePlayer;
    const driver = active === "player-1" ? bot1 : bot2;
    const step = driver.step(session);
    if (!step) {
      // Active bot found no usable move. During chain priority /
      // Showdown focus the non-active player may have a legal pass move
      // — force-step their bot to unwedge before falling back to endTurn.
      const otherBot = active === "player-1" ? bot2 : bot1;
      const forced = otherBot.step(session, { force: true });
      if (forced) {
        moveCounts[forced.moveId] = (moveCounts[forced.moveId] ?? 0) + 1;
        if (forced.success && CARD_PLAY_IDS.has(forced.moveId)) {cardsPlayed++;}
        moves++;
        continue;
      }
    }
    if (!step) {
      // Bot returned null — try fallback endTurn.
      const fallback = session.applyMove(active, {
        moveId: "endTurn",
        params: { playerId: active },
      });
      if (!fallback.success) {
        stalled = true;
        break;
      }
      moveCounts["endTurn"] = (moveCounts["endTurn"] ?? 0) + 1;
    } else {
      moveCounts[step.moveId] = (moveCounts[step.moveId] ?? 0) + 1;
      if (step.success && CARD_PLAY_IDS.has(step.moveId)) {
        cardsPlayed++;
      }
    }
    moves++;
  }

  const finalView = session.getView();
  // The engine sometimes flags game-over via VP-threshold without flipping
  // `state.winner` (EngineSession.isGameOver checks `vp >= victoryScore`
  // Directly). Treat those as wins too so the tournament reflects actual
  // Game-completion rates.
  let winner = finalView.winner ?? null;
  if (!winner && session.isGameOver()) {
    const vpWinner = finalView.players.find(
      (p) => p.victoryPoints >= finalView.victoryScore,
    );
    if (vpWinner) {winner = vpWinner.id;}
  }
  let reason: MatchResult["reason"];
  if (winner) {reason = "winner";}
  else if (stalled) {reason = "stalled";}
  else {reason = "turnCap";}

  return {
    cardsPlayed,
    durationMs: Date.now() - t0,
    finalStatus: finalView.status,
    gameSeed,
    matchId,
    moveCounts,
    p1Deck,
    p2Deck,
    reason,
    shuffleSeed,
    totalMoves: moves,
    totalTurns: turnsObserved,
    winner,
  };
}

// ---------------------------------------------------------------------------
// CSV writer
// ---------------------------------------------------------------------------
function writeCsv(path: string, results: MatchResult[]): void {
  const headers = [
    "matchId",
    "gameSeed",
    "shuffleSeed",
    "winner",
    "totalTurns",
    "totalMoves",
    "cardsPlayed",
    "p1Deck",
    "p2Deck",
    "finalStatus",
    "reason",
    "durationMs",
  ];
  const lines = [headers.join(",")];
  for (const r of results) {
    lines.push(
      [
        r.matchId,
        JSON.stringify(r.gameSeed),
        r.shuffleSeed,
        JSON.stringify(r.winner ?? ""),
        r.totalTurns,
        r.totalMoves,
        r.cardsPlayed,
        JSON.stringify(r.p1Deck),
        JSON.stringify(r.p2Deck),
        JSON.stringify(r.finalStatus),
        r.reason,
        r.durationMs,
      ].join(","),
    );
  }
  writeFileSync(path, lines.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// Summary markdown
// ---------------------------------------------------------------------------
function summarize(results: MatchResult[]): {
  text: string;
  stats: Record<string, unknown>;
} {
  const total = results.length;
  let p1Wins = 0;
  let p2Wins = 0;
  let draws = 0;
  let stalled = 0;
  let totalTurns = 0;
  let totalMoves = 0;
  let totalCards = 0;
  const movesAgg: Record<string, number> = {};

  for (const r of results) {
    if (r.winner === "player-1") {p1Wins++;}
    else if (r.winner === "player-2") {p2Wins++;}
    else if (r.reason === "stalled") {stalled++;}
    else {draws++;}
    totalTurns += r.totalTurns;
    totalMoves += r.totalMoves;
    totalCards += r.cardsPlayed;
    for (const [moveId, n] of Object.entries(r.moveCounts)) {
      movesAgg[moveId] = (movesAgg[moveId] ?? 0) + n;
    }
  }

  const moveRanked = Object.entries(movesAgg).toSorted((a, b) => b[1] - a[1]);

  const fmt = (n: number, d = 2) => Number(n.toFixed(d));
  const stats = {
    avgCardsPlayed: fmt(totalCards / total),
    avgMoves: fmt(totalMoves / total),
    avgTurns: fmt(totalTurns / total),
    drawRate: fmt(draws / total),
    draws,
    p1WinRate: fmt(p1Wins / total),
    p1Wins,
    p2WinRate: fmt(p2Wins / total),
    p2Wins,
    stalled,
    topMoves: moveRanked.slice(0, 10),
    total,
  };

  const lines: string[] = [];
  lines.push(`# Bot Tournament Summary`);
  lines.push("");
  lines.push(`- Total matches: ${total}`);
  lines.push(`- player-1 wins: ${p1Wins} (${stats.p1WinRate})`);
  lines.push(`- player-2 wins: ${p2Wins} (${stats.p2WinRate})`);
  lines.push(`- draws / turn-capped: ${draws} (${stats.drawRate})`);
  lines.push(`- stalled (bot returned null + endTurn failed): ${stalled}`);
  lines.push(`- avg turns / match: ${stats.avgTurns}`);
  lines.push(`- avg moves / match: ${stats.avgMoves}`);
  lines.push(`- avg card-plays / match: ${stats.avgCardsPlayed}`);
  lines.push("");
  lines.push(`## Top move IDs by frequency`);
  lines.push("");
  lines.push(`| Move ID | Count |`);
  lines.push(`|---------|-------|`);
  for (const [moveId, n] of moveRanked.slice(0, 20)) {
    lines.push(`| ${moveId} | ${n} |`);
  }
  return { stats, text: lines.join("\n") + "\n" };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const opts = parseArgs(process.argv);
  mkdirSync(opts.outDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = join(opts.outDir, `tournament-${ts}.csv`);
  const summaryPath = join(opts.outDir, `tournament-${ts}-summary.md`);

  console.log(
    `tournament: matches=${opts.matches} turnCap=${opts.turnCap} realDecks=${opts.realDecks}`,
  );
  console.log(`  bot1=${JSON.stringify(opts.bot1)}`);
  console.log(`  bot2=${JSON.stringify(opts.bot2)}`);
  console.log(`  csv=${csvPath}`);
  console.log(`  summary=${summaryPath}`);

  // Top-level RNG so the entire tournament is reproducible from a single
  // Seed (--bot1 / --bot2 add per-match jitter on top).
  const tournamentSeed = hashSeed(`tourney-${opts.matches}-${opts.turnCap}`);
  const matchRng = makeRng(tournamentSeed);

  const results: MatchResult[] = [];
  for (let i = 1; i <= opts.matches; i++) {
    const r = runMatch(i, opts, matchRng);
    results.push(r);
    if (i % 10 === 0 || i === opts.matches) {
      process.stdout.write(
        `  [${i}/${opts.matches}] last: winner=${r.winner ?? "-"} turns=${r.totalTurns} moves=${r.totalMoves} cardsPlayed=${r.cardsPlayed}\n`,
      );
    }
  }

  writeCsv(csvPath, results);
  const { text } = summarize(results);
  writeFileSync(summaryPath, text);
  console.log(`\nDone. CSV: ${csvPath}\nSummary: ${summaryPath}`);
  process.stdout.write(`\n--- SUMMARY ---\n${text}`);
}

main();
