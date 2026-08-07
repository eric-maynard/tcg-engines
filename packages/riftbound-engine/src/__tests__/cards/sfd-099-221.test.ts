/**
 * Veteran Poro — sfd-099-221 · Unit · Body · 2 energy · 2 Might · Poro
 *
 *   [Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow]
 *   less, even if it's already attached.)
 *
 * Rules: 821 (Weaponmaster: a play effect; choose an Equipment YOU control, pay its Equip cost
 * reduced by one power of any domain, attach it — 821.1.c.5 if the reduced cost can't be paid it
 * stays where it is; 821.2 no function while merely on the board), 716 (attachment; an Equipment
 * is attached to exactly one unit, so re-attaching detaches it from the old holder), 208.3 (only
 * gear with [Equip]/the Equipment type qualifies), 143.4 (units enter exhausted).
 *
 * Head-judge corner cases considered:
 *   1. Discount arithmetic: Equip [body] → free; Equip [1][body] → still costs [1]; if that [1]
 *      is not available after paying for the Poro the Equipment is not offered / stays put.
 *   2. "even if it's already attached": an Equipment worn by another friendly unit migrates —
 *      the old holder must lose its bonus, the Poro gains it.
 *   3. Only YOUR Equipment: enemy Equipment and plain (non-Equipment) gear are never offered;
 *      with nothing eligible there is no prompt at all.
 *   4. "one of": with two Equipment exactly one may be chosen; the other is untouched.
 *   5. Optional: declining costs nothing and attaches nothing.
 *   6. The bonus is real Might: 2 + Doran's Blade (+2) beats a 3-Might defender in actual combat.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-099-221";
const DORANS_BLADE = "sfd-095-221"; // Body Equipment · Equip [body] · +2 Might
const BONESHIVER = "sfd-118-221"; // Body Equipment · Equip [1][body] · +2 Might

describe("Veteran Poro (sfd-099-221)", () => {
  test("parsed abilities: exactly the Weaponmaster keyword; 2-cost 2-Might Poro with no power cost", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 2, might: 2, tags: ["Poro"] });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([{ keyword: "Weaponmaster", type: "keyword" }]);
  });

  test("cost: 2 energy, enters the base exhausted with Weaponmaster; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "poro").build();
    await game.p1.play("poro");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro")).toMatchObject({ isExhausted: true, might: 2 });
    expect(game.state("poro").keywords).toContain("Weaponmaster");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "poro").build();
    expect(poor.p1.can("play", "poro")).toBe(false);
  });

  test("Weaponmaster with Doran's Blade (Equip [body]): [rainbow] less makes it free — attaches, Poro is 4 Might, power untouched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .gear(P1, DORANS_BLADE, "blade")
      .hand(P1, CARD, "poro")
      .build();
    await game.p1.play("poro");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", max: 1, seat: P1 });
    await game.p1.pick("blade");
    await game.settle();
    expect(game.state("blade").attachedTo).toBe("poro");
    expect(game.state("poro").attachments).toEqual(["blade"]);
    expect(game.state("poro").might).toBe(4);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1 } });
    expect(game.violations()).toEqual([]);
  });

  test("Weaponmaster with Boneshiver (Equip [1][body]): only the power is waived — the [1] is still paid", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 0 } })
      .gear(P1, BONESHIVER, "bone")
      .hand(P1, CARD, "poro")
      .build();
    await game.p1.play("poro", { answers: ["bone"] });
    await game.settle();
    expect(game.state("bone").attachedTo).toBe("poro");
    expect(game.state("poro").might).toBe(4);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } }); // 2 for the Poro + 1 for the Equip
  });

  test("821.1.c.5: if the reduced Equip cost ([1]) can't be paid, Boneshiver is not offered and stays unattached", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } }) // exactly the Poro; body power can't cover the [1] energy
      .gear(P1, BONESHIVER, "bone")
      .hand(P1, CARD, "poro")
      .build();
    await game.p1.play("poro");
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(offered).not.toContain("bone");
    await game.settle(); // an empty optional prompt (if any) is declined
    expect(game.state("bone").attachedTo).toBeUndefined();
    expect(game.state("poro").might).toBe(2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1 } });
  });

  test("optional: declining attaches nothing and costs nothing beyond the Poro", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .gear(P1, DORANS_BLADE, "blade")
      .hand(P1, CARD, "poro")
      .build();
    await game.p1.play("poro");
    expect(game.decision()?.kind).toBe("pick");
    await game.p1.decline();
    await game.settle();
    expect(game.state("blade").attachedTo).toBeUndefined();
    expect(game.state("poro")).toMatchObject({ attachments: [], might: 2 });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 1 } });
  });

  test("'even if it's already attached': a Blade worn by another friendly unit migrates — old holder drops to base Might", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .gear(P1, DORANS_BLADE, "blade", { attachedTo: "squire" })
      .unit(P1, "base", { might: 3, name: "Squire" }, "squire", { equippedWith: ["blade"] })
      .hand(P1, CARD, "poro")
      .build();
    expect(game.state("squire").might).toBe(5);
    await game.p1.play("poro");
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["blade"]);
    await game.p1.pick("blade");
    await game.settle();
    expect(game.state("blade").attachedTo).toBe("poro");
    expect(game.state("poro")).toMatchObject({ attachments: ["blade"], might: 4 });
    expect(game.state("squire")).toMatchObject({ attachments: [], might: 3 });
  });

  test("only YOUR Equipment: an enemy Doran's Blade or a friendly non-Equipment gear gives no prompt at all", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .gear(P2, DORANS_BLADE, "theirs")
      .gear(P1, { cardType: "gear", name: "Trinket" }, "trinket")
      .hand(P1, CARD, "poro")
      .build();
    await game.p1.play("poro");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.settle();
    expect(game.state("theirs").attachedTo).toBeUndefined();
    expect(game.state("trinket").attachedTo).toBeUndefined();
    expect(game.state("poro")).toMatchObject({ attachments: [], might: 2 });
  });

  test("'one of your Equipment': with two eligible pieces exactly one is attached, the other stays in base unattached", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 2 } })
      .gear(P1, DORANS_BLADE, "blade")
      .gear(P1, BONESHIVER, "bone")
      .hand(P1, CARD, "poro")
      .build();
    await game.p1.play("poro");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["blade", "bone"]);
    await game.p1.pick("bone");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action" }); // no second Weaponmaster prompt
    expect(game.state("bone").attachedTo).toBe("poro");
    expect(game.state("blade").attachedTo).toBeUndefined();
    expect(game.state("poro")).toMatchObject({ attachments: ["bone"], might: 4 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 2 } });
  });

  test("played to a battlefield you control: Weaponmaster still fires and the Blade attaches there", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .gear(P1, DORANS_BLADE, "blade")
      .hand(P1, CARD, "poro")
      .build();
    await game.p1.play("poro", { answers: ["blade"], to: "bf1" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.state("blade").attachedTo).toBe("poro");
    expect(game.state("poro").might).toBe(4);
  });

  test("the bonus is real: an equipped 4-Might Poro attacks and kills a 3-Might defender, conquering the battlefield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
      .gear(P1, DORANS_BLADE, "blade")
      .hand(P1, CARD, "poro")
      .build();
    await game.p1.play("poro", { answers: ["blade"] });
    await game.settle();
    expect(game.state("poro").isExhausted).toBe(true); // can't attack this turn
    await game.advanceTurn();
    await game.advanceTurn(); // back to P1, Poro readied
    expect(game.state("poro")).toMatchObject({ isReady: true, might: 4 });
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.state("blade").attachedTo).toBe("poro");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative space: the same attack WITHOUT the Blade (2 vs 3) loses the Poro and scores nothing", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "base", CARD, "poro")
      .build();
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(0);
  });
});
