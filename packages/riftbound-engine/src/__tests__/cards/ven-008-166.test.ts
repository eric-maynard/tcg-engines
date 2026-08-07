/**
 * Ruthless Strike — ven-008-166 · Spell · Fury · 3 energy
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   As an additional cost to play this, you may discard 1.
 *   Deal 3 to a unit at a battlefield. If you paid the additional cost, deal 5 to it instead.
 *
 * Rules: 356.2.b / 204.2 (an optional additional cost is chosen and paid as the spell is
 * played), 422.3 (the discarded card goes to the trash before the spell is on the chain).
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-008-166";

function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: null })
    .unit(P2, "bf1", { might: 6, name: "Target" }, "foe")
    .hand(P1, CARD, "strike")
    .hand(P1, "ogn-175-298", "fodder");
}

describe("Ruthless Strike (ven-008-166)", () => {
  test("card data: the optional discard cost and the paid rider are modelled", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { additionalCost: { discard: 1 }, optional: true, type: "additional-cost-option" },
      type: "static",
    });
    expect(def?.abilities?.[1]).toMatchObject({
      effect: { condition: { type: "paid-additional-cost" }, type: "conditional" },
      type: "spell",
    });
  });

  test("unpaid: deals 3 to a unit at a battlefield and the hand card stays in hand", async () => {
    const game = await board().build();
    await game.p1.cast("strike");
    await game.settle();
    if (game.decision()?.kind === "pick") { await game.p1.pick("foe"); await game.settle(); }
    expect(game.state("foe").damage).toBe(3);
    expect(game.zoneOf("fodder")).toBe("hand");
    expect(game.p1.energy()).toBe(0);
  });

  test("paid: discarding 1 as the additional cost deals 5 instead, and the discard hits the trash", async () => {
    const game = await board().build();
    await game.p1.cast("strike", { params: { discardId: "fodder", paidAdditionalCost: true } });
    await game.settle();
    if (game.decision()?.kind === "pick") { await game.p1.pick("foe"); await game.settle(); }
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.state("foe").damage).toBe(5);
    expect(game.p1.energy()).toBe(0);
  });

  test("the additional cost is optional: with an empty hand the spell is still castable for 3", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: null })
      .unit(P2, "bf1", { might: 6, name: "Target" }, "foe")
      .hand(P1, CARD, "strike")
      .build();
    expect(game.p1.can("cast", "strike")).toBe(true);
    await game.p1.cast("strike");
    await game.settle();
    if (game.decision()?.kind === "pick") { await game.p1.pick("foe"); await game.settle(); }
    expect(game.state("foe").damage).toBe(3);
  });
});
