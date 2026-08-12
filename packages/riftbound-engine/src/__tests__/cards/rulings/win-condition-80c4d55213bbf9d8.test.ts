/**
 * Ruling 80c4d55213bbf9d8 — (general win conditions; no specific card)
 *
 * Q: How does someone win a game of Riftbound?
 * A: By reaching the Victory Score (8 in a duel). Points come from Conquering (gaining control of a battlefield
 *    you have not scored this turn) or Holding (still controlling it in your Beginning Phase); each battlefield
 *    scores at most once per turn. The FINAL point may not be taken by a Conquer unless every battlefield was
 *    scored that turn. Otherwise: an opponent who concedes is removed, and the last player standing wins.
 * Rules: 449 / 194 (Victory Score reached ⇒ win immediately), 446.1 / 469 (Conquer), 446.2 / 470 (Hold),
 *        447 (once per battlefield per turn), 448.1.b.2 / 471.1.b (final point by Conquer), 651.1 (concession).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

describe("Ruling 80c4d55213bbf9d8 — reaching the Victory Score wins; points come from Conquer and Hold", () => {
  test("Conquer (446.1): taking a battlefield not yet scored this turn is worth a point", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Runt" }, "runt")
      .unit(P2, "bf2", { might: 4, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
      .build();
    expect(game.p1.points()).toBe(0);
    await game.p1.move("brute", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.isOver()).toBe(false);
  });

  test("Hold (446.2): still controlling a battlefield in my Beginning Phase scores it", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 3, name: "Wall" }, "wall")
      .build();
    expect(game.p1.points()).toBe(0);
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("449: the 8th point ends the game immediately — P1 at 7 holds bf1 into their Beginning Phase and wins", async () => {
    const game = await scenario()
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 3, name: "Wall" }, "wall")
      .build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("the Final Point restriction (448.1.b.2): a Conquer at 7 with the other battlefield unscored draws a card instead — the game goes on", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Runt" }, "runt")
      .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("brute", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(game.isOver()).toBe(false);
  });

  test("651.1: a concession removes that player — the only one left wins", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: null })
      .build();
    expect(game.isOver()).toBe(false);
    await game.p1.concede();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
