/**
 * Kadregrin the Infernal — ogn-038-298 · Unit · Fury · 9 energy + 2 [fury] · 9 Might
 *
 *   When you play me, draw 1 for each of your [Mighty] units.
 *   (A unit is Mighty while it has 5+ [Might].)
 *
 * Rules 706–711: a unit is Mighty while its Might is 5 or greater. Kadregrin is
 * on the board (9 Might) when his own play trigger resolves, so he counts himself.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-038-298";

function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .hand(P1, CARD, "kad");
}

describe("Kadregrin the Infernal (ogn-038-298)", () => {
  test("costs 9 energy + 2 fury and enters the base as a 9-Might unit", async () => {
    const game = await board().build();
    await game.p1.play("kad");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("kad")).toBe("base");
    expect(game.state("kad").might).toBe(9);
  });

  test("not playable with only 1 fury power or 8 energy", async () => {
    const lowPower = await scenario().resources(P1, { energy: 9, power: { fury: 1 } }).hand(P1, CARD, "kad").build();
    expect(lowPower.p1.can("play", "kad")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 8, power: { fury: 2 } }).hand(P1, CARD, "kad").build();
    expect(lowEnergy.p1.can("play", "kad")).toBe(false);
  });

  test("with no other units, draws 1 (Kadregrin himself is Mighty)", async () => {
    const game = await board().build();
    const before = game.p1.hand().length; // 1 (kad)
    await game.p1.play("kad");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(before - 1 + 1);
  });

  test("should draw 1 per friendly Mighty unit — Kadregrin + a 5 and a 6 = 3 cards (rules 708, 710)", async () => {
    const game = await board()
      .unit(P1, "base", { might: 5 }, "five")
      .unit(P1, "bf1", { might: 6 }, "six")
      .unit(P1, "base", { might: 4 }, "four")
      .build();
    await game.p1.play("kad");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(3);
  });

  test("a buffed 4-Might ally (current Might 5) is Mighty and should add a draw (rule 710)", async () => {
    const game = await board().unit(P1, "base", { might: 4 }, "pumped", { buffed: true }).build();
    expect(game.state("pumped").might).toBe(5);
    await game.p1.play("kad");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("enemy Mighty units are not 'your' units and don't add draws", async () => {
    const game = await board().unit(P2, "bf1", { might: 7 }, "bigfoe").unit(P2, "base", { might: 5 }, "foe5").build();
    await game.p1.play("kad");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p2.hand()).toHaveLength(0);
  });
});
