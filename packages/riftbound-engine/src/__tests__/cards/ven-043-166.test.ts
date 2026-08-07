/**
 * Steel Paws — ven-043-166 · Unit · Calm · 1 energy · 0 Might
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *   [Empower] [7] ([7]: Empower me. Use only if not Empowered.)
 *   [Empowered][>] I have +7 [Might].
 *
 * Rules: 809 (Deflect 1: an OPPONENT's spell/ability that chooses this costs 1 more Power, of ANY
 * domain, as a mandatory additional cost — the controller's own effects are untaxed), 827 (Empower is
 * an activated ability "[7]: Empower this. Play only if not Empowered"; 827.1.b.1 the source is not a
 * target, so Deflect is irrelevant to it), 377/151.2-style timing (a unit's activated ability without
 * Action/Reaction: your Main Phase, Open State, not in a showdown, uses the chain), 441 (Empowered is
 * binary and permanent until removed), 727.1.b ([Empowered][>] +7 exactly while Empowered),
 * 142.4.b (a 0-Might unit is alive: lethal damage is NON-ZERO damage ≥ Might, so 1 damage kills it).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. 0 Might is a real body: it can walk onto an open battlefield and conquer, but any 1 damage —
 *     or defending against a 1-Might attacker — kills it, and it deals nothing back.
 *  2. [7] is exact: 7 energy → Empowered 7/7 with 0 left; 6 energy → not offered; power can't stand
 *     in for energy. Once Empowered the ability disappears (no paying 7 again for nothing).
 *  3. The empower goes through the chain: before both players pass it is still a 0.
 *  4. Timing: never on the opponent's turn, never with Focus inside a showdown.
 *  5. Deflect vs a real opponent spell (Rune Prison, 2+[calm]): with exactly 2 energy + 1 calm P2 can
 *     stun a plain unit but NOT Steel Paws; a second power of any domain (fury) pays the tax.
 *     P1's own Rune Prison on Steel Paws costs the plain 2+[calm].
 *  6. Empowered 7 persists across turns and wins real combats (a 5-Might raider dies, Paws holds).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-043-166";
const RUNE_PRISON = "ogn-050-298"; // [Action] Stun a unit. — 2 energy + [calm]

describe("Steel Paws (ven-043-166)", () => {
  test("registry payload: Calm 1-cost 0-Might; [Deflect 1 keyword, activated {energy 7} empower self (not-empowered), static while-empowered +7]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 1, might: 0, name: "Steel Paws" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(3);
    expect(def?.abilities?.[0]).toEqual({ keyword: "Deflect", type: "keyword", value: 1 });
    expect(def?.abilities?.[1]).toMatchObject({ cost: { energy: 7 }, effect: { target: "self", type: "empower" }, restrictions: [{ type: "not-empowered" }], type: "activated" });
    expect(def?.abilities?.[2]).toMatchObject({ condition: { type: "while-empowered" }, effect: { amount: 7, type: "modify-might" }, type: "static" });
  });

  test("cost: 1 energy → an exhausted 0-Might Deflect unit in base, not Empowered; 0 energy (even with power) → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "paws").build();
    await game.p1.play("paws");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("paws")).toMatchObject({ baseMight: 0, isEmpowered: false, isExhausted: true, might: 0, zone: "base" });
    expect(game.state("paws").keywords).toContain("Deflect");
    expect((await scenario().resources(P1, { energy: 0, power: { calm: 3 } }).hand(P1, CARD, "p").build()).p1.can("play", "p")).toBe(false);
  });

  test("[Empower] [7]: pays exactly 7 energy, goes on the chain (still 0 Might there), resolves → Empowered, 7 Might; the ability is then gone (827.1.c.1)", async () => {
    const game = await scenario().resources(P1, { energy: 8 }).unit(P1, "base", CARD, "paws").build();
    expect(game.p1.can("activate", "paws")).toBe(true);
    await game.p1.activate("paws");
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "paws", controller: P1 })]);
    expect(game.state("paws")).toMatchObject({ isEmpowered: false, might: 0 });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("paws")).toMatchObject({ baseMight: 0, isEmpowered: true, might: 7 });
    expect(game.p1.can("activate", "paws")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("[7] means 7 ENERGY: 6 energy plus any amount of power is not enough; an opponent can never activate it", async () => {
    const six = await scenario().resources(P1, { energy: 6, power: { calm: 5, rainbow: 5 } }).unit(P1, "base", CARD, "paws").build();
    expect(six.p1.can("activate", "paws")).toBe(false);
    expect((await six.p1.try((p) => p.activate("paws", 1))).ok).toBe(false);
    expect(six.p1.energy()).toBe(6);
    const theirs = await scenario().active(P2).resources(P2, { energy: 9 }).unit(P1, "base", CARD, "paws").build();
    expect(theirs.p2.can("activate", "paws")).toBe(false);
  });

  test("already Empowered: the [Empower] ability is not offered even with 7 energy; it stays exactly 7 Might (no +14)", async () => {
    const game = await scenario().resources(P1, { energy: 7 }).unit(P1, "base", CARD, "paws", { empowered: true }).build();
    expect(game.state("paws")).toMatchObject({ isEmpowered: true, might: 7 });
    expect(game.p1.can("activate", "paws")).toBe(false);
    expect(game.p1.energy()).toBe(7);
  });

  test("timing: not on the opponent's turn, and not with Focus inside a showdown (unit activated ability, no Action/Reaction)", async () => {
    const opp = await scenario().active(P2).resources(P1, { energy: 7 }).unit(P1, "base", CARD, "paws").build();
    expect(opp.p1.can("activate", "paws")).toBe(false);
    const sd = await scenario()
      .resources(P1, { energy: 7 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry")
      .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
      .unit(P1, "base", CARD, "paws")
      .build();
    await sd.p1.move("scout", "bf1");
    expect((sd.decision() as ActionDecision).context).toBe("showdown");
    expect(sd.p1.can("activate", "paws")).toBe(false);
  });

  test("Empowered persists: 7 Might through the opponent's turn and into your next one (still Empowered, readied, ability still absent)", async () => {
    const game = await scenario().resources(P1, { energy: 7 }).unit(P1, "base", CARD, "paws").build();
    await game.p1.activate("paws");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("paws")).toMatchObject({ isEmpowered: true, might: 7 });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("paws")).toMatchObject({ isEmpowered: true, isReady: true, might: 7 });
    expect(game.p1.can("activate", "paws")).toBe(false);
  });

  test("0 Might is alive (142.4.b): un-empowered Paws walks onto an OPEN battlefield and conquers it for a point", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "paws").build();
    await game.p1.move("paws", "bf1");
    await game.settle();
    expect(game.state("paws")).toMatchObject({ might: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("combat: a lone 0-Might Paws defending against a 1-Might raider takes 1 (lethal, 142.4.b) and dies, raider conquers", async () => {
    // Expected: raider deals 1 to Paws (non-zero ≥ 0 Might → lethal), Paws dies, P2 conquers bf1.
    // Actual: resolve-full-combat filters out units whose PRINTED might is ≤ 0 ("non-unit"), so Paws
    // neither takes nor deals damage; the raider is recalled and P1 keeps bf1.
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "paws")
      .unit(P2, "base", { might: 1, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("paws")).toBe("trash");
    expect(game.state("raider")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("combat: an Empowered 7-Might Paws defending kills a 5-Might raider and holds", async () => {
    // Expected: Paws (0 printed + 7 static) deals 7 → raider dies; Paws takes 5 < 7 and survives.
    // Actual: the printed-might ≤ 0 filter drops Paws from combat, nobody is damaged, raider recalled.
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "paws", { empowered: true })
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("paws")).toMatchObject({ damage: 0, isEmpowered: true, might: 7, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("[Deflect] vs an opponent's Rune Prison (2+[calm]): with exactly 2 energy + 1 calm P2 may stun a plain unit but NOT Steel Paws", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { calm: 1 } })
      .unit(P1, "base", CARD, "paws")
      .unit(P1, "base", { might: 2, name: "Plain" }, "plain")
      .hand(P2, RUNE_PRISON, "prison")
      .build();
    const r = await game.p2.try((p) => p.cast("prison", { targets: "paws" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("prison")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 1 } });
    await game.p2.cast("prison", { targets: "plain" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.state("plain").isStunned).toBe(true);
    expect(game.state("paws").isStunned).toBe(false);
  });

  test("[Deflect] paid with power of ANY domain (809.1.c.1): 2 energy + calm + a spare fury lets P2 stun Steel Paws, and all of it is spent", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { calm: 1, fury: 1 } })
      .unit(P1, "base", CARD, "paws")
      .hand(P2, RUNE_PRISON, "prison")
      .build();
    await game.p2.cast("prison", { targets: "paws" });
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.power()).toBe(0);
    await game.settle();
    expect(game.state("paws").isStunned).toBe(true);
  });

  test("[Deflect] taxes OPPONENTS only: P1's own Rune Prison on Steel Paws costs the plain 2 + [calm]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .unit(P1, "base", CARD, "paws")
      .hand(P1, RUNE_PRISON, "prison")
      .build();
    await game.p1.cast("prison", { targets: "paws" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.state("paws").isStunned).toBe(true);
  });
});
