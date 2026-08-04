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
import {
  advanceTurn,
  buildDefaultDeck,
  createPlayableGame,
  definitionIdOf,
  getCardMeta,
  getZoneCards,
  type Engine,
} from "./game-setup";

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
const DECK_STRATEGY = arg("--deck-strategy", "cheap") as "cheap" | "random";

mkdirSync(OUT, { recursive: true });

const DOMAINS = ["fury", "calm", "mind", "body", "chaos", "order"];
const DOMAIN_PAIRS: [string, string][] = [];
for (let i = 0; i < DOMAINS.length; i++) {
  for (let j = i + 1; j < DOMAINS.length; j++) {
    DOMAIN_PAIRS.push([DOMAINS[i], DOMAINS[j]]);
  }
}

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

function compact(s: RiftboundGameState, engine?: Engine) {
  const zoneCards = (z: string) =>
    engine ? getZoneCards(engine, z).map((id) => ({ id, exhausted: getCardMeta(engine, id)?.exhausted })) : [];
  return {
    turn: s.turn,
    status: s.status,
    pendingChoice: (s as any).pendingChoice,
    interaction: (s as any).interaction,
    vp: Object.fromEntries(
      Object.entries(s.players).map(([id, p]: [string, any]) => [id, p?.victoryPoints ?? 0])
    ),
    runePools: s.runePools,
    // Rule 143.4 / 315.3.b need these visible in the trace.
    base: zoneCards("base"),
    runePoolZone: zoneCards("runePool"),
    battlefields: Object.fromEntries(
      Object.entries(s.battlefields).map(([id, bf]: [string, any]) => [
        id,
        {
          controller: bf.controller,
          contested: bf.contested,
          units: zoneCards(`battlefield-${id}`),
        },
      ])
    ),
  };
}

const NEVER_PICK = new Set(["concede", "removePlayer", "invitePlayer", "counterSpell"]);

/** Light bias so games get resources first and then play cards, without being deterministic. */
const WEIGHT: Record<string, number> = {
  exhaustRune: 8,
  playUnit: 5,
  playSpell: 4,
  playGear: 4,
  standardMove: 4,
  passChainPriority: 3,
  passShowdownFocus: 3,
  activateAbility: 2,
  recycleRune: 1,
  counterSpell: 1,
};

function pickWeighted(moves: any[], rand: () => number) {
  const w = moves.map((m) => WEIGHT[m.moveId] ?? 2);
  const total = w.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < moves.length; i++) {
    r -= w[i];
    if (r <= 0) return moves[i];
  }
  return moves[moves.length - 1];
}

/** Who should act next: pendingChoice prompter > chain priority holder > showdown focus holder > turn player. */
function actingPlayer(s: RiftboundGameState): string {
  const pc: any = (s as any).pendingChoice;
  if (pc?.prompter) return pc.prompter;
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
  const deck1 = buildDefaultDeck(allCards, d1a, d1b, DECK_STRATEGY, `${seed}-p1`);
  const deck2 = buildDefaultDeck(allCards, d2a, d2b, DECK_STRATEGY, `${seed}-p2`);
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
    let chosen = pool.length ? pickWeighted(pool, rand) : undefined;
    if (!chosen) {
      // Nothing pickable — try the appropriate escape hatch for the current state.
      const pc: any = (s as any).pendingChoice;
      const ia: any = (s as any).interaction;
      chosen = pc
        ? // Engine gap: pendingChoice with no valid picks (e.g. empty revealed hand)
          // has no escape hatch. Record it as a deadlock finding.
          {
            moveId: "resolvePendingChoice",
            params:
              pc.type === "name-card"
                ? { playerId: active, pickedName: pc.options?.[0] }
                : { playerId: active, pickedCardId: pc.revealed?.[0] },
          }
        : ia?.chain?.active
          ? { moveId: "passChainPriority", params: { playerId: active } }
          : ia?.showdownStack?.length
            ? { moveId: "passShowdownFocus", params: { playerId: active } }
            : { moveId: "endTurn", params: { playerId: active } };
    }
    const result = engine.executeMove(chosen.moveId, {
      params: (chosen.params ?? {}) as any,
      playerId: active,
    });

    // Hard invariant: a play* move must have deducted at least its cost.
    // Catches the class where enumerator/condition credit resources the reducer
    // never charges (e.g. potential-rune-energy widened enumerator only).
    let costViolation: string | undefined;
    if ((result as any)?.success && /^play(Unit|Spell|Gear|FromChampionZone)$/.test(chosen.moveId)) {
      const before = s.runePools?.[active]?.energy ?? 0;
      const after = engine.getState().runePools?.[active]?.energy ?? 0;
      const def = allCards.find((c) => chosen.params?.cardId?.endsWith(c.id));
      const cost = def?.energyCost ?? 0;
      if (before - after < cost && cost > 0) {
        costViolation = `${chosen.moveId} ${def?.id} cost=${cost} but energy ${before}→${after} (deducted ${before - after})`;
      }
    }

    appendFileSync(
      traceFile,
      JSON.stringify({
        seq: seq++,
        costViolation,
        turn: (s.turn as any)?.number ?? null,
        phase: (s.turn as any)?.phase ?? null,
        player: active,
        available: available.map((m: any) => ({ moveId: m.moveId, params: m.params })),
        chosen: { moveId: chosen.moveId, params: chosen.params },
        success: (result as any)?.success ?? true,
        error: (result as any)?.error,
        enumErr,
        hand: getZoneCards(engine, "hand", active).map((id) => ({
          id,
          def: definitionIdOf(engine, id),
        })),
        state: compact(engine.getState(), engine),
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
        JSON.stringify({ seq: seq++, deadlock: true, active, state: compact(s, engine) }) +
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
    finalState: compact(engine.getState(), engine),
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
