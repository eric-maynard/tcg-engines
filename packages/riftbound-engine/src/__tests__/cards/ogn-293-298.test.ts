/**
 * The Grand Plaza — ogn-293-298 · Battlefield · no domain · no cost
 *
 *   When you hold here, if you have 7+ units here, you win the game.
 *
 * Rules: 469.2 / 315.2.b (Hold = the TURN PLAYER keeps control of a battlefield through the
 * Scoring Step of THEIR Beginning Phase), 471.2.b/.c (hold abilities trigger at the battlefield
 * held, once per turn), 383.2.a.1 (an "if …" written immediately after the trigger condition is
 * PART OF THE CONDITION: checked when the hold happens, never re-checked on resolution — cf. the
 * Sona example: removed in response, still resolves), 190.6.d ("you" = the Plaza's controller),
 * 108.2 / 740.1.a ("your units" = units you control, tokens included), 816.1.b ([Temporary] units
 * die at the start of the Beginning Phase BEFORE scoring), 469.1 (a conquer is not a hold).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Threshold: exactly 7 wins, 6 does not ("7+" — 8 also wins); points are irrelevant (an
 *     alternate win at 0 points).
 *  2. "here": six at the Plaza plus any number in base / at another battlefield is still six.
 *  3. Only YOUR hold: seven units parked there do nothing during the opponent's Beginning Phase;
 *     the win comes at the start of your own next turn.
 *  4. Conquering the Plaza with seven units (walk-in) is a conquer, not a hold — no win that turn.
 *  5. Condition timing (383.2.a.1): the opponent Gust-ing one of the seven in response to the
 *     trigger does NOT stop the win; conversely a seventh body that is [Temporary] dies before
 *     scoring, so the trigger never goes on the chain.
 *  6. Tokens are units: Recruit tokens count toward the seven.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-293-298";
const GUST = "ogn-169-298"; // [Reaction] 1 chaos-domain energy: return a ≤3-Might unit at a battlefield to hand
const SPRITE = "ogn-274-298"; // 3-Might [Temporary] unit token
const RECRUIT = "ogn-273-298"; // 1-Might Recruit unit token

/** P1 controls the Plaza with `n` vanilla 1-Might units; `endingTurnOf` is about to end their turn. */
function plaza(n: number, endingTurnOf = P2) {
  const b = scenario().turn(2).active(endingTurnOf).battlefield("plaza", { controller: P1, def: CARD, inert: false, owner: P1 }).battlefield("other", { controller: null });
  for (let i = 0; i < n; i++) {
    b.unit(P1, "plaza", { might: 1, name: `Citizen ${i}` }, `c${i}`);
  }
  return b;
}

describe("The Grand Plaza (ogn-293-298)", () => {
  test("registry payload: a 'hold here' trigger with the 7+-friendly-units-here condition and a win-game effect (not optional)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "The Grand Plaza" });
    expect(def?.abilities).toEqual([
      {
        condition: { count: 7, target: { controller: "friendly", location: "here", type: "unit" }, type: "has-at-least" },
        effect: { type: "win-game" },
        trigger: { event: "hold", location: "here", on: "controller" },
        type: "triggered",
      },
    ]);
  });

  test("holding with exactly 7 units: the trigger goes on the chain in P1's Beginning Phase and P1 wins the game on resolution — at 1 point, far short of the victory score", async () => {
    const game = await plaza(7).victoryScore(8).build();
    expect(game.p1.points()).toBe(0);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "plaza", controller: P1, triggered: true })]);
    expect(game.isOver()).toBe(false); // not until it resolves
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(1); // the ordinary hold point, nothing more
  });

  test("'7+' — eight units also win", async () => {
    const game = await plaza(8).build();
    await game.advanceTurn();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("negative space: six units hold for 1 point and the game simply continues into P1's main phase — no trigger is even placed (383.2.a.1)", async () => {
    const game = await plaza(6).build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("'here' — six at the Plaza plus three in base and two at another held battlefield: 2 hold points, no win", async () => {
    const game = await plaza(6)
      .unit(P1, "base", { might: 2 }, "b1")
      .unit(P1, "base", { might: 2 }, "b2")
      .unit(P1, "base", { might: 2 }, "b3")
      .battlefield("annex", { controller: P1 })
      .unit(P1, "annex", { might: 2 }, "a1")
      .unit(P1, "annex", { might: 2 }, "a2")
      .build();
    await game.advanceTurn();
    expect(game.isOver()).toBe(false);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });

  test("only YOUR hold (469.2): seven units sit at the Plaza through the OPPONENT's Beginning Phase without effect; the win arrives at the start of P1's next turn", async () => {
    const game = await plaza(7, P1).build();
    await game.advanceTurn(); // P1 ends → P2's turn (P2's Beginning Phase: P1 does not hold)
    expect(game.turnPlayer()).toBe(P2);
    expect(game.isOver()).toBe(false);
    expect(game.p1.points()).toBe(0);
    await game.p2.endTurn(); // → P1's Beginning Phase
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("469.1 vs 469.2 — CONQUERING the empty Plaza by walking seven units in scores 1 but is not a hold: no win this turn", async () => {
    const b = scenario().battlefield("plaza", { controller: null, def: CARD, inert: false, owner: P1 });
    const ids = Array.from({ length: 7 }, (_, i) => `c${i}`);
    for (const id of ids) {
      b.unit(P1, "base", { might: 1, name: id }, id);
    }
    const game = await b.build();
    await game.p1.move(ids, "plaza");
    await game.settle();
    expect(game.p1.units("plaza")).toHaveLength(7);
    expect(game.gameState.battlefields.plaza?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("tokens are units: five vanilla units + two Recruit tokens hold for the win", async () => {
    const game = await plaza(5).unit(P1, "plaza", RECRUIT, "r1").unit(P1, "plaza", RECRUIT, "r2").build();
    await game.advanceTurn();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("816.1.b 'before scoring' — the seventh body is a [Temporary] Sprite: it dies at the start of the Beginning Phase, six remain at the hold, no trigger, no win", async () => {
    const game = await plaza(6).unit(P1, "plaza", SPRITE, "sprite").build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.has("sprite") ? game.zoneOf("sprite") : "gone").not.toBe("battlefield-plaza");
    expect(game.p1.units("plaza")).toHaveLength(6);
    expect(game.isOver()).toBe(false);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
  });

  test("383.2.a.1 — the 'if 7+' is part of the trigger condition: P2 Gusts one citizen back to hand IN RESPONSE (6 left), yet the trigger already on the chain still resolves and P1 wins", async () => {
    // P2's pool empties as their turn ends, so the Gust is paid for with a ready rune.
    const game = await plaza(7).rune(P2, "chaos", { alias: "p2rune" }).hand(P2, GUST, "gust").build();
    await game.p2.endTurn();
    expect(game.chain().map((i) => i.cardId)).toEqual(["plaza"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.tapRune("p2rune");
    await game.p2.cast("gust", { targets: "c0" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["plaza", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves first (LIFO)
    expect(game.zoneOf("c0")).toBe("hand");
    expect(game.p1.units("plaza")).toHaveLength(6);
    expect(game.isOver()).toBe(false);
    await game.settle(); // now the Plaza trigger resolves
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("control: the opponent's seven units at a Plaza THEY control win it for them at the start of their turn, not yours", async () => {
    const b = scenario().turn(3).active(P1).battlefield("plaza", { controller: P2, def: CARD, inert: false, owner: P1 });
    for (let i = 0; i < 7; i++) {
      b.unit(P2, "plaza", { might: 1 }, `e${i}`);
    }
    const game = await b.build();
    expect(game.isOver()).toBe(false);
    await game.advanceTurn(); // P1 ends → P2's Beginning Phase: P2 holds with 7
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });
});
