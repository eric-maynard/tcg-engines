/**
 * Ahri, Alluring — ogn-066-298 · Champion Unit · Calm · 5 energy + 1 [calm] · 4 might
 *
 *   When I hold, you score 1 point.
 *
 * Rules: 469.2 (Hold — keep control of a battlefield during your Beginning
 * Phase → 1 point), 383.4.d (Hold Effects trigger for units present at the held
 * battlefield), 469.1 (Conquer is a different way to score).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-066-298";

describe("Ahri, Alluring (ogn-066-298)", () => {
  test("costs 5 energy + 1 calm power; unaffordable without the calm power", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { calm: 1 } }).hand(P1, CARD, "ahri").build();
    await game.p1.play("ahri", { to: "base" });
    await game.settle();
    expect(game.zoneOf("ahri")).toBe("base");
    expect(game.state("ahri").might).toBe(4);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    const noPower = await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, CARD, "ahri").build();
    expect(noPower.p1.can("play", "ahri")).toBe(false);
  });

  test("When I hold: her trigger goes on the chain in the Beginning Phase and P1 ends up with 2 points (hold + Ahri)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ahri")
      .build();
    expect(game.p1.points()).toBe(0);
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(1); // the hold point itself is already scored
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(2);
  });

  test("'When I hold': holding a battlefield Ahri is not at scores only the normal 1 point", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "grunt")
      .unit(P1, "base", CARD, "ahri")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("only YOUR hold: nothing happens during the opponent's Beginning Phase", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ahri")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("conquering is not holding: Ahri conquering an empty enemy battlefield scores just 1", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "ahri")
      .build();
    await game.p1.move("ahri", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
