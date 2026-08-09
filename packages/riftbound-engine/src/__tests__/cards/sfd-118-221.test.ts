/**
 * Boneshiver — sfd-118-221 · Gear (Equipment) · Body · 3 energy · Might bonus +2
 *
 *   [Equip] [1][body] ([1][body]: Attach this to a unit you control.)
 *
 * Rules: 149.1 (gear enters ready, in base), 818 (Equip: activated gear ability, target = a unit you
 * control; 818.1.c.3 costs may mix resource kinds), 151.2 (gear ability timing: your Main Phase, Open
 * State, no showdown), 434/718/719 (attached: +2 to the Top-Most unit, text Inactive, travels with the
 * unit), 457.1 (wearer dies at a battlefield → Equipment stays on board and is recalled to base),
 * 821 (Weaponmaster: pay the Equip cost reduced by [rainbow] — 821.1.c: only the POWER pip is shaved,
 * the [1] remains), 356.6 (no cost below 0).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Two-part Equip cost: [1] AND [body] must both be payable — 1 energy alone, or a body power
 *     alone, is not enough; a rune tapped for [1] funds it.
 *  2. Weaponmaster reduces [1][body] to just [1]: a Veteran Poro played with exactly 2 energy has
 *     nothing left for the [1] and must not be able to accept; with 3 energy it equips for 1.
 *  3. "even if it's already attached": Weaponmaster can strip Boneshiver off another friendly unit —
 *     the old wearer drops by 2 immediately.
 *  4. Exactly-lethal: a 2-might unit wearing Boneshiver (4) kills a 4-might defender and dies too;
 *     against a 3-might defender it survives (3 damage < 4) and conquers.
 *  5. Death at a battlefield: Boneshiver detaches, is recalled to base, and its Equip is live again.
 *  6. Partner Jax, Unrelenting: attaching Boneshiver via [Equip] fires "you may pay [1] to draw 1".
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-118-221";
const VETERAN_PORO = "sfd-099-221"; // Unit · Body · 2 energy · 2 might · [Weaponmaster]
const JAX_UNRELENTING = "sfd-119-221"; // Unit · Body · 4 energy · 3 might · Weaponmaster + "When you attach an Equipment to me, you may pay [1] to draw 1."

function onBoard(energy = 1, power: Record<string, number> = { body: 1 }) {
  return scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
    .gear(P1, CARD, "bone");
}

describe("Boneshiver (sfd-118-221)", () => {
  test("registry payload: 3-cost body Equipment, +2 bonus, one Equip keyword costing {energy:1, power:[body]}", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "body", energyCost: 3, mightBonus: 2, name: "Boneshiver" });
    // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "When I conquer, channel 1 rune exhausted." —
    // conferred on the equipped unit while attached, hence the `effectText: true` entries.
    expect(def?.abilities).toEqual([
      { cost: { energy: 1, power: ["body"] }, keyword: "Equip", type: "keyword" },
      { effect: { amount: 1, exhausted: true, type: "channel" }, effectText: true, trigger: { event: "conquer", on: "self" }, type: "triggered" },
    ] as never);
  });

  test("playing it: 3 energy, no power; enters base ready and unattached; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "bone").build();
    await game.p1.play("bone");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("bone")).toBe("base");
    expect(game.state("bone")).toMatchObject({ attachedTo: undefined, isExhausted: false });
    expect((await scenario().resources(P1, { energy: 2, power: { body: 2 } }).hand(P1, CARD, "bone").build()).p1.can("play", "bone")).toBe(false);
  });

  test("[Equip][1][body]: deducts 1 energy AND 1 body, attaches, Squire 2 → 4", async () => {
    const game = await onBoard(2, { body: 2 }).build();
    await game.p1.choose("equipCard", { params: { equipmentId: "bone", unitId: "squire" } });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 1 } });
    expect(game.state("bone").attachedTo).toBe("squire");
    expect(game.state("squire").attachments).toEqual(["bone"]);
    expect(game.state("squire").might).toBe(4);
    expect(game.state("squire").baseMight).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("cost negative space: [1] without body, or body without any energy source, is not enough; a ready rune funds the [1]", async () => {
    expect((await onBoard(5, {}).build()).p1.can("equipCard")).toBe(false);
    expect((await onBoard(0, { body: 3 }).build()).p1.can("equipCard")).toBe(false);
    expect((await onBoard(1, { calm: 1 }).build()).p1.can("equipCard")).toBe(false);
    const runeFunded = await onBoard(0, { body: 1 }).runes(P1, "body", 1).build();
    await runeFunded.p1.tapRune(); // rune → [1] (164.2.a), then the Equip is payable
    expect(runeFunded.p1.can("equipCard")).toBe(true);
    await runeFunded.p1.choose("equipCard", { params: { equipmentId: "bone", unitId: "squire" } });
    await runeFunded.settle();
    expect(runeFunded.state("squire").might).toBe(4);
    expect(runeFunded.p1.runes({ ready: true })).toHaveLength(0);
    expect(runeFunded.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("targets: enemy units are not legal recipients", async () => {
    const game = await onBoard().build();
    const offered = game.p1.option("equipCard")?.fields.find((f) => f.name === "unitId")?.options;
    expect(offered).toEqual(["squire"]);
    const r = await game.p1.try((p) => p.choose("equipCard", { params: { equipmentId: "bone", unitId: "bystander" } }));
    expect(r.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 1 } });
  });

  test("timing (151.2): illegal on the opponent's turn and during a showdown", async () => {
    expect((await onBoard().active(P2).build()).p1.can("equipCard")).toBe(false);
    const showdown = await onBoard().unit(P1, "base", { might: 1, name: "Runner" }, "runner").build();
    expect(showdown.p1.can("equipCard")).toBe(true);
    await showdown.p1.move("runner", "bf1");
    expect(showdown.p1.can("equipCard")).toBe(false);
  });

  test("exactly lethal both ways: Squire+Boneshiver (4) into the 4-might Guard — both die; Boneshiver detaches and is recalled to base (457.1)", async () => {
    const game = await onBoard().build();
    await game.p1.choose("equipCard", { params: { equipmentId: "bone", unitId: "squire" } });
    await game.settle();
    await game.p1.move("squire", "bf1");
    expect(game.locationOf("bone")).toBe("bf1"); // 719.3.a — it travels with its wearer
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("bone")).toBe("base");
    expect(game.state("bone").attachedTo).toBeUndefined();
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
  });

  test("one short of dying: into a 3-might defender the 4-might wearer survives (3 damage), conquers, and keeps Boneshiver", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
      .gear(P1, CARD, "bone")
      .build();
    await game.p1.choose("equipCard", { params: { equipmentId: "bone", unitId: "squire" } });
    await game.settle();
    await game.p1.move("squire", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("battlefield-bf1");
    expect(game.state("squire").might).toBe(4);
    expect(game.state("bone").attachedTo).toBe("squire");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("partner — Veteran Poro (Weaponmaster) with 3 energy: plays for 2, equips Boneshiver for [1][body] − [rainbow] = [1]; 2 → 4", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).gear(P1, CARD, "bone").hand(P1, VETERAN_PORO, "poro").build();
    await game.p1.play("poro");
    expect(game.p1.energy()).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("bone");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("bone").attachedTo).toBe("poro");
    expect(game.state("poro").might).toBe(4);
  });

  test("partner negative space — Veteran Poro with exactly 2 energy: nothing left for the residual [1], so Boneshiver cannot be weaponmastered", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).gear(P1, CARD, "bone").hand(P1, VETERAN_PORO, "poro").build();
    await game.p1.play("poro");
    expect(game.p1.energy()).toBe(0);
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(offered).not.toContain("bone");
    await game.settle();
    expect(game.state("bone").attachedTo).toBeUndefined();
    expect(game.state("poro").might).toBe(2);
    expect(game.p1.energy()).toBe(0);
  });

  test("'even if it's already attached': Weaponmaster strips Boneshiver off the Squire (4 → 2) onto the Poro (2 → 4)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["bone"] })
      .gear(P1, CARD, "bone", { attachedTo: "squire" })
      .hand(P1, VETERAN_PORO, "poro")
      .build();
    expect(game.state("squire").might).toBe(4);
    await game.p1.play("poro", { answers: ["bone"] });
    await game.settle();
    expect(game.state("bone").attachedTo).toBe("poro");
    expect(game.state("poro").might).toBe(4);
    expect(game.state("squire").might).toBe(2);
    expect(game.state("squire").attachments).toEqual([]);
  });

  test("partner — Jax, Unrelenting on the board: [Equip]ping Boneshiver to him offers 'pay [1] to draw 1'; accepting costs 1 more and draws", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { body: 1 } }).unit(P1, "base", JAX_UNRELENTING, "jax").gear(P1, CARD, "bone").build();
    const handBefore = game.p1.hand().length;
    await game.p1.choose("equipCard", { params: { equipmentId: "bone", unitId: "jax" } });
    await game.settle();
    expect(game.state("bone").attachedTo).toBe("jax");
    expect(game.state("jax").might).toBe(5);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
  });
});
