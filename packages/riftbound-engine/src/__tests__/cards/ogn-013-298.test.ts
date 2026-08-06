/**
 * Pouty Poro — ogn-013-298 · Unit · Fury · 2 energy · 2 might · Poro
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *
 * Rule 809.1.c — Deflect: opponents' spells/abilities that choose this cost 1
 * more Power (of any domain, 809.1.c.1) as a mandatory additional cost.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-013-298";
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

describe("Pouty Poro (ogn-013-298)", () => {
  test("costs 2 energy to play; 2-might unit with the Deflect keyword lands in base", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "poro").build();
    await game.p1.play("poro");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("poro").might).toBe(2);
    expect(game.state("poro").keywords).toContain("Deflect");
  });

  test("not playable with only 1 energy", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "poro").build();
    expect(game.p1.can("play", "poro")).toBe(false);
  });

  test("Deflect: an opponent's spell cannot choose the Poro without a spare power to pay", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "poro")
      .unit(P1, "base", { might: 2 }, "plain")
      .hand(P2, BOLT, "bolt")
      .build();
    // The vanilla unit is a fine target; the Poro is not affordable.
    const r = await game.p2.try((p) => p.cast("bolt", { targets: "poro" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("bolt")).toBe("hand");
    await game.p2.cast("bolt", { targets: "plain" });
    expect(game.p2.energy()).toBe(0);
  });

  test("Deflect: with one power of any domain the opponent may choose the Poro and pays it (809.1.c.1)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .unit(P1, "base", CARD, "poro")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "poro" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash"); // 2 damage kills the 2-might Poro
  });

  test("Deflect only taxes opponents: the controller's own spell chooses the Poro at no extra cost", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", CARD, "poro")
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p1.cast("bolt", { targets: "poro" });
    expect(game.p1.resources().energy).toBe(0);
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
  });
});
