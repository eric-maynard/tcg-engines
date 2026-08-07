/**
 * Ruined Rex — unl-067-219 · Unit · Mind · 6 energy · 6 Might
 *
 *   [Deathknell] Deal 4 to an enemy unit. (When I die, get the effect.)
 *
 * rule 355.5 / 337.1 / 383.3 — the Game Object a triggered ability acts on is
 * chosen as the Pending Item is FINALIZED onto the chain, before priority
 * passes (rule 340.4), not when the item resolves.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-067-219";

/** 0-cost spell "Deal 6 to a unit." — a clean way to kill Rex. */
const ZAP = {
  abilities: [
    { effect: { amount: 6, target: { type: "unit" }, type: "damage" }, type: "spell" },
  ],
  cardType: "spell",
  energyCost: 0,
  name: "Filler Bolt",
};

describe("Ruined Rex (unl-067-219)", () => {
  test("the Deathknell's target is chosen when the trigger goes on the chain, not at resolution", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "rex")
      .unit(P2, "base", { might: 5 }, "foe1")
      .unit(P2, "base", { might: 5 }, "foe2")
      .hand(P2, ZAP, "zap")
      .build();
    await game.p2.cast("zap", { targets: "rex" });
    await game.settle();
    // The trigger is still a pending item on the chain and its controller is
    // already being asked to choose — not after priority passes and it resolves.
    expect(game.chain().map((i) => i.cardId)).toEqual(["rex"]);
    const decision = game.decision();
    expect(decision?.seat).toBe(P1);
    expect(decision?.kind).toBe("pick");
    expect(decision?.options?.map((o) => o.key).sort()).toEqual(["foe1", "foe2"]);
    await game.p1.pick("foe2");
    await game.settle();
    expect(game.state("foe2").damage).toBe(4);
    expect(game.state("foe1").damage).toBe(0);
  });
});
