/**
 * Ruling a474cecea92ddf5b — The Grand Plaza (OGN-293 → ogn-293-298) · Battlefield
 *   (the Plaza's own text is incidental here — the question is about scoring it again)
 *   × Void Seeker (ogn-024-298) "Deal 4 to a unit at a battlefield. Draw 1." / Hextech Ray (ogn-009-298) "Deal 3 to a
 *     unit at a battlefield." — the removal that empties the Plaza.
 *
 * Q: My unit died on the Grand Plaza last turn (I had been holding it). Can I put a unit there THIS turn to win?
 * A: Yes — a conquer in a later turn scores, as long as you haven't already scored the Plaza this turn. To take the
 *    final (8th) point by conquering you must have scored every battlefield this turn (e.g. hold the other one for 7,
 *    conquer the Plaza for 8). You can NOT hold the Plaza and then re-conquer it in the same turn for a second point.
 * Rules: 469.1/469.2 (conquer vs hold), 471.2.c (each battlefield scores once per turn), 471.1.b (Final Point),
 *        323.6 (control of an empty battlefield lapses in an Open State).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GRAND_PLAZA = "ogn-293-298";
const VOID_SEEKER = "ogn-024-298";
const HEXTECH_RAY = "ogn-009-298";

describe("Ruling a474cecea92ddf5b — re-taking the Plaza after your holder died", () => {
  test("holder killed on the opponent's turn → Plaza lapses to nobody; next turn P1 holds the other battlefield (6→7) and walks into the empty Plaza: a Conquer, both battlefields scored this turn → 8th point, P1 wins", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .victoryScore(8)
      .points(P1, 6)
      .resources(P2, { energy: 3, power: { fury: 1 } })
      .battlefield("plaza", { controller: P1, def: GRAND_PLAZA, inert: false })
      .battlefield("annex", { controller: P1 })
      .unit(P1, "plaza", { might: 2, name: "Doomed Holder" }, "doomed")
      .unit(P1, "annex", { might: 5, name: "Annex Keeper" }, "keeper")
      .unit(P1, "base", { might: 3, name: "Reinforcement" }, "reinf")
      .hand(P2, VOID_SEEKER, "seeker")
      .build();
    // Last turn (P2's): the lone holder dies to a spell → in the following Open Cleanup P1 loses the Plaza.
    await game.p2.cast("seeker", { targets: "doomed" });
    await game.settle();
    expect(game.zoneOf("doomed")).toBe("trash");
    expect(game.gameState.battlefields.plaza?.controller).toBe(null);
    // This turn: P1 holds the annex at the start of the turn → 7.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    // …and moves a unit onto the empty, uncontrolled Plaza → showdown nobody contests → Conquer.
    await game.p1.move("reinf", "plaza");
    const r = await game.settle();
    expect(game.gameState.battlefields.plaza?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8); // 471.1.b satisfied: annex (hold) + plaza (conquer) both scored this turn
    expect(r.reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — NOT in the same turn: P1 holds the Plaza (5→6), its holder then dies during P1's own turn, and a fresh unit re-conquers the Plaza → control regained but NO second point (471.2.c)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 5)
      .battlefield("plaza", { controller: P1, def: GRAND_PLAZA, inert: false })
      .battlefield("theirs", { controller: P2 })
      .unit(P2, "theirs", { might: 5, name: "Their Keeper" }, "tk")
      .unit(P1, "plaza", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 3, name: "Reinforcement" }, "reinf")
      .hand(P1, HEXTECH_RAY, "ray")
      .runes(P1, "fury", 2)
      .build();
    await game.advanceTurn(); // → P1's turn: hold the Plaza
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(6);
    // P1's own Hextech Ray kills the holder (any "unit at a battlefield" is legal) → Plaza lapses.
    await game.p1.tapRune();
    await game.p1.recycleRune(undefined, "fury");
    await game.p1.cast("ray", { targets: "holder" });
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.plaza?.controller).toBe(null);
    // Walk back in: control is re-established (a conquer)… but the Plaza already scored this turn.
    await game.p1.move("reinf", "plaza");
    await game.settle();
    expect(game.gameState.battlefields.plaza?.controller).toBe(P1);
    expect(game.p1.points()).toBe(6);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance — the Final Point rule still applies: at 7 with the OTHER battlefield unscored this turn, conquering the empty Plaza does not give the 8th point", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("plaza", { controller: null, def: GRAND_PLAZA, inert: false })
      .battlefield("theirs", { controller: P2 })
      .unit(P2, "theirs", { might: 5, name: "Their Keeper" }, "tk")
      .unit(P1, "base", { might: 3, name: "Reinforcement" }, "reinf")
      .build();
    await game.p1.move("reinf", "plaza");
    await game.settle();
    expect(game.gameState.battlefields.plaza?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });
});
