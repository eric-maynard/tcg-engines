/**
 * Friendship — unl-046-219 · Spell (Reaction) · Calm · 1 energy
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Choose a unit. Give it +1 [Might] this turn for each of the following
 *   tags among your units — Bird, Cat, Dog, and Poro.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "unl-046-219";
const POUTY_PORO = "ogn-013-298";
const MYSTIC_PORO = "ogn-171-298";

describe("Friendship (unl-046-219)", () => {
  test("two Poro units contribute one distinct tag → +1 Might", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", POUTY_PORO, "pouty")
      .unit(P1, "base", MYSTIC_PORO, "mystic")
      .hand(P1, CARD, "friendship")
      .build();
    const before = game.state("pouty").might;
    await game.p1.cast("friendship", { targets: "pouty" });
    await game.settle();
    expect(game.state("pouty").might).toBe(before + 1);
  });

  test("counts each listed tag once across your units (Poro + Cat + Dog → +3)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", POUTY_PORO, "pouty")
      .unit(P1, "base", { might: 1, tags: ["Cat"] }, "cat")
      .unit(P1, "base", { might: 1, tags: ["Dog", "Cat"] }, "dog")
      .unit(P1, "base", { might: 4 }, "target")
      .hand(P1, CARD, "friendship")
      .build();
    await game.p1.cast("friendship", { targets: "target" });
    await game.settle();
    expect(game.state("target").might).toBe(7);
  });
});
