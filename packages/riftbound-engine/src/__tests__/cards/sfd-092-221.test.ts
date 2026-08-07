/**
 * Combat Chef — sfd-092-221 · Unit · Body · 5 energy (no power) · 5 might
 *
 *   [Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow]
 *   less, even if it's already attached.)
 *
 * Head-judge notes — the tricky situations for this card:
 *   1. Weaponmaster (821) is an optional PLAY trigger: choose an Equipment YOU control (enemy
 *      Equipment, plain gear and Gold tokens are not choices), pay its Equip cost reduced by one
 *      power of any domain, attach it. [body]-only costs (Doran's Blade) become free; [1][body]
 *      (Boneshiver) still needs the [1] — and if that [1] can't be paid it stays put (821.1.c.5).
 *   2. "even if it's already attached": an Equipment worn by another friendly unit migrates to the
 *      Chef; the old wearer loses the Might bonus (718.4).
 *   3. Exactly one Equipment per Weaponmaster instance; declining costs nothing; with no Equipment
 *      there is no prompt at all (821.2: no function on the board afterwards either).
 *   4. Real combat with the bonus: 5+2 = 7 attacking into a 6 wins and conquers; into a 7 both die
 *      and the Blade detaches and is recalled to its controller's base (719.5 / 323.7), not trashed.
 *   5. Chef is Mighty on its own (708: 5+) — relevant for Body partners such as Show of Strength.
 *   6. Cost: 5 energy flat; 4 is not enough; enters exhausted (143.4).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-092-221";
const BLADE = "sfd-095-221"; // Doran's Blade — Equipment, [Equip] [body], +2
const BONESHIVER = "sfd-118-221"; // Equipment, [Equip] [1][body], +2
const GOLD = "sfd-t03"; // gear token (not Equipment)
const SHOW_OF_STRENGTH = "sfd-106-221"; // Reaction: draw 1 for each of your Mighty units

describe("Combat Chef (sfd-092-221)", () => {
  test("parsed abilities: exactly the Weaponmaster keyword; 5-cost 5-might Body unit with no power cost", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 5, might: 5, name: "Combat Chef" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([{ keyword: "Weaponmaster", type: "keyword" }]);
  });

  test("cost: 5 energy; enters the base exhausted as a Mighty 5; no Equipment → no Weaponmaster prompt; 4 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).gear(P1, GOLD, "gold").hand(P1, CARD, "chef").build();
    await game.p1.play("chef");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.decision()?.kind).toBe("action"); // Gold is gear but not Equipment → nothing to ask
    await game.settle();
    expect(game.zoneOf("chef")).toBe("base");
    expect(game.state("chef")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.state("chef").keywords).toContain("Weaponmaster");
    expect(game.state("chef").attachments).toEqual([]);
    const poor = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "chef").build();
    expect(poor.p1.can("play", "chef")).toBe(false);
  });

  test("Weaponmaster with Doran's Blade ([Equip] [body]): the [rainbow] discount makes it free → attached, Chef is 7", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).gear(P1, BLADE, "blade").hand(P1, CARD, "chef").build();
    await game.p1.play("chef");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "equip" });
    await game.p1.pick("blade");
    await game.settle();
    expect(game.state("blade").attachedTo).toBe("chef");
    expect(game.state("chef").attachments).toEqual(["blade"]);
    expect(game.state("chef").might).toBe(7);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("only YOUR Equipment, and only Equipment: enemy Blade and my Gold token are not offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .gear(P1, BLADE, "blade")
      .gear(P2, BLADE, "theirBlade")
      .gear(P1, GOLD, "gold")
      .hand(P1, CARD, "chef")
      .build();
    await game.p1.play("chef");
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["blade"]);
    const r = await game.p1.try((p) => p.pick("theirBlade"));
    expect(r.ok).toBe(false);
    expect(game.state("theirBlade").attachedTo).toBeUndefined();
  });

  test("Boneshiver ([Equip] [1][body]) still costs the [1] after the discount: with 6 energy it attaches and leaves 0", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).gear(P1, BONESHIVER, "bone").hand(P1, CARD, "chef").build();
    await game.p1.play("chef", { answers: ["bone"] });
    await game.settle();
    expect(game.state("bone").attachedTo).toBe("chef");
    expect(game.state("chef").might).toBe(7);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("821.1.c.5: with exactly 5 energy the leftover [1] for Boneshiver can't be paid — it is not attachable and energy never goes negative", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).gear(P1, BONESHIVER, "bone").gear(P1, BLADE, "blade").hand(P1, CARD, "chef").build();
    await game.p1.play("chef");
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(offered).not.toContain("bone");
    expect(offered).toContain("blade");
    const r = await game.p1.try((p) => p.pick("bone"));
    expect(r.ok).toBe(false);
    await game.p1.decline();
    await game.settle();
    expect(game.state("bone").attachedTo).toBeUndefined();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("chef").might).toBe(5);
  });

  test("optional: declining attaches nothing, spends nothing more, and exactly one pick is offered even with two Equipment", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).gear(P1, BLADE, "b1").gear(P1, BLADE, "b2").hand(P1, CARD, "chef").build();
    await game.p1.play("chef");
    expect(game.decision()).toMatchObject({ kind: "pick", max: 1 });
    await game.p1.decline();
    await game.settle();
    expect(game.state("b1").attachedTo).toBeUndefined();
    expect(game.state("b2").attachedTo).toBeUndefined();
    expect(game.state("chef").might).toBe(5);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // Picking one leaves the other in base, unattached.
    const g2 = await scenario().resources(P1, { energy: 5 }).gear(P1, BLADE, "b1").gear(P1, BLADE, "b2").hand(P1, CARD, "chef").build();
    await g2.p1.play("chef", { answers: ["b2"] });
    await g2.settle();
    expect(g2.state("chef").attachments).toEqual(["b2"]);
    expect(g2.state("b1").attachedTo).toBeUndefined();
    expect(g2.decision()?.kind).toBe("action"); // no second Weaponmaster prompt
  });

  test("'even if it's already attached': the Blade migrates from a friendly Squire (4→2) onto the Chef (5→7)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["blade"] })
      .gear(P1, BLADE, "blade", { attachedTo: "squire" })
      .hand(P1, CARD, "chef")
      .build();
    expect(game.state("squire").might).toBe(4);
    await game.p1.play("chef", { answers: ["blade"] });
    await game.settle();
    expect(game.state("blade").attachedTo).toBe("chef");
    expect(game.state("chef").might).toBe(7);
    expect(game.state("squire").might).toBe(2);
    expect(game.state("squire").attachments).toEqual([]);
  });

  test("Weaponmaster fires only on PLAY: a Chef merely moved to a battlefield and back gets no new prompt (821.2)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "chef")
      .gear(P1, BLADE, "blade")
      .build();
    await game.p1.move("chef", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action" });
    expect(game.state("blade").attachedTo).toBeUndefined();
  });

  test("real combat, win: an equipped Chef (7) attacking a lone 6-might defender kills it and conquers (1 point); Blade stays on", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Guard" }, "guard")
      .unit(P1, "base", CARD, "chef", { equippedWith: ["blade"] })
      .gear(P1, BLADE, "blade", { attachedTo: "chef" })
      .build();
    expect(game.state("chef").might).toBe(7);
    await game.p1.move("chef", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("chef")).toBe("battlefield-bf1");
    expect(game.state("chef").damage).toBe(0); // healed in combat cleanup
    expect(game.state("blade").attachedTo).toBe("chef");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("real combat, trade: into a 7-might defender both die; the Blade DETACHES and is recalled to my base, not trashed (719.5, 323.7)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "chef", { equippedWith: ["blade"] })
      .gear(P1, BLADE, "blade", { attachedTo: "chef" })
      .build();
    await game.p1.move("chef", "bf1");
    await game.settle();
    expect(game.zoneOf("chef")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.state("blade").attachedTo).toBeUndefined();
    expect(game.state("blade").owner).toBe(P1);
    expect(game.p1.points()).toBe(0); // nobody left to conquer with
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
  });

  test("Body partner: the Chef is Mighty by itself, so Show of Strength (2+[body], Reaction) draws 1 for it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .unit(P1, "base", CARD, "chef")
      .unit(P1, "base", { might: 4, name: "NotMighty" }, "small")
      .hand(P1, SHOW_OF_STRENGTH, "sos")
      .build();
    await game.p1.cast("sos");
    await game.settle();
    expect(game.zoneOf("sos")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });
});
