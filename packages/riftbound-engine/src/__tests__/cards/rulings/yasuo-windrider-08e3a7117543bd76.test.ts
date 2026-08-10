/**
 * Ruling 08e3a7117543bd76 — Yasuo, Windrider (OGN-205 → ogn-205-298)
 *   "[Ganking] The third time I move in a turn, you score 1 point."
 *   × Ahri, Alluring (OGN-066 → ogn-066-298) "When I hold, you score 1 point."
 *
 * Q: Do alternate scoring effects like Yasuo / Ahri bypass the last-point restriction (must have scored
 *    every battlefield to take the final point by conquering), or do they only accelerate towards it?
 * A: The final-point restriction applies only to points from Conquering battlefields. Other point sources
 *    (Yasuo's third move, Ahri's hold trigger) are not restricted and can score the winning point directly.
 * Rules: 471.1.a / 471.1.a.1 (only Conquer is beholden to the Final Point restriction), 471.1.b.1 (conquer
 *        at match point without every battlefield scored ⇒ draw instead), 472 (win at Victory Score).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-205-298";
const AHRI = "ogn-066-298";
const RIDE_THE_WIND = "ogn-173-298";

describe("Ruling 08e3a7117543bd76 — non-Conquer point sources take the Final Point directly", () => {
  test("control — the restriction itself: at 7/8, CONQUERING one of two battlefields does not give the final point; P1 draws a card instead (471.1.b.1)", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .build();
    const hand = game.p1.hand().length;
    await game.p1.move("runner", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.isOver()).toBe(false);
  });

  test("ruling 08e3a7117543bd76 — Yasuo at 7/8: his THIRD move this turn scores the 8th point and wins outright, with no battlefield conquered or held at all", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder 1" }, "h1")
      .unit(P1, "bf2", { might: 1, name: "Holder 2" }, "h2")
      .unit(P1, "base", YASUO, "yasuo")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    // Move 1: standard move base → bf1 (own battlefield: no showdown, no score).
    await game.p1.move("yasuo", "bf1");
    await game.settle();
    expect(game.state("yasuo")).toMatchObject({ isExhausted: true, location: "bf1" });
    expect(game.p1.points()).toBe(7);
    // Move 2: Ride the Wind moves him bf1 → bf2 and readies him.
    await game.p1.cast("rtw", { targets: "yasuo" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.state("yasuo")).toMatchObject({ isReady: true, location: "bf2" });
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    // Move 3: Ganking move bf2 → bf1 — "the third time I move in a turn, you score 1 point".
    await game.p1.gank("yasuo", "bf1");
    await game.settle();
    expect(game.gameState.scoredThisTurn[P1]).toEqual([]); // no battlefield was scored this turn
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("ruling 08e3a7117543bd76 — Ahri at 6/8 holding ONE of two battlefields: the Hold makes 7, then her 'When I hold, you score 1 point' trigger takes the FINAL point (8) and wins — B was never scored", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 6)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", AHRI, "ahri")
      .unit(P2, "B", { might: 2, name: "Their Holder" }, "theirs")
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    // The Hold of A scored 6 → 7 and put Ahri's Hold trigger on the chain.
    expect(game.p1.points()).toBe(7);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, triggered: true })]);
    expect(game.isOver()).toBe(false);
    await game.settle();
    // Ahri's point is not a Conquer → not restricted → 8 and the game is won although B is P2's and unscored.
    expect(game.gameState.battlefields.B?.controller).toBe(P2);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
