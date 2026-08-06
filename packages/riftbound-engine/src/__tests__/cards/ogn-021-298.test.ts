/**
 * Sun Disc — ogn-021-298 · Gear · Fury · 2 energy + 1 [fury]
 *
 *   [Exhaust]: [Legion] — The next unit you play this turn enters ready.
 *   (Get the effect if you've played another card this turn.)
 *
 * Rule 812 (Legion: active once you have finalized a different card this turn);
 * units normally enter exhausted (143.4) — this is a "next" replacement effect.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-021-298";

/** Sun Disc on board, two cheap vanilla units in hand and plenty of energy. */
function board() {
  return scenario()
    .resources(P1, { energy: 10 })
    .gear(P1, CARD, "disc")
    .hand(P1, { might: 1, energyCost: 1 }, "u1")
    .hand(P1, { might: 1, energyCost: 1 }, "u2")
    .hand(P1, { might: 1, energyCost: 1 }, "u3");
}

describe("Sun Disc (ogn-021-298)", () => {
  test("costs 2 energy + 1 fury to play; enters the base as gear", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).hand(P1, CARD, "disc").build();
    await game.p1.play("disc");
    await game.settle();
    expect(game.zoneOf("disc")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "disc").build();
    expect(poor.p1.can("play", "disc")).toBe(false);
    const poor2 = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).hand(P1, CARD, "disc").build();
    expect(poor2.p1.can("play", "disc")).toBe(false);
  });

  test("[Exhaust] cost: activating exhausts Sun Disc and costs no resources; cannot activate while exhausted", async () => {
    const game = await board().build();
    await game.p1.play("u1"); // satisfy Legion
    await game.settle();
    const before = game.p1.energy();
    await game.p1.activate("disc");
    await game.settle();
    expect(game.state("disc").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(before);
    expect(game.p1.can("activate", "disc")).toBe(false);
  });

  test("Legion met (another card played this turn): the next unit you play enters ready", async () => {
    const game = await board().build();
    await game.p1.play("u1");
    await game.settle();
    expect(game.state("u1").isExhausted).toBe(true); // baseline: units enter exhausted
    await game.p1.activate("disc");
    await game.settle();
    await game.p1.play("u2");
    await game.settle();
    expect(game.zoneOf("u2")).toBe("base");
    expect(game.state("u2").isReady).toBe(true);
  });

  test("only the NEXT unit: the unit played after that one enters exhausted as normal", async () => {
    const game = await board().build();
    await game.p1.play("u1");
    await game.settle();
    await game.p1.activate("disc");
    await game.settle();
    await game.p1.play("u2");
    await game.settle();
    await game.p1.play("u3");
    await game.settle();
    expect(game.state("u2").isReady).toBe(true);
    expect(game.state("u3").isExhausted).toBe(true);
  });

  test("Legion NOT met (no other card played this turn): activating gives no effect — the next unit enters exhausted", async () => {
    const game = await board().build();
    if (game.p1.can("activate", "disc")) {
      await game.p1.activate("disc");
      await game.settle();
    }
    await game.p1.play("u1");
    await game.settle();
    expect(game.state("u1").isExhausted).toBe(true);
  });

  test("Legion needs ANOTHER card: playing Sun Disc itself this turn does not satisfy its own Legion (rule 812.1.c)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 1 } })
      .hand(P1, CARD, "disc")
      .hand(P1, { might: 1, energyCost: 1 }, "u1")
      .build();
    await game.p1.play("disc");
    await game.settle();
    expect(game.state("disc").isReady).toBe(true); // gear enters ready
    if (game.p1.can("activate", "disc")) {
      await game.p1.activate("disc");
      await game.settle();
    }
    await game.p1.play("u1");
    await game.settle();
    expect(game.state("u1").isExhausted).toBe(true);
  });

  test("'this turn': an unused enters-ready effect does not carry over to your next turn", async () => {
    const game = await board().build();
    await game.p1.play("u1");
    await game.settle();
    await game.p1.activate("disc");
    await game.settle();
    await game.advanceTurn();
    await game.advanceToTurnOf(P1);
    expect(game.turnNumber()).toBe(4);
    await game.p1.tapRune();
    await game.p1.play("u2");
    await game.settle();
    expect(game.state("u2").isExhausted).toBe(true);
  });
});
