/**
 * Sentinel Adept — sfd-008-221 · Unit · Fury · 3 energy · 3 might
 *
 *   [Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow]
 *   less, even if it's already attached.)
 *
 * Rules: 821 Weaponmaster — a play trigger that chooses an Equipment you control, pays its Equip
 * cost reduced by one power of any domain and attaches it (821.1.c), even one attached elsewhere;
 * 143.4 units enter exhausted.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "sfd-008-221";
const DIRK = "sfd-009-221"; // Serrated Dirk — Equipment, Equip [fury], +0 might
const SKYFALL = "sfd-030-221"; // Skyfall of Areion — Equipment, Equip [1][fury], +2 might

describe("Sentinel Adept (sfd-008-221)", () => {
  test("cost: 3 energy for a 3-might unit that enters the base exhausted; unaffordable with 2 energy", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "sa").build();
    expect(game.p1.can("play", "sa")).toBe(true);
    await game.p1.play("sa");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("sa")).toBe("base");
    expect(game.state("sa").might).toBe(3);
    expect(game.state("sa").isExhausted).toBe(true);
    expect(game.state("sa").keywords).toContain("Weaponmaster");
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "sa").build();
    expect(poor.p1.can("play", "sa")).toBe(false);
  });

  test("Weaponmaster: on play you may equip Skyfall (Equip [1][fury]) for [rainbow] less — pays only [1], attaches, +2 might", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).gear(P1, SKYFALL, "sky").hand(P1, CARD, "sa").build();
    await game.p1.play("sa");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.pick("sky");
    await game.settle();
    expect(game.state("sky").attachedTo).toBe("sa");
    expect(game.state("sa").attachments).toContain("sky");
    expect(game.state("sa").might).toBe(5);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } }); // [1][fury] − [rainbow] = [1]
  });

  test("Weaponmaster with a power-only Equip cost (Serrated Dirk, [fury]) becomes free", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).gear(P1, DIRK, "dirk").hand(P1, CARD, "sa").build();
    await game.p1.play("sa", { answers: ["dirk"] });
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("sa");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("Weaponmaster is optional: declining leaves the Equipment unattached and costs nothing more", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).gear(P1, SKYFALL, "sky").hand(P1, CARD, "sa").build();
    await game.p1.play("sa");
    await game.p1.decline();
    await game.settle();
    expect(game.state("sky").attachedTo).toBeUndefined();
    expect(game.state("sa").might).toBe(3);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("'even if it's already attached': a Dirk worn by another unit is offered and moves onto the Adept", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .gear(P1, DIRK, "dirk")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .hand(P1, CARD, "sa")
      .build();
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "squire" });
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("squire");
    await game.p1.play("sa");
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["dirk"]);
    await game.p1.pick("dirk");
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("sa");
    expect(game.state("squire").attachments).toEqual([]);
    expect(game.state("sa").attachments).toEqual(["dirk"]);
  });

  test("no Equipment you control → no Weaponmaster prompt; the unit simply enters play", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).gear(P1, { cardType: "gear", name: "Trinket" }, "trinket").hand(P1, CARD, "sa").build();
    await game.p1.play("sa");
    expect(game.decision()?.kind).toBe("action");
    await game.settle();
    expect(game.zoneOf("sa")).toBe("base");
    expect(game.state("sa").attachments).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
