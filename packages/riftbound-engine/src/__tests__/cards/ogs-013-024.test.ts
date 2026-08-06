/**
 * Garen, Commander — ogs-013-024 · Champion Unit · Order · 6 energy + [order] · 5 might
 *
 *   Other friendly units have +1 [Might] here.
 *
 * "here" = Garen's current location (his base or the battlefield he is at); as a static
 * (passive) ability it applies continuously (rule 476 layers) as units or Garen change location.
 *
 * Engine note: static Might bonuses are only recomputed when a chain resolves, so the semantic
 * tests cast a 0-cost "Draw 1" spell as a nudge; the always-on expectation is its own BUG test.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const GAREN = "ogs-013-024";
const VENGEANCE = "ogn-229-298"; // 4 + [order][order]: "Kill a unit."
const NUDGE = { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", energyCost: 0, name: "Nudge", timing: "action" };

async function nudge(game: Game, alias = "nudge") {
  await game.p1.cast(alias);
  await game.settle();
}

function board(garenAt: "base" | "bf1" = "bf1") {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, garenAt, GAREN, "garen")
    .unit(P1, "bf1", { might: 2, name: "Field" }, "field")
    .unit(P2, "bf1", { might: 2, name: "FoeField" }, "foe")
    .unit(P1, "base", { might: 2, name: "Home" }, "home")
    .hand(P1, NUDGE, "nudge")
    .hand(P1, NUDGE, "nudge2")
    .hand(P1, NUDGE, "nudge3");
}

describe("Garen, Commander (ogs-013-024)", () => {
  test("costs 6 energy + 1 order power; 5 Might", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { order: 1 } }).hand(P1, GAREN, "garen").build();
    await game.p1.play("garen", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("garen")).toBe("base");
    expect(game.state("garen").might).toBe(5);
    const noPower = await scenario().resources(P1, { energy: 6 }).hand(P1, GAREN, "garen").build();
    expect(noPower.p1.can("play", "garen")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 5, power: { order: 1 } }).hand(P1, GAREN, "garen").build();
    expect(lowEnergy.p1.can("play", "garen")).toBe(false);
  });

  test("Garen at a battlefield: other friendly units THERE have +1; base units, enemies there and Garen himself do not", async () => {
    const game = await board("bf1").build();
    await nudge(game);
    expect(game.state("field").might).toBe(3);
    expect(game.state("field").baseMight).toBe(2);
    expect(game.state("home").might).toBe(2);
    expect(game.state("foe").might).toBe(2);
    expect(game.state("garen").might).toBe(5);
  });

  test("'here' can be the base: with Garen in base, other friendly base units have +1 and battlefield units do not", async () => {
    const game = await board("base").build();
    await nudge(game);
    expect(game.state("home").might).toBe(3);
    expect(game.state("field").might).toBe(2);
  });

  test("the bonus follows location: a unit leaving Garen's battlefield loses it, one joining gains it", async () => {
    const game = await board("bf1").build();
    await nudge(game);
    expect(game.state("field").might).toBe(3);
    await game.p1.move("field", "base");
    await nudge(game, "nudge2");
    expect(game.state("field").might).toBe(2);
    await game.p1.move("home", "bf1");
    await nudge(game, "nudge3");
    expect(game.state("home").might).toBe(3);
  });

  test("when Garen leaves the board the bonus ends", async () => {
    const game = await board("bf1").resources(P1, { energy: 4, power: { order: 2 } }).hand(P1, VENGEANCE, "vengeance").build();
    await nudge(game);
    expect(game.state("field").might).toBe(3);
    await game.p1.cast("vengeance", { targets: "garen" });
    await game.settle();
    expect(game.zoneOf("garen")).toBe("trash");
    expect(game.state("field").might).toBe(2);
  });

  test.failing("BUG: the static applies continuously — no chain resolution should be needed to see +1 (rule 476)", async () => {
    // Expected: straight after setup / a move, allies at Garen's location read 3 Might.
    // Actual: staticMightBonus is only recomputed when a chain resolves, so they read 2.
    const game = await board("bf1").build();
    expect(game.state("field").might).toBe(3);
    await game.p1.move("home", "bf1");
    expect(game.state("home").might).toBe(3);
  });

  test("the bonus counts in combat: Garen (5) + a 2-Might ally (→3) deal 8 and kill an 8-Might defender", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", GAREN, "garen")
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 8 }, "wall")
      .build();
    await game.p1.move(["garen", "ally"], "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
  });
});
