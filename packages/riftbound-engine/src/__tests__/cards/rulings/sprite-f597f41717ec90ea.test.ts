/**
 * Ruling f597f41717ec90ea — Sprite (OGN-274 → ogn-274-298) · 3 [Might] Fae unit token · [Temporary]
 *
 * Q: A Sprite whose Might is 5 already has 3 marked damage on it. Does it still deal its FULL damage in combat
 *    and kill both blockers?
 * A: Yes. Marked damage never reduces the damage a unit deals. It assigns all 5, killing both defenders, and is
 *    itself killed once the defenders' damage brings its total to (or past) its Might.
 * Rules: 465.2.a/c (assign damage equal to summed Might), 465.2.d (dealt simultaneously), 195.3 (lethal = marked ≥ Might).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";

/** P1's turn. A 5-Might Sprite (printed 3, +2) carrying 3 damage; P2 defends bf1 with a 2- and a 3-Might unit. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Blocker A" }, "blockA")
    .unit(P2, "bf1", { might: 3, name: "Blocker B" }, "blockB")
    .unit(P1, "base", SPRITE, "sprite", { damage: 3, mightModifier: 2 });
}

async function attack(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("sprite", "bf1");
  return game;
}

describe("Ruling f597f41717ec90ea — 3 marked damage does not shrink the Sprite's 5 combat damage", () => {
  test("premise: the Sprite is at 5 Might with 3 damage marked — 2 more will kill it", async () => {
    const game = await board().build();
    expect(game.state("sprite")).toMatchObject({ baseMight: 3, damage: 3, might: 5 });
    expect(game.state("sprite").keywords).toContain("Temporary");
  });

  test("it assigns all 5 (2 + 3), killing BOTH blockers — the marked damage is not deducted", async () => {
    const game = await attack();
    expect(game.state("sprite").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("blockA")).toBe("trash");
    expect(game.zoneOf("blockB")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the blockers' 5 damage on top of the 3 already marked kills the Sprite: nobody remains, nobody conquers", async () => {
    const game = await attack();
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("gone"); // a token that left the board ceases to exist (186.1)
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0);
  });

  test("contrast: an undamaged 5-Might Sprite kills both blockers the same way — the output never depended on its damage", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", { might: 2, name: "Blocker A" }, "blockA")
      .unit(P2, "bf1", { might: 3, name: "Blocker B" }, "blockB")
      .unit(P1, "base", SPRITE, "sprite", { mightModifier: 2 })
      .build();
    await game.p1.move("sprite", "bf1");
    await game.settle();
    expect(game.zoneOf("blockA")).toBe("trash");
    expect(game.zoneOf("blockB")).toBe("trash");
    expect(game.zoneOf("sprite")).toBe("gone"); // 5 damage back is still lethal on a 5-Might unit
  });
});
