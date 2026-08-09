/**
 * Guardian Angel — sfd-051-221 · Gear — Equipment · Calm · 2 energy · Might bonus +1
 *
 *   Rules text:  [Equip] [calm] ([calm]: Attach this to a unit you control.)
 *   Effect text: If I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me.
 *                (quoted by rules 136.2.d and 373.2)
 *
 * Rules: 818 (Equip = "[calm]: Attach this to a unit you control", an activated ability on the chain),
 * 724 / 718.3 (Effect Text is INACTIVE unless attached; while attached it is appended to the holder's
 * text — so "I/me" is the HOLDER and "Guardian Angel" is the equipment, 136.2.d), 371 (an "instead"
 * replacement without "may" is mandatory: no prompt), 370.1.a.1 (the replaced death never happened —
 * no Deathknell, the unit stays the same object: no 124.1 reset beyond what the text says), 373.1.a
 * (the replacement's actions run before simultaneous unmodified deaths), 434.1.d (the +1 applies only
 * while attached), 457.1 / 719.5 (once GA is killed the holder is no longer equipped).
 *
 * Head-judge corner cases covered here:
 *   1. LOOSE Guardian Angel in base does nothing when a friendly unit dies (effect text inactive).
 *   2. Death by spell damage, by a "kill" effect (Vengeance) and by combat damage are all "would die".
 *   3. The save is forced and complete: GA → trash, holder damage 0, exhausted, in base, unequipped,
 *      back to printed Might; a battlefield it alone held is lost; the attacker does NOT conquer-score
 *      off a unit that never died… but does take the now-empty battlefield.
 *   4. Deathknell of the saved unit must not fire (Watchful Sentry draws nothing).
 *   5. Exactly-lethal arithmetic includes the +1: 2 damage on a 2(+1) holder is not a death at all
 *      (GA stays attached); the shield is single-use — the next lethal hit after the save kills.
 *   6. Simultaneous deaths (Kog'Maw's Deathknell wipes the battlefield): only the holder is saved.
 *   7. Cost negatives: 2 energy to play (1 is not enough); Equip needs a CALM power specifically.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";
import { getGlobalCardRegistry } from "../../operations/card-lookup";

const CARD = "sfd-051-221";
const SENTRY = "ogn-096-298"; // Watchful Sentry · 1 might · [Deathknell] — Draw 1
const VENGEANCE = "ogn-229-298"; // 4 + [order][order]: Kill a unit
const KOGMAW = "ogn-190-298"; // Kog'Maw, Caustic · [Deathknell] — Deal 4 to all units at my battlefield
const BOLT = (n: number) => ({
  abilities: [{ effect: { amount: n, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: `Bolt ${n}`,
  timing: "action",
});

/** Ally (2 might, `damage` pre-marked) at bf1 already wearing Guardian Angel (setup-attached). */
function equipped(opts: { damage?: number; at?: "bf1" | "base" } = {}) {
  const at = opts.at ?? "bf1";
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, at, { might: 2, name: "Ally" }, "ally", { damage: opts.damage ?? 0, equippedWith: ["ga"] })
    .card("ga", { def: CARD, meta: { attachedTo: "ally" }, owner: P1, zone: at });
}

describe("Guardian Angel (sfd-051-221)", () => {
  test("registry payload: Equip [calm] keyword + ONE mandatory 'die' replacement scoped to the unit this is attached to = sequence[kill self, heal all, exhaust, recall]", async () => {
    const game = await scenario().hand(P1, CARD, "ga").build();
    expect(game.state("ga")).toMatchObject({ cardType: "equipment", energyCost: 2, name: "Guardian Angel" });
    expect(getGlobalCardRegistry().get("ga")?.mightBonus).toBe(1);
    const abilities = getGlobalCardRegistry().getAbilities("ga") ?? [];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toEqual({ cost: { power: ["calm"] }, keyword: "Equip", type: "keyword" } as never);
    expect(abilities[1]).toMatchObject({
      replacement: { effects: [{ target: "self", type: "kill" }, { amount: "all", type: "heal" }, { type: "exhaust" }, { type: "recall" }], type: "sequence" },
      replaces: "die",
      target: { attachedToSource: true, controller: "friendly", type: "unit" },
      type: "replacement",
    });
    expect(abilities[1]).not.toHaveProperty("optional", true);
  });

  test("play cost: 2 energy, lands loose in base (no Quick-Draw); 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { calm: 1 } }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "ga").build();
    await game.p1.play("ga");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    await game.settle();
    expect(game.zoneOf("ga")).toBe("base");
    expect(game.state("ga").attachedTo).toBeUndefined();
    expect((await scenario().resources(P1, { energy: 1, power: { calm: 3 } }).hand(P1, CARD, "ga").build()).p1.can("play", "ga")).toBe(false);
  });

  test("[Equip][calm]: pays 1 calm (no energy), resolves off the chain, holder +1; with only chaos power it is not available", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { calm: 1 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "ga").build();
    await game.p1.do("equipCard", { equipmentId: "ga", unitId: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 0 } });
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.state("ga").attachedTo).toBe("ally");
    expect(game.state("ally").might).toBe(3);
    const wrong = await scenario().resources(P1, { energy: 2, power: { chaos: 2 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "ga").build();
    expect(wrong.p1.legal().some((o) => o.moveId === "equipCard")).toBe(false);
    expect((await wrong.p1.try((p) => p.do("equipCard", { equipmentId: "ga", unitId: "ally" }))).ok).toBe(false);
  });

  test("negative space: an UNATTACHED Guardian Angel is inactive effect text — the friendly unit next to it just dies", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "ga").hand(P1, BOLT(3), "b").build();
    await game.p1.cast("b", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("base");
  });

  test("lethal spell damage on the holder: no prompt (mandatory) — GA is killed instead; the holder is healed to 0, exhausted, recalled to base, unequipped and back to 2 Might; bf1 is left empty", async () => {
    const game = await equipped({ damage: 1 }).hand(P1, BOLT(2), "b").build(); // 1 marked + 2 = 3 ≥ 3
    expect(game.state("ally")).toMatchObject({ damage: 1, might: 3 });
    await game.p1.cast("b", { targets: "ally" });
    const r = await game.settle();
    expect(r.reason).toBe("open"); // nobody was asked anything
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 2 });
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("exactly-lethal includes the +1: 2 damage on the 2(+1)-Might holder is NOT a death — nothing is replaced, GA stays attached", async () => {
    const game = await equipped().hand(P1, BOLT(2), "b").build();
    await game.p1.cast("b", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.state("ally")).toMatchObject({ damage: 2, isExhausted: false, might: 3 });
    expect(game.state("ga").attachedTo).toBe("ally");
  });

  test("single use: after the save GA is gone, so the next lethal hit on the (now 2-Might) unit really kills it", async () => {
    const game = await equipped({ at: "base" }).hand(P1, BOLT(3), "b1").hand(P1, BOLT(2), "b2").build();
    await game.p1.cast("b1", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base"); // "recall me" while already in base: stays put
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true, might: 2 });
    await game.p1.cast("b2", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
  });

  test("a KILL effect is also 'would die': the opponent's Vengeance on the holder is replaced the same way", async () => {
    const game = await equipped({ damage: 1 }).active(P2).resources(P2, { energy: 4, power: { order: 2 } }).hand(P2, VENGEANCE, "ven").build();
    await game.p2.cast("ven", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ven")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true });
  });

  test("combat death + Deathknell: equipped Watchful Sentry (1+1) attacks a 5-Might Foe — it is saved to base exhausted, GA dies, NO Deathknell draw, Foe keeps the battlefield undamaged after combat", async () => {
    const game = await scenario()
      .resources(P1, { power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Foe" }, "foe")
      .unit(P1, "base", SENTRY, "sentry")
      .gear(P1, CARD, "ga")
      .build();
    await game.p1.do("equipCard", { equipmentId: "ga", unitId: "sentry" });
    await game.settle();
    expect(game.state("sentry").might).toBe(2);
    const hand = game.p1.hand().length;
    await game.p1.move("sentry", "bf1");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.state("sentry")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 1 });
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand); // 370.1.a.1: it never died
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.state("foe").damage).toBe(0); // combat damage heals at the combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(0);
  });

  test("simultaneous deaths (373): Kog'Maw's Deathknell deals 4 to everything at bf1 — the equipped Ally is saved to base, the plain Pal beside it dies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", KOGMAW, "kog")
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally", { equippedWith: ["ga"] })
      .card("ga", { def: CARD, meta: { attachedTo: "ally" }, owner: P1, zone: "bf1" })
      .unit(P1, "bf1", { might: 2, name: "Pal" }, "pal")
      .hand(P1, BOLT(5), "b")
      .build();
    await game.p1.cast("b", { targets: "kog" });
    await game.settle();
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true, might: 2 });
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("only MY death: GA attached to Ally does nothing for the plain Pal dying next to it (target = the attached unit only)", async () => {
    const game = await equipped().unit(P1, "bf1", { might: 2, name: "Pal" }, "pal").hand(P1, BOLT(3), "b").build();
    await game.p1.cast("b", { targets: "pal" });
    await game.settle();
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("battlefield-bf1");
    expect(game.state("ga").attachedTo).toBe("ally");
    expect(game.state("ally")).toMatchObject({ isExhausted: false, might: 3 });
  });
});
