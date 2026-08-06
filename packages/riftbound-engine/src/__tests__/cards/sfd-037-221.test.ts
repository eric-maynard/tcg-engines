/**
 * Navori Scout — sfd-037-221 · Unit · Calm · 4 energy · 4 might
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *
 * Rule 809.1.c — Deflect: opponents' spells/abilities that choose this cost 1 more Power (of any
 * domain, 809.1.c.1) as a mandatory additional cost (356.2.a.2). Only opponents are taxed.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-037-221";
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
};

describe("Navori Scout (sfd-037-221)", () => {
  test("costs 4 energy; a 4-might unit with the Deflect keyword lands in base exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "scout").build();
    await game.p1.play("scout");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.state("scout").might).toBe(4);
    expect(game.state("scout").isExhausted).toBe(true);
    expect(game.state("scout").keywords).toContain("Deflect");
  });

  test("not playable with only 3 energy", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "scout").build();
    expect(game.p1.can("play", "scout")).toBe(false);
  });

  test("Deflect: an opponent's spell cannot choose the Scout without a spare power to pay", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "scout")
      .unit(P1, "base", { might: 2, name: "Plain" }, "plain")
      .hand(P2, BOLT, "bolt")
      .build();
    const r = await game.p2.try((p) => p.cast("bolt", { targets: "scout" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("bolt")).toBe("hand");
    await game.p2.cast("bolt", { targets: "plain" }); // the vanilla unit is untaxed
    expect(game.p2.energy()).toBe(0);
  });

  test("Deflect: with one power of ANY domain the opponent may choose the Scout and pays it (809.1.c.1)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { chaos: 1 } })
      .unit(P1, "base", CARD, "scout")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "scout" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.state("scout").damage).toBe(2);
    expect(game.zoneOf("scout")).toBe("base"); // 2 damage does not kill a 4-might unit
  });

  test("Deflect only taxes opponents: the controller's own spell chooses the Scout at no extra cost", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "scout").hand(P1, BOLT, "bolt").build();
    await game.p1.cast("bolt", { targets: "scout" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("scout").damage).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
