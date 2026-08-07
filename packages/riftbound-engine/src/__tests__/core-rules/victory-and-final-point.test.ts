/**
 * Core rules — Winning the game: Victory Score, the Final Point restriction on
 * Conquer, ties, cleanup timing and conceding. CARD-INDEPENDENT (inline filler
 * units / spells only).
 *
 * Rules covered:
 *   194.2 / 194.2.a / 194.2.b  win = (points ≥ Victory Score) AND (more than any other player), checked in a Cleanup
 *   194.3 / 194.3.a / 483.3    Victory Score is 8 by default and may be altered
 *   194.1.c                    points from spells / abilities
 *   195, 650, 651, 651.1, 652.4  conceding: any time; last remaining player wins
 *   319.2 / 319.3 / 319.5      when a Cleanup becomes outstanding (phase change, pending item added, item leaves chain)
 *   320 / 321 / 321.1          no cleanup while a chain item is resolving
 *   323.1                      cleanup task 1 = the victory check
 *   336 / 340.1                chain resolves newest-first (LIFO)
 *   370.1.a.2 / 370.1.c        simultaneous events; replacement effects apply before the event
 *   383.4.c.2.c                Conquer Effects still trigger when the conquer point is replaced
 *   469 / 469.1 / 469.2 / 470  Score = Conquer or Hold, once per battlefield per turn
 *   471.1 / 471.1.a / 471.1.a.1 / 471.1.b / 471.1.b.1  the Final Point restriction (draw instead)
 *   472                        win at cleanup
 *   487.4 / 488.4              three-battlefield modes
 *   431.3.c.1                  (contrast) only repeated Burn Out wins without a cleanup
 */

import { describe, expect, test } from "bun:test";
import type { PlayerId } from "@tcg/core";
import { P1, P2, P3, scenario } from "../../harness";
import type { ActionDecision } from "../../harness/types";

// ---------------------------------------------------------------------------
// Inline filler definitions
// ---------------------------------------------------------------------------

/** An [Action]/[Reaction] spell costing nothing with a single effect. */
const spell = (name: string, effect: Record<string, unknown>, timing: "action" | "reaction" = "action") => ({
  abilities: [{ effect, timing, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name,
  timing,
});

/** 3-Might unit: "When I conquer, [Add] [1]." — an observable, non-point Conquer Effect. */
const CONQUEROR_ADD_ENERGY = {
  abilities: [{ effect: { energy: 1, type: "add-resource" }, trigger: { event: "conquer", on: "self" }, type: "triggered" }],
  might: 3,
  name: "Filler Conqueror (Add 1)",
};

/** 3-Might unit: "When I conquer, you gain 1 point." (194.1.c — an ability point, not a Conquer point). */
const CONQUEROR_GAIN_POINT = {
  abilities: [{ effect: { amount: 1, type: "score" }, trigger: { event: "conquer", on: "self" }, type: "triggered" }],
  might: 3,
  name: "Filler Conqueror (Gain 1 point)",
};

/** "Each player gains 1 point." — one game action, simultaneous events (370.1.a.2). */
const EACH_PLAYER_GAINS_1 = spell("Shared Glory", { amount: 1, player: "each", type: "score" });

/** "You gain 1 point. Then each opponent gains 1 point." — two sequential instructions. */
const GAIN_THEN_OPPONENT_GAINS = spell("Staggered Glory", {
  effects: [
    { amount: 1, type: "score" },
    { amount: 1, player: "opponent", type: "score" },
  ],
  type: "sequence",
});

/** [Reaction] "Target player loses 1 point." (modelled as the opponent of the caster). */
const OPPONENT_LOSES_1 = spell("Sap Glory", { amount: -1, player: "opponent", type: "score" }, "reaction");

/** Unit with the triggered ability "When an opponent holds, that player loses 1 point." */
const HOLD_PUNISHER = {
  abilities: [
    {
      effect: { amount: -1, player: "opponent", type: "score" },
      trigger: { event: "hold", on: "opponent" },
      type: "triggered",
    },
  ],
  might: 1,
  name: "Filler Hold Punisher",
};

/** Unit with the passive/replacement "Opponents can't gain points." (370.1.c). */
const POINT_DENIER = {
  abilities: [
    {
      duration: "permanent",
      replacement: "prevent",
      replaces: "score",
      target: { controller: "enemy", type: "player" },
      type: "replacement",
    },
  ],
  might: 1,
  name: "Filler Point Denier",
};

/** Unit with "When I hold, gain 1 XP." — observable Hold Effect. */
const HOLDER_GAIN_XP = {
  abilities: [{ effect: { amount: 1, type: "gain-xp" }, trigger: { event: "hold", on: "self" }, type: "triggered" }],
  might: 2,
  name: "Filler Holder (XP)",
};

const SLOW_DRAW = spell("Slow Draw", { amount: 1, type: "draw" });

/** Engine-level legality of `concede` for a seat (the harness hides concede-only free menus). */
function engineAllowsConcede(game: { engine: { enumerateMoves: (p: PlayerId, o: { moveIds: string[]; validOnly: boolean }) => { isValid?: boolean }[] } }, seat: string): boolean {
  const rows = game.engine.enumerateMoves(seat as PlayerId, { moveIds: ["concede"], validOnly: true });
  return rows.length > 0 && rows.every((r) => r.isValid !== false);
}

// ---------------------------------------------------------------------------
// 1. Hold at seven → Final Point → win at the next Cleanup
// ---------------------------------------------------------------------------

describe("471.1.a.1 / 472: Hold is not subject to the Final Point restriction", () => {
  test("holding one battlefield at 7 gives the 8th point during the Scoring Step (469.2, 471.1)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 5)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", { might: 2 }, "holderA")
      .unit(P2, "B", { might: 2 }, "holderB")
      .build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    // Hold A → 7→8 immediately; it must NOT "draw instead" and must NOT need every battlefield.
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(5);
    expect(game.gameState.battlefields.B?.controller).toBe(P2);
  });

  test("323.1/319.2/472 — the victory check runs after a Hold; the turn continues (channel + draw) instead of P1 winning at the Beginning→Channel cleanup", async () => {
    // Expected: P1 8 > 5 at the first Cleanup after the Scoring Step → status over, winner P1,
    // and the Channel/Draw/Main phases of that turn never happen. Actual: status stays "playing",
    // P1 channels 2 runes and draws a card.
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 5)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", { might: 2 }, "holderA")
      .unit(P2, "B", { might: 2 }, "holderB")
      .build();
    const handBefore = game.p1.hand().length;
    const runesBefore = game.p1.runes().length;
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    // Channel / Draw never ran.
    expect(game.p1.runes().length).toBe(runesBefore);
    expect(game.p1.hand().length).toBe(handBefore);
    expect(game.decision()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Lone conquer at seven → draw instead; conquer trigger still fires
// ---------------------------------------------------------------------------

describe("471.1.b.1 / 383.4.c.2.c: a lone Conquer at 7 draws a card instead of the Final Point", () => {
  test.failing("BUG: 471.1.b.1 — engine awards the 8th point (and the game) for conquering one of two battlefields", async () => {
    // Expected: P1 stays at 7, draws exactly 1, A is scored/controlled, the Conquer Effect still
    // resolves ([Add] 1), no winner; P2's turn then proceeds. Actual: P1 → 8 and wins on the spot.
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 5)
      .battlefield("A", { controller: P2 })
      .battlefield("B", { controller: P2 })
      .unit(P2, "A", { might: 1 }, "defA")
      .unit(P2, "B", { might: 1 }, "defB")
      .unit(P1, "base", CONQUEROR_ADD_ENERGY, "cu")
      .build();
    const handBefore = game.p1.hand().length;
    expect(game.p1.energy()).toBe(0);
    await game.p1.move("cu", "A");
    await game.settle();
    // Control established, A conquered and marked scored this turn.
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.zoneOf("defA")).toBe("trash");
    expect(game.gameState.scoredThisTurn[P1]).toContain("A");
    // Draw-instead: exactly one card, points unchanged, no winner.
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    // 383.4.c.2.c: the Conquer Effect still triggered and resolved.
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([]);
    // The game goes on: P1 ends the turn and P2's turn proceeds normally.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.isOver()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Conquering every battlefield in one turn earns the Final Point (2 battlefields)
// ---------------------------------------------------------------------------

describe("471.1.b.1 / 470: conquering every battlefield in one turn earns the Final Point (two battlefields)", () => {
  test("Run 1 — from 6: first conquer is a normal point (6→7), second conquer has scored every battlefield → 8 and the win; no card drawn", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 6)
      .points(P2, 4)
      .battlefield("A", { controller: P2 })
      .battlefield("B", { controller: P2 })
      .unit(P2, "A", { might: 1 }, "defA")
      .unit(P2, "B", { might: 1 }, "defB")
      .unit(P1, "base", { might: 3 }, "att1")
      .unit(P1, "base", { might: 3 }, "att2")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("att1", "A");
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false); // must NOT award 8 after only the first conquer
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    await game.p1.move("att2", "B");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.hand().length).toBe(handBefore); // no draw-instead anywhere in Run 1
  });

  test.failing("BUG: 471.1.b.1 — Run 2 from 7: first conquer must draw instead (stay 7, A still Scored), second conquer then earns the Final Point; engine wins on the first conquer", async () => {
    // Expected: A → draw 1 (7), B → every battlefield scored this turn → 8 → win; exactly one card
    // drawn. Actual: the first conquer already awards 8 and ends the game.
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 4)
      .battlefield("A", { controller: P2 })
      .battlefield("B", { controller: P2 })
      .unit(P2, "A", { might: 1 }, "defA")
      .unit(P2, "B", { might: 1 }, "defB")
      .unit(P1, "base", { might: 3 }, "att1")
      .unit(P1, "base", { might: 3 }, "att2")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("att1", "A");
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(game.isOver()).toBe(false);
    expect(game.gameState.scoredThisTurn[P1]).toContain("A"); // A counts as Scored even though it yielded a draw
    await game.p1.move("att2", "B");
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand().length).toBe(handBefore + 1); // exactly one card drawn in Run 2
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});

// ---------------------------------------------------------------------------
// 4. Hold + Conquer counts as scoring every battlefield
// ---------------------------------------------------------------------------

describe("469 / 470 / 471.1.b.1: 'Scored every battlefield' counts Hold and Conquer alike", () => {
  test("from 6: Hold A (6→7) then Conquer B → every battlefield scored → Final Point 7→8 → P1 wins; no draw-instead", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 6)
      .points(P2, 3)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", { might: 2 }, "holderA")
      .unit(P2, "B", { might: 1 }, "defB")
      .unit(P1, "base", { might: 3 }, "att")
      .build();
    await game.advanceTurn(); // P2 ends → P1's turn; Scoring Step holds A
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.isOver()).toBe(false);
    const handBefore = game.p1.hand().length;
    await game.p1.move("att", "B");
    await game.settle();
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand().length).toBe(handBefore); // must NOT draw instead
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("472/323.1 — negative control: from 7, Hold A alone gives 8 and should win before the Main Phase (no conquer needed); engine keeps playing", async () => {
    // Expected: game over (winner P1) right after the Scoring Step. Actual: P1 sits at 8 in an
    // open Main Phase.
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 3)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", { might: 2 }, "holderA")
      .unit(P2, "B", { might: 1 }, "defB")
      .unit(P1, "base", { might: 3 }, "att")
      .build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.can("move")).toBe(false); // no Main Phase for P1
  });
});

// ---------------------------------------------------------------------------
// 5. Three battlefields: the Final Point needs all three
// ---------------------------------------------------------------------------

describe("487.4 / 488.4 / 471.1.b.1: with three battlefields, 'every battlefield' means all three", () => {
  test.failing("BUG: 471.1.b.1 — at 7 with three battlefields the first and second lone conquers must each draw instead; only the third earns the Final Point (engine wins on the first)", async () => {
    // Expected: A → draw (7), B → draw (7, two of three is not 'every'), C → 8 → win. Actual: the
    // first conquer awards 8 and ends the game.
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 3)
      .battlefield("A", { controller: P2 })
      .battlefield("B", { controller: P2 })
      .battlefield("C", { controller: P2 })
      .unit(P2, "A", { might: 1 }, "defA")
      .unit(P2, "B", { might: 1 }, "defB")
      .unit(P2, "C", { might: 1 }, "defC")
      .unit(P1, "base", { might: 3 }, "att1")
      .unit(P1, "base", { might: 3 }, "att2")
      .unit(P1, "base", { might: 3 }, "att3")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("att1", "A");
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(game.isOver()).toBe(false);
    await game.p1.move("att2", "B");
    await game.settle();
    // Two of three is still not "every": must NOT hardcode "two battlefields".
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand().length).toBe(handBefore + 2);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    await game.p1.move("att3", "C");
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand().length).toBe(handBefore + 2);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("variant (3 seats, 3 battlefields): P1 held A and B at the Scoring Step (5→7), then conquers C → all three scored → 8 and wins (opponents ≤ 7)", async () => {
    const game = await scenario({ players: 3 })
      .victoryScore(8)
      .active(P3)
      .points(P1, 5)
      .points(P2, 4)
      .points(P3, 2)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P1 })
      .battlefield("C", { controller: P2 })
      .unit(P1, "A", { might: 1 }, "holderA")
      .unit(P1, "B", { might: 1 }, "holderB")
      .unit(P2, "C", { might: 1 }, "defC")
      .unit(P1, "base", { might: 3 }, "att")
      .build();
    await game.advanceToTurnOf(P1); // P3 ends → P1: Scoring Step holds A and B
    expect(game.p1.points()).toBe(7);
    expect([...game.gameState.scoredThisTurn[P1] ?? []].sort()).toEqual(["A", "B"]);
    expect(game.isOver()).toBe(false);
    const handBefore = game.p1.hand().length;
    await game.p1.move("att", "C");
    await game.settle();
    expect(game.gameState.battlefields.C?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand().length).toBe(handBefore);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});

// ---------------------------------------------------------------------------
// 6. The restriction tracks the Victory Score, not a literal 7
// ---------------------------------------------------------------------------

describe("194.3.a / 483.3 / 471.1.b: the Final Point restriction is relative to the (possibly altered) Victory Score", () => {
  test("Victory Score 9: a lone conquer at 7 is a normal point (7 is not within 1 of 9) — 7→8, no draw, no win at 8", async () => {
    const game = await scenario()
      .victoryScore(9)
      .points(P1, 7)
      .points(P2, 3)
      .battlefield("A", { controller: P2 })
      .battlefield("B", { controller: P2 })
      .unit(P2, "A", { might: 1 }, "defA")
      .unit(P2, "B", { might: 1 }, "defB")
      .unit(P1, "base", { might: 3 }, "att1")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("att1", "A");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand().length).toBe(handBefore); // must NOT draw-instead at 7 when the Victory Score is 9
    expect(game.isOver()).toBe(false); // must NOT win at 8
    expect(game.winner()).toBeUndefined();
  });

  test("471.1.b — Victory Score 9: at 8, a lone conquer (other battlefield unscored this turn) must draw instead and stay 8; engine awards 9 and the win", async () => {
    // Expected: draw 1, stay at 8, no winner. Actual: 9 points, game over.
    const game = await scenario()
      .victoryScore(9)
      .points(P1, 8)
      .points(P2, 3)
      .battlefield("A", { controller: P2 })
      .battlefield("B", { controller: P2 })
      .unit(P2, "A", { might: 1 }, "defA")
      .unit(P2, "B", { might: 1 }, "defB")
      .unit(P1, "base", { might: 3 }, "att1")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("att1", "A");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(game.isOver()).toBe(false);
  });

  test("472/323.1 — Victory Score 9: holding one battlefield at 8 gives 9 and should win at the cleanup; engine keeps playing", async () => {
    // Expected: over, winner P1 with 9. Actual: 9 points but status "playing".
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(9)
      .points(P1, 8)
      .points(P2, 3)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", { might: 2 }, "holderA")
      .unit(P2, "B", { might: 2 }, "holderB")
      .build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(9);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});

// ---------------------------------------------------------------------------
// 7. Non-conquer point at seven wins; a LIFO response can avert it
// ---------------------------------------------------------------------------

describe("471.1.a.1 / 194.1.c / 340.1: ability points are not Conquer points; responses resolve newest-first", () => {
  test("471.1.b.1 + 471.1.a.1 — Run 1: the conquer point is refused (draw) but CU's 'gain 1 point' trigger then takes P1 to 8 and wins at the post-resolution cleanup; engine instead awards the conquer point itself", async () => {
    // Expected: after combat P1 is still 7 (+1 card) with CU's trigger pending; P2 passes; the
    // trigger resolves → 8 → win at the 319.5 cleanup. Actual: the conquer already gives 8/win.
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 4)
      .battlefield("A", { controller: P2 })
      .battlefield("B", { controller: P2 })
      .unit(P2, "A", { might: 1 }, "defA")
      .unit(P2, "B", { might: 1 }, "defB")
      .unit(P1, "base", CONQUEROR_GAIN_POINT, "cu")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("cu", "A");
    await game.p1.passFocus();
    await game.p2.passFocus(); // combat resolves → conquer
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(game.isOver()).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["cu"]);
    // Priority window on the trigger: whoever holds it passes until it resolves.
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true); // must NOT delay the win to end of turn
    expect(game.winner()).toBe(P1);
  });

  test.failing("BUG: 340.1/323.1 — Run 2: P2 responds to CU's trigger with 'target player loses 1 point'; LIFO → 7→6 then 6→7, never 8 at any cleanup, no winner; engine awards the conquer point up front (and ignores the score effect's player)", async () => {
    // Expected: P1 ends at 7 controlling A, game continues. Actual: P1 wins on the conquer.
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 4)
      .battlefield("A", { controller: P2 })
      .battlefield("B", { controller: P2 })
      .unit(P2, "A", { might: 1 }, "defA")
      .unit(P2, "B", { might: 1 }, "defB")
      .unit(P1, "base", CONQUEROR_GAIN_POINT, "cu")
      .hand(P2, OPPONENT_LOSES_1, "sap")
      .build();
    await game.p1.move("cu", "A");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["cu"]);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("sap");
    expect(game.chain().map((c) => c.cardId)).toEqual(["cu", "sap"]);
    // Resolve newest-first: sap (7→6) then cu's trigger (6→7).
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(4);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
  });
});

// ---------------------------------------------------------------------------
// 8. Simultaneous 8–8: no winner; a lone conquer at 8 still draws
// ---------------------------------------------------------------------------

describe("194.2.a / 194.2.b / 323.1: a tie at or above the Victory Score has no winner until someone is strictly ahead at a Cleanup", () => {
  test.failing("BUG: 194.2.b/471.1.b — 'each player gains 1 point' at 7–7 → 8–8, nobody wins; P1's lone conquer at 8 draws instead; P2 then holds to 9 and wins (engine declares a winner at the first 8 and ignores the score effect's player)", async () => {
    // Expected: 8–8 continues; P1's conquer of A → draw (8–8); P2's Scoring Step holds B → 9 > 8 →
    // P2 wins. Actual: engine finishes the game as soon as P1 reaches 8 mid-resolution.
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 7)
      .battlefield("A", { controller: P2 })
      .battlefield("B", { controller: P2 })
      .unit(P2, "A", { might: 1 }, "defA")
      .unit(P2, "B", { might: 2 }, "holderB")
      .unit(P1, "base", { might: 3 }, "att")
      .hand(P1, EACH_PLAYER_GAINS_1, "glory")
      .build();
    await game.p1.cast("glory");
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(false); // must NOT pick a winner at 8–8 (not turn player, not first-to-resolve)
    expect(game.winner()).toBeUndefined();
    expect(game.p2.points()).toBe(8);
    const handBefore = game.p1.hand().length;
    await game.p1.move("att", "A");
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8); // '1 from Victory Score or higher' → still restricted
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(game.isOver()).toBe(false);
    // P1 ends turn; P2 still controls B and holds it at the Scoring Step → 9 vs 8 → P2 wins.
    await game.p1.endTurn();
    await game.settle();
    expect(game.p2.points()).toBe(9);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });
});

// ---------------------------------------------------------------------------
// 9. No win mid-resolution: sequential instructions ending tied
// ---------------------------------------------------------------------------

describe("321 / 321.1 / 319.5: no Cleanup (hence no win) while a chain item is resolving", () => {
  test.failing("BUG: 321/323.1 — 'You gain 1 point. Then each opponent gains 1 point.' at 7–7: P1 is momentarily 8 vs 7 mid-resolution but the cleanup runs after the spell leaves the chain (8–8) → no winner; engine finishes the game between the two instructions", async () => {
    // Expected: 8–8, status playing, no winner (431.3.c.1's immediate win is only for repeated
    // Burn Out). Actual: status "finished", winner P1 as soon as the first instruction executes
    // (and the opponent-directed point is applied to P1 as well).
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 7)
      .battlefield("A", { controller: null })
      .hand(P1, GAIN_THEN_OPPONENT_GAINS, "stagger")
      .build();
    await game.p1.cast("stagger");
    await game.settle();
    expect(game.zoneOf("stagger")).toBe("trash");
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(false); // must NOT declare P1 the winner between the two instructions
    expect(game.winner()).toBeUndefined();
    expect(game.p2.points()).toBe(8);
    expect((game.decision() as ActionDecision).context).toBe("main");
  });
});

// ---------------------------------------------------------------------------
// 10. Reach eight with an opponent's punisher trigger pending → win before it resolves
// ---------------------------------------------------------------------------

describe("319.3 / 320 / 323.1 vs 370.1.c: a pending triggered 'punisher' cannot pre-empt the win; a passive replacement can", () => {
  test("319.3/323.1 — Hold A takes P1 7→8; P2's 'when an opponent holds, that player loses 1 point' trigger is added as a Pending Item, whose cleanup finds 8 > 6 → P1 wins before the trigger resolves; engine never checks victory after a Hold", async () => {
    // Expected: game over, winner P1 with 8; the punisher never resolves. Actual: game continues,
    // the trigger resolves (and its point loss lands on its own controller).
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 6)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: null })
      .unit(P1, "A", { might: 2 }, "holderA")
      .unit(P2, "base", HOLD_PUNISHER, "punisher")
      .build();
    await game.p2.endTurn();
    // The trigger is (at most) pending on the chain; the win check comes first.
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    await game.settle();
    expect(game.p1.points()).toBe(8); // the punisher must NOT have resolved
    expect(game.p2.points()).toBe(6);
    expect(game.winner()).toBe(P1);
  });

  test("contrast (370.1.c): a passive 'opponents can't gain points' replacement applies before the Hold point — P1 stays 7, no win, and Hold Effects still fire (383.4.d.2.c)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 6)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: null })
      .unit(P1, "A", HOLDER_GAIN_XP, "holderA")
      .unit(P2, "base", POINT_DENIER, "denier")
      .build();
    expect(game.p1.xp()).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(7); // point denied up front — not a chain item a cleanup could pre-empt
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.chain()).toEqual([]);
    expect(game.p1.xp()).toBe(1); // "When I hold" still triggered and resolved
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
  });
});

// ---------------------------------------------------------------------------
// 11. Concede: any time; the remaining player wins regardless of points
// ---------------------------------------------------------------------------

describe("650 / 651.1 / 652.4 / 195: conceding", () => {
  test("the non-turn player holding priority mid-chain has 'concede' in its menu; the far-ahead turn player concedes mid-chain → the 0-point opponent wins immediately, the pending spell never resolves", async () => {
    const game = await scenario()
      .active(P2)
      .victoryScore(8)
      .points(P1, 0)
      .points(P2, 7)
      .battlefield("A", { controller: P2 })
      .battlefield("B", { controller: P2 })
      .unit(P2, "A", { might: 2 }, "holdA")
      .unit(P2, "B", { might: 2 }, "holdB")
      .hand(P2, SLOW_DRAW, "slow")
      .build();
    await game.p2.cast("slow");
    await game.p2.passPriority();
    // P1 (not the turn player, chain open) may concede right now (650).
    expect(game.actingSeat()).toBe(P1);
    const d1 = game.p1.decision() as ActionDecision;
    expect(d1.kind).toBe("action");
    expect(d1.context).toBe("chain");
    expect(game.p1.can("concede")).toBe(true);
    // P2 does not hold priority, yet conceding is legal for P2 at the engine level (650: any time).
    expect(engineAllowsConcede(game, P2)).toBe(true);
    const p2HandBefore = game.p2.hand().length;
    await game.p2.do("concede", { playerId: P2 });
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1); // 651.1 — regardless of points
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(7); // no further scoring / comparison happened
    expect(game.decision()).toBeNull();
    expect(game.p2.hand().length).toBe(p2HandBefore); // 652.4 — the pending Slow Draw never resolved
    expect((await game.settle()).reason).toBe("game-over");
  });

  test("symmetric: the player who is behind and NOT the acting seat concedes mid-showdown → the other player wins immediately (no priority/focus/turn requirement, no point comparison)", async () => {
    const game = await scenario()
      .active(P2)
      .victoryScore(8)
      .points(P1, 1)
      .points(P2, 6)
      .battlefield("A", { controller: P1 })
      .unit(P1, "A", { might: 4 }, "defA")
      .unit(P2, "base", { might: 2 }, "att")
      .build();
    await game.p2.move("att", "A"); // showdown opens, P2 (attacker) has Focus
    const d = game.decision() as ActionDecision;
    expect(d.seat).toBe(P2);
    expect(d.context).toBe("showdown");
    expect(game.actingSeat()).toBe(P2);
    expect(engineAllowsConcede(game, P1)).toBe(true);
    await game.p1.do("concede", { playerId: P1 });
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(6); // winner did not need the Victory Score
    expect(game.decision()).toBeNull();
  });
});
