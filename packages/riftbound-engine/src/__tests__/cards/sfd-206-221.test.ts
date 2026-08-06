/**
 * Riposte — sfd-206-221 · Spell · Body/Order · 2 energy · 2 power
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Choose a friendly unit and a spell. Counter that spell and give that unit
 *   +[Might] equal to that spell's Energy cost this turn.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-206-221";

const BOLT = {
  abilities: [
    {
      effect: { amount: 2, target: { type: "unit" }, type: "damage" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 3,
  name: "Test Bolt",
  timing: "action",
};

describe("Riposte (sfd-206-221)", () => {
  test("counters the spell and gives the chosen unit +Might equal to its Energy cost", async () => {
    const game = await scenario()
      .resources(P2, { energy: 3, power: { fury: 1 } })
      .resources(P1, { energy: 2, power: { body: 1, order: 1, rainbow: 2 } })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P2, BOLT, "bolt")
      .hand(P1, CARD, "riposte")
      .active(P2)
      .build();
    await game.p2.cast("bolt", { targets: "ally" });
    await game.p1.cast("riposte", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.state("ally").damage).toBe(0);
    expect(game.state("ally").mightModifier).toBe(3);
    expect(game.state("ally").might).toBe(5);
  });

  // rule-id: sfd-206-221 (rule 355.8) — "Choose a friendly unit and a spell":
  // both are caster-chosen targets, so the play is illegal with no spell on
  // the chain or no friendly unit, and must prompt for which friendly unit.
  test("not castable with no spell on the chain", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1, order: 1, rainbow: 2 } })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, CARD, "riposte")
      .build();
    expect(game.p1.can("cast", "riposte")).toBe(false);
  });

  test("not castable with no friendly unit", async () => {
    const game = await scenario()
      .resources(P2, { energy: 3, power: { fury: 1 } })
      .resources(P1, { energy: 2, power: { body: 1, order: 1, rainbow: 2 } })
      .unit(P2, "base", { might: 2 }, "foe")
      .hand(P2, BOLT, "bolt")
      .hand(P1, CARD, "riposte")
      .active(P2)
      .build();
    await game.p2.cast("bolt", { targets: "foe" });
    expect(game.p1.can("cast", "riposte")).toBe(false);
  });

  test("prompts for which friendly unit when several are on the board", async () => {
    const game = await scenario()
      .resources(P2, { energy: 3, power: { fury: 1 } })
      .resources(P1, { energy: 2, power: { body: 1, order: 1, rainbow: 2 } })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P1, "base", { might: 1 }, "other")
      .hand(P2, BOLT, "bolt")
      .hand(P1, CARD, "riposte")
      .active(P2)
      .build();
    await game.p2.cast("bolt", { targets: "ally" });
    expect(game.p1.can("cast", "riposte")).toBe(true);
    const r = await game.p1.try((p) => p.cast("riposte"));
    expect(r.ok).toBe(false);
    await game.p1.cast("riposte", { targets: "other" });
    await game.settle();
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.state("other").mightModifier).toBe(3);
    expect(game.state("ally").mightModifier ?? 0).toBe(0);
  });
});
