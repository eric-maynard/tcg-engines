/**
 * Interaction: Obelisk of Power (ogn-284-298 · Battlefield)
 *     "At the start of each player's first Beginning Phase, that player channels 1 rune."
 *   × The Arena's Greatest (ogn-290-298 · Battlefield)
 *     "At the start of each player's first Beginning Phase, that player gains 1 point."
 *   × the going-second extra rune (rule 485.7)
 *
 * Rules: 485.7 (the second player channels ONE extra rune in their FIRST Channel Phase only),
 * 315.2.a.1 (Beginning Step: "at the start of Beginning Phase" effects happen — before Scoring
 * 315.2.b, Channel 315.3 and Draw), 315.3.b (Channel Phase: channel 2), 430.2.a (runes are
 * channeled READY unless told otherwise), 430.4.a (two per Channel Phase), 383.1 ("At [time]" =
 * triggered ability → it uses the chain, 383.3.c/d), 468.1 (every Score is a Gain — but not the
 * reverse: Arena's point is a Gain, not a Score), 471.1.a.1 (non-Conquer gains ignore Final Point
 * restrictions).
 *
 * Question — 1v1 Duel, P1 first, both battlefields uncontrolled. Walk P1 T1 → P2 T1 → P1 T2 → P2 T2:
 *   runes on board after each Channel Phase (and are they ready?), score per seat; does 485.7 STACK
 *   with Obelisk and the base 2; is Obelisk's rune channeled in the Beginning Phase (before the
 *   Channel Phase); do 485.7 / Obelisk / Arena fire again on each player's SECOND turn?
 * Expected: P1 T1 → 1 (Obelisk, in Beginning) + 2 = 3 runes, score 1–0. P2 T1 → 1 + (2 + 1 extra)
 *   = 4 runes, 1–1. P1 T2 → 5, P2 T2 → 6 (no second bonus, no re-trigger); score stays 1–1; every
 *   rune entered ready; Arena's point is not a "score" of a battlefield.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { basicRuneDef, Game as HarnessGame, loadDefaultCardPool, P1, P2 } from "../../../harness";

const OBELISK = "ogn-284-298";
const ARENA = "ogn-290-298";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit — inert deck filler
const OBELISK_ID = `player-1-bf-${OBELISK}`; // instance ids given by the constructed-deck setup
const ARENA_ID = `player-2-bf-${ARENA}`;

/** Real 1v1 setup: P1 brought Obelisk of Power, P2 brought The Arena's Greatest; no legends (no other triggers). P1 goes first. */
async function duel(): Promise<Game> {
  const pool = await loadDefaultCardPool();
  const rune = basicRuneDef(pool, "fury").id as string;
  const deck = (bf: string) => ({
    battlefieldIds: [bf],
    mainDeckCardIds: Array.from({ length: 40 }, () => SKULKER),
    runeDeckCardIds: Array.from({ length: 12 }, () => rune),
  });
  return HarnessGame.fromDecks({ p1: deck(OBELISK), p2: deck(ARENA), seed: "obelisk-arena-485.7" });
}

/** Answer the pending trigger-order offer so that `topCard`'s trigger is on TOP (resolves first). */
async function orderTop(game: Game, topCard: string): Promise<void> {
  const d = game.decision();
  expect(d?.kind).toBe("order");
  const items = d?.kind === "order" ? d.items : [];
  const top = items.find((i) => i.card === topCard)?.key as string;
  expect(top).toBeDefined();
  await game.seat(d?.seat as string).order([...items.filter((i) => i.card !== topCard).map((i) => i.key), top]);
}

/** Both players pass once → the top chain item resolves. */
async function resolveTop(game: Game): Promise<void> {
  const turn = game.turnPlayer();
  const other = turn === P1 ? P2 : P1;
  await game.seat(turn).passPriority();
  await game.seat(other).passPriority();
}

describe("P1 turn 1 — both uncontrolled battlefields trigger for the Turn Player at the Beginning Step (315.2.a.1, 383.1)", () => {
  test("the game opens in P1's BEGINNING phase with two triggered chain items — Obelisk and Arena — both controlled by P1, and P1 is asked to order them (383.3.d)", async () => {
    const game = await duel();
    expect(game.turnNumber()).toBe(1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.gameState.battlefields[OBELISK_ID]?.controller).toBeNull();
    expect(game.gameState.battlefields[ARENA_ID]?.controller).toBeNull();
    expect(game.chain().map((c) => [c.name, c.controller, c.triggered])).toEqual(
      expect.arrayContaining([
        ["Obelisk of Power", P1, true],
        ["The Arena's Greatest", P1, true],
      ]),
    );
    expect(game.chain()).toHaveLength(2);
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
    expect(game.p1.runes()).toHaveLength(0); // nothing channeled yet
    expect(game.p1.points()).toBe(0);
  });

  test("Obelisk's rune is channeled IN THE BEGINNING PHASE, ready (430.2.a), before the Channel Phase: with Obelisk on top, after it resolves P1 has exactly 1 ready rune while Arena is still pending", async () => {
    const game = await duel();
    await orderTop(game, OBELISK_ID);
    expect(game.chain().at(-1)?.name).toBe("Obelisk of Power");
    // P2 gets a priority window on P1's Beginning-Phase triggers (383.3.c).
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.phase()).toBe("beginning");
    expect(game.chain().map((c) => c.name)).toEqual(["The Arena's Greatest"]);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(11);
    expect(game.p1.points()).toBe(0);
  });

  test("Arena: P1 GAINS 1 point (1–0) — a Gain, not a Score: no battlefield is recorded as scored and control does not change", async () => {
    const game = await duel();
    await orderTop(game, ARENA_ID);
    await resolveTop(game);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).toEqual([]);
    expect(game.gameState.conqueredThisTurn?.[P1] ?? []).toEqual([]);
    expect(game.gameState.battlefields[ARENA_ID]?.controller).toBeNull();
    expect(game.phase()).toBe("beginning"); // Obelisk still on the chain
  });

  test("after both resolve, Channel Phase adds 2 → P1 sits in Main with 3 runes, ALL ready, 9 left in the rune deck; the first player still draws 1 (hand 4 → 5); score 1–0", async () => {
    const game = await duel();
    expect(game.p1.hand()).toHaveLength(4);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(3);
    expect(game.p1.runeDeck()).toHaveLength(9);
    expect(game.p1.hand()).toHaveLength(5);
    expect([game.p1.points(), game.p2.points()]).toEqual([1, 0]);
    // P2 untouched so far.
    expect(game.p2.runes()).toHaveLength(0);
    expect(game.p2.hand()).toHaveLength(4);
  });
});

describe("P2 turn 1 — Obelisk + base 2 + the going-second extra rune all STACK (485.7)", () => {
  test("P1 ends turn → P2's Beginning Phase: both battlefields trigger again, now for P2 (each player's OWN first Beginning Phase), P2 orders them", async () => {
    const game = await duel();
    await game.settle();
    await game.p1.endTurn();
    expect(game.turnNumber()).toBe(2);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    expect(game.chain().map((c) => [c.name, c.controller])).toEqual(
      expect.arrayContaining([
        ["Obelisk of Power", P2],
        ["The Arena's Greatest", P2],
      ]),
    );
    expect(game.chain()).toHaveLength(2);
    expect(game.decision()).toMatchObject({ kind: "order", seat: P2 });
  });

  test("Obelisk first: P2 has 1 ready rune in the Beginning Phase; then Arena → 1–1; then Channel Phase 2 + 1 extra = 3 more → P2 in Main with 4 runes, all ready, 8 left; drew 1", async () => {
    const game = await duel();
    await game.settle();
    await game.p1.endTurn();
    await orderTop(game, OBELISK_ID);
    await resolveTop(game); // Obelisk (P2 passes first — it is P2's turn — then P1)
    expect(game.phase()).toBe("beginning");
    expect(game.p2.runes()).toHaveLength(1);
    expect(game.p2.runes({ ready: true })).toHaveLength(1);
    expect(game.p2.points()).toBe(0);
    await resolveTop(game); // Arena
    expect([game.p1.points(), game.p2.points()]).toEqual([1, 1]);
    expect(game.gameState.scoredThisTurn?.[P2] ?? []).toEqual([]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(4); // 1 (Obelisk) + 2 (315.3.b) + 1 (485.7)
    expect(game.p2.runes({ ready: true })).toHaveLength(4);
    expect(game.p2.runeDeck()).toHaveLength(8);
    expect(game.p2.hand()).toHaveLength(5);
    // P1's board is unchanged by P2's turn start.
    expect(game.p1.runes()).toHaveLength(3);
  });
});

describe("second turns — nothing fires again: no Obelisk, no Arena, no second 485.7 bonus", () => {
  test("P1 T2: no Beginning-Phase triggers (not P1's FIRST Beginning Phase) → straight to Main with 3 + 2 = 5 ready runes; score still 1–1", async () => {
    const game = await duel();
    await game.settle(); // P1 T1
    await game.advanceTurn(); // → P2 T1 main
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.endTurn(); // → P1 T2
    expect(game.turnNumber()).toBe(3);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]); // no once-per-player trigger re-arms
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(5);
    expect(game.p1.runes({ ready: true })).toHaveLength(5);
    expect(game.p1.runeDeck()).toHaveLength(7);
    expect([game.p1.points(), game.p2.points()]).toEqual([1, 1]);
  });

  test("P2 T2: no triggers and NO extra rune — 485.7 is the second player's FIRST Channel Phase only → 4 + 2 = 6 ready runes; final tally P1 5 / P2 6, score 1–1, no violations", async () => {
    const game = await duel();
    await game.settle(); // P1 T1 (3)
    await game.advanceTurn(); // P2 T1 (4)
    await game.advanceTurn(); // P1 T2 (5)
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.endTurn(); // → P2 T2
    expect(game.turnNumber()).toBe(4);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p2.runes()).toHaveLength(6);
    expect(game.p2.runes({ ready: true })).toHaveLength(6);
    expect(game.p2.runeDeck()).toHaveLength(6);
    expect(game.p1.runes()).toHaveLength(5);
    expect([game.p1.points(), game.p2.points()]).toEqual([1, 1]);
    expect(game.gameState.battlefields[OBELISK_ID]?.controller).toBeNull();
    expect(game.gameState.battlefields[ARENA_ID]?.controller).toBeNull();
    expect(game.violations()).toEqual([]);
  });
});
