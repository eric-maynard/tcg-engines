/**
 * Smoke Screen — ogn-093-298 · Spell · Mind · 2 energy + 1 [mind]
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Give a unit -4 [Might] this turn, to a minimum of 1 [Might].
 *
 * Rules: 813 (Reaction: playable in Closed states on any player's turn),
 * 159.2.b.3 (a Reaction resolves before items already on the chain).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-093-298";
const CLEAVE = "ogn-004-298"; // [Action] 1-energy spell the opponent casts on their own turn

describe("Smoke Screen (ogn-093-298)", () => {
  test("costs 2 energy + 1 mind; not playable short of either", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).unit(P2, "base", { might: 6 }, "foe").hand(P1, CARD, "ss").build();
    await game.p1.cast("ss", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    const noMind = await scenario().resources(P1, { energy: 2 }).unit(P2, "base", { might: 6 }, "foe").hand(P1, CARD, "ss").build();
    expect(noMind.p1.can("cast", "ss")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 1, power: { mind: 1 } }).unit(P2, "base", { might: 6 }, "foe").hand(P1, CARD, "ss").build();
    expect(noEnergy.p1.can("cast", "ss")).toBe(false);
  });

  test("gives the chosen unit (friendly or enemy) -4 Might: 6 → 2; spell goes to trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .unit(P2, "base", { might: 6 }, "foe")
      .unit(P1, "base", { might: 6 }, "ally")
      .hand(P1, CARD, "ss")
      .build();
    const targets = game.p1.option("cast", "ss")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["foe"], ["ally"]]));
    await game.p1.cast("ss", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(2);
    expect(game.state("ally").might).toBe(6);
    expect(game.zoneOf("ss")).toBe("trash");
  });

  test("to a minimum of 1: a 3-Might unit ends at 1, not below", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).unit(P2, "base", { might: 3 }, "foe").hand(P1, CARD, "ss").build();
    await game.p1.cast("ss", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(1);
  });

  test("'this turn': the penalty is gone after the turn ends", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).unit(P2, "base", { might: 6 }, "foe").hand(P1, CARD, "ss").build();
    await game.p1.cast("ss", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(2);
    await game.advanceTurn();
    expect(game.state("foe").might).toBe(6);
  });

  test("[Reaction]: cast on the opponent's turn in response to their spell, and it resolves first", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .unit(P2, "base", { might: 6 }, "theirs")
      .hand(P2, CLEAVE, "cleave")
      .hand(P1, CARD, "ss")
      .build();
    await game.p2.cast("cleave", { targets: "theirs" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("ss", { targets: "theirs" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "ss"]);
    // One round of passes resolves only the top item (Smoke Screen).
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("ss")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    expect(game.state("theirs").might).toBe(2);
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
  });
});
