/**
 * Random-legal-move Monkey for Riftbound
 *
 * Phase B batch 11 agent O — drives the engine API directly with
 * uniformly-random LEGAL moves (no LLM tokens during play).
 *
 * Architecture:
 *   1. Spin up RuleEngine with 2 prebuilt decks via the same setup
 *      sequence used by bot.test.ts (initializeMainDeck → initializeRuneDeck
 *      → drawInitialHand → placeBattlefields → transitionToPlay).
 *   2. Loop until win / loss / turn-cap (default 30 turns):
 *        - enumerate legal moves for active player
 *        - pick one uniformly at random with a small bias AWAY from
 *          endTurn/passFocus to keep the game moving
 *        - executeMove + capture state-diff + patches + any error
 *   3. Append everything to /tmp/random-monkey/<run-id>/transcript.jsonl
 *
 * Usage:
 *   bun run scripts/random-monkey/run.ts             # 5 default seeds
 *   bun run scripts/random-monkey/run.ts --seed 42   # single seed
 *   bun run scripts/random-monkey/run.ts --turns 50  # turn cap
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RuleEngine } from "../../packages/core/src/index";
import type { PlayerId } from "../../packages/core/src/index";
import { riftboundDefinition } from "../../packages/riftbound-engine/src/game-definition/definition";
import {
  CardDefinitionRegistry,
  setGlobalCardRegistry,
} from "../../packages/riftbound-engine/src/operations/card-lookup";
import type {
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../packages/riftbound-engine/src/types";
import {
  type RegisteredDeck,
  getPrebuiltDecks,
  seedRealDeckRegistry,
} from "./real-decks";

const P1 = "player-1";
const P2 = "player-2";

interface RunOptions {
  seed: string;
  turnCap: number;
  movesCap: number;
  runDir: string;
  realDecks?: boolean;
  /**
   * Batch 19-LL: swap deck assignments (P1 gets Calm/Mind, P2 gets Fury/Chaos)
   * to isolate first-player bias from deck-imbalance bias.
   */
  swapDecks?: boolean;
  /**
   * Use the priority-table picker (a greedy "play cards first, end-turn last"
   * heuristic) instead of the uniform-random picker. Real-deck runs default
   * this on because the random picker on a real deck spends most turns
   * exhausting runes without ever playing the cards in hand.
   */
  priorityPick?: boolean;
  /**
   * Batch 18-II aggressive mode: deepens late-game coverage by preferring
   * assignAttacker / assignDefender over passShowdownFocus, and reaction-
   * spell plays during opponent windows. Implies priorityPick.
   */
  aggressive?: boolean;
  /**
   * Cycle detector: watch the move trail; if the same (moveId+params) appears
   * > 8 times in any 20-move window, log a CYCLE finding and break out.
   */
  noProgressDetect?: boolean;
}

interface MonkeyMove {
  moveId: string;
  params: Record<string, unknown>;
  playerId: PlayerId;
  synthetic?: boolean;
}

interface EngineLike {
  getState(): RiftboundGameState;
  executeMove(
    moveId: string,
    ctx: { params: Record<string, unknown>; playerId: PlayerId },
  ): {
    success: boolean;
    error?: string;
    errorCode?: string;
    patches?: unknown[];
  };
  enumerateMoves(
    playerId: PlayerId,
    opts: { validOnly: boolean },
  ): { moveId: string; params: unknown; isValid: boolean }[];
  getFlowManager?(): {
    getCurrentPhase?(): string | undefined;
    getCurrentPlayer?(): string | undefined;
    getTurnNumber?(): number;
    getGameState?(): RiftboundGameState;
  } | undefined;
}

/**
 * Pump the FlowManager: repeatedly call `checkEndConditions()` until no
 * further phase/segment/turn transition fires. This works around two
 * generic engine bugs simultaneously:
 *
 *   - Finding O-1 (endTurn flow drift): the engine never reads FlowManager
 *     mutations back into its own `currentState`. The monkey would see
 *     `state.turn` frozen at turn 1, main, P1.
 *   - Finding R-1 (endIf cascade not pumped): the engine calls
 *     `checkEndConditions()` exactly once after each move, but that
 *     advances at most ONE phase. A chain of `endIf: () => true` phases
 *     (e.g. riftbound's beginning → channel → draw → main) needs multiple
 *     ticks to settle. Without pumping, the FM stops at `channel` after
 *     `transitionToPlay` and the monkey only ever sees `endTurn`.
 *
 * Both bugs live in @tcg/core, which P is treating as out-of-scope for
 * batch 11/12 because the fix affects gundam/lorcana too. This is a
 * harness-side workaround so the monkey can actually drive a riftbound
 * game forward and surface DOWNSTREAM rule gaps.
 */
function syncFlowIntoEngine(engine: EngineLike): void {
  const fm = engine.getFlowManager?.();
  if (!fm) {return;}
  const internal = engine as unknown as { currentState?: RiftboundGameState };
  if (!internal.currentState) {return;}

  // Pump up to N times to cascade through all `endIf: true` phases. The
  // Cap protects against pathological loops; in practice 4-5 iterations
  // Are enough for any single move (channel → draw → main, etc.).
  const maxPumps = 32;
  let prevPhase: string | undefined;
  let prevPlayer: string | undefined;
  let prevTurn: number | undefined;
  for (let i = 0; i < maxPumps; i++) {
    const ce = (fm as unknown as { checkEndConditions?: () => void }).checkEndConditions;
    if (typeof ce === "function") {ce.call(fm);}
    const phase = fm.getCurrentPhase?.();
    const player = fm.getCurrentPlayer?.();
    const turn = fm.getTurnNumber?.();
    if (phase === prevPhase && player === prevPlayer && turn === prevTurn) {
      break;
    }
    prevPhase = phase;
    prevPlayer = player;
    prevTurn = turn;
  }

  const fmState = fm.getGameState?.();
  if (!fmState) {return;}
  // Full sync: copy the FM's view of state back into the engine. This is
  // The same workaround pattern as `rules-audit/helpers.ts` (which does
  // `internal.currentState = flowManager.getGameState()` after each
  // Phase advance). The engine itself never reads FM mutations back,
  // So everything the flow hooks do (empty rune pool at end of draw,
  // Ready units in awaken, damage cleanup in ending, etc.) is lost
  // From the engine's view without this copy.
  internal.currentState = fmState;
}

// ---------------------------------------------------------------------------
// Mulberry32 RNG — small, fast, fully deterministic from a numeric seed.
// We re-seed our own RNG independent of the engine's internal RNG so that
// Our MOVE-PICK randomness is reproducible per run even when the engine
// Itself shuffles via its own SeededRNG.
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
  let h = 0x811C9DC5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01_00_01_93);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Card registry seeding
//
// The Riftbound move enumerators (playUnit, playSpell, playGear, etc.)
// Look up every card-instance ID in the global card registry. Cards with
// No registry entry are skipped — and the bare default monkey setup uses
// Synthetic IDs (`player-1-card-0` …) that aren't in any real card pack.
// Without seeding the registry, the monkey ONLY ever sees `endTurn` and
// `concede` as legal moves, regardless of phase.
//
// We register a tiny synthetic pool that exercises the major card types
// (1-cost / 2-cost units, 1-cost spells, basic runes) so move enumerators
// Have something to do during the main phase. The IDs match the deck
// IDs the setup code feeds into `initializeMainDeck`.
//
// IMPORTANT: this is monkey-fuzzing fodder, not a real card set. Real
// Regression tests still use real card definitions from
// `packages/riftbound-cards`.
// ---------------------------------------------------------------------------
function seedCardRegistry(): void {
  const registry = new CardDefinitionRegistry();

  // For each player, register their 40 main-deck cards and 12 runes.
  // The card-instance ID encodes the player + index; we don't need
  // Distinct definitions per index, just SOMETHING in the registry.
  for (const pid of [P1, P2]) {
    for (let i = 0; i < 40; i++) {
      const id = `${pid}-card-${i}`;
      // Mix of unit / spell / gear so multiple play-move enumerators fire.
      const variant = i % 6;
      if (variant === 0) {
        registry.register(id, {
          cardType: "unit",
          energyCost: 1,
          id,
          keywords: [],
          might: 1,
          name: `M-Unit-${i}`,
        });
      } else if (variant === 1) {
        registry.register(id, {
          cardType: "unit",
          energyCost: 2,
          id,
          keywords: [],
          might: 2,
          name: `M-Unit2-${i}`,
        });
      } else if (variant === 2) {
        registry.register(id, {
          cardType: "spell",
          energyCost: 1,
          id,
          keywords: [],
          name: `M-Spell-${i}`,
          timing: "action",
        });
      } else if (variant === 3) {
        registry.register(id, {
          cardType: "spell",
          energyCost: 1,
          id,
          keywords: [],
          name: `M-Reaction-${i}`,
          timing: "reaction",
        });
      } else if (variant === 4) {
        registry.register(id, {
          cardType: "gear",
          energyCost: 1,
          id,
          keywords: [],
          mightBonus: 1,
          name: `M-Gear-${i}`,
        });
      } else {
        registry.register(id, {
          cardType: "unit",
          energyCost: 0,
          id,
          keywords: [],
          might: 1,
          name: `M-FreeUnit-${i}`,
        });
      }
    }
    // Runes — basic rune defs add 1 energy on exhaust.
    for (let i = 0; i < 12; i++) {
      registry.register(`${pid}-rune-${i}`, {
        cardType: "rune",
        energyCost: 0,
        id: `${pid}-rune-${i}`,
        keywords: [],
        name: `M-Rune-${i}`,
      });
    }
  }
  setGlobalCardRegistry(registry);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
function createEngine(seed: string): EngineLike {
  return new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    [
      { id: P1, name: "Monkey1" },
      { id: P2, name: "Monkey2" },
    ],
    { seed: `monkey-${seed}` },
  ) as unknown as EngineLike;
}

/**
 * Real-deck setup: build prebuilt decks, seed the global registry with
 * per-instance lookups, pre-place battlefields in `battlefieldRow`, then run
 * the standard setup move sequence. Drives the flow forward through the
 * pregame -> first-turn-main cascade the same way `EngineSession` does
 * (channel.onBegin auto-channels starting runes, draw.onBegin draws 1).
 */
function runRealDeckSetup(engine: EngineLike, swapDecks = false, shuffleSeed?: number): { decks: ReturnType<typeof getPrebuiltDecks>; registered: Record<string, RegisteredDeck>; battlefieldIds: string[] } {
  const decks = getPrebuiltDecks({ shuffleSeed, swapDecks });
  const { byPlayer, battlefieldInstanceIds } = seedRealDeckRegistry(decks);

  // Pre-place battlefield instances in the engine's internalState so
  // PlaceBattlefields → moveCard can find them in `battlefieldRow`.
  const internal = (engine as unknown as {
    internalState: {
      cards: Record<string, { definitionId: string; owner: string; controller: string; zone: string; position?: number }>;
      cardMetas: Record<string, RiftboundCardMeta>;
      zones: Record<string, { cardIds: string[] } | undefined>;
    };
  }).internalState;
  for (let i = 0; i < battlefieldInstanceIds.length; i++) {
    const stableId = battlefieldInstanceIds[i]!;
    const defId = decks[0].battlefieldIds[i]!;
    internal.cards[stableId] = {
      controller: P1,
      definitionId: defId,
      owner: P1,
      position: undefined,
      zone: "battlefieldRow",
    };
    internal.cardMetas[stableId] = {
      buffed: false,
      combatRole: null,
      damage: 0,
      exhausted: false,
      hidden: false,
      stunned: false,
    };
    const row = internal.zones.battlefieldRow;
    if (row && !row.cardIds.includes(stableId)) {
      row.cardIds.push(stableId);
    }
  }

  for (const pid of [P1, P2]) {
    const reg = byPlayer[pid];
    if (!reg) {throw new Error(`no registered deck for ${pid}`);}
    engine.executeMove("initializeMainDeck", {
      params: { cardIds: reg.mainDeckInstanceIds, playerId: pid },
      playerId: pid as PlayerId,
    });
    engine.executeMove("initializeRuneDeck", {
      params: { playerId: pid, runeIds: reg.runeDeckInstanceIds },
      playerId: pid as PlayerId,
    });
    engine.executeMove("drawInitialHand", {
      params: { playerId: pid },
      playerId: pid as PlayerId,
    });
  }

  engine.executeMove("placeBattlefields", {
    params: { battlefieldIds: battlefieldInstanceIds },
    playerId: P1 as PlayerId,
  });
  engine.executeMove("transitionToPlay", {
    params: {},
    playerId: P1 as PlayerId,
  });

  // Drive the pregame -> main cascade via flowManager.nextPhase().
  // See engine-session.ts for the rationale: the flow stops at `channel`
  // After transitionToPlay because executeMove only cascades one phase per
  // Dispatch. We push it forward to `main` so the first turn is playable.
  const fm = (engine as unknown as { getFlowManager?: () => { getCurrentPhase?: () => string | undefined; nextPhase?: () => void; getGameState?: () => RiftboundGameState } }).getFlowManager?.();
  if (fm) {
    const SAFETY_CAP = 8;
    for (let i = 0; i < SAFETY_CAP; i++) {
      const phase = fm.getCurrentPhase?.();
      if (phase === "main" || !phase) {break;}
      fm.nextPhase?.();
    }
    const flowState = fm.getGameState?.();
    if (flowState) {
      (engine as unknown as { currentState: RiftboundGameState }).currentState = flowState;
    }
  }

  return { battlefieldIds: battlefieldInstanceIds, decks, registered: byPlayer };
}

function runSetup(engine: EngineLike): void {
  for (const pid of [P1, P2]) {
    engine.executeMove("initializeMainDeck", {
      params: {
        cardIds: Array.from({ length: 40 }, (_, i) => `${pid}-card-${i}`),
        playerId: pid,
      },
      playerId: pid as PlayerId,
    });
    engine.executeMove("initializeRuneDeck", {
      params: {
        playerId: pid,
        runeIds: Array.from({ length: 12 }, (_, i) => `${pid}-rune-${i}`),
      },
      playerId: pid as PlayerId,
    });
    engine.executeMove("drawInitialHand", {
      params: { playerId: pid },
      playerId: pid as PlayerId,
    });
  }
  engine.executeMove("placeBattlefields", {
    params: { battlefieldIds: ["bf-1", "bf-2"] },
    playerId: P1 as PlayerId,
  });
  engine.executeMove("transitionToPlay", {
    params: {},
    playerId: P1 as PlayerId,
  });
}

// ---------------------------------------------------------------------------
// Synthetic move enumerators
//
// Many engine moves have no `enumerator` function and therefore never appear
// In `engine.enumerateMoves(..., {validOnly: true})`. That's intentional for
// Some (engine-internal effects like `recallUnit`, `addCounter`, `killUnit`)
// But for a fuzzer we WANT to exercise those code paths from random states —
// They're a major source of latent bugs (per-card meta corruption, zone
// Drift, etc.). We synthesize plausible parameter combinations from the
// Current game state and tag them as `synthetic: true` so the transcript
// Makes it obvious which moves the harness invented vs. which the engine
// Enumerated as legal.
//
// We deliberately do NOT call moves the rules explicitly forbid as "player
// Moves" (recallUnit, channelRunes both have `condition: () => false`); those
// Are engine-only and will trivially reject. We target moves whose `condition`
// Is permissive OR missing (e.g. `assignAttacker`, `resolveCombat`,
// `advancePhase`).
// ---------------------------------------------------------------------------
interface SyntheticMove {
  moveId: string;
  params: Record<string, unknown>;
  playerId: PlayerId;
  synthetic: true;
}

function synthesizeMoves(state: RiftboundGameState): SyntheticMove[] {
  const out: SyntheticMove[] = [];
  const players: PlayerId[] = Object.keys(state.players ?? {}) as PlayerId[];
  const active = state.turn.activePlayer as PlayerId;

  // AdvancePhase — active player can advance through phases without endTurn.
  // Surfaces phase-transition bugs that endTurn skips over.
  if (state.status === "playing" && !state.pendingChoice) {
    out.push({
      moveId: "advancePhase",
      params: { playerId: active },
      playerId: active,
      synthetic: true,
    });
  }

  // Combat primitives (assignAttacker / assignDefender / assignDamage /
  // ResolveCombat / clearCombatState / contestBattlefield). The first four
  // Have NO condition guard at all, so they're a goldmine for the monkey to
  // Surface generic bugs in combat-state machinery.
  for (const [bfId, bf] of Object.entries(state.battlefields ?? {})) {
    const bfZoneKey = `battlefield-${bfId}`;
    const cardsAtBf =
      (state.zones as unknown as Record<string, { cards?: string[] }> | undefined)?.[bfZoneKey]
        ?.cards ?? [];
    // ContestBattlefield — has an enumerator, so usually appears via the
    // Engine. Skip — don't duplicate.

    // ResolveCombat / clearCombatState — fire even when bf isn't contested.
    out.push({
      moveId: "resolveCombat",
      params: { battlefieldId: bfId, playerId: active },
      playerId: active,
      synthetic: true,
    });
    out.push({
      moveId: "clearCombatState",
      params: { battlefieldId: bfId, playerId: active },
      playerId: active,
      synthetic: true,
    });

    // AssignAttacker / assignDefender — one synthesized per unit per bf.
    for (const unitId of cardsAtBf) {
      out.push({
        moveId: "assignAttacker",
        params: { playerId: active, unitId },
        playerId: active,
        synthetic: true,
      });
      out.push({
        moveId: "assignDefender",
        params: { playerId: active, unitId },
        playerId: active,
        synthetic: true,
      });
      out.push({
        moveId: "assignDamage",
        params: { amount: 1, playerId: active, targetId: unitId },
        playerId: active,
        synthetic: true,
      });
    }

    // Bf metadata only used to silence unused-var lint
    if ((bf as { controller?: string }).controller === undefined) {
      // No-op
    }
  }

  // Equipment moves — equip a gear card from hand to a unit on the field.
  // Find gear cards in any player's hand (registry knows by id pattern) and
  // Pair with any unit on the field owned by the same player.
  const allZones = (state.zones as unknown as Record<string, { cards?: string[] }>) ?? {};
  for (const pid of players) {
    const handKey = `hand-${pid}`;
    const handCards = allZones[handKey]?.cards ?? [];
    // Heuristic: card ids ending in "-card-4" or "-card-10" / multiples of 6 + 4 are gear in seedRegistry.
    for (const cardId of handCards) {
      const idx = Number(cardId.split("-card-")[1] ?? "-1");
      if (idx >= 0 && idx % 6 === 4) {
        // Find a target unit on any battlefield.
        for (const bfId of Object.keys(state.battlefields ?? {})) {
          const cardsAtBf = allZones[`battlefield-${bfId}`]?.cards ?? [];
          for (const targetUnitId of cardsAtBf) {
            out.push({
              moveId: "equipCard",
              params: { gearId: cardId, playerId: pid, unitId: targetUnitId },
              playerId: pid,
              synthetic: true,
            });
          }
        }
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Move picking — uniform random with a small bias away from end-turn so the
// Monkey actually exercises non-trivial branches.
// ---------------------------------------------------------------------------
const FILLER_MOVES = new Set([
  "endTurn",
  "passChainPriority",
  "passFocus",
  "passShowdownPriority",
]);

// Moves the monkey should never pick — they end the run early or skip turns.
const FORBIDDEN_MOVES = new Set([
  "concede",
  "forfeitGame",
  "surrender",
]);

/**
 * Priority-table picker — adapted from `apps/riftbound-app/lib/bot-driver.ts`.
 * Replicated here (not imported) because the monkey lives in `scripts/` and
 * cannot depend on the app. The numeric values are the same.
 */
const PRIORITIES: Readonly<Record<string, number>> = {
  assignAttacker: 350,
  assignBlocker: 340,
  assignDefender: 340,
  channelRunes: 200,
  concede: -1,
  conquerBattlefield: 900,
  contestBattlefield: 330,
  drawCard: 90,
  endTurn: 40,
  exhaustRune: 30,
  passChainPriority: 50,
  passShowdownFocus: 50,
  playEquipment: 600,
  playGear: 600,
  playSpell: 650,
  playUnit: 700,
  readyRune: 20,
  resolveCombat: 400,
  resolveFullCombat: 400,
  scorePoint: 1000,
  standardMove: 500,
};
const PRIORITY_DEFAULT = 25;
const CARD_PLAY_IDS = new Set(["standardMove", "playUnit", "playSpell", "playGear", "playEquipment"]);

/**
 * Aggressive overrides — push the picker to engage combat/showdown windows
 * and play reactions on opponent turns. Targets the late-game / chain-stack
 * coverage gap noted by FF batch 17 (175 seeds @ 30 turns → 1 bug).
 */
const AGGRESSIVE_OVERRIDES: Readonly<Record<string, number>> = {
  assignAttacker: 800,
  assignDefender: 800,
  assignBlocker: 800,
  contestBattlefield: 780,
  // Reaction spells from hand mid-chain: keep their playSpell priority high
  // But the picker logic below boosts them further when it's opponent-main.
  playSpell: 720,
  counterSpell: 760,
  // Showdown/chain passes should be near-last so we actually exercise the
  // Stack instead of instantly conceding the window.
  passShowdownFocus: 5,
  passChainPriority: 5,
  passFocus: 5,
};

function pickMovePriority(
  moves: { moveId: string; params: unknown; playerId: PlayerId; synthetic?: boolean }[],
  rng: () => number,
): MonkeyMove | null {
  const filtered = moves.filter((m) => !FORBIDDEN_MOVES.has(m.moveId));
  if (filtered.length === 0) {return null;}

  const hasAffordablePlay = filtered.some((m) => CARD_PLAY_IDS.has(m.moveId));

  const scored = filtered.map((m) => {
    let priority = PRIORITIES[m.moveId] ?? PRIORITY_DEFAULT;
    // Dynamic raise: exhaustRune above endTurn when no affordable play.
    if (m.moveId === "exhaustRune" && !hasAffordablePlay) {
      priority = Math.max(priority, 80);
    }
    return { move: m, priority, tie: rng() };
  });
  scored.sort((a, b) => b.priority - a.priority || a.tie - b.tie);
  const pick = scored[0]?.move;
  if (!pick) {return null;}
  return {
    moveId: pick.moveId,
    params: (pick.params ?? {}) as Record<string, unknown>,
    playerId: pick.playerId,
    synthetic: pick.synthetic,
  };
}

/**
 * Aggressive picker — like `pickMovePriority` but heavily biases towards
 * combat / showdown / reaction engagement. Used by `--aggressive` runs to
 * surface late-game / chain-stack bugs that the conservative priority picker
 * misses (FF batch 17: 175 seeds @ 30 turns produced only 1 bug because the
 * priority picker passes showdown focus instantly).
 *
 * `state` is used to detect "opponent's main phase" so we boost reaction
 * spells when the active player is NOT the move's owner. Combined with the
 * AGGRESSIVE_OVERRIDES table, this should drive multi-card chain stacks.
 */
function pickMoveAggressive(
  moves: { moveId: string; params: unknown; playerId: PlayerId; synthetic?: boolean }[],
  rng: () => number,
  state: RiftboundGameState,
): MonkeyMove | null {
  const filtered = moves.filter((m) => !FORBIDDEN_MOVES.has(m.moveId));
  if (filtered.length === 0) {return null;}

  const hasAffordablePlay = filtered.some((m) => CARD_PLAY_IDS.has(m.moveId));
  const activePid = state.turn.activePlayer;

  const scored = filtered.map((m) => {
    let priority = AGGRESSIVE_OVERRIDES[m.moveId] ?? PRIORITIES[m.moveId] ?? PRIORITY_DEFAULT;
    if (m.moveId === "exhaustRune" && !hasAffordablePlay) {
      priority = Math.max(priority, 80);
    }
    // When it's the opponent's main phase, give reaction-style plays from
    // OUR hand a fat bonus so chains/stacks actually form.
    if (m.playerId !== activePid && (m.moveId === "playSpell" || m.moveId === "counterSpell")) {
      priority += 200;
    }
    return { move: m, priority, tie: rng() };
  });
  scored.sort((a, b) => b.priority - a.priority || a.tie - b.tie);
  const pick = scored[0]?.move;
  if (!pick) {return null;}
  return {
    moveId: pick.moveId,
    params: (pick.params ?? {}) as Record<string, unknown>,
    playerId: pick.playerId,
    synthetic: pick.synthetic,
  };
}

// ---------------------------------------------------------------------------
// Cycle / no-progress detector (Stream 2)
//
// Watches a sliding 20-move trail. If the same (moveId+params-fingerprint)
// Appears more than 8 times in that window, the bot is stuck in a loop
// (FF noted bots picking `contestBattlefield` redundantly). Break out and
// Log a CYCLE finding so we can surface latent enumerator bugs (e.g.
// Moves that remain "valid" forever despite a no-op reducer).
// ---------------------------------------------------------------------------
const CYCLE_WINDOW = 20;
const CYCLE_THRESHOLD = 8;

function moveFingerprint(moveId: string, params: Record<string, unknown>): string {
  // Stable JSON for primitives — params are flat key/value records from
  // The engine; sort keys so order-independence.
  const keys = Object.keys(params).toSorted();
  const parts: string[] = [];
  for (const k of keys) {
    parts.push(`${k}=${JSON.stringify(params[k])}`);
  }
  return `${moveId}|${parts.join(",")}`;
}

function detectCycle(trail: string[]): { cycling: boolean; offender?: string; count?: number } {
  if (trail.length < CYCLE_THRESHOLD) {return { cycling: false };}
  const window = trail.slice(-CYCLE_WINDOW);
  const counts: Record<string, number> = {};
  for (const fp of window) {
    counts[fp] = (counts[fp] ?? 0) + 1;
    if (counts[fp]! > CYCLE_THRESHOLD) {
      return { count: counts[fp], cycling: true, offender: fp };
    }
  }
  return { cycling: false };
}

function pickMove(
  moves: { moveId: string; params: unknown; playerId: PlayerId; synthetic?: boolean }[],
  rng: () => number,
): MonkeyMove | null {
  const filtered = moves.filter((m) => !FORBIDDEN_MOVES.has(m.moveId));
  if (filtered.length === 0) {
    return null;
  }

  // Bias: try to pick a non-filler move on 75% of turns.
  const meaty = filtered.filter((m) => !FILLER_MOVES.has(m.moveId));
  const pool = meaty.length > 0 && rng() < 0.75 ? meaty : filtered;
  const pick = pool[Math.floor(rng() * pool.length)];
  if (!pick) {
    return null;
  }
  return {
    moveId: pick.moveId,
    params: (pick.params ?? {}) as Record<string, unknown>,
    playerId: pick.playerId,
    synthetic: pick.synthetic,
  };
}

// ---------------------------------------------------------------------------
// State digest for the transcript — strip down to the shape a reviewer needs
// Without serializing the full ~MB internal state every step.
// ---------------------------------------------------------------------------
function digestState(state: RiftboundGameState): Record<string, unknown> {
  const battlefields: Record<string, unknown> = {};
  for (const [id, bf] of Object.entries(state.battlefields ?? {})) {
    battlefields[id] = {
      contested: (bf as { contested?: boolean }).contested ?? false,
      controller: (bf as { controller?: string | null }).controller ?? null,
    };
  }
  const players: Record<string, unknown> = {};
  for (const [pid, p] of Object.entries(state.players ?? {})) {
    players[pid] = {
      vp: (p as { victoryPoints?: number }).victoryPoints ?? 0,
      xp: (p as { xp?: number }).xp ?? 0,
    };
  }
  const runePools: Record<string, unknown> = {};
  for (const [pid, pool] of Object.entries(state.runePools ?? {})) {
    runePools[pid] = {
      energy: (pool as { energy?: number }).energy ?? 0,
      power: (pool as { power?: Record<string, number> }).power ?? {},
    };
  }
  return {
    battlefields,
    players,
    runePools,
    status: state.status,
    turn: state.turn,
    winner: (state as { winner?: string }).winner ?? null,
  };
}

function shallowDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const a = JSON.stringify(before[k]);
    const b = JSON.stringify(after[k]);
    if (a !== b) {
      out[k] = { after: after[k], before: before[k] };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Single run
// ---------------------------------------------------------------------------
interface RunSummary {
  seed: string;
  movesAttempted: number;
  movesApplied: number;
  movesRejected: number;
  errors: number;
  thrown: number;
  finalStatus: string;
  winner: string | null;
  turnsReached: number;
  durationMs: number;
}

function runOne(opts: RunOptions): RunSummary {
  mkdirSync(opts.runDir, { recursive: true });
  const transcriptPath = join(opts.runDir, "transcript.jsonl");
  writeFileSync(transcriptPath, ""); // Truncate

  const rng = makeRng(hashSeed(opts.seed));
  if (!opts.realDecks) {
    seedCardRegistry();
  }
  const engine = createEngine(opts.seed);
  const t0 = Date.now();

  const log = (entry: Record<string, unknown>) => {
    appendFileSync(transcriptPath, JSON.stringify(entry) + "\n");
  };

  log({ seed: opts.seed, t: Date.now(), type: "run-start" });

  try {
    if (opts.realDecks) {
      // Derive a numeric shuffle seed from the per-seed RNG state so each
      // Monkey seed produces a different deck order — exercises spell-cover.
      const shuffleSeed = hashSeed(`shuffle-${opts.seed}`);
      runRealDeckSetup(engine, opts.swapDecks, shuffleSeed);
    } else {
      runSetup(engine);
    }
  } catch (error) {
    log({
      type: "setup-error",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      durationMs: Date.now() - t0,
      errors: 0,
      finalStatus: "setup-error",
      movesApplied: 0,
      movesAttempted: 0,
      movesRejected: 0,
      seed: opts.seed,
      thrown: 1,
      turnsReached: 0,
      winner: null,
    };
  }

  syncFlowIntoEngine(engine);
  log({ state: digestState(engine.getState()), type: "setup-complete" });

  let movesAttempted = 0;
  let movesApplied = 0;
  let movesRejected = 0;
  let errors = 0;
  let thrown = 0;
  let consecutiveNoOps = 0;
  const moveTrail: string[] = [];

  for (let step = 0; step < opts.movesCap; step++) {
    syncFlowIntoEngine(engine);
    const state = engine.getState();
    if (state.status === "finished") {
      log({ type: "game-finished", winner: (state as { winner?: string }).winner ?? null });
      break;
    }
    if (state.turn.number > opts.turnCap) {
      log({ turn: state.turn.number, type: "turn-cap-reached" });
      break;
    }

    // Enumerate for BOTH players, not just the turn's active player. During
    // Chain / showdown windows the focus holder can be either player, and
    // The set of legal "reaction" moves often belongs to the non-turn
    // Player. Combine + dedupe + pick from the merged pool with the
    // Owning playerId tagged so we route the move through the right player.
    const enumerated: {
      moveId: string;
      params: unknown;
      isValid: boolean;
      playerId: PlayerId;
      synthetic?: boolean;
    }[] = [];
    for (const pid of [state.turn.activePlayer as PlayerId, (state.turn.activePlayer === P1 ? P2 : P1) as PlayerId]) {
      try {
        const ms = engine.enumerateMoves(pid, { validOnly: true });
        for (const m of ms) {
          enumerated.push({ ...m, playerId: pid });
        }
      } catch (error) {
        log({
          type: "enumerate-throw",
          turn: state.turn.number,
          phase: state.turn.phase,
          activePlayer: pid,
          error: error instanceof Error ? error.message : String(error),
        });
        thrown++;
      }
    }
    // Synthesize candidate moves for engine-internal effects that lack
    // `enumerator` functions. Sprinkle a small fraction (one synthetic
    // Pick attempt per ~5 normal moves) so we exercise the surface without
    // Drowning the meaty enumerated moves.
    const synth = synthesizeMoves(state);
    if (synth.length > 0 && rng() < 0.2) {
      const pickSynth = synth[Math.floor(rng() * synth.length)];
      if (pickSynth) {
        enumerated.push({
          isValid: true,
          moveId: pickSynth.moveId,
          params: pickSynth.params,
          playerId: pickSynth.playerId,
          synthetic: true,
        });
      }
    }
    const {activePlayer} = state.turn;

    if (enumerated.length === 0) {
      consecutiveNoOps++;
      log({
        activePlayer,
        phase: state.turn.phase,
        turn: state.turn.number,
        type: "no-legal-moves",
      });
      // Forcibly try endTurn to keep things moving.
      const force = engine.executeMove("endTurn", {
        params: { playerId: activePlayer },
        playerId: activePlayer as PlayerId,
      });
      log({ error: force.error, success: force.success, type: "force-endTurn" });
      if (consecutiveNoOps >= 3) {
        log({ type: "abort-no-progress" });
        break;
      }
      continue;
    }
    consecutiveNoOps = 0;

    const pick = opts.aggressive
      ? pickMoveAggressive(enumerated, rng, state)
      : (opts.priorityPick
        ? pickMovePriority(enumerated, rng)
        : pickMove(enumerated, rng));
    if (!pick) {
      break;
    }

    if (opts.noProgressDetect) {
      moveTrail.push(moveFingerprint(pick.moveId, pick.params));
      if (moveTrail.length > CYCLE_WINDOW * 2) {moveTrail.shift();}
      const cyc = detectCycle(moveTrail);
      if (cyc.cycling) {
        log({
          count: cyc.count,
          offender: cyc.offender,
          phase: state.turn.phase,
          threshold: CYCLE_THRESHOLD,
          turn: state.turn.number,
          type: "CYCLE",
          window: CYCLE_WINDOW,
        });
        break;
      }
    }

    const beforeDigest = digestState(state);
    movesAttempted++;

    let result: ReturnType<EngineLike["executeMove"]>;
    try {
      result = engine.executeMove(pick.moveId, {
        params: pick.params,
        playerId: pick.playerId,
      });
    } catch (error) {
      thrown++;
      log({
        type: "execute-throw",
        turn: state.turn.number,
        phase: state.turn.phase,
        activePlayer,
        move: pick,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.split("\n").slice(0, 6).join("\n") : undefined,
      });
      continue;
    }

    if (!result.success) {
      // Legal move came from enumerateMoves with validOnly:true but execution
      // Failed — this is a strong signal of an enumerator/reducer mismatch.
      movesRejected++;
      errors++;
      log({
        activePlayer,
        error: result.error,
        errorCode: result.errorCode,
        move: pick,
        phase: state.turn.phase,
        turn: state.turn.number,
        type: "move-rejected",
      });
      continue;
    }

    movesApplied++;
    const afterState = engine.getState();
    const afterDigest = digestState(afterState);
    const diff = shallowDiff(beforeDigest, afterDigest);

    // Detect engine-vs-flow state drift: if the move went through
    // `context.flow.endPhase()` we expect the engine's view of turn/phase
    // To match the flow manager's view. Any drift is a strong bug signal.
    const flow = engine.getFlowManager?.();
    const flowPhase = flow?.getCurrentPhase?.();
    const flowPlayer = flow?.getCurrentPlayer?.();
    const flowTurn = flow?.getTurnNumber?.();
    const flowDriftAnomaly =
      (flowPhase !== undefined && flowPhase !== afterState.turn.phase) ||
      (flowPlayer !== undefined && flowPlayer !== afterState.turn.activePlayer) ||
      (flowTurn !== undefined && flowTurn !== afterState.turn.number);

    log({
      activePlayer,
      diff,
      flow: { phase: flowPhase, player: flowPlayer, turn: flowTurn },
      flowDriftAnomaly,
      move: pick,
      patchCount: Array.isArray(result.patches) ? result.patches.length : 0,
      phase: state.turn.phase,
      step,
      turn: state.turn.number,
      type: "move-applied",
    });
  }

  const final = engine.getState();
  const summary: RunSummary = {
    durationMs: Date.now() - t0,
    errors,
    finalStatus: final.status,
    movesApplied,
    movesAttempted,
    movesRejected,
    seed: opts.seed,
    thrown,
    turnsReached: final.turn.number,
    winner: (final as { winner?: string }).winner ?? null,
  };
  log({ type: "run-end", ...summary });
  return summary;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv: string[]): { seeds: string[]; turnCap: number; movesCap: number; realDecks: boolean; priorityPick: boolean; aggressive: boolean; noProgressDetect: boolean; swapDecks: boolean } {
  let seeds: string[] | null = null;
  let turnCap = 30;
  let movesCap = 2000;
  let realDecks = false;
  let priorityPick = false;
  let aggressive = false;
  let noProgressDetect = false;
  let swapDecks = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--seed" && argv[i + 1]) {
      seeds = [argv[i + 1]!];
      i++;
    } else if (argv[i] === "--seeds" && argv[i + 1]) {
      seeds = argv[i + 1]!.split(",").map((s) => s.trim()).filter(Boolean);
      i++;
    } else if (argv[i] === "--count" && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      seeds = Array.from({ length: n }, (_, idx) => `s${idx + 1}`);
      i++;
    } else if ((argv[i] === "--turns" || argv[i] === "--turnCap") && argv[i + 1]) {
      turnCap = Number(argv[i + 1]);
      i++;
    } else if ((argv[i] === "--moves" || argv[i] === "--moveCap") && argv[i + 1]) {
      movesCap = Number(argv[i + 1]);
      i++;
    } else if (argv[i] === "--realDecks") {
      realDecks = true;
      // Real decks default to the priority picker — the random picker
      // Wastes its turns exhausting runes and never plays the cards in hand.
      priorityPick = true;
    } else if (argv[i] === "--priorityPick") {
      priorityPick = true;
    } else if (argv[i] === "--randomPick") {
      priorityPick = false;
    } else if (argv[i] === "--aggressive") {
      aggressive = true;
      priorityPick = true; // Aggressive supersedes random
      // Raise caps when aggressive unless user explicitly set them
      if (turnCap < 60) {turnCap = 60;}
      if (movesCap < 10_000) {movesCap = 10000;}
    } else if (argv[i] === "--noProgressDetect") {
      noProgressDetect = true;
    } else if (argv[i] === "--swapDecks") {
      swapDecks = true;
    }
  }
  if (!seeds) {
    seeds = ["alpha", "beta", "gamma", "delta", "epsilon"];
  }
  return { aggressive, movesCap, noProgressDetect, priorityPick, realDecks, seeds, swapDecks, turnCap };
}

function main() {
  const { seeds, turnCap, movesCap, realDecks, priorityPick, aggressive, noProgressDetect, swapDecks } = parseArgs(process.argv);
  const baseDir = `/tmp/random-monkey/${Date.now()}`;
  mkdirSync(baseDir, { recursive: true });

  console.log(`monkey: ${seeds.length} runs, turnCap=${turnCap}, movesCap=${movesCap}, realDecks=${realDecks}, priorityPick=${priorityPick}, aggressive=${aggressive}, noProgressDetect=${noProgressDetect}, swapDecks=${swapDecks}`);
  console.log(`monkey: base dir = ${baseDir}`);

  const summaries: RunSummary[] = [];
  for (const seed of seeds) {
    const runDir = join(baseDir, seed);
    const summary = runOne({ aggressive, movesCap, noProgressDetect, priorityPick, realDecks, runDir, seed, swapDecks, turnCap });
    summaries.push(summary);
    console.log(
      `  seed=${seed.padEnd(10)} applied=${String(summary.movesApplied).padStart(3)} ` +
        `rejected=${summary.movesRejected} thrown=${summary.thrown} ` +
        `turns=${summary.turnsReached} status=${summary.finalStatus} ` +
        `winner=${summary.winner ?? "-"} (${summary.durationMs}ms)`,
    );
  }

  writeFileSync(join(baseDir, "summary.json"), JSON.stringify(summaries, null, 2));
  console.log(`\nDone. Summaries written to ${baseDir}/summary.json`);
}

main();
