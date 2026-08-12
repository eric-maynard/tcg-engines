/**
 * Ruling 599e8a0e061a2362 — (no specific card) both players revealing the SAME battlefield.
 *   Exercised with two copies of Grove of the God-Willow (OGN-280 → ogn-280-298)
 *   "When you hold here, draw 1."
 *
 * Q: Can both players reveal the same battlefield when starting game 3 of a best-of-3 match?
 * A: Yes — in 1v1 nothing stops the two players from bringing the same battlefield; both copies are
 *    in play and each works for whoever controls it. (The restriction that a player must pick a
 *    different battlefield each game of the match is about that one player's own choices; and in 2v2
 *    teammates may not duplicate each other.)
 * Rules: 486.5 (battlefield selection), 190 (each battlefield is its own object), 471.2 (its
 *        abilities are read at that battlefield only).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GROVE = "ogn-280-298";

describe("Ruling 599e8a0e061a2362 — two copies of one battlefield card coexist and work independently", () => {
  test("both battlefields carry the same printed card yet are distinct objects with their own controller", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1, def: GROVE, inert: false })
      .battlefield("bf2", { controller: P2, def: GROVE, inert: false })
      .unit(P1, "bf1", { might: 3, name: "Alpha" }, "a")
      .unit(P2, "bf2", { might: 3, name: "Bravo" }, "b")
      .build();
    expect(game.battlefields().sort()).toEqual(["bf1", "bf2"]);
    expect(game.state("bf1").defId).toBe(GROVE);
    expect(game.state("bf2").defId).toBe(GROVE);
    expect(game.state("bf1").id).not.toBe(game.state("bf2").id);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  test("each copy's hold ability fires for its own controller, on that player's own turn", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1, def: GROVE, inert: false })
      .battlefield("bf2", { controller: P2, def: GROVE, inert: false })
      .unit(P1, "bf1", { might: 3, name: "Alpha" }, "a")
      .unit(P2, "bf2", { might: 3, name: "Bravo" }, "b")
      .build();
    const before = { p1: game.p1.hand().length, p2: game.p2.hand().length };
    await game.advanceTurn(); // → P1's turn: normal draw 1 + one Grove hold
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.hand().length - before.p1).toBe(2);
    expect(game.p2.hand().length - before.p2).toBe(0);
    const mid = { p1: game.p1.hand().length, p2: game.p2.hand().length };
    await game.advanceTurn(); // → P2's turn: their own copy pays out the same way
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.hand().length - mid.p2).toBe(2);
    expect(game.p1.hand().length - mid.p1).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("one player holding BOTH copies gets both hold effects — they do not merge into one", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1, def: GROVE, inert: false })
      .battlefield("bf2", { controller: P1, def: GROVE, inert: false })
      .unit(P1, "bf1", { might: 3, name: "Alpha" }, "a")
      .unit(P1, "bf2", { might: 3, name: "Bravo" }, "b")
      .build();
    const before = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.hand().length - before).toBe(3); // 1 turn draw + 2 holds
    expect(game.p1.points()).toBe(2); // and a point per battlefield held
    expect(game.violations()).toEqual([]);
  });
});
