/**
 * Defiant Dance — sfd-196-221 · Spell (Reaction) · Calm/Chaos · 1 energy
 *
 *   Give a unit +2 [Might] this turn and another unit -2 [Might] this turn.
 *
 * "another unit" names a SECOND, distinct caster-chosen target: the spell needs
 * two different units and buffs one while shrinking the other.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const DEFIANT_DANCE = "sfd-196-221";

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .unit(P1, "base", { might: 4 }, "mine")
    .unit(P2, "base", { might: 4 }, "foe")
    .hand(P1, DEFIANT_DANCE, "dd");
}

describe("Defiant Dance (sfd-196-221)", () => {
  test("asks for two distinct targets: +2 to the first, -2 to the second", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "dd")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(
      expect.arrayContaining([
        ["mine", "foe"],
        ["foe", "mine"],
      ]),
    );
    await game.p1.cast("dd", { targets: ["mine", "foe"] });
    await game.settle();
    expect(game.state("mine").might).toBe(6);
    expect(game.state("foe").might).toBe(2);
  });

  test("not castable with only one unit on board — a second distinct target is required", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 1 } })
      .unit(P1, "base", { might: 4 }, "mine")
      .hand(P1, DEFIANT_DANCE, "dd")
      .build();
    expect(game.p1.can("cast", "dd")).toBe(false);
  });

  test("the same unit cannot fill both slots", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "dd")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets?.every((t: string[]) => t.length === 2 && t[0] !== t[1])).toBe(true);
  });
});
