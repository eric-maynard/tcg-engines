/**
 * Rewind (undo / redo) — the engine restores the COMPLETE position.
 *
 * A history checkpoint carries: game state, internal state (zones / cards /
 * metas), the flow machine (segment / phase / step / turn / current player),
 * the seeded RNG cursor, the per-turn trackers, the game-over latch and the
 * card registry's runtime layer. `undo()` rewinds one player-facing ACTION
 * (the move + the automatic procedures the driver ran after it); `redo()`
 * re-applies it; a new move after an undo truncates the redo history.
 *
 * (a) PROPERTY: ≥30 seeded random games; for EVERY applied action k:
 *     h0 = hash before; act; h1 = hash after; undo ⇒ hash == h0 AND both seats'
 *     legal moves + the decision are identical; redo ⇒ hash == h1; go on.
 *     Every 8 actions: undo 5 / redo 5 ⇒ identical; at the end: undo 3, take a
 *     DIFFERENT action ⇒ redo() is refused.
 * (b) RNG: a rewound shuffle re-deals the same cards on redo AND when the same
 *     move is issued again (the generator cursor is part of the checkpoint).
 * (c) Targeted: across endTurn, with a prompt open, into a showdown / combat,
 *     a chain response with a bound target, the game-winning move, and the
 *     empty-history no-op.
 */

import { describe, expect, test } from "bun:test";
import type { PlayerId } from "@tcg/core";
import type { Game } from "../../harness";
import {
  Game as GameCtor,
  P1,
  P2,
  applyMove,
  getActingSeat,
  getInternalState,
  loadDefaultCardPool,
  scenario,
} from "../../harness";
import { buildDefaultDeck } from "../../testing/playtest/game-setup";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function mulberry(seed: string): () => number {
  let a = 0;
  for (const c of seed) {
    a = (a * 31 + c.charCodeAt(0)) | 0;
  }
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Probe {
  readonly hash: string;
  /** Both seats' complete legal move lists (enumerateMoves, validOnly). */
  readonly legal: string;
  /** The cursor decision minus its seq-bearing id. */
  readonly decision: string;
}

function legalOf(game: Game): string {
  return JSON.stringify([P1, P2].map((s) => game.engine.enumerateMoves(s as PlayerId, { validOnly: true })));
}

function probe(game: Game): Probe {
  const d = game.decision() as (Record<string, unknown> & { id?: string }) | null;
  const { id: _id, ...rest } = d ?? {};
  return { decision: JSON.stringify(d ? rest : null), hash: game.snapshotHash(), legal: legalOf(game) };
}

interface Flat {
  moveId: string;
  params: Record<string, unknown>;
  seat: string;
}

const WINDOW_CLOSERS = new Set(["endTurn", "passChainPriority", "passShowdownFocus"]);

/** A random legal move for whoever holds the cursor (monkey policy: prefers doing something over passing). */
function pickMove(game: Game, rand: () => number): Flat | undefined {
  const state = game.gameState;
  if (state.status !== "playing") {
    return undefined;
  }
  const cursor = getActingSeat(state) ?? state.turn.activePlayer;
  const seats = [cursor, ...[P1, P2].filter((s) => s !== cursor)];
  for (const seat of seats) {
    const flat = game.engine
      .enumerateMoves(seat as PlayerId, { validOnly: true })
      .filter((m) => m.moveId !== "concede")
      .map((m) => ({ moveId: m.moveId, params: (m.params ?? {}) as Record<string, unknown>, seat }));
    if (flat.length === 0) {
      continue;
    }
    const active = flat.filter((m) => !WINDOW_CLOSERS.has(m.moveId));
    const closers = flat.filter((m) => WINDOW_CLOSERS.has(m.moveId));
    const pool = active.length > 0 && (closers.length === 0 || rand() < 0.72) ? active : closers.length > 0 ? closers : flat;
    return pool[Math.floor(rand() * pool.length)];
  }
  return undefined;
}

function apply(game: Game, m: Flat): boolean {
  return applyMove(game.engine, [P1, P2], m.seat, m.moveId, { ...m.params }).success;
}

const DOMAIN_PAIRS: [string, string][] = [
  ["fury", "chaos"],
  ["calm", "mind"],
  ["body", "order"],
  ["fury", "mind"],
  ["calm", "chaos"],
  ["body", "fury"],
  ["order", "mind"],
  ["chaos", "body"],
];

async function randomGame(seed: string): Promise<Game> {
  const pool = await loadDefaultCardPool();
  const all = pool.all() as Parameters<typeof buildDefaultDeck>[0];
  const r = mulberry(`decks:${seed}`);
  const [a1, a2] = DOMAIN_PAIRS[Math.floor(r() * DOMAIN_PAIRS.length)] as [string, string];
  const [b1, b2] = DOMAIN_PAIRS[Math.floor(r() * DOMAIN_PAIRS.length)] as [string, string];
  return GameCtor.fromDecks({
    p1: buildDefaultDeck(all, a1, a2, "random", `${seed}-p1`),
    p2: buildDefaultDeck(all, b1, b2, "random", `${seed}-p2`),
    seed,
  });
}

// ---------------------------------------------------------------------------
// (a) property
// ---------------------------------------------------------------------------

const GAMES = 32;
const ACTIONS_PER_GAME = 36;

describe("PROPERTY — every action of a seeded random game is exactly rewindable and re-appliable", () => {
  for (let g = 0; g < GAMES; g++) {
    const seed = `undo-prop-${g}`;
    test(`game ${g + 1}/${GAMES} (seed ${seed}): per action undo ⇒ pre-hash + same legal/decision, redo ⇒ post-hash; undo5/redo5; a different move kills redo`, async () => {
      const game = await randomGame(seed);
      const rand = mulberry(seed);
      const kinds = new Set<string>();
      let applied = 0;
      let attempts = 0;
      while (applied < ACTIONS_PER_GAME && attempts < ACTIONS_PER_GAME * 3) {
        attempts++;
        const m = pickMove(game, rand);
        if (!m) {
          break;
        }
        const before = probe(game);
        if (!apply(game, m)) {
          // A rejected move is a no-op on the whole position.
          expect({ move: m.moveId, probe: probe(game) }).toEqual({ move: m.moveId, probe: before });
          continue;
        }
        applied++;
        kinds.add(m.moveId);
        const h1 = game.snapshotHash();
        expect(game.canUndo()).toBe(true);
        expect(game.undo()).toBe(true);
        expect({ at: applied, move: m.moveId, probe: probe(game) }).toEqual({ at: applied, move: m.moveId, probe: before });
        expect(game.canRedo()).toBe(true);
        expect(game.redo()).toBe(true);
        expect({ at: applied, hash: game.snapshotHash(), move: m.moveId }).toEqual({ at: applied, hash: h1, move: m.moveId });
        expect(game.canRedo()).toBe(false);

        if (applied % 8 === 0) {
          const tail = game.snapshotHash();
          const seen: string[] = [tail];
          let n = 0;
          while (n < 5 && game.undo()) {
            n++;
            seen.push(game.snapshotHash());
          }
          for (let i = n; i > 0; i--) {
            expect(game.snapshotHash()).toBe(seen[i] as string);
            expect(game.redo()).toBe(true);
          }
          expect(game.snapshotHash()).toBe(tail);
        }
      }
      expect(applied).toBeGreaterThan(8);
      expect(kinds.size).toBeGreaterThan(2);

      // Undo 3, then a DIFFERENT action ⇒ the redo branch is gone.
      if (game.gameState.status === "playing") {
        const redoHead = game.engine.peekRedo();
        expect(redoHead).toBeUndefined();
        let n = 0;
        while (n < 3 && game.undo()) {
          n++;
        }
        if (n > 0) {
          const undone = game.engine.peekRedo();
          const was = JSON.stringify({ moveId: undone?.moveId, params: undone?.context?.params });
          const options: Flat[] = [];
          for (const seat of [P1, P2]) {
            for (const mv of game.engine.enumerateMoves(seat as PlayerId, { validOnly: true })) {
              if (mv.moveId !== "concede") {
                options.push({ moveId: mv.moveId, params: (mv.params ?? {}) as Record<string, unknown>, seat });
              }
            }
          }
          const different = options.find((o) => JSON.stringify({ moveId: o.moveId, params: { ...o.params } }) !== was && !WINDOW_CLOSERS.has(o.moveId)) ??
            options.find((o) => JSON.stringify({ moveId: o.moveId, params: { ...o.params } }) !== was);
          if (different && apply(game, different)) {
            expect(game.canRedo()).toBe(false);
            expect(game.redo()).toBe(false);
          }
        }
      }
    }, 60_000);
  }
});

// ---------------------------------------------------------------------------
// (b) RNG
// ---------------------------------------------------------------------------

const STACKED_DECK = "ogn-183-298"; // Look at top 3, put 1 in hand, recycle the rest (random bottom order, rule 416.5)
const VANILLA = "ogn-175-298";
const DESERTS_CALL = "sfd-031-221"; // "Play a 2 [Might] Sand Soldier unit token." (rule 186 — a token per execution)

function deckOf(game: Game, seat: string): string[] {
  const internal = getInternalState(game.engine);
  return (internal.zones.mainDeck?.cardIds ?? []).filter((id) => internal.cards[id]?.owner === seat);
}

describe("DETERMINISM — undo then RE-ISSUE the same move reproduces the position exactly", () => {
  // rule 186 — a created token is a new game object; its id must come from the
  // GAME (a state counter), never from the wall clock or a process-wide
  // sequence, or an undo → re-issue (and a seeded replay) mints different ids
  // and the position hash drifts even though the game is identical.
  test("a token-creating spell: cast ⇒ h1; undo to the start ⇒ h0; cast the SAME move again ⇒ h1 again (identical token ids)", async () => {
    const build = () =>
      scenario({ seed: "token-determinism" })
        .resources(P1, { energy: 4 })
        .hand(P1, DESERTS_CALL, "call")
        .build();
    const game = await build();
    const h0 = game.snapshotHash();

    await game.p1.cast("call");
    await game.settle({ policy: "first" });
    const h1 = game.snapshotHash();
    const tokens = game.p1.base().filter((id) => id.startsWith("token-"));
    expect(tokens.length).toBeGreaterThan(0);

    while (game.snapshotHash() !== h0 && game.undo()) {
      // rewind the whole action
    }
    expect(game.snapshotHash()).toBe(h0);

    await game.p1.cast("call");
    await game.settle({ policy: "first" });
    expect(game.p1.base().filter((id) => id.startsWith("token-"))).toEqual(tokens);
    expect(game.snapshotHash()).toBe(h1);

    // A fresh engine on the same seed agrees: the ids are a function of the game.
    const twin = await build();
    await twin.p1.cast("call");
    await twin.settle({ policy: "first" });
    expect(twin.p1.base().filter((id) => id.startsWith("token-"))).toEqual(tokens);
    expect(twin.snapshotHash()).toBe(h1);
  });
});

describe("RNG — the generator cursor is part of the checkpoint", () => {
  test("Stacked Deck's random recycle order: undo ⇒ pre-hash; redo ⇒ SAME deck; undo + re-cast with the same answers ⇒ SAME deck and same position hash", async () => {
    const build = () =>
      scenario({ seed: "rng-undo" })
        .resources(P1, { energy: 3, power: { chaos: 1 } })
        .hand(P1, STACKED_DECK, "sd")
        .deck(P1, [VANILLA, VANILLA, VANILLA, VANILLA, VANILLA, VANILLA], ["d0", "d1", "d2", "d3", "d4", "d5"])
        .build();
    const game = await build();
    const h0 = game.snapshotHash();
    const deck0 = deckOf(game, P1);
    const undosToStart = async (): Promise<number> => {
      let n = 0;
      while (game.snapshotHash() !== h0 && game.undo()) {
        n++;
      }
      expect(game.snapshotHash()).toBe(h0);
      expect(deckOf(game, P1)).toEqual(deck0);
      return n;
    };
    const castIt = async () => {
      await game.p1.cast("sd", { answers: ["d2"] });
      await game.settle({ policy: "first" });
      expect(game.p1.hand()).toContain("d2");
    };

    await castIt();
    const h1 = game.snapshotHash();
    const deck1 = deckOf(game, P1);
    expect(deck1.slice(-2).sort()).toEqual(["d0", "d1"]);

    const n = await undosToStart();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      expect(game.redo()).toBe(true);
    }
    expect(game.snapshotHash()).toBe(h1);
    expect(deckOf(game, P1)).toEqual(deck1);

    // Determinism: rewind and ISSUE THE SAME MOVES again ⇒ identical outcome.
    await undosToStart();
    await castIt();
    expect(deckOf(game, P1)).toEqual(deck1);
    expect(game.snapshotHash()).toBe(h1);

    // And an independent engine with the same seed agrees (the cursor was not merely frozen).
    const twin = await build();
    await twin.p1.cast("sd", { answers: ["d2"] });
    await twin.settle({ policy: "first" });
    expect(deckOf(twin, P1)).toEqual(deck1);
  });

  test("Burn Out shuffle (empty deck at the Draw Phase): undo the endTurn ⇒ trash/deck restored; redo and re-issue both reproduce the same shuffled deck", async () => {
    const game = await scenario({ seed: "burnout-undo" })
      .deck(P2, [])
      .trash(P2, VANILLA, "t0")
      .trash(P2, { cardType: "unit", energyCost: 1, might: 1, name: "Trash One" }, "t1")
      .trash(P2, { cardType: "unit", energyCost: 2, might: 2, name: "Trash Two" }, "t2")
      .trash(P2, { cardType: "unit", energyCost: 3, might: 3, name: "Trash Three" }, "t3")
      .trash(P2, { cardType: "unit", energyCost: 4, might: 4, name: "Trash Four" }, "t4")
      .fillDecks(false)
      .build();
    const h0 = game.snapshotHash();
    expect(deckOf(game, P2)).toEqual([]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    const h1 = game.snapshotHash();
    const deck1 = deckOf(game, P2);
    const hand1 = [...game.p2.hand()];
    expect(deck1.length + hand1.length).toBeGreaterThanOrEqual(4); // trash was shuffled in, one drawn
    expect(game.p2.trash()).toHaveLength(0);

    let n = 0;
    while (game.snapshotHash() !== h0 && game.undo()) {
      n++;
    }
    expect(game.snapshotHash()).toBe(h0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.trash().sort()).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    for (let i = 0; i < n; i++) {
      expect(game.redo()).toBe(true);
    }
    expect(game.snapshotHash()).toBe(h1);
    expect(deckOf(game, P2)).toEqual(deck1);

    while (game.snapshotHash() !== h0 && game.undo()) {
      /* rewind again */
    }
    await game.advanceTurn();
    expect(deckOf(game, P2)).toEqual(deck1);
    expect([...game.p2.hand()]).toEqual(hand1);
    expect(game.snapshotHash()).toBe(h1);
  });
});

// ---------------------------------------------------------------------------
// (c) targeted
// ---------------------------------------------------------------------------

const CLEAVE = "ogn-004-298"; // [Action] Give a unit [Assault 3] this turn.
const DISCIPLINE = "ogn-058-298"; // [Reaction] Give a unit +2 Might this turn. Draw 1.

describe("targeted rewinds", () => {
  test("across endTurn: turn number, active player, phase, rune pools, flow machine and expiration trace all come back; redo lands on the next turn again", async () => {
    const game = await scenario({ seed: "endturn-undo" })
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .runes(P1, "fury", 2, { exhausted: true })
      .unit(P1, "base", { might: 2 }, "u1")
      .build();
    const flow = () => game.engine.getFlowManager()?.serializeFlowState();
    const before = probe(game);
    const flow0 = flow();
    const trace0 = JSON.stringify(game.trace());
    expect(game.turnPlayer()).toBe(P1);
    const t0 = game.turnNumber();

    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(t0 + 1);
    expect(game.p1.energy()).toBe(0); // pools emptied at end of turn
    const after = probe(game);
    const flow1 = flow();

    expect(game.undo()).toBe(true);
    expect(probe(game)).toEqual(before);
    expect(flow()).toEqual(flow0);
    expect(JSON.stringify(game.trace())).toBe(trace0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(t0);
    expect(game.phase()).toBe("main");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.runes({ ready: false })).toHaveLength(2);

    expect(game.redo()).toBe(true);
    expect(probe(game)).toEqual(after);
    expect(flow()).toEqual(flow1);
    expect(game.turnPlayer()).toBe(P2);
    // The flow really is live again: P2 can end ITS turn and P1's next turn readies (and channels) runes.
    const tapped = game.p1.runes({ ready: false });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(t0 + 2);
    for (const r of tapped) {
      expect(game.state(r).isReady).toBe(true);
    }
  });

  test("while a pendingChoice is open: undo rewinds to before the move that opened it (prompt gone, card back in hand, energy refunded); redo reopens the very same prompt", async () => {
    const game = await scenario({ seed: "prompt-undo" })
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .hand(P1, STACKED_DECK, "sd")
      .deck(P1, [VANILLA, VANILLA, VANILLA, VANILLA], ["d0", "d1", "d2", "d3"])
      .build();
    const before = probe(game);
    await game.p1.cast("sd");
    await game.settle(); // passive: hands the look-and-pick prompt back unanswered
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind).not.toBe("action");
    expect(game.gameState.pendingChoice).toBeTruthy();
    const opened = probe(game);

    // Rewind whatever it took to get here (cast [+ passes]) one action at a time; the first undo already closes the prompt.
    expect(game.undo()).toBe(true);
    expect(game.gameState.pendingChoice?.type === (JSON.parse(opened.decision) as { source?: { pendingChoiceType?: string } }).source?.pendingChoiceType && probe(game).hash === opened.hash).toBe(false);
    while (probe(game).hash !== before.hash && game.undo()) {
      /* keep rewinding */
    }
    expect(probe(game)).toEqual(before);
    expect(game.p1.hand()).toContain("sd");
    expect(game.p1.energy()).toBe(3);
    expect(game.gameState.pendingChoice).toBeFalsy();

    while (game.canRedo()) {
      expect(game.redo()).toBe(true);
    }
    expect(probe(game)).toEqual(opened);
    // …and it is answerable exactly as before.
    await game.p1.answer({ keys: ["d1"], kind: "pick" });
    await game.settle({ policy: "first" });
    expect(game.p1.hand()).toContain("d1");
    expect(game.gameState.pendingChoice).toBeFalsy();
  });

  test("a move that opens a showdown / combat: undo restores the uncontested battlefield, unit back in base, no showdown, focus/priority as before; redo re-stages it identically", async () => {
    const game = await scenario({ seed: "showdown-undo" })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "atk")
      .unit(P2, "bf1", { might: 2 }, "def")
      .build();
    const before = probe(game);
    const bfState0 = JSON.stringify(game.gameState.battlefields);
    await game.p1.move("atk", "bf1");
    const staged = probe(game);
    const st = game.gameState;
    const inShowdown = (st.interaction?.showdownStack ?? []).length > 0 || Object.values(st.battlefields).some((b) => (b as { contested?: boolean }).contested);
    expect(inShowdown).toBe(true);
    expect(game.locationOf("atk")).not.toBe("base");

    expect(game.undo()).toBe(true);
    expect(probe(game)).toEqual(before);
    expect(JSON.stringify(game.gameState.battlefields)).toBe(bfState0);
    expect(game.zoneOf("atk")).toBe("base");
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
    expect(game.gameState.interaction?.chain?.active ?? false).toBe(false);

    expect(game.redo()).toBe(true);
    expect(probe(game)).toEqual(staged);
    // The re-staged showdown plays out: settle passes focus for both and combat resolves.
    await game.settle();
    expect(game.has("def") ? game.state("def").zone : "trash").not.toBe("battlefield-bf1-with-3-might"); // sanity: engine progressed without error
    expect(game.violations()).toEqual([]);
  });

  test("a chain RESPONSE with a bound target: undo removes exactly the response (chain back to one item, its target binding intact, priority restored, card + energy back); redo puts the response back on top with the same target", async () => {
    const game = await scenario({ seed: "chain-undo" })
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .resources(P2, { energy: 2, power: { calm: 1 } })
      .unit(P1, "base", { might: 2 }, "u1")
      .unit(P2, "base", { might: 2 }, "e1")
      .hand(P1, CLEAVE, "cleave")
      .hand(P2, DISCIPLINE, "disc")
      .deck(P2, [VANILLA, VANILLA], ["p2d0", "p2d1"])
      .build();
    await game.p1.cast("cleave", { targets: "u1" });
    await game.p1.passPriority(); // caster passes; P2 now holds priority with a Reaction in hand
    const chain1 = game.chain();
    expect(chain1).toHaveLength(1);
    const oneItem = probe(game);
    expect(game.decision()?.seat).toBe(P2);
    // P2 responds with a Reaction targeting its own unit.
    expect(game.p2.can("cast", "disc")).toBe(true);
    await game.p2.cast("disc", { targets: "e1" });
    const chain2 = game.chain();
    expect(chain2).toHaveLength(2);
    expect(chain2[1]?.targets).toEqual(["e1"]);
    const twoItems = probe(game);
    const topTargets = JSON.stringify((game.gameState.interaction?.chain?.items ?? []).map((it) => (it as { targets?: unknown }).targets));

    expect(game.undo()).toBe(true);
    expect(probe(game)).toEqual(oneItem);
    expect(game.chain()).toHaveLength(1);
    expect(JSON.stringify(game.chain())).toBe(JSON.stringify(chain1));
    expect(game.decision()?.seat).toBe(P2);
    expect(game.p2.hand()).toContain("disc");
    expect(game.p2.energy()).toBe(2);

    expect(game.redo()).toBe(true);
    expect(probe(game)).toEqual(twoItems);
    expect(JSON.stringify((game.gameState.interaction?.chain?.items ?? []).map((it) => (it as { targets?: unknown }).targets))).toBe(topTargets);
    // Resolves cleanly from the redone position: Discipline draws P2 a card, Cleave resolves after it.
    await game.settle();
    expect(game.chain()).toHaveLength(0);
    expect(game.p2.hand()).toContain("p2d0");
  });

  test("the game-winning move: undo puts status back to playing (winner cleared, point removed, engine accepts moves again); redo ends it again", async () => {
    const game = await scenario({ seed: "win-undo" })
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 5 }, "atk")
      .build();
    const before = probe(game);
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    const latched = game.engine.hasGameEnded();
    const won = game.snapshotHash();

    let n = 0;
    while (game.snapshotHash() !== before.hash && game.undo()) {
      n++;
    }
    expect(n).toBeGreaterThan(0);
    expect(probe(game)).toEqual(before);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.p1.points()).toBe(7);
    expect(game.engine.hasGameEnded()).toBe(false);
    expect(game.gameState.status).toBe("playing");
    for (let i = 0; i < n; i++) {
      expect(game.redo()).toBe(true);
    }
    expect(game.snapshotHash()).toBe(won);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.engine.hasGameEnded()).toBe(latched);

    // Rewind once more and PLAY ON instead: not just cosmetics — the engine takes
    // moves again (a GAME_ENDED latch would refuse them), and that new move
    // truncates the "won" branch (redo refused).
    while (game.snapshotHash() !== before.hash && game.undo()) {
      /* back to before the winning move */
    }
    expect(game.p1.legal().length).toBeGreaterThan(0);
    const r = await game.p1.try((p) => p.endTurn());
    expect(r.ok).toBe(true);
    expect(game.isOver()).toBe(false);
    expect(game.canRedo()).toBe(false);
    expect(game.redo()).toBe(false);
  });

  test("nothing to rewind: undo()/redo() at the start of history return false and leave the position untouched; canUndo/canRedo track the cursor; a new move after an undo truncates redo", async () => {
    const game = await scenario({ seed: "empty-undo" }).resources(P1, { energy: 1 }).runes(P1, "fury", 2).unit(P1, "base", { might: 1 }, "u").build();
    const h0 = game.snapshotHash();
    expect(game.canUndo()).toBe(false);
    expect(game.canRedo()).toBe(false);
    expect(game.undo()).toBe(false);
    expect(game.redo()).toBe(false);
    expect(game.snapshotHash()).toBe(h0);

    const [r1, r2] = game.p1.runes({ ready: true });
    await game.p1.tapRune(r1 as string);
    expect(game.canUndo()).toBe(true);
    expect(game.canRedo()).toBe(false);
    const h1 = game.snapshotHash();
    expect(game.undo()).toBe(true);
    expect(game.snapshotHash()).toBe(h0);
    expect(game.canRedo()).toBe(true);
    expect(game.undo()).toBe(false); // floor reached, harmless
    expect(game.snapshotHash()).toBe(h0);
    // A DIFFERENT move now ⇒ the rewound tap can no longer be redone.
    await game.p1.tapRune(r2 as string);
    expect(game.canRedo()).toBe(false);
    expect(game.redo()).toBe(false);
    expect(game.state(r1 as string).isExhausted).toBe(false);
    expect(game.state(r2 as string).isExhausted).toBe(true);
    expect(game.snapshotHash()).not.toBe(h1);
  });

  test("registry runtime layer rides along: a token created by a move is unregistered by undo and re-registered (same id) by redo", async () => {
    const game = await scenario({ seed: "token-undo" })
      .resources(P1, { energy: 0 })
      .unit(P1, "base", { might: 1 }, "u")
      .build();
    const before = probe(game);
    const r = await game.p1.try((p) => p.do("addToken", { count: 1, playerId: P1, tokenName: "Bird", zoneId: "base" }));
    expect(r.ok).toBe(true);
    const withToken = probe(game);
    const tokens = game.p1.units().filter((c) => c !== "u");
    expect(tokens.length).toBe(1);
    expect(game.undo()).toBe(true);
    expect(probe(game)).toEqual(before);
    expect(game.p1.units()).toEqual(["u"]);
    expect(game.redo()).toBe(true);
    expect(probe(game)).toEqual(withToken);
    expect(game.p1.units().filter((c) => c !== "u")).toEqual(tokens);
  });
});
