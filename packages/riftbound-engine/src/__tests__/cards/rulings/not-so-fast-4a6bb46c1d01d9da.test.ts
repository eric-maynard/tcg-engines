/**
 * Ruling 4a6bb46c1d01d9da — Not So Fast (SFD-045 → sfd-045-221)
 *   "[Reaction] Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Fox-Fire (ogn-256-298) "Kill any number of units at a battlefield with total Might 4 or less."
 *   × Defiant Dance (sfd-196-221) "Give a unit +2 [Might] this turn and another unit -2 [Might] this turn."
 *
 * Q: If a spell chooses several of my units and I play Not So Fast, is the whole spell cancelled or
 *    only its effect on the one unit?
 * A: The WHOLE spell. A spell is one atomic object on the Chain; countering it stops every instruction,
 *    however many units it chose — there is no partial resolution.
 * Rules: 425.1 (a countered object never resolves and does nothing), 336.1 (one spell = one chain item).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const FOX_FIRE = "ogn-256-298";
const DEFIANT_DANCE = "sfd-196-221";

describe("Ruling 4a6bb46c1d01d9da — Not So Fast counters the whole spell, not just one of its targets", () => {
  test("Fox-Fire chooses TWO of P2's units; one Not So Fast saves both", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .resources(P2, { energy: 2, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "A" }, "a")
      .unit(P2, "bf1", { might: 2, name: "B" }, "b")
      .hand(P1, FOX_FIRE, "fox")
      .hand(P2, NOT_SO_FAST, "nsf")
      .build();

    await game.p1.cast("fox", { targets: ["a", "b"] });
    // Intermediate fact: the two chosen units are ONE chain item, with both ids on it.
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "fox", controller: P1, targets: expect.arrayContaining(["a", "b"]) }),
    ]);

    await game.p1.passPriority();
    await game.p2.cast("nsf", { targets: "fox" });
    await game.settle();

    expect(game.zoneOf("a")).toBe("battlefield-bf1"); // neither instruction executed
    expect(game.zoneOf("b")).toBe("battlefield-bf1");
    expect(game.state("a").damage).toBe(0);
    expect(game.state("b").damage).toBe(0);
    expect(game.zoneOf("fox")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control: with no Not So Fast the same Fox-Fire kills both — so the save above really came from the counter", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "A" }, "a")
      .unit(P2, "bf1", { might: 2, name: "B" }, "b")
      .hand(P1, FOX_FIRE, "fox")
      .build();

    await game.p1.cast("fox", { targets: ["a", "b"] });
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
  });

  test("a two-role spell (Defiant Dance) is countered whole: the friendly +2 is lost along with the enemy -2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 1 } })
      .resources(P2, { energy: 2, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .hand(P1, DEFIANT_DANCE, "dance")
      .hand(P2, NOT_SO_FAST, "nsf")
      .build();

    await game.p1.cast("dance", { targets: ["ally", "foe"] });
    await game.p1.passPriority();
    await game.p2.cast("nsf", { targets: "dance" });
    await game.settle();

    expect(game.state("ally").might).toBe(3); // the +2 half died with the spell
    expect(game.state("foe").might).toBe(3); // and so did the -2 half
    expect(game.zoneOf("dance")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
