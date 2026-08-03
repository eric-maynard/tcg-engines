#!/usr/bin/env bun
/**
 * Plays bot-vs-bot Riftbound games via createPlayableGame() and emits JSONL
 * traces for observer/coverage agents.
 *
 *   bun game-tracer.ts --games 5 --max-turns 30 --out /tmp/playtest-traces
 *
 * Each trace line: {seq, turn, phase, player, available, chosen, success, state}
 * Also writes decks.json and history-<seed>.json (RuleEngine replay history).
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PlayerId } from "@tcg/core";
import type { RiftboundGameState } from "../../types";
import { advanceTurn, buildDefaultDeck, createPlayableGame, type Engine } from "./game-setup";

let getAllCards: (() => any[]) | undefined;
try {
  ({ getAllCards } = await import("../../../../riftbound-cards/src/data/all-cards"));
} catch {}

const argv = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const N_GAMES = parseInt(arg("--games", "5"), 10);
const MAX_TURNS = parseInt(arg("--max-turns", "30"), 10);
const OUT = arg("--out", "/tmp/playtest-traces");
const SEED_BASE = arg("--seed", "trace");

mkdirSync(OUT, { recursive: true });

const DOMAIN_PAIRS: [string, string][] = [
  ["fury", "chaos"],
  ["mind", "order"],
  ["body", "calm"],
  ["fury", "body"],
  ["mind", "chaos"],
];

function mulberry32(seed: string) {
  let a = 0;
  for (const c of seed) a = (a * 31 + c.charCodeAt(0)) | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function compact(s: RiftboundGameState) {
  return {
    turn: s.turn,
    status: s.status,
    vp: Object.fromEntries(
      Object.entries(s.players).map(([id, p]: [string, any]) => [id, p?.victoryPoints ?? 0])
    ),
    runePools: s.runePools,
    battlefields: Object.fromEntries(
      Object.entries(s.battlefields).map(([id, bf]: [string, any]) => [
        id,
        { controller: bf.controller, contested: bf.contested, units: bf.units?.length ?? 0 },
      ])
    ),
  };
}

const NEVER_PICK = new Set(["concede", "removePlayer"]);

/** Who should act next: chain priority holder > showdown focus holder > turn player. */
function actingPlayer(s: RiftboundGameState): string {
  const ia: any = (s as any).interaction;
  if (ia?.chain?.active && ia.chain.activePlayer) return ia.chain.activePlayer;
  const sd = ia?.showdownStack?.[ia.showdownStack.length - 1];
  if (sd?.active && sd.focusPlayer) return sd.focusPlayer;
  return s.turn.activePlayer;
}

function playAndTrace(seed: string, gameIdx: number, allCards: any[]) {
  const rand = mulberry32(seed);
  const [d1a, d1b] = DOMAIN_PAIRS[gameIdx % DOMAIN_PAIRS.length];
  const [d2a, d2b] = DOMAIN_PAIRS[(gameIdx + 1) % DOMAIN_PAIRS.length];
  const deck1 = buildDefaultDeck(allCards, d1a, d1b);
  const deck2 = buildDefaultDeck(allCards, d2a, d2b);
  const { engine, instanceIds } = createPlayableGame(allCards, deck1, deck2, seed);

  const traceFile = join(OUT, `game-${seed}.jsonl`);
  writeFileSync(traceFile, "");

  let seq = 0;
  let safety = MAX_TURNS * 60;
  let consecFail = 0;
  while (engine.getState().status === "playing" && safety-- > 0) {
    const s = engine.getState();
    if (((s.turn as any)?.number ?? 0) > MAX_TURNS) break;
    const active = actingPlayer(s) as PlayerId;
    let available: any[] = [];
    let enumErr: string | undefined;
    try {
      available = engine.enumerateMoves(active, { validOnly: true }) as any[];
    } catch (e) {
      enumErr = String(e);
    }
    const pickable = available.filter((m) => !NEVER_PICK.has(m.moveId));
    const nonEnd = pickable.filter((m) => m.moveId !== "endTurn");
    const pool = nonEnd.length > 0 && rand() < 0.85 ? nonEnd : pickable;
    let chosen = pool[Math.floor(rand() * pool.length)];
    if (!chosen) {
      // Nothing pickable for the priority holder — try the pass move for the current interaction.
      const ia: any = (s as any).interaction;
      chosen = ia?.chain?.active
        ? { moveId: "passChainPriority", params: { playerId: active } }
        : ia?.showdownStack?.length
          ? { moveId: "passFocus", params: { playerId: active } }
          : { moveId: "endTurn", params: { playerId: active } };
    }
    const result = engine.executeMove(chosen.moveId, {
      params: (chosen.params ?? {}) as any,
      playerId: active,
    });

    appendFileSync(
      traceFile,
      JSON.stringify({
        seq: seq++,
        turn: (s.turn as any)?.number ?? null,
        phase: (s.turn as any)?.phase ?? null,
        player: active,
        available: available.map((m: any) => ({ moveId: m.moveId, params: m.params })),
        chosen: { moveId: chosen.moveId, params: chosen.params },
        success: (result as any)?.success ?? true,
        error: (result as any)?.error,
        enumErr,
        state: compact(engine.getState()),
      }) + "\n"
    );

    if ((result as any)?.success) {
      consecFail = 0;
      if (chosen.moveId === "endTurn") {
        advanceTurn(engine, ["player-1", "player-2"]);
      }
    } else if (++consecFail > 5) {
      appendFileSync(
        traceFile,
        JSON.stringify({ seq: seq++, deadlock: true, active, state: compact(s), interaction: (s as any).interaction }) +
          "\n"
      );
      break;
    }
  }

  writeFileSync(
    join(OUT, `history-${seed}.json`),
    JSON.stringify((engine as any).getReplayHistory?.() ?? [], null, 0)
  );
  return {
    seed,
    domains: { p1: [d1a, d1b], p2: [d2a, d2b] },
    deck1,
    deck2,
    instanceIds,
    steps: seq,
    finalState: compact(engine.getState()),
  };
}

if (!getAllCards) {
  console.error("getAllCards() unavailable — cannot build real decks");
  process.exit(1);
}
const allCards = getAllCards();
console.log(`card pool: ${allCards.length} cards`);

const summaries: any[] = [];
for (let g = 0; g < N_GAMES; g++) {
  const seed = `${SEED_BASE}-${g}`;
  try {
    const s = playAndTrace(seed, g, allCards);
    summaries.push(s);
    console.log(
      `game ${seed}: ${s.steps} steps, final vp=${JSON.stringify(s.finalState.vp)} status=${s.finalState.status}`
    );
  } catch (e) {
    console.error(`game ${seed} crashed: ${(e as Error).stack ?? e}`);
    summaries.push({ seed, error: String(e) });
  }
}

writeFileSync(
  join(OUT, "decks.json"),
  JSON.stringify(
    {
      games: summaries,
      allDeckCards: [
        ...new Set(
          summaries.flatMap((s: any) => [
            ...(s.instanceIds?.p1 ?? []),
            ...(s.instanceIds?.p2 ?? []),
          ])
        ),
      ],
    },
    null,
    2
  )
);
console.log(`\nwrote ${N_GAMES} traces -> ${OUT}`);
