/**
 * Shadow — unl-194-219 · Unit · Calm/Chaos · 3 energy · 3 Might
 *
 *   If you play me to a battlefield, I enter ready.
 *   [Action][>] [1][rainbow], [Exhaust]: [Stun] an enemy unit attacking here.
 *   (It doesn't deal combat damage this turn.)
 *
 * Rules: 143.4 (units enter exhausted unless stated otherwise), 806.1.c.2 / 806.1.d ("[Action][>]" is on the
 * ABILITY: it may be activated during showdowns on any player's turn — the unit itself gains no Action, 806.3),
 * 145.2 (otherwise unit abilities are Main-Phase-open-state only), 355.8 (needs a legal "enemy unit attacking
 * here" to activate at all), 423.1.b/c (stunned units deal no combat damage but still need full lethal to die),
 * [rainbow] = one power of ANY domain, [Exhaust] cost requires a ready Shadow.
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. The enter-ready clause is CONDITIONAL: to a battlefield → ready; to base → exhausted like any unit.
 *   2. The ability is a DEFENSIVE showdown trick: enemy units are only "attacking here" while they attack
 *      Shadow's battlefield, and Shadow's controller may only act once the attacker passes Focus.
 *   3. Negative space for "attacking here": Shadow attacking (enemies are defenders), a fight at ANOTHER
 *      battlefield, or an open main phase — no legal target, so the ability can't even be activated.
 *   4. Costs: 1 energy + 1 power of any domain + exhausting a READY Shadow; an exhausted Shadow, 0 energy or
 *      no power at all each make it illegal. Exhausting Shadow does not stop it dealing defender damage.
 *   5. The unit card has no Action of its own: Shadow cannot be PLAYED during a showdown.
 *   6. With two attackers only one is stunned — the other still hits Shadow.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-194-219";

/** P2's turn; P1 (1 energy + `power`) holds bf1 with a READY Shadow; P2 has a ready 3-Might raider in base. */
function defense(power: Record<string, number> = { calm: 1 }) {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 1, power })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", CARD, "shadow")
    .unit(P1, "bf2", { might: 2, name: "Other Holder" }, "other")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
}

describe("Shadow (unl-194-219)", () => {
  test("registry payload: 3-cost calm/chaos 3-Might unit; an enters-ready static + an Action-timed activated ability costing {1 energy, [rainbow], exhaust} that stuns an enemy ATTACKING unit HERE", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: ["calm", "chaos"], energyCost: 3, might: 3, name: "Shadow" });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ effect: { keyword: "EntersReady", target: "self", type: "grant-keyword" }, type: "static" });
    expect(abilities[1]).toEqual({
      cost: { energy: 1, exhaust: true, power: ["rainbow"] },
      effect: { target: { controller: "enemy", filter: "attacking", location: "here", type: "unit" }, type: "stun" },
      timing: "action",
      type: "activated",
    });
  });

  test("cost: 3 energy, no power; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "shadow").build();
    await game.p1.play("shadow");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("shadow")).toMatchObject({ might: 3, zone: "base" });
    expect((await scenario().resources(P1, { energy: 2, power: { calm: 1, chaos: 1 } }).hand(P1, CARD, "s").build()).p1.can("play", "s")).toBe(false);
  });

  test("'If you play me to a battlefield, I enter ready': played to a battlefield P1 controls, Shadow arrives READY", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 1 }, "holder").hand(P1, CARD, "shadow").build();
    await game.p1.play("shadow", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("shadow")).toBe("battlefield-bf1");
    expect(game.state("shadow").isReady).toBe(true);
  });

  test("the clause is conditional — played to BASE, Shadow enters EXHAUSTED like any other unit (143.4)", async () => {
    // Expected: isExhausted true when the destination is the base. Actual: EntersReady is granted unconditionally.
    const game = await scenario().resources(P1, { energy: 3 }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 1 }, "holder").hand(P1, CARD, "shadow").build();
    await game.p1.play("shadow", { to: "base" });
    await game.settle();
    expect(game.zoneOf("shadow")).toBe("base");
    expect(game.state("shadow").isExhausted).toBe(true);
  });

  test("the defensive trick: P2's 3-Might raider attacks bf1; only after P2 passes Focus can P1 activate — pays 1 energy + 1 calm, exhausts Shadow, ability on the chain; it resolves, the raider is stunned, deals nothing, takes 3 and dies; Shadow unhurt, bf1 held", async () => {
    const game = await defense().build();
    await game.p2.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.p1.can("activate", "shadow")).toBe(false); // P2 still holds Focus
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.option("activate", "shadow")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["raider"]]);
    await game.p1.activate("shadow");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.state("shadow").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shadow", controller: P1, triggered: false })]);
    expect(game.state("raider").isStunned).toBe(false); // not before resolution
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("raider").isStunned).toBe(true);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("shadow")).toBe("battlefield-bf1");
    expect(game.state("shadow").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("[rainbow] is one power of ANY domain: chaos pays for it just as well; with energy but NO power, or power but 0 energy, the ability is not available", async () => {
    const chaos = await defense({ chaos: 1 }).build();
    await chaos.p2.move("raider", "bf1");
    await chaos.p2.passFocus();
    expect(chaos.p1.can("activate", "shadow")).toBe(true);
    await chaos.p1.activate("shadow");
    expect(chaos.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    const noPower = await defense({}).build();
    await noPower.p2.move("raider", "bf1");
    await noPower.p2.passFocus();
    expect(noPower.p1.can("activate", "shadow")).toBe(false);
    const noEnergy = await defense({ calm: 2 }).resources(P1, { energy: 0, power: { calm: 2 } }).build();
    await noEnergy.p2.move("raider", "bf1");
    await noEnergy.p2.passFocus();
    expect(noEnergy.p1.can("activate", "shadow")).toBe(false);
  });

  test("[Exhaust] is a cost: an already-exhausted Shadow cannot activate even with the resources and an attacker present", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "shadow", { exhausted: true })
      .unit(P2, "base", { might: 3 }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "shadow")).toBe(false);
    await game.settle(); // plain 3-vs-3 trade
    expect(game.zoneOf("shadow")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
  });

  test("'attacking HERE': a fight at ANOTHER battlefield (raider into bf2) gives Shadow on bf1 nothing to stun — not activatable when P1 gets Focus", async () => {
    const game = await defense().build();
    await game.p2.move("raider", "bf2");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "shadow")).toBe(false);
    await game.settle();
    expect(game.zoneOf("other")).toBe("trash"); // 2 vs 3: the other holder falls
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  test("'enemy unit ATTACKING': when Shadow itself attacks, the enemies there are defenders — no legal target while P1 holds Focus in its own showdown", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
      .unit(P1, "base", CARD, "shadow")
      .build();
    await game.p1.move("shadow", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("def").combatRole).toBe("defender");
    expect(game.p1.can("activate", "shadow")).toBe(false);
  });

  test("open main phase with no combat anywhere: nobody is attacking, so the ability cannot be activated (355.8) and nothing is spent", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "shadow")
      .unit(P2, "bf2", { might: 3 }, "idle")
      .build();
    expect(game.p1.can("activate", "shadow")).toBe(false);
    expect((await game.p1.try((p) => p.activate("shadow"))).ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.state("shadow").isReady).toBe(true);
  });

  test("806.3 / 806.1.d: the [Action] belongs to the ability, not the card — Shadow cannot be PLAYED from hand during a showdown", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1 }, "picket")
      .unit(P1, "base", { might: 2 }, "scout")
      .hand(P1, CARD, "shadow")
      .build();
    expect(game.p1.can("play", "shadow")).toBe(true); // fine in the open main phase
    await game.p1.move("scout", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(game.p1.can("play", "shadow")).toBe(false);
  });

  test("two attackers (3 and 2): only the chosen one is stunned — the 2 still hits Shadow (survives, healed at cleanup), Shadow's 3 goes onto the attackers, bf1 stays P1's", async () => {
    const game = await defense().unit(P2, "base", { might: 2, name: "Sidekick" }, "kick").build();
    await game.p2.move(["raider", "kick"], "bf1");
    await game.p2.passFocus();
    await game.p1.activate("shadow", 1, { targets: "raider" }); // ability #1 (index 0 is the enters-ready static)
    await game.settle();
    expect(game.state("raider").isStunned || game.zoneOf("raider") === "trash").toBe(true);
    expect(game.zoneOf("shadow")).toBe("battlefield-bf1"); // took only 2 (< 3)
    expect(game.state("shadow").damage).toBe(0); // healed in combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.units("bf1")).toEqual([]); // survivors recalled, casualties trashed
  });
});
