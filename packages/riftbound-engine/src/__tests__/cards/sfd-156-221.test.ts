/**
 * Laurent Duelist — sfd-156-221 · Unit · Order · 4 energy · 3 might
 *
 *   [Assault 2] (+2 [Might] while I'm an attacker.)
 *
 * Rules: 807 Assault (807.1.c: the bonus applies only while the unit is an attacker; at rest and
 * while defending it has its printed Might), 143.4 (units enter exhausted).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-156-221";

describe("Laurent Duelist (sfd-156-221)", () => {
  test("cost: 4 energy, no power; a 3-might unit with Assault (value 2); unaffordable with 3", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "ld").build();
    await game.p1.play("ld");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("ld")).toBe("base");
    expect(game.state("ld").might).toBe(3); // Assault does nothing at rest
    expect(game.state("ld").keywords).toContain("Assault");
    expect(game.state("ld").isExhausted).toBe(true);
    const poor = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "ld").build();
    expect(poor.p1.can("play", "ld")).toBe(false);
  });

  test("Assault 2 while attacking: 3 + 2 = 5 kills a 5-might defender (and the Duelist dies to its 5)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "ld")
      .unit(P2, "bf1", { might: 5, name: "Foe" }, "foe")
      .build();
    await game.p1.move("ld", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("ld")).toBe("trash");
  });

  test("Assault 2 while attacking: a 4-might defender dies and the Duelist survives with the battlefield conquered", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "ld")
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .build();
    await game.p1.move("ld", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("ld")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("ld").might).toBe(3); // bonus gone once combat is over
  });

  test("no bonus while DEFENDING: a 4-might attacker kills the 3-might Duelist and survives", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ld")
      .unit(P2, "base", { might: 4, name: "Attacker" }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("ld")).toBe("trash");
    expect(game.locationOf("atk")).toBe("bf1"); // took only 3 damage
  });
});
