/**
 * Deadbloom Predator — ogn-161-298 · Unit · Body · 8 energy + [body][body] · 8 Might
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *   You may play me to an occupied enemy battlefield.
 *
 * Rules: 809 Deflect (mandatory additional cost of 1 power of ANY domain for opponents'
 * spells/abilities that target it; own spells untaxed); 355.2.a/b (units are normally played
 * to your base or a battlefield you control — this card adds occupied ENEMY battlefields as
 * valid locations); 170.11.a (occupied = has a unit); 323.9/323.13 (opposing units at one
 * battlefield in a neutral open state → combat begins there).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-161-298";
const CLEAVE = "ogn-004-298"; // 1-energy Fury Action: "Give a unit [Assault 3] this turn."

function inHand() {
  return scenario()
    .resources(P1, { energy: 8, power: { body: 2 } })
    .battlefield("bf1", { controller: P2 }) // occupied enemy battlefield
    .battlefield("bf2", { controller: P2 }) // enemy-controlled but empty
    .battlefield("bf3", { controller: null }) // open
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P1, CARD, "dp");
}

const playTargets = (game: Awaited<ReturnType<ReturnType<typeof inHand>["build"]>>) =>
  game.p1.option("play", "dp")?.fields.find((f) => f.arg === "to")?.options ?? [];

describe("Deadbloom Predator (ogn-161-298)", () => {
  test("costs 8 energy + 2 body power; an 8-Might unit with Deflect; unaffordable short of either", async () => {
    const game = await inHand().build();
    await game.p1.play("dp", { to: "base" });
    await game.settle();
    expect(game.zoneOf("dp")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.state("dp").might).toBe(8);
    expect(game.state("dp").keywords).toContain("Deflect");
    const onePower = await scenario().resources(P1, { energy: 8, power: { body: 1 } }).hand(P1, CARD, "dp").build();
    expect(onePower.p1.can("play", "dp")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 7, power: { body: 2 } }).hand(P1, CARD, "dp").build();
    expect(lowEnergy.p1.can("play", "dp")).toBe(false);
  });

  test("Deflect: an opponent's spell can only choose it by paying 1 extra power (any domain)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "dp")
      .unit(P2, "base", { might: 3 }, "theirs")
      .hand(P2, CLEAVE, "cleave")
      .build();
    const targets = () => game.p2.option("cast", "cleave")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets()).toEqual([["theirs"]]);
    await game.p2.do("addResources", { power: { mind: 1 } });
    expect(targets()).toEqual(expect.arrayContaining([["dp"], ["theirs"]]));
    await game.p2.cast("cleave", { targets: "dp" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.state("dp").keywords).toContain("Assault");
  });

  test("Deflect does not tax its controller's own spells", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "dp").hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "dp" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("dp").keywords).toContain("Assault");
  });

  test("normal locations stay valid: base is offered; an empty enemy battlefield and an open battlefield are not", async () => {
    const game = await inHand().build();
    const to = playTargets(game);
    expect(to).toContain("base");
    expect(to).not.toContain("battlefield-bf2");
    expect(to).not.toContain("battlefield-bf3");
  });

  test.failing("BUG: may be played to an OCCUPIED ENEMY battlefield; combat then begins there (355.2.b, 323.13)", async () => {
    // Expected: bf1 (enemy-controlled, has an enemy unit) is a legal play location; the Predator
    // enters there and, with opposing units present, a combat is staged and resolves — the 3-Might
    // guard dies and P1 conquers bf1. Actual: only base / own battlefields are offered.
    const game = await inHand().build();
    expect(playTargets(game)).toContain("battlefield-bf1");
    await game.p1.play("dp", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("dp")).toBe("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("dp")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
