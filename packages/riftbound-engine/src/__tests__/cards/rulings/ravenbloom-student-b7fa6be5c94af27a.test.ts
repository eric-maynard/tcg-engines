/**
 * Ruling b7fa6be5c94af27a — Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might
 *   "When you play a spell, give me +1 [Might] this turn."
 *   × Square Up (UNL-017 → unl-017-219) · [4] · "[Repeat] — Discard 1. Give a unit [Assault 4] this turn."
 *
 * Q: With Ravenbloom Student out, does paying a [Repeat] cost count as playing two separate spells?
 * A: No. However many times a [Repeat] spell's instructions are executed, the spell is PLAYED once — so
 *    Ravenbloom Student triggers exactly once and gets +1, not +2.
 * Rules: 820.3.a ("Regardless of the number of times a spell's instructions are executed with this keyword,
 *        the spell is only Played once"), 419.4.a ("when you play a spell" fires on its resolution, once).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const RAVENBLOOM_STUDENT = "ogn-103-298";
const SQUARE_UP = "unl-017-219";

const FODDER = { cardType: "unit", energyCost: 1, might: 1, name: "Fodder" } as const;

/** P1's turn with 9 energy: the Student and a Pal in base, Square Up plus two discardable cards in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 9 })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .hand(P1, SQUARE_UP, "sq")
    .hand(P1, FODDER, "fodder1")
    .hand(P1, FODDER, "fodder2");
}

describe("Ruling b7fa6be5c94af27a — a [Repeat] spell is PLAYED once, so Ravenbloom Student triggers once", () => {
  test("baseline: one plain Square Up gives the Student +1 (2 → 3)", async () => {
    const game = await board().build();
    expect(game.state("student").might).toBe(2);
    await game.p1.cast("sq", { targets: "pal" });
    await game.settle();
    expect(game.state("student").might).toBe(3);
    expect(game.state("student").mightModifier).toBe(1);
  });

  test("ruling: paying the [Repeat] cost executes the effect TWICE but still triggers the Student only ONCE (+1, not +2)", async () => {
    const game = await board().build();
    await game.p1.cast("sq", { discard: "fodder1", repeat: 1, targets: ["pal", "pal"] });
    // One card played ⇒ exactly one chain item, not two.
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "sq", controller: P1, targets: ["pal", "pal"], triggered: false }),
    ]);
    await game.settle();
    expect(game.state("student").might).toBe(3);
    expect(game.state("student").mightModifier).toBe(1);
  });

  test("ruling: the repeat DID happen — the Pal carries [Assault 4] twice and the discard cost was paid", async () => {
    const game = await board().build();
    await game.p1.cast("sq", { discard: "fodder1", repeat: 1, targets: ["pal", "pal"] });
    await game.settle();
    expect(game.state("pal").grantedKeywords).toEqual([
      { duration: "turn", keyword: "Assault", value: 4 },
      { duration: "turn", keyword: "Assault", value: 4 },
    ]);
    expect(game.p1.trash()).toContain("sq");
    expect(game.p1.hand()).toHaveLength(1); // one of the two fodder cards was discarded for [Repeat]
  });

  test("contrast: two SEPARATE spells really are two plays — the Student ends on 4 (+1 each)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9 })
      .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .hand(P1, SQUARE_UP, "sq1")
      .hand(P1, SQUARE_UP, "sq2")
      .hand(P1, FODDER, "fodder1")
      .build();
    await game.p1.cast("sq1", { targets: "pal" });
    await game.settle();
    await game.p1.cast("sq2", { targets: "pal" });
    await game.settle();
    expect(game.state("student").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});
