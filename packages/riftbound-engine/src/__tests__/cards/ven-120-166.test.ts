/**
 * Masa, Crashing Thunder — ven-120-166 · Champion Unit (Masa) · Order · 4 energy (no power) · 4 Might
 *
 *   You may pay [order] as an additional cost to play me.
 *   When you play me, if you paid the additional cost, [Stun] an enemy unit at a battlefield.
 *   (It doesn't deal combat damage this turn.)
 *
 * Rules: 356.2.b (optional additional cost — declared and paid while playing), 356.4.f.1 ("paid" =
 * the decision to pay), 359.3 ("if you paid" checked when the play trigger resolves), 423 (Stun:
 * binary, no combat damage contribution, still needs full lethal, cleared in end-of-turn step),
 * 143.4 (units enter exhausted), 355.10.a.1 (Champion Zone play is still "playing me").
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. The stun is gated on the PAID cost, not on owning order power: decline → 4 energy only, the
 *     order power is untouched and no prompt appears even with juicy enemy targets around.
 *  2. Target legality is "ENEMY unit AT A BATTLEFIELD": an enemy unit in its base and a friendly unit
 *     at a battlefield must never be offered; two enemy battlefield units (different battlefields)
 *     both are.
 *  3. Paid with no legal target (enemies only in base): the play is legal, the power IS spent (a cost
 *     is a cost), Masa lands, nothing is stunned and no prompt dangles.
 *  4. Stun value the same turn: the stunned defender contributes 0 combat damage (423.1.b) but still
 *     needs full lethal (423.1.c) — a 2-Might ally into a stunned 5-Might defender survives unhurt and
 *     the defender survives too (2 < 5); a 5-Might ally kills it cleanly.
 *  5. "this turn": the Stunned status drops at end of turn (423.1.a.2) — after advanceTurn() it's gone.
 *  6. No order power in the pool → the option cannot be taken; forcing it must not silently stun.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-120-166";

function inHand(power: Record<string, number> = { order: 1 }) {
  return scenario()
    .resources(P1, { energy: 4, power })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Big Foe" }, "bigfoe")
    .unit(P2, "bf2", { might: 2, name: "Small Foe" }, "smallfoe")
    .unit(P2, "base", { might: 3, name: "Homebody" }, "home")
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout") // friendly unit AT a battlefield — never a legal stun target
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 5, name: "Bruiser" }, "bruiser")
    .hand(P1, CARD, "masa");
}

describe("Masa, Crashing Thunder (ven-120-166)", () => {
  test("registry payload: optional [order] additional-cost static + play-self stun trigger gated on paid-additional-cost, targeting an ENEMY unit at a BATTLEFIELD", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 4, isChampion: true, might: 4, name: "Masa, Crashing Thunder", tags: ["Masa"] });
    expect(def?.powerCost).toBeUndefined();
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ effect: { optional: true, type: "additional-cost-option" }, type: "static" });
    expect(abilities[1]).toMatchObject({
      condition: { type: "paid-additional-cost" },
      effect: { target: { controller: "enemy", location: "battlefield", type: "unit" }, type: "stun" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
  });

  test("base cost: 4 energy; declining the option leaves the order power untouched; enters base exhausted at 4 Might; 3 energy is not enough", async () => {
    const game = await inHand().build();
    expect(game.p1.option("play", "masa")?.fields.some((f) => f.arg === "payOptional")).toBe(true);
    await game.p1.play("masa", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
    await game.settle();
    expect(game.zoneOf("masa")).toBe("base");
    expect(game.state("masa")).toMatchObject({ baseMight: 4, isExhausted: true, isStunned: false, might: 4 });
    expect((await inHand().resources(P1, { energy: 3, power: { order: 3 } }).build()).p1.can("play", "masa")).toBe(false);
  });

  test("declined cost → no stun prompt and nobody is stunned, even with two enemy battlefield units available", async () => {
    const game = await inHand().build();
    await game.p1.play("masa", { to: "base" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    for (const id of ["bigfoe", "smallfoe", "home", "scout", "ally"]) {
      expect(game.state(id).isStunned).toBe(false);
    }
  });

  test("paid [order]: 4 energy + 1 order deducted; the prompt offers exactly the ENEMY units AT BATTLEFIELDS (not the base enemy, not the friendly Scout); the pick is stunned", async () => {
    const game = await inHand().build();
    await game.p1.play("masa", { payOptional: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).sort();
    expect(offered).toEqual(["bigfoe", "smallfoe"]);
    await game.p1.pick("bigfoe");
    await game.settle();
    expect(game.state("bigfoe").isStunned).toBe(true);
    expect(game.state("smallfoe").isStunned).toBe(false);
    expect(game.state("home").isStunned).toBe(false);
    expect(game.state("scout").isStunned).toBe(false);
    expect(game.zoneOf("masa")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("paid, but the only enemy units are in their base: legal, the order power is still spent, Masa lands, nothing is stunned and no prompt is left over", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "base", { might: 3, name: "Homebody" }, "home")
      .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
      .hand(P1, CARD, "masa")
      .build();
    await game.p1.play("masa", { payOptional: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("masa")).toBe("base");
    expect(game.state("home").isStunned).toBe(false);
    expect(game.state("scout").isStunned).toBe(false);
  });

  test("no order power in the pool: forcing payOptional is rejected (or dropped) — either way only 4 energy is charged and nothing is stunned", async () => {
    const game = await inHand({ fury: 2 }).build();
    const forced = await game.p1.try((p) => p.play("masa", { payOptional: true, to: "base" }));
    if (forced.ok) {
      await game.settle();
      expect(game.decision()?.kind).toBe("action");
    } else {
      await game.p1.play("masa", { to: "base" });
      await game.settle();
    }
    expect(game.zoneOf("masa")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 2 } });
    expect(game.state("bigfoe").isStunned).toBe(false);
    expect(game.state("smallfoe").isStunned).toBe(false);
  });

  test("a single legal target is still the one stunned (exactly one enemy battlefield unit)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Big Foe" }, "bigfoe")
      .unit(P2, "base", { might: 3, name: "Homebody" }, "home")
      .hand(P1, CARD, "masa")
      .build();
    await game.p1.play("masa", { payOptional: true, to: "base" });
    await game.settle(); // a forced single pick is taken by settle
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bigfoe");
      await game.settle();
    }
    expect(game.state("bigfoe").isStunned).toBe(true);
    expect(game.state("home").isStunned).toBe(false);
  });

  test("423.1.b/c same turn: the stunned 5-Might defender deals no combat damage — a 2-Might attacker survives unhurt, but 2 < 5 so the defender survives and keeps the battlefield", async () => {
    const game = await inHand().build();
    await game.p1.play("masa", { payOptional: true, to: "base" });
    await game.settle();
    await game.p1.pick("bigfoe");
    await game.settle();
    expect(game.state("bigfoe").isStunned).toBe(true);
    await game.p1.move("ally", "bf1"); // joins Scout (2) → attackers total 4 < 5
    await game.settle();
    expect(game.locationOf("bigfoe")).toBe("bf1");
    expect(game.zoneOf("ally")).not.toBe("trash");
    expect(game.zoneOf("scout")).not.toBe("trash");
    expect(game.state("ally").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("same turn, enough might: Bruiser (5) + Scout (2) into the stunned 5-Might defender kills it, nobody on P1's side is hurt, P1 conquers bf1", async () => {
    const game = await inHand().build();
    await game.p1.play("masa", { payOptional: true, to: "base" });
    await game.settle();
    await game.p1.pick("bigfoe");
    await game.settle();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("bigfoe")).toBe("trash");
    expect(game.locationOf("bruiser")).toBe("bf1");
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.state("bruiser").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative space for note 4: WITHOUT the stun the same Ally (2) + Scout (2) attack into Big Foe (5) gets both attackers killed", async () => {
    const game = await inHand().build();
    await game.p1.play("masa", { to: "base" }); // declined → no stun
    await game.settle();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.locationOf("bigfoe")).toBe("bf1");
    // 5 damage assigned among two 2-Might attackers: at least one of them must die.
    const dead = ["ally", "scout"].filter((id) => game.zoneOf(id) === "trash");
    expect(dead.length).toBeGreaterThanOrEqual(1);
  });

  test("423.1.a.2 'this turn': the stun is cleared at end of turn — after the turn passes Big Foe is no longer stunned", async () => {
    const game = await inHand().build();
    await game.p1.play("masa", { payOptional: true, to: "base" });
    await game.settle();
    await game.p1.pick("bigfoe");
    await game.settle();
    expect(game.state("bigfoe").isStunned).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("bigfoe").isStunned).toBe(false);
  });

  test("played from the Champion Zone the [order] option is offered too (355.10.a.1) — paying it stuns the enemy battlefield unit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Big Foe" }, "bigfoe")
      .unit(P2, "base", { might: 3, name: "Homebody" }, "home")
      .champion(P1, CARD, "masa")
      .build();
    const offered = game.p1.option("playChampion")?.fields.some((f) => f.arg === "payOptional") ?? false;
    if (offered) {
      await game.p1.choose("playFromChampionZone", { payOptional: true, to: "base" });
    } else {
      await game.p1.playChampion("base");
    }
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.seat === P1 && d.kind === "yes-no") {
        await game.p1.yes();
      } else if (d?.seat === P1 && d.kind === "pick") {
        await game.p1.pick(d.options.find((o) => (o.card ?? o.key) === "bigfoe") ? "bigfoe" : d.options[0]!.key);
      } else {
        const r = await game.settle();
        if (r.reason === "open") {
          break;
        }
      }
    }
    expect(game.zoneOf("masa")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("bigfoe").isStunned).toBe(true);
    expect(game.state("home").isStunned).toBe(false);
  });
});
