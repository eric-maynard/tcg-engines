/**
 * Core rules — Victory & Scoring: the Victory Score, Hold / Conquer scoring, the Final Point
 * restriction, ties, the cleanup win-check timing, and conceding.
 *
 * CARD-INDEPENDENT: every unit / spell / legend / battlefield below is an inline filler
 * definition built through the ScenarioBuilder. Nothing here depends on printed card text.
 *
 * Rules covered (riftbound-rules):
 *   194.2 / 194.2.a / 194.2.b   win = points ≥ Victory Score AND more than any other player, at a Cleanup
 *   194.3 / 483.3 / 485.3       Victory Score 8 in a duel; 489.3 = 11 in 2v2
 *   194.4 / 194.4.a / 194.4.b   points never go below 0; the clamped part triggers nothing
 *   195 / 650 / 651 / 651.1     conceding: any time, removal, last player standing wins
 *   652 – 652.4                 Removal of a Player (banish, replace battlefield, counter their items)
 *   315.1 / 315.2.b.2 / 315.3.b / 315.4.b   Awaken → Scoring Step (Hold) → Channel (2) → Draw (1)
 *   319.5 / 321 / 321.1 / 323 / 323.1 / 323.5 / 323.6   cleanup tasks; task 1 is the victory check;
 *                               no cleanup while a chain item resolves
 *   323.8 / 323.12 / 316.8.b.1  staging and beginning a (Non-Combat) Showdown
 *   340.1 / 383.3.d / 383.3.d.1 chain resolves newest-first; controllers order simultaneous triggers
 *   348.2.a / 348.2.a.1         non-combat showdown → establish Control → Conquer
 *   190.3.a.1 / 190.4.c         Contested on arrival; control lapses when you have no units there
 *   431.1.a / 431.2.b–d / 431.3.b / 431.3.c.1   Burn Out
 *   466.3.a / 466.5 / 466.5.d / 466.5.e   combat result → establish Control → Conquer
 *   469 / 469.1 / 469.2 / 470   Scoring: Conquer or Hold, at most once per battlefield per turn per player
 *   471 / 471.1 / 471.1.a.1 / 471.1.b / 471.1.b.1   the Score event and the Final Point restriction
 *   471.2 / 471.2.a–c           Score triggers fire at the scored battlefield, once per turn
 *   472                         winning at a cleanup
 *   483.4 / 485.4 / 485.7 / 487.4   Battlefield Count per mode; the going-second extra rune
 *   383.4.c.2.c / 383.4.d.2.c   Conquer / Hold effects trigger even when the point is replaced or denied
 */

import { describe, expect, test } from "bun:test";
import type { PlayerId } from "@tcg/core";
import type { Game as GameType } from "../../harness";
import { Game, P1, P2, P3, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// Inline filler definitions
// ---------------------------------------------------------------------------

const spell = (name: string, effect: Record<string, unknown>, timing: "action" | "reaction" = "action") => ({
  abilities: [{ effect, timing, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name,
  timing,
});

/** "Each player gains 1 point." */
const EACH_GAINS_1 = spell("Filler Shared Glory", { amount: 1, player: "each", type: "score" });

/** "You gain 1 point. Then each opponent gains 1 point." (two sequential instructions in one resolution) */
const GAIN_THEN_OPPONENTS_GAIN = spell("Filler Staggered Glory", {
  effects: [
    { amount: 1, type: "score" },
    { amount: 1, player: "opponent", type: "score" },
  ],
  type: "sequence",
});

/** "[Reaction] Move a friendly unit to a battlefield." — lets the off-turn player reach a battlefield. */
const FLANK_REACTION = spell("Filler Flank", { target: { controller: "friendly", type: "unit" }, to: { battlefield: "any" }, type: "move" }, "reaction");

/** "Recall a friendly unit." — vacates a battlefield at will. */
const RECALL_FRIENDLY = spell("Filler Retreat", { target: { controller: "friendly", type: "unit" }, type: "recall" });

/** "Draw 1." — a slow filler item, just to occupy the chain. */
const SLOW_DRAW = spell("Filler Ponder", { amount: 1, type: "draw" });

/** Legend: "When you hold, draw 1." — a Hold Effect that keeps the Beginning Phase open. */
const HOLD_DRAW_LEGEND = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "hold", on: "controller" }, type: "triggered" }],
  cardType: "legend",
  domain: ["fury", "mind"],
  name: "Filler Castellan (When you hold, draw 1)",
};

/** Legend: "[Exhaust]: You gain 1 point." — an ability point (194.1.c), never a Conquer point. */
const EXHAUST_POINT_LEGEND = {
  abilities: [{ cost: { exhaust: true }, effect: { amount: 1, type: "score" }, type: "activated" }],
  cardType: "legend",
  domain: ["fury", "mind"],
  name: "Filler Laurel ([Exhaust]: You gain 1 point)",
};

/** Unit: "When I conquer, draw 1." */
const CONQUER_DRAW_UNIT = (might: number) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "conquer", on: "self" }, type: "triggered" }],
  might,
  name: "Filler Raider (When I conquer, draw 1)",
});

/** Unit: "When I hold, you gain 1 point." */
const HOLD_GAIN_POINT_UNIT = (might: number) => ({
  abilities: [{ effect: { amount: 1, type: "score" }, trigger: { event: "hold", on: "self" }, type: "triggered" }],
  might,
  name: "Filler Charmer (When I hold, you gain 1 point)",
});

/** Unit: "When I hold, you lose 2 points." */
const HOLD_LOSE_2_UNIT = (might: number) => ({
  abilities: [{ effect: { amount: -2, type: "score" }, trigger: { event: "hold", on: "self" }, type: "triggered" }],
  might,
  name: "Filler Tithe-Bearer (When I hold, you lose 2 points)",
});

/** Unit: "While I'm at a battlefield, opponents can't gain points." */
const POINT_DENIER_UNIT = (might: number) => ({
  abilities: [
    {
      condition: { type: "while-at-battlefield" },
      effect: { restriction: "opponents can't gain points.", type: "restriction" },
      type: "static",
    },
  ],
  might,
  name: "Filler Warden (opponents can't gain points)",
});

/** A vanilla constructed duel deck (no legend abilities → no start-of-turn noise). */
const VANILLA_DECK = {
  battlefieldIds: ["ogn-277-298"],
  mainDeckCardIds: Array.from({ length: 40 }, () => "ogn-175-298"),
  runeDeckCardIds: Array.from({ length: 12 }, () => "ogn-007-298"),
};

function contextOf(game: GameType): string | undefined {
  const d = game.decision();
  return d && d.kind === "action" ? d.context : undefined;
}

/** Engine-level legality of `concede` for a seat (the harness hides concede-only free menus). */
function engineAllowsConcede(game: { engine: { enumerateMoves: (p: PlayerId, o: { moveIds: string[]; validOnly: boolean }) => { isValid?: boolean }[] } }, seat: string): boolean {
  const rows = game.engine.enumerateMoves(seat as PlayerId, { moveIds: ["concede"], validOnly: true });
  return rows.length > 0 && rows.every((r) => r.isValid !== false);
}

// ---------------------------------------------------------------------------
// 1. A fresh duel: nothing to Hold, and the going-second extra rune
// ---------------------------------------------------------------------------

describe("485.4 / 485.7 / 315.2.b.2 — the opening turns of a duel score nothing and the player going second channels 3", () => {
  test("T1 P1: 0 points, 2 runes, 1 card; T2 P2: 0 points, 3 runes, 1 card; T4 P2: only 2 more runes; no battlefield is ever Held from the Base", async () => {
    const game = await Game.fromDecks({ p1: VANILLA_DECK, p2: VANILLA_DECK });
    await game.settle();
    const bfs = game.battlefields();
    expect(bfs.length).toBe(2); // 485.4 — Battlefield Count 2
    for (const bf of bfs) expect(game.gameState.battlefields[bf]?.controller ?? null).toBeNull();

    // P1's first turn: Scoring Step Holds nothing …
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P1] ?? []).toEqual([]);
    // … Channel gives exactly 2 (no going-first bonus) and Draw exactly 1.
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runeDeck()).toHaveLength(10);
    const p1Hand = game.p1.hand().length;

    await game.advanceTurn(); // → P2's first turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P2] ?? []).toEqual([]);
    expect(game.p2.runes()).toHaveLength(3); // 485.7 — 2 + 1 extra
    expect(game.p2.runeDeck()).toHaveLength(9);

    await game.advanceTurn(); // → P1 again: still only 2, still 0 points
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand().length).toBe(p1Hand + 1);

    await game.advanceTurn(); // → P2's SECOND turn: the extra rune is first-Channel-only
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(5);
    expect(game.p2.runeDeck()).toHaveLength(7);
    // Nobody scored anything from an uncontrolled battlefield or from units sitting in a Base.
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2–3. Hold at the Scoring Step
// ---------------------------------------------------------------------------

describe("315.2.b.2 / 469.2 / 470 / 471 — Hold scores once per controlled battlefield, for the Turn Player only", () => {
  test("run (a) one controlled battlefield → +1 and scored-this-turn [A]; run (b) two → +2 as two separate Scores", async () => {
    // (a) P1 controls A only; P2 controls B.
    const a = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 2)
      .points(P2, 2)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", { might: 2 }, "p1AtA")
      .unit(P2, "B", { might: 2 }, "p2AtB")
      .build();
    await a.advanceTurn();
    expect(a.turnPlayer()).toBe(P1);
    expect(a.p1.points()).toBe(3);
    expect(a.p2.points()).toBe(2); // the opponent's total never moves
    expect(a.gameState.scoredThisTurn[P1]).toEqual(["A"]); // B was NOT scored by P1
    expect(a.p1.runes()).toHaveLength(2); // Channel and Draw still happened, after the Hold
    expect(a.violations()).toEqual([]);

    // (b) P1 controls both.
    const b = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 2)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P1 })
      .unit(P1, "A", HOLD_GAIN_POINT_UNIT(2), "holderA")
      .unit(P1, "B", { might: 2 }, "p1AtB")
      .build();
    await b.p2.endTurn();
    expect(b.phase()).toBe("beginning");
    expect(b.p1.points()).toBe(4); // 2 + Hold A + Hold B — two distinct Scores
    expect([...(b.gameState.scoredThisTurn[P1] ?? [])].sort()).toEqual(["A", "B"]);
    // 471.2.b — the unit's Hold ability triggered exactly once, for its own battlefield.
    expect(b.chain().filter((i) => i.cardId === "holderA")).toHaveLength(1);
    await b.settle();
    expect(b.p1.points()).toBe(5); // + the ability point; never a third Hold
  });

  test("only the Turn Player Holds: P1 gains nothing on P2's turn and A is not flagged as scored for P1", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .points(P1, 3)
      .points(P2, 3)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", { might: 2 }, "p1AtA")
      .unit(P2, "B", { might: 2 }, "p2AtB")
      .build();
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(4);
    expect(game.gameState.scoredThisTurn[P2]).toEqual(["B"]);
    expect(game.p1.points()).toBe(3); // no Hold for P1 on P2's turn
    expect(game.gameState.scoredThisTurn[P1] ?? []).toEqual([]);

    await game.advanceTurn(); // → P1's turn: A is scorable again
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(4);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
  });
});

// ---------------------------------------------------------------------------
// 4. Conquer through a Non-Combat Showdown
// ---------------------------------------------------------------------------

describe("348.2.a(.1) / 316.8.b.1 / 469.1 — conquering an open battlefield scores exactly once", () => {
  test("move → Contested → staged Non-Combat Showdown → both pass → Control established = Conquer (+1), trigger once, no second point later", async () => {
    const game = await scenario()
      .points(P1, 2)
      .battlefield("A", { controller: null })
      .unit(P1, "base", CONQUER_DRAW_UNIT(2), "scout")
      .unit(P2, "base", { might: 2 }, "bystander")
      .build();
    const hand0 = game.p1.hand().length;

    await game.p1.move("scout", "A");
    // 190.3.a.1 — arriving where you do not control applies Contested; no score yet.
    expect(game.gameState.battlefields.A).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.p1.points()).toBe(2);
    // 316.8.b.1 — a lone mover opens a NON-combat showdown (no combat is staged).
    const sd = game.gameState.interaction?.showdownStack ?? [];
    expect(sd).toHaveLength(1);
    expect(sd[0]).toMatchObject({ battlefieldId: "A", isCombatShowdown: false });
    expect(game.state("scout").combatRole).toBeFalsy();

    await game.settle(); // both pass focus → the showdown closes
    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(3);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // the "when I conquer" trigger fired exactly once

    // No re-score when control is merely re-checked in later cleanups.
    await game.settle();
    expect(game.p1.points()).toBe(3);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.violations()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5–6. Once per battlefield per turn — and it is tracked per player
// ---------------------------------------------------------------------------

describe("470 / 471.2.c — a same-turn control flip away and back is not a second Score", () => {
  test("Hold A (3→4), vacate A (control lapses, 323.6), retake A → no point, no Score trigger; next turn's Hold pays again", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 3)
      .battlefield("A", { controller: P1 })
      .unit(P1, "A", { might: 2 }, "u1")
      .unit(P1, "base", CONQUER_DRAW_UNIT(2), "u2")
      .hand(P1, RECALL_FRIENDLY, "retreat")
      .build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(4);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    const hand0 = game.p1.hand().length;

    // Vacate A → 323.6 strips control, but the scored-this-turn record survives.
    await game.p1.cast("retreat", { targets: "u1" });
    await game.settle();
    expect(game.locationOf("u1")).toBe("base");
    expect(game.gameState.battlefields.A?.controller).toBeNull();
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);

    // Retake A: control is re-established, but this is NOT a Conquer (469.1 / 470).
    await game.p1.move("u2", "A");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(4); // no point
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]); // not listed twice
    expect(game.p1.hand().length).toBe(hand0 - 1); // only the cast retreat left the hand: no conquer draw

    // Next turn A is scorable again.
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(5);
  });
});

describe("469.1 / 470 / 466.5.e — scored-this-turn is tracked PER PLAYER", () => {
  test("P2 conquers, on P1's turn, a battlefield P1 already Held; P1's own retake then scores nothing", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 4)
      .points(P2, 4)
      .battlefield("A", { controller: P1 })
      .unit(P1, "A", { might: 1 }, "u1")
      .unit(P1, "base", { might: 5 }, "u2")
      .unit(P2, "base", { might: 3 }, "d1")
      .hand(P2, FLANK_REACTION, "flank")
      .hand(P1, SLOW_DRAW, "ponder")
      .build();
    await game.advanceTurn(); // P1's Beginning Phase Holds A
    expect(game.p1.points()).toBe(5);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);

    // Still P1's turn: P2 flanks into A with a bigger unit and wins the combat.
    await game.p1.cast("ponder");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("flank", { targets: "d1" });
    await game.settle();
    expect(game.locationOf("d1")).toBe("A");
    expect(game.zoneOf("u1")).toBe("trash"); // 3 might beats 1
    expect(game.gameState.battlefields.A?.controller).toBe(P2);
    // 466.5(.e) / 469.1 — P2 had not scored A this turn, so this IS a Conquer for P2.
    expect(game.p2.points()).toBe(5);
    expect(game.gameState.scoredThisTurn[P2]).toEqual(["A"]);
    expect(game.p1.points()).toBe(5); // P1 gained nothing from losing it

    // P1 retakes A: A is in P1's scored set → no point for anybody.
    await game.p1.move("u2", "A");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(5);
    expect(game.p2.points()).toBe(5);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
  });
});

// ---------------------------------------------------------------------------
// 7–10. The Final Point
// ---------------------------------------------------------------------------

describe("471.1.a.1 / 472 — the Final Point CAN come from a Hold", () => {
  test("at 7 of 8, Holding one of two battlefields gains the 8th point (no card drawn instead, no 'every battlefield' requirement)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 3)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", { might: 2 }, "p1AtA")
      .unit(P2, "B", { might: 2 }, "p2AtB")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(8); // 471.1.a.1 — non-Conquer sources ignore the Final Point restriction
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.p1.hand().length).toBe(hand0); // no "draw a card instead"
  });

  test("323.1 / 472 — reaching the Victory Score by Hold wins at the following cleanup, before Channel and Draw", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 3)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", { might: 2 }, "p1AtA")
      .unit(P2, "B", { might: 2 }, "p2AtB")
      .build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(0); // the Channel Phase never happened
  });
});

describe("471.1.b(.1) — the Final Point CANNOT come from a lone Conquer", () => {
  test("471.1.b.1 — a lone Conquer at Victory Score − 1 draws a card instead of gaining the point; the Score itself still happens", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 3)
      .battlefield("A", { controller: null })
      .battlefield("B", { controller: P2 })
      .unit(P1, "base", CONQUER_DRAW_UNIT(2), "scout")
      .unit(P2, "B", { might: 2 }, "p2AtB")
      .build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;

    await game.p1.move("scout", "A");
    await game.settle();
    // The Score still happened in every respect except the point itself.
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    // one card for the refused Final Point + one for the "when I conquer, draw 1" trigger
    expect(game.p1.hand().length).toBe(hand0 + 2);
    expect(game.p1.deck().length).toBe(deck0 - 2);
  });

  test("the same board one point lower is an ordinary Conquer: 6 → 7, no draw-instead, no win", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 6)
      .points(P2, 3)
      .battlefield("A", { controller: null })
      .battlefield("B", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "scout")
      .unit(P2, "B", { might: 2 }, "p2AtB")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("scout", "A");
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand().length).toBe(hand0); // 471.1.b does not apply below Victory Score − 1
    expect(game.isOver()).toBe(false);
  });
});

describe("471.1.b.1 / 470 — 'Scored every battlefield this turn' counts a Hold as well as a Conquer", () => {
  test("from 6: Hold A (→7) then Conquer B → every battlefield scored → the Final Point is granted (→8) and P1 wins", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 6)
      .points(P2, 2)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: null })
      .unit(P1, "A", { might: 2 }, "holder")
      .unit(P1, "base", { might: 2 }, "scout")
      .build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(7);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    const hand0 = game.p1.hand().length;

    await game.p1.move("scout", "B");
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand().length).toBe(hand0); // the point was gained, not replaced by a draw
    expect([...(game.gameState.scoredThisTurn[P1] ?? [])].sort()).toEqual(["A", "B"]);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("from 7 with nothing Held: the first lone conquer only draws (A still Scored), the second conquer completes 'every battlefield' and takes the Final Point", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 2)
      .battlefield("A", { controller: null })
      .battlefield("B", { controller: P2 })
      .unit(P1, "base", { might: 5 }, "scout")
      .unit(P1, "base", { might: 5 }, "bruiser")
      .unit(P2, "B", { might: 1 }, "sentry")
      .build();
    const hand0 = game.p1.hand().length;

    await game.p1.move("scout", "A"); // conquer #1 — B is unscored, so no Final Point
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]); // 470 — Scored even though it paid no point
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand().length).toBe(hand0 + 1); // 471.1.b.1 — a card instead
    expect(game.isOver()).toBe(false);

    await game.p1.move("bruiser", "B"); // conquer #2 — now every battlefield has been Scored this turn
    await game.settle();
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand().length).toBe(hand0 + 1); // no second replacement draw
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});

describe("483.4 / 485.4 / 487.4 / 471.1.b.1 — 'every battlefield' is Battlefield-Count dependent", () => {
  test("duel (2 battlefields): Hold A then Conquer B at 6 wins the game", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 6)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: null })
      .unit(P1, "A", { might: 2 }, "holder")
      .unit(P1, "base", { might: 2 }, "scout")
      .build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(7);
    await game.p1.move("scout", "B");
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
  });

  test("471.1.b.1 — in a 3-battlefield game two scored battlefields are not 'every battlefield': the conquer draws instead", async () => {
    const game = await scenario({ players: 3 })
      .turn(2)
      .active(P3)
      .victoryScore(8)
      .points(P1, 6)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: null })
      .battlefield("C", { controller: P2 })
      .unit(P1, "A", { might: 2 }, "holder")
      .unit(P1, "base", { might: 2 }, "scout")
      .unit(P2, "C", { might: 2 }, "p2AtC")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(7);
    const hand0 = game.p1.hand().length;

    await game.p1.move("scout", "B");
    await game.settle();
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    expect([...(game.gameState.scoredThisTurn[P1] ?? [])].sort()).toEqual(["A", "B"]);
    expect(game.p1.points()).toBe(7); // C is unscored → draw a card instead of the Final Point
    expect(game.p1.hand().length).toBe(hand0 + 1);
    expect(game.isOver()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. The refused Final Point can Burn Out
// ---------------------------------------------------------------------------

describe("471.1.b.1 / 431 — the 'draw a card instead' of a refused Final Point can cause a Burn Out", () => {
  // 471.1.b.1 refuses the Final Point and replaces it with a draw; with an empty Main Deck AND an
  // empty trash that draw burns out (431.1.a) and hands 1 point to an opponent (431.2.c). The deck is
  // still empty afterwards, so 431.3(.a) keeps burning out — every later point in the sequence is
  // unpreventable (431.3.b) — until P2 passes the Victory Score and wins immediately (431.3.c.1).
  test("471.1.b.1 + 431.2.c / 431.3 — the refused Final Point's replacement draw burns out repeatedly and hands the game to the opponent", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 3)
      .fillDecks(false)
      .deck(P1, [])
      .runeDeck(P1, [{ cardType: "rune", domain: "fury", name: "Fury Rune" }])
      .runeDeck(P2, [{ cardType: "rune", domain: "fury", name: "Fury Rune" }])
      .battlefield("A", { controller: null })
      .battlefield("B", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "scout")
      .unit(P2, "B", { might: 2 }, "p2AtB")
      .build();
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);

    await game.p1.move("scout", "A");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]); // the Score itself still happened
    expect(game.p1.points()).toBe(7); // never the Final Point, and never a burn-out point for themselves
    expect(game.p1.hand()).toEqual([]); // nothing could be drawn
    expect(game.p2.points()).toBe(8); // 431.2.c / 431.3.a — one point per burn out, to the opponent
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2); // 431.3.c.1 — the win lands immediately, without a cleanup
  });
});

// ---------------------------------------------------------------------------
// 12–13. Ties and the timing of the victory check
// ---------------------------------------------------------------------------

describe("194.2.a / 194.2.b / 323.1 — simultaneously reaching the Victory Score is a tie, not a win", () => {
  test("194.2.a/.b — 8–8 has no winner; play continues until somebody is strictly ahead at a cleanup", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 7)
      .battlefield("A", { controller: P1 })
      .unit(P1, "A", { might: 2 }, "holder")
      .hand(P1, EACH_GAINS_1, "glory")
      .build();
    await game.p1.cast("glory");
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
  });

  test("a strictly-ahead cleanup does end it: 8 vs 7 wins as soon as a cleanup runs", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 7)
      .legend(P1, EXHAUST_POINT_LEGEND, "laurel")
      .build();
    await game.p1.activate("laurel");
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(7);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});

describe("321 / 321.1 / 319.5 / 323.1 — no Cleanup (hence no victory check) while a chain item is resolving", () => {
  test("321 — the mid-resolution 8 vs 7 does not win; the post-resolution cleanup sees 8–8 and declares nobody", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 7)
      .hand(P1, GAIN_THEN_OPPONENTS_GAIN, "staggered")
      .build();
    await game.p1.cast("staggered");
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(false);
  });
});

describe("323 / 323.1 — the victory check is task 1 of the Cleanup, ahead of every other cleanup task", () => {
  test("323.1 — winning at 8 is decided before the Hold trigger resolves and before Channel/Draw", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 2)
      .battlefield("A", { controller: P1 })
      .unit(P1, "A", { might: 2 }, "holder")
      .legend(P1, HOLD_DRAW_LEGEND, "castellan")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.hand().length).toBe(hand0); // the Hold trigger never resolved
    expect(game.p1.runes()).toHaveLength(0); // Channel never ran
    expect(game.zoneOf("holder")).toBe("battlefield-A"); // no later cleanup task got the chance to matter
  });
});

// ---------------------------------------------------------------------------
// 14. Denial removes the point, not the Score
// ---------------------------------------------------------------------------

describe("471 / 470 / 383.4.d.2.c — a point-denier makes a Score pay 0 without cancelling the Score", () => {
  test("054.1 / 471.1 — under an enemy 'opponents can't gain points' unit the Hold pays 0 but still Scores", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 5)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", HOLD_GAIN_POINT_UNIT(2), "holder")
      .unit(P2, "B", POINT_DENIER_UNIT(2), "warden")
      .build();
    const hand0 = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]); // the Score happened …
    expect(game.p1.hand().length).toBeGreaterThan(hand0); // … its trigger fired and resolved …
    expect(game.p1.points()).toBe(5); // … but no point was gained (Hold point + ability point both denied)
  });

  test("killing the denier grants nothing retroactively and A stays unscorable this turn; an unscored battlefield still pays", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 5)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: null })
      .unit(P1, "A", { might: 2 }, "holder")
      .unit(P1, "base", { might: 4 }, "bruiser")
      .unit(P2, "B", POINT_DENIER_UNIT(1), "warden")
      .hand(P1, RECALL_FRIENDLY, "retreat")
      .build();
    await game.advanceTurn();
    const afterHold = game.p1.points();
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);

    // Kill the denier by conquering B — B is unscored, so THAT score pays normally.
    await game.p1.move("bruiser", "B");
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    expect(game.p1.points()).toBe(afterHold + 1);
    expect([...(game.gameState.scoredThisTurn[P1] ?? [])].sort()).toEqual(["A", "B"]);

    // Nothing is added back for A, and A cannot be re-scored even after a control flip.
    const afterB = game.p1.points();
    await game.p1.cast("retreat", { targets: "holder" });
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBeNull();
    await game.p1.move("holder", "A");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(afterB); // no retroactive point, no second Score for A
  });
});

// ---------------------------------------------------------------------------
// 15. LIFO ordering of simultaneous Score triggers, with the 0-point floor
// ---------------------------------------------------------------------------

describe("383.3.d / 340.1 / 194.4 — the controller orders simultaneous Hold triggers; the chain resolves newest-first", () => {
  function board() {
    return scenario()
      .turn(2)
      .active(P2)
      .points(P1, 0)
      .battlefield("A", { controller: P1 })
      .unit(P1, "A", HOLD_GAIN_POINT_UNIT(2), "gainer")
      .unit(P1, "A", HOLD_LOSE_2_UNIT(2), "loser");
  }

  test("run (a): placing 'gain 1' first and 'lose 2' second → lose resolves first and clamps at 0 → final 1", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(1); // the Hold itself
    // 383.3.d — the controller of both triggers chooses the order they go on the chain.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    await game.p1.order(["gainer", "loser"]); // first = bottom, last = top
    await game.settle();
    // 340.1 — newest-first: lose 2 (1 → clamped 0, 194.4.a), then gain 1 → 1.
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
  });

  test("run (b): the opposite order → gain resolves first (→2), then lose 2 → final 0", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(1);
    await game.p1.order(["loser", "gainer"]);
    await game.settle();
    expect(game.p1.points()).toBe(0);
    expect(game.p1.points()).toBeGreaterThanOrEqual(0); // 194.4 — never negative
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]); // A scored exactly once either way
  });
});

// ---------------------------------------------------------------------------
// 16. Conceding
// ---------------------------------------------------------------------------

describe("650 / 651 / 651.1 / 652.4 / 195 — conceding in a duel", () => {
  test("the far-behind player concedes with no priority, mid-chain: the opponent wins immediately regardless of points, and the conceder's chain item is countered", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 0)
      .battlefield("A", { controller: P1 })
      .unit(P1, "A", { might: 2 }, "holder")
      .hand(P1, SLOW_DRAW, "ponder")
      .build();
    await game.p1.cast("ponder"); // P1 (turn player) holds priority; P2 has none
    expect(game.chain().map((i) => i.cardId)).toEqual(["ponder"]);
    expect(game.actingSeat()).toBe(P1);
    const p1Hand = game.p1.hand().length;

    // 650 — a player may concede at any time: no priority, focus or turn requirement.
    expect(engineAllowsConcede(game, P2)).toBe(true);
    await game.p2.do("concede", { playerId: P2 });
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1); // 651.1 / 195 — last player standing, 7 < 8 is irrelevant
    expect(game.p1.points()).toBe(7);
    expect(game.decision()).toBeNull();
    expect(game.p1.hand().length).toBe(p1Hand); // the game ended; nothing further resolved
    expect((await game.settle()).reason).toBe("game-over");
  });

  test("the turn player concedes mid-chain: their own pending spell is countered (652.4) and the 0-point opponent wins", async () => {
    const game = await scenario()
      .active(P2)
      .victoryScore(8)
      .points(P1, 0)
      .points(P2, 7)
      .hand(P2, SLOW_DRAW, "ponder")
      .build();
    await game.p2.cast("ponder");
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(contextOf(game)).toBe("chain");
    const p2Hand = game.p2.hand().length;

    await game.p2.do("concede", { playerId: P2 });
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p2.hand().length).toBe(p2Hand); // 652.4 — the pending spell never resolved
    expect(game.p2.points()).toBe(7); // no point comparison took place
  });
});

describe("651.1 / 652 — conceding in a 3-player game: the game continues and the conceder is removed", () => {
  test("with three players a concession does NOT end the game: the conceder's objects leave the board, they can no longer act, and the Battlefield Count stays 3", async () => {
    const game = await scenario({ players: 3 })
      .victoryScore(8)
      .points(P1, 3)
      .points(P2, 2)
      .points(P3, 2)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .battlefield("C", { controller: P3, owner: P3 })
      .unit(P1, "A", { might: 2 }, "p1AtA")
      .unit(P2, "B", { might: 2 }, "p2AtB")
      .unit(P3, "C", { might: 2 }, "p3AtC")
      .unit(P1, "C", { might: 1 }, "p1AtC")
      .rune(P3, "fury", { alias: "p3rune" })
      .hand(P3, SLOW_DRAW, "p3spell")
      .build();
    expect(game.seat(P3).runes()).toEqual(["p3rune"]);

    await game.seat(P3).do("concede", { playerId: P3 });

    // 651.1 does not apply: two players remain, so nobody wins.
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.view().status).toBe("playing");
    // 652.1 / 652.3 — the conceder's permanents, runes and cards leave the board / the game.
    expect(game.locationOf("p3AtC")).toBeUndefined();
    expect(game.seat(P3).units()).toEqual([]);
    expect(game.seat(P3).runes()).toEqual([]);
    expect(game.seat(P3).hand()).toEqual([]);
    // 651.3 — they can no longer make choices …
    expect(game.seat(P3).legal()).toEqual([]);
    expect(game.actingSeat()).not.toBe(P3);
    // 652.2(.a/.b) — the battlefield they contributed stays in play (as an ability-less token) and the
    // units standing there do not move; C is simply uncontrolled now.
    expect(game.battlefields()).toHaveLength(3);
    expect(game.locationOf("p1AtC")).toBe("C");
    expect(game.gameState.battlefields.C?.controller).toBeNull();
    expect(game.violations()).toEqual([]);
  });
});

// ===========================================================================
// 471.1.b.1 on the OPPONENT's turn — the Final Point restriction is scoped to
// battlefields, never to whose turn it is (blind benchmark RJ-6, ruling
// 07aa3d637c07db8c).
// ===========================================================================

/** "[Action] Move an enemy unit at a battlefield to its base." — vacates the opponent's holder. */
const SHOVE_ENEMY = spell("Filler Shove", {
  target: { controller: "enemy", location: "battlefield", type: "unit" },
  to: "base",
  type: "move",
});

async function resolveOpenChain(game: GameType): Promise<void> {
  for (let i = 0; i < 12 && game.chain().length > 0; i++) {
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
      continue;
    }
    await game.acting().passPriority();
  }
}

/**
 * P2 is the turn player. P2 shoves P1's holder off `A` (control lapses, rule
 * 323.6) and walks in; P1 Marches the holder back and wins the combat, so P1
 * ESTABLISHES control it had lost = a Conquer on the opponent's turn (466.5 /
 * 469.1, rulings 007fba1784bd1662 / cba925b25c0bd764).
 *
 * `extraBattlefield` decides whether 471.1.b.1's "Scored every battlefield this
 * turn" can be satisfied: with a second battlefield P1 never scores it, so the
 * Final Point is refused; with `A` alone it is the only battlefield and the
 * Final Point lands — on P2's turn.
 */
async function conquerOnOpponentsTurn(
  victoryScore: number,
  p1Points: number,
  extraBattlefield: boolean,
): Promise<GameType> {
  let build = scenario()
    .turn(3)
    .active(P2)
    .victoryScore(victoryScore)
    .points(P1, p1Points)
    .points(P2, 0)
    .battlefield("A", { controller: P1 });
  if (extraBattlefield) {
    build = build.battlefield("B", { controller: P2 }).unit(P2, "B", { might: 2 }, "p2AtB");
  }
  const game = await build
    .unit(P1, "A", { might: 5, name: "Filler Anchor" }, "anchor")
    .hand(P1, FLANK_REACTION, "march")
    .unit(P2, "base", { might: 2, name: "Filler Scout" }, "scout")
    .hand(P2, SHOVE_ENEMY, "shove")
    .build();

  await game.p2.cast("shove", { targets: "anchor" });
  await resolveOpenChain(game);
  await game.p2.move("scout", "A");
  await game.p2.passFocus();
  await game.p1.cast("march", { targets: "anchor" });
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("battlefield-A");
  }
  await game.settle();
  return game;
}

describe("471.1.b.1 — a Conquer that would be the WINNING point is refused for the Final-Point reason only (unscored battlefields), not because it is the opponent's turn", () => {
  // (victoryScore, P1 starting points, expected points after the Conquer, whether 471.1.b.1 fired)
  const sweep: readonly [number, number, number, boolean][] = [
    [3, 1, 2, false],
    [3, 2, 2, true],
    [5, 2, 3, false],
    [8, 7, 7, true],
  ];

  for (const [victoryScore, start, expected, refused] of sweep) {
    test(`Victory Score ${victoryScore}, P1 at ${start} → ${expected}${refused ? " (471.1.b.1: draws a card instead)" : " (ordinary Conquer point)"}`, async () => {
      const game = await conquerOnOpponentsTurn(victoryScore, start, true);
      // The Score itself happened in every respect: control flipped and A is scored.
      expect(game.gameState.battlefields.A?.controller).toBe(P1);
      expect(game.gameState.scoredThisTurn?.[P1] ?? []).toContain("A");
      expect(game.p1.points()).toBe(expected);
      // rule 471.1.b.1 — the refusal is a DRAW, never a silent withholding.
      expect(game.p1.hand()).toHaveLength(refused ? 1 : 0);
      // Neither branch ends the game here: the refused point never existed, and the
      // granted ones are below the Victory Score.
      expect(game.isOver()).toBe(false);
      expect(game.view().status).toBe("playing");
      expect(game.violations()).toEqual([]);
    });
  }

  test("471.1.b.1 — with A as the ONLY battlefield the same Conquer scores every battlefield, so the Final Point IS granted and P1 wins on P2's turn (no opponent's-turn guard exists)", async () => {
    const game = await conquerOnOpponentsTurn(3, 2, false);
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(3);
    expect(game.p1.hand()).toHaveLength(0); // the point was gained, so no "draw instead"
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
