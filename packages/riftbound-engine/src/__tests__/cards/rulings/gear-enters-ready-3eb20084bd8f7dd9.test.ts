/**
 * Ruling 3eb20084bd8f7dd9 — (general Gear rules)
 *   Stand-in: Long Sword (sfd-022-221) · Equipment · Fury · [2][fury] · "[Quick-Draw] … [Equip] [fury]"
 *
 * Q: When you play a piece of equipment, does it enter the base readied or exhausted?
 * A: Equipment enters READY by default (unless the card says otherwise). Nuances: [Equip] does not
 *    require the equipment to be ready — you may use it while the gear is exhausted — and the equipment
 *    does not have to be in the same location (base / battlefield) as the unit it attaches to.
 * Rules: 143.4 (units enter exhausted; gear does not), 818.1 ([Equip]'s cost is the printed one — no
 *        exhaust unless stated), 476.1 (attaching to a unit you control).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LONG_SWORD = "sfd-022-221";

describe("Ruling 3eb20084bd8f7dd9 — gear enters ready, and [Equip] works exhausted and across locations", () => {
  test("a gear played from hand enters the base READY (the unit played alongside it enters exhausted)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .unit(P1, "base", { might: 3, name: "Squire" }, "squire")
      .hand(P1, LONG_SWORD, "sword")
      .build();
    await game.p1.play("sword");
    await game.settle();
    expect(game.zoneOf("sword")).toBe("base");
    expect(game.state("sword")).toMatchObject({ isExhausted: false, isReady: true });
  });

  test("[Equip] does not need a ready gear: an EXHAUSTED Long Sword still attaches", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .gear(P1, LONG_SWORD, "sword")
      .unit(P1, "base", { might: 3, name: "Squire" }, "squire")
      .build();
    await game.p1.do("exhaustCard", { cardId: "sword", playerId: P1 });
    expect(game.state("sword").isExhausted).toBe(true);
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "squire" });
    await game.settle();
    expect(game.state("sword").attachedTo).toBe("squire");
    expect(game.state("squire").might).toBe(5);
    expect(game.state("sword").isExhausted).toBe(true); // attaching did not ready or exhaust it
    expect(game.violations()).toEqual([]);
  });

  test("locations need not match: a gear in the base attaches to a unit standing at a battlefield", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .gear(P1, LONG_SWORD, "sword")
      .unit(P1, "bf1", { might: 3, name: "Vanguard" }, "vanguard")
      .unit(P2, "base", { might: 1, name: "Peon" }, "peon")
      .build();
    expect(game.locationOf("sword")).toBe("base");
    expect(game.locationOf("vanguard")).toBe("bf1");
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "vanguard" });
    await game.settle();
    expect(game.state("sword").attachedTo).toBe("vanguard");
    expect(game.state("vanguard").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });
});
