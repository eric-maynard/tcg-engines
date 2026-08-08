/**
 * Enthralling Protector — unl-162-219 · Unit · Order · 2 energy (no power) · 2 Might
 *
 *   [Hunt] (When I conquer or hold, gain 1 XP.)
 *   Spend 2 XP: [Buff] me. (Give me a +1 [Might] buff if I don't have one.)
 *
 * Rules: 823 (Hunt = "When I conquer or hold, my controller gains X XP"; bare [Hunt] = 1; a chain
 * trigger of THIS unit only), 469 (conquer / hold), 730.2 (Spend XP = reduce the ACTIVATING player's XP —
 * it is that player's resource, 108.2), 145.2 / 381 (a unit's activated ability: only in its controller's
 * Main Phase, Open State, not in a showdown, not while a chain is pending; once activated it sits on the
 * chain like a spell, 145.2.a.1), 202–203 (the XP is a COST: paid on activation, before anyone responds),
 * 702–703 (a Buff is a +1 Might COUNTER; one per unit — a second is simply not placed, 702.3.a; it can be
 * SPENT by other effects, 702.2.b, after which the unit may be buffed again).
 *
 * Head-judge checklist for THIS card:
 *  1. "Spend 2 XP" is the whole cost — no [Exhaust]: legal while exhausted; exactly 2 XP suffices, 1
 *     does not; exactly 2 leaves the pool even from 5.
 *  2. Timing traps: not on the opponent's turn, not inside a showdown, not with a spell waiting on the
 *     chain (Closed State), not from hand.
 *  3. Already buffed: activation is still legal and still costs 2 XP but places nothing (702.3.a).
 *  4. Whose XP? The CONTROLLER's — a Protector P2 has taken control of spends P2's XP on P2's turn.
 *  5. Order partner Call to Glory spends the buff as its alternative cost; the emptied slot can then be
 *     refilled for another 2 XP.
 *  6. The buff is real, permanent Might: a buffed Protector (3) defending against a 2-Might attacker
 *     kills it and lives; unbuffed the same fight is a trade.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-162-219";
const CALL_TO_GLORY = "ogn-207-298"; // Order Reaction 3: may spend a buff instead of the cost; give a unit +3 Might this turn.
const SLOW = { abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }], cardType: "spell", domain: "order", energyCost: 0, name: "Slow Cantrip" };

describe("Enthralling Protector (unl-162-219)", () => {
  test("registry payload: Hunt 1 (+ its 1-XP conquer/hold triggers) and one activated ability costing exactly { xp: 2 } (no exhaust, no energy) that buffs itself", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 2, might: 2, name: "Enthralling Protector" });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities.filter((a) => a.type === "keyword")).toEqual([{ keyword: "Hunt", type: "keyword", value: 1 }]);
    for (const ev of ["conquer", "hold"]) {
      expect(abilities).toContainEqual({ effect: { amount: 1, type: "gain-xp" }, trigger: { event: ev, on: "self" }, type: "triggered" });
    }
    const activated = abilities.filter((a) => a.type === "activated");
    expect(activated).toEqual([{ cost: { xp: 2 }, effect: { target: "self", type: "buff" }, type: "activated" }]);
  });

  test("cost: 2 energy, no power; enters the base exhausted as a 2-Might Hunt unit; nothing triggers on play; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).xp(P1, 4).hand(P1, CARD, "ep").build();
    expect(game.p1.can("activate", "ep")).toBe(false); // not from hand, even with XP to spare
    await game.p1.play("ep");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("ep")).toMatchObject({ baseMight: 2, isBuffed: false, isExhausted: true, might: 2, zone: "base" });
    expect(game.state("ep").keywords).toContain("Hunt");
    expect(game.p1.xp()).toBe(4);
    expect((await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "ep").build()).p1.can("play", "ep")).toBe(false);
  });

  test("[Hunt] on conquer (even of an EMPTY enemy battlefield): the trigger resolves for exactly +1 XP and the conquer point; a Protector left in base while an ally conquers earns nothing", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "ep").build();
    await game.p1.move("ep", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
    const bystander = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "ep").unit(P1, "base", { might: 2 }, "ally").build();
    await bystander.p1.move("ally", "bf1");
    await bystander.settle();
    expect(bystander.p1.points()).toBe(1);
    expect(bystander.p1.xp()).toBe(0);
  });

  test("[Hunt] on hold: holding bf1 through P1's Beginning Phase puts the trigger on the chain → +1 XP and the point; P2's Beginning Phase afterwards is not P1's hold", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "ep").build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ep", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
  });

  test("Spend 2 XP: legal at exactly 2 XP while EXHAUSTED; the 2 XP leave on activation (cost), the ability waits on the chain un-triggered, and only its resolution places the buff (2 → 3 Might)", async () => {
    const game = await scenario().xp(P1, 2).unit(P1, "base", CARD, "ep", { exhausted: true }).build();
    expect(game.p1.can("activate", "ep")).toBe(true);
    await game.p1.activate("ep");
    expect(game.p1.xp()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ep", controller: P1, triggered: false })]);
    expect(game.state("ep")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.actingSeat()).toBe(P1); // priority to respond starts with the activator
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // the opponent gets a window too
    await game.p2.passPriority();
    expect(game.state("ep")).toMatchObject({ baseMight: 2, isBuffed: true, isExhausted: true, might: 3 });
    expect(game.chain()).toEqual([]);
  });

  test("cost edges: 1 XP is one short (not legal); from 5 XP exactly 2 are spent (730.2)", async () => {
    expect((await scenario().xp(P1, 1).unit(P1, "base", CARD, "ep").build()).p1.can("activate", "ep")).toBe(false);
    expect((await scenario().xp(P1, 0).unit(P1, "base", CARD, "ep").build()).p1.can("activate", "ep")).toBe(false);
    const rich = await scenario().xp(P1, 5).unit(P1, "base", CARD, "ep").build();
    await rich.p1.activate("ep");
    await rich.settle();
    expect(rich.p1.xp()).toBe(3);
    expect(rich.state("ep").might).toBe(3);
  });

  test("one buff per unit (702.3.a): activating while already buffed is legal and still costs 2 XP, but Might stays 3", async () => {
    const game = await scenario().xp(P1, 4).unit(P1, "base", CARD, "ep", { buffed: true }).build();
    expect(game.state("ep")).toMatchObject({ isBuffed: true, might: 3 });
    await game.p1.activate("ep");
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.state("ep")).toMatchObject({ isBuffed: true, might: 3 });
    await game.p1.activate("ep");
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(game.state("ep").might).toBe(3);
  });

  test("timing (145.2 / 381): not on the opponent's turn, not inside a showdown it is attacking in, and not in a Closed State with P1's own spell still on the chain", async () => {
    const opp = await scenario().active(P2).xp(P1, 4).unit(P1, "base", CARD, "ep").build();
    expect(opp.p1.can("activate", "ep")).toBe(false);
    const sd = await scenario().xp(P1, 4).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 1 }, "foe").unit(P1, "base", CARD, "ep").build();
    await sd.p1.move("ep", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("activate", "ep")).toBe(false);
    const closed = await scenario().xp(P1, 4).unit(P1, "base", CARD, "ep").hand(P1, SLOW, "cantrip").build();
    expect(closed.p1.can("activate", "ep")).toBe(true);
    await closed.p1.cast("cantrip");
    expect(closed.chain()).toHaveLength(1);
    expect(closed.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(closed.p1.can("activate", "ep")).toBe(false);
    await closed.settle();
    expect(closed.p1.can("activate", "ep")).toBe(true); // open again once the chain is empty
  });

  test("whose XP (108.2 / 730.2): a Protector P1 owns but P2 CONTROLS is P2's to activate on P2's turn, spending P2's XP — P1's XP is untouched and P1 cannot activate it", async () => {
    const game = await scenario()
      .active(P2)
      .xp(P1, 5)
      .xp(P2, 2)
      .card("ep", { controller: P2, def: CARD, owner: P1, zone: "base" })
      .build();
    expect(game.state("ep")).toMatchObject({ controller: P2, owner: P1 });
    expect(game.p1.can("activate", "ep")).toBe(false);
    expect(game.p2.can("activate", "ep")).toBe(true);
    await game.p2.activate("ep");
    await game.settle();
    expect(game.p2.xp()).toBe(0);
    expect(game.p1.xp()).toBe(5);
    expect(game.state("ep")).toMatchObject({ isBuffed: true, might: 3 });
  });

  test("partner — Call to Glory spends the Protector's buff as its alternative cost (0 energy paid, +3 this turn), and the emptied slot can be re-bought for another 2 XP: 2 base + 1 buff + 3 = 6", async () => {
    const game = await scenario().xp(P1, 4).resources(P1, { energy: 0 }).unit(P1, "base", CARD, "ep").hand(P1, CALL_TO_GLORY, "ctg").build();
    expect(game.p1.can("cast", "ctg")).toBe(false); // no energy and no buff to spend yet
    await game.p1.activate("ep");
    await game.settle();
    expect(game.state("ep")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.p1.can("cast", "ctg")).toBe(true);
    await game.p1.cast("ctg", { payOptional: true, targets: "ep" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("ep").isBuffed).toBe(false); // spent as the cost
    await game.settle();
    expect(game.state("ep")).toMatchObject({ isBuffed: false, might: 5 }); // 2 + 3 this turn
    await game.p1.activate("ep");
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(game.state("ep")).toMatchObject({ isBuffed: true, might: 6 });
    await game.advanceTurn();
    expect(game.state("ep").might).toBe(3); // the +3 expired, the counter stayed
  });

  test("the buff is permanent, real Might: bought on turn 2 it is still there two turns later, and a buffed Protector (3) DEFENDING against a 2-Might attacker kills it and survives", async () => {
    const game = await scenario()
      .xp(P1, 2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ep")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    await game.p1.activate("ep");
    await game.settle();
    expect(game.state("ep").might).toBe(3);
    await game.advanceTurn(); // P2's turn — P1 held nothing new (bf1 hold happens on P1's turn)
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("ep")).toMatchObject({ isBuffed: true, might: 3 });
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("ep")).toMatchObject({ isBuffed: true, might: 3, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    await game.advanceTurn(); // back to P1: hold → +1 XP, +1 point; buff still there
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("ep")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("control line — unbuffed, the same defence is a trade: the 2-Might Raider and the 2-Might Protector kill each other and bf1 is left empty", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ep")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("ep")).toBe("trash");
    expect(game.p2.points()).toBe(0);
    expect(game.p1.xp()).toBe(0);
  });

  test("the natural loop: hold on two of P1's turns (1 + 1 XP, 2 points), then cash the 2 XP in during the second main phase → a 3-Might holder", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "ep").build();
    await game.advanceTurn(); // P1: hold #1
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.can("activate", "ep")).toBe(false);
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1: hold #2
    expect(game.p1.xp()).toBe(2);
    expect(game.p1.points()).toBe(2);
    await game.p1.activate("ep");
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(game.state("ep")).toMatchObject({ isBuffed: true, location: "bf1", might: 3 });
  });
});
