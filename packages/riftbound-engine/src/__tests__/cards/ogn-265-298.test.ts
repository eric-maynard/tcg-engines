/**
 * Herald of the Arcane — ogn-265-298 · Legend · Mind/Order · Viktor
 *
 *   [1], [Exhaust]: Play a 1 [Might] Recruit unit token.
 *
 * The activated ability carries no [Action]/[Reaction] keyword, so by default it
 * may only be activated in a Neutral Open State on its controller's turn
 * (rules 343.1.b, 313.1.a, 308.1.a).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-265-298";

describe("Herald of the Arcane (ogn-265-298)", () => {
  test("[1],[Exhaust]: creates a 1 Might Recruit token in an Open State", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).legend(P1, CARD, "herald").build();
    const before = game.p1.base().length;
    await game.p1.activate("herald");
    await game.settle();
    expect(game.p1.base().length).toBe(before + 1);
    expect(game.state("herald").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
  });

  test("no [Action] keyword — cannot be activated during a Showdown (rules 343.1.b, 313.1.a)", async () => {
    // rule 313.1.a: a player with Focus may not activate abilities that lack
    // the Action or Reaction keywords. Only gear/unit hosts were restricted
    // before; a legend's untagged ability was wrongly offered mid-showdown.
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "foe")
      .unit(P1, "base", { might: 3 }, "scout")
      .legend(P1, CARD, "herald")
      .autoProcedures(false)
      .build();
    await game.p1.move("scout", "bf1");
    const d = game.decision() as ActionDecision;
    expect(d.context).toBe("showdown");
    expect(d.seat).toBe(P1);
    expect(game.p1.can("activate", "herald")).toBe(false);
  });
});
