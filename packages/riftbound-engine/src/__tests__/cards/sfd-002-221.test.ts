/**
 * Armed Assailant — sfd-002-221 · Unit · Fury · 6 energy + [fury] · 6 might
 *
 *   [Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)
 *   [Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow]
 *   less, even if it's already attached.)
 *
 * Rules: 805 Accelerate (optional additional cost [1][C]; if paid the unit enters ready — otherwise
 * units enter exhausted, 143.4); 821 Weaponmaster (play trigger: choose an Equipment you control,
 * pay its Equip cost reduced by one power of any domain, attach it — even one attached elsewhere).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "sfd-002-221";
const DIRK = "sfd-009-221"; // Serrated Dirk — Equipment, Equip [fury], +0 might
const SKYFALL = "sfd-030-221"; // Skyfall of Areion — Equipment, Equip [1][fury], +2 might

describe("Armed Assailant (sfd-002-221)", () => {
  test("cost: 6 energy + 1 fury for a 6-might unit that enters exhausted; unaffordable without fury or with 5 energy", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { fury: 1 } }).hand(P1, CARD, "aa").build();
    await game.p1.play("aa");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("aa")).toBe("base");
    expect(game.state("aa").might).toBe(6);
    expect(game.state("aa").isExhausted).toBe(true);
    expect(game.state("aa").keywords).toEqual(expect.arrayContaining(["Accelerate", "Weaponmaster"]));
    const noPower = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "aa").build();
    expect(noPower.p1.can("play", "aa")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, CARD, "aa").build();
    expect(lowEnergy.p1.can("play", "aa")).toBe(false);
  });

  test("Accelerate: paying the extra [1][fury] (7 energy + 2 fury total) makes it enter ready", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { fury: 2 } }).hand(P1, CARD, "aa").build();
    await game.p1.play("aa", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("aa")).toBe("base");
    expect(game.state("aa").isReady).toBe(true);
  });

  test.failing("BUG: Accelerate needs the second fury — with 7 energy + 1 fury the accelerated play must be refused (engine accepts it and silently plays un-accelerated)", async () => {
    // Expected: the paid-additional-cost variant is illegal when [1][fury] extra cannot be covered.
    // Actual: the variant is offered and executes as a plain 6+[fury] play (enters exhausted, 1 energy left).
    const game = await scenario().resources(P1, { energy: 7, power: { fury: 1 } }).hand(P1, CARD, "aa").build();
    const r = await game.p1.try((p) => p.play("aa", { accelerate: true }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("aa")).toBe("hand");
    expect(game.p1.can("play", "aa")).toBe(true);
  });

  test("Weaponmaster: on play you may equip Skyfall (Equip [1][fury]) for [rainbow] less — pays only [1], attaches, +2 might", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { fury: 2 } }).gear(P1, SKYFALL, "sky").hand(P1, CARD, "aa").build();
    await game.p1.play("aa");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, allowDecline: true });
    await game.p1.pick("sky");
    await game.settle();
    expect(game.state("sky").attachedTo).toBe("aa");
    expect(game.state("aa").attachments).toContain("sky");
    expect(game.state("aa").might).toBe(8);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } }); // [1][fury] − [rainbow] = [1]
  });

  test("Weaponmaster with a power-only Equip cost (Serrated Dirk, [fury]) becomes free", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { fury: 1 } }).gear(P1, DIRK, "dirk").hand(P1, CARD, "aa").build();
    await game.p1.play("aa", { answers: ["dirk"] });
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("aa");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("Weaponmaster is optional: declining leaves the Equipment unattached and costs nothing more", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { fury: 2 } }).gear(P1, SKYFALL, "sky").hand(P1, CARD, "aa").build();
    await game.p1.play("aa");
    await game.p1.decline();
    await game.settle();
    expect(game.state("sky").attachedTo).toBeUndefined();
    expect(game.state("aa").might).toBe(6);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("'even if it's already attached': a Dirk worn by another unit is offered and moves onto the Assailant", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1 } })
      .gear(P1, DIRK, "dirk")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .hand(P1, CARD, "aa")
      .build();
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "squire" });
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("squire");
    await game.p1.play("aa");
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["dirk"]);
    await game.p1.pick("dirk");
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("aa");
    expect(game.state("squire").attachments).toEqual([]);
    expect(game.state("aa").attachments).toEqual(["dirk"]);
  });

  test("no Equipment you control → no Weaponmaster prompt; the unit simply enters play", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { fury: 1 } }).gear(P1, { cardType: "gear", name: "Trinket" }, "trinket").hand(P1, CARD, "aa").build();
    await game.p1.play("aa");
    expect(game.decision()?.kind).toBe("action");
    await game.settle();
    expect(game.zoneOf("aa")).toBe("base");
    expect(game.state("aa").attachments).toEqual([]);
  });
});
