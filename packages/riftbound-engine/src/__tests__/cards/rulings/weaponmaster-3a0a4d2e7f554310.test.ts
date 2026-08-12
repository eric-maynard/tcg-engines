/**
 * Ruling 3a0a4d2e7f554310 — Armed Assailant (sfd-002-221) · Unit · Fury · [6][fury] · 6 Might
 *   "[Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow] less,
 *    even if it's already attached.)"
 *   Equipment used: Serrated Dirk (sfd-009-221) "[Equip] [fury]" · Skyfall of Areion (sfd-030-221)
 *   "[Equip] [1][fury]", +2 Might.
 *
 * Q: With Weaponmaster, can I grab a gear that is already attached to one of my units at a battlefield
 *    and put it on the unit I just played, without paying?
 * A: Yes to the grab — an Equipment you control that is already attached to another friendly unit is a
 *    legal choice. But not necessarily free: you pay its [Equip] cost reduced by [rainbow] (1 Power).
 *    Only an Equip cost of exactly one Power becomes free; a bigger cost still has a remainder. A gear
 *    with no [Equip] cost cannot be taken this way at all. It happens as a play effect of the unit.
 * Rules: 821.1.c ([Weaponmaster] = [Equip] for [rainbow] less), 747.1.b / 476.1 (re-attaching an
 *        Equipment you control), 818.1 ([Equip] is an activated ability with a printed cost).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const ASSAILANT = "sfd-002-221";
const DIRK = "sfd-009-221"; // [Equip] [fury]
const SKYFALL = "sfd-030-221"; // [Equip] [1][fury], +2 Might

describe("Ruling 3a0a4d2e7f554310 — Weaponmaster may steal your own attached gear, at Equip cost − [rainbow]", () => {
  test("a Dirk worn by a friendly unit AT A BATTLEFIELD is offered to the freshly played Assailant and moves onto it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 2 } })
      .battlefield("bf1", { controller: P1 })
      .gear(P1, DIRK, "dirk")
      .unit(P1, "bf1", { might: 2, name: "Vanguard" }, "vanguard")
      .hand(P1, ASSAILANT, "aa")
      .build();
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "vanguard" });
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("vanguard");
    expect(game.p1.resources()).toEqual({ energy: 6, power: { fury: 1 } });
    await game.p1.play("aa");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["dirk"]);
    await game.p1.pick("dirk");
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("aa");
    expect(game.state("vanguard").attachments).toEqual([]);
    expect(game.state("aa").attachments).toEqual(["dirk"]);
  });

  test("'without paying' only when the Equip cost was exactly one Power: the Dirk ([Equip] [fury]) costs nothing extra", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1 } })
      .gear(P1, DIRK, "dirk")
      .hand(P1, ASSAILANT, "aa")
      .build();
    await game.p1.play("aa"); // the unit's own [6][fury] is paid here
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.p1.pick("dirk"); // [fury] − [rainbow] = free
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("aa");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("a bigger Equip cost still has a remainder: Skyfall ([Equip] [1][fury]) costs [1] after the [rainbow] discount", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { fury: 2 } })
      .gear(P1, SKYFALL, "sky")
      .hand(P1, ASSAILANT, "aa")
      .build();
    await game.p1.play("aa");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } }); // after the unit's own cost
    await game.p1.pick("sky");
    await game.settle();
    expect(game.state("sky").attachedTo).toBe("aa");
    expect(game.state("aa").might).toBe(8); // 6 + 2
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } }); // [1] was still paid
  });

  test("a gear with no [Equip] ability cannot be taken by Weaponmaster — nothing is even offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1 } })
      .gear(P1, { cardType: "gear", name: "Trinket" }, "trinket")
      .hand(P1, ASSAILANT, "aa")
      .build();
    await game.p1.play("aa");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.settle();
    expect(game.state("aa").attachments).toEqual([]);
    expect(game.state("trinket").attachedTo).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });

  test("it is a play effect of the unit and it is optional — declining leaves the gear where it was", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 2 } })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .gear(P1, DIRK, "dirk")
      .hand(P1, ASSAILANT, "aa")
      .build();
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "squire" });
    await game.settle();
    await game.p1.play("aa");
    await game.p1.decline();
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("squire");
    expect(game.state("aa").attachments).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
