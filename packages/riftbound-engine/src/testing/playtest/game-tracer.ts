#!/usr/bin/env bun
/**
 * Plays bot-vs-bot Riftbound games and emits JSONL traces for observer/coverage agents.
 *
 *   bun game-tracer.ts --games 5 --max-turns 30 --out /tmp/playtest-traces
 *
 * Each trace line: {seq, turn, phase, player, available, chosen, success}
 * Also writes decks.json (cards used) and history-<seed>.json (RuleEngine replay history).
 */
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { RuleEngine, type PlayerId } from "@tcg/core";
import { riftboundDefinition } from "../../game-definition/definition";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";

let getAllCards: (() => any[]) | undefined;
try {
  ({ getAllCards } = await import("../../../../riftbound-cards/src/data/all-cards"));
} catch {
  /* fall back to fake ids */
}

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

const P1 = "player-1";
const P2 = "player-2";

function mulberry32(seed: string) {
  let a = 0;
  for (const c of seed) a = (a * 31 + c.charCodeAt(0)) | 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Deck = { main: string[]; runes: string[]; battlefields: string[]; legend?: string };

function buildDeck(tag: string): Deck {
  if (getAllCards) {
    const all = getAllCards();
    const by = (t: string) => all.filter((c: any) => c.cardType === t);
    const pick = <T>(xs: T[], n: number) => {
      const out: T[] = [];
      for (let i = 0; i < n; i++) out.push(xs[i % xs.length]);
      return out;
    };
    const units = by("unit");
    const spells = by("spell");
    const runes = by("rune");
    const bfs = by("battlefield");
    if (units.length && runes.length && bfs.length) {
      return {
        main: [...pick(units, 30), ...pick(spells, 10)].map((c: any) => c.id),
        runes: pick(runes, 12).map((c: any) => c.id),
        battlefields: pick(bfs, 2).map((c: any) => c.id),
      };
    }
  }
  return {
    main: Array.from({ length: 40 }, (_, i) => `${tag}-card-${i}`),
    runes: Array.from({ length: 12 }, (_, i) => `${tag}-rune-${i}`),
    battlefields: [`${tag}-bf-0`, `${tag}-bf-1`],
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

function setupGame(seed: string, d1: Deck, d2: Deck) {
  const engine = new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    [
      { id: P1, name: "Bot1" },
      { id: P2, name: "Bot2" },
    ],
    { seed }
  );
  for (const [pid, d] of [[P1, d1], [P2, d2]] as const) {
    engine.executeMove("initializeMainDeck", {
      params: { cardIds: d.main, playerId: pid },
      playerId: pid as PlayerId,
    });
    engine.executeMove("initializeRuneDeck", {
      params: { runeIds: d.runes, playerId: pid },
      playerId: pid as PlayerId,
    });
    engine.executeMove("drawInitialHand", {
      params: { playerId: pid },
      playerId: pid as PlayerId,
    });
  }
  engine.executeMove("placeBattlefields", {
    params: { battlefieldIds: [...d1.battlefields, ...d2.battlefields] },
    playerId: P1 as PlayerId,
  });
  engine.executeMove("transitionToPlay", { params: {}, playerId: P1 as PlayerId });
  return engine;
}

function playAndTrace(seed: string) {
  const rand = mulberry32(seed);
  const d1 = buildDeck(P1);
  const d2 = buildDeck(P2);
  const engine = setupGame(seed, d1, d2);
  const traceFile = join(OUT, `game-${seed}.jsonl`);
  writeFileSync(traceFile, "");

  const NEVER_PICK = new Set(["concede", "removePlayer"]);
  let seq = 0;
  let safety = MAX_TURNS * 40;
  while (engine.getState().status === "playing" && safety-- > 0) {
    const s = engine.getState();
    if (((s.turn as any)?.number ?? 0) > MAX_TURNS) break;
    const active = s.turn.activePlayer as PlayerId;
    let available: any[] = [];
    try {
      available = engine.enumerateMoves(active, { validOnly: true }) as any[];
    } catch (e) {
      available = [{ moveId: "endTurn", params: { playerId: active }, _enumErr: String(e) }];
    }
    const pickable = available.filter((m) => !NEVER_PICK.has(m.moveId));
    const nonEnd = pickable.filter((m) => m.moveId !== "endTurn");
    const pool = nonEnd.length > 0 && rand() < 0.85 ? nonEnd : pickable;
    const chosen = pool[Math.floor(rand() * pool.length)] ?? {
      moveId: "endTurn",
      params: { playerId: active },
    };
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
        available: available.map((m: any) => ({ moveId: m.moveId, params: m.params, _enumErr: m._enumErr })),
        chosen: { moveId: chosen.moveId, params: chosen.params },
        success: (result as any)?.success ?? true,
        error: (result as any)?.error,
        state: compact(engine.getState()),
      }) + "\n"
    );

    if (!(result as any)?.success && chosen.moveId !== "endTurn") {
      engine.executeMove("endTurn", { params: { playerId: active }, playerId: active });
    }
  }

  writeFileSync(
    join(OUT, `history-${seed}.json`),
    JSON.stringify((engine as any).getReplayHistory?.() ?? [], null, 0)
  );
  return { seed, deck1: d1, deck2: d2, steps: seq, finalState: compact(engine.getState()) };
}

const summaries = [];
for (let g = 0; g < N_GAMES; g++) {
  const seed = `${SEED_BASE}-${g}`;
  try {
    summaries.push(playAndTrace(seed));
    console.log(`game ${seed}: ${summaries[summaries.length - 1].steps} steps`);
  } catch (e) {
    console.error(`game ${seed} crashed: ${e}`);
    summaries.push({ seed, error: String(e) });
  }
}

writeFileSync(
  join(OUT, "decks.json"),
  JSON.stringify(
    { games: summaries, allDeckCards: [...new Set(summaries.flatMap((s: any) => [...(s.deck1?.main ?? []), ...(s.deck2?.main ?? [])]))] },
    null,
    2
  )
);
console.log(`\nwrote ${N_GAMES} traces -> ${OUT}`);
