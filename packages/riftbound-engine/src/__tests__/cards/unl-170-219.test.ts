/**
 * Atakhan — unl-170-219 · Unit · Order · 10 energy + [order][order][order] · 7 Might
 *
 *   You may kill a friendly unit as an additional cost to play me. If you do, I cost [1] less for each
 *   Energy it costs and [order] less for each Power it costs.
 *   [Ganking] (I can move from battlefield to battlefield.)
 *   When I attack, the defender must kill one of their units here.
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. The kill is an OPTIONAL additional cost (356.2.b): full price kills nothing; paying it kills the
 *      unit while finalizing (its Deathknell fires) and discounts by that unit's printed cost — [1] per
 *      Energy and one [order] per Power pip of ANY domain (a [fury] pip still shaves an [order]); the
 *      discount can make an otherwise unaffordable Atakhan playable and floors at zero.
 *   2. Ganking (810): battlefield → battlefield with the Standard Move; a gank into an enemy battlefield
 *      is an attack like any other.
 *   3. "When I attack" (383.4.e): only when HE gains the attacker designation — never when defending.
 *   4. "the defender MUST kill one of THEIR units HERE" (355.10.f): not targeted — the DEFENDING player
 *      chooses, at resolution, among the units they control at this battlefield only (their base is safe);
 *      with exactly one unit here it is forced; with none the instruction does nothing.
 *   5. The kill resolves before combat damage: a lone 9-Might blocker is simply removed and Atakhan
 *      conquers untouched.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-170-219";
const WATCHFUL_SENTRY = "ogn-096-298"; // 2 energy, 1 might: [Deathknell] — Draw 1.

describe("Atakhan (unl-170-219)", () => {
  test("registry payload: optional kill-a-friendly additional cost, Ganking, and an attack trigger whose kill is chosen by the opponent among enemy units here", async () => {
    await scenario().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 10, might: 7, name: "Atakhan", powerCost: ["order", "order", "order"] });
    expect(def?.abilities).toEqual([
      { cost: { kill: { controller: "friendly", type: "unit" } }, type: "additional-cost-option" },
      { keyword: "Ganking", type: "keyword" },
      {
        effect: { player: "opponent", target: { controller: "enemy", location: "here", type: "unit" }, type: "kill" },
        trigger: { event: "attack", on: "self" },
        type: "triggered",
      },
    ]);
  });

  test("full price: 10 energy + 3 order for a 7-Might Ganking unit; the friendly unit is NOT killed; 10 + 2 order is not enough", async () => {
    const game = await scenario()
      .resources(P1, { energy: 10, power: { order: 3 } })
      .unit(P1, "base", { energyCost: 2, might: 2, name: "Squire" }, "squire")
      .hand(P1, CARD, "ata")
      .build();
    await game.p1.play("ata");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("ata")).toBe("base");
    expect(game.state("ata")).toMatchObject({ isExhausted: true, might: 7 });
    expect(game.state("ata").keywords).toContain("Ganking");
    expect(game.zoneOf("squire")).toBe("base");
    const short = await scenario().resources(P1, { energy: 10, power: { order: 2 } }).hand(P1, CARD, "ata").build();
    expect(short.p1.can("play", "ata")).toBe(false);
  });

  test("paying the optional cost kills the chosen friendly unit as he is played — a sacrificed Watchful Sentry's Deathknell draws 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 10, power: { order: 3 } })
      .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
      .unit(P1, "base", { energyCost: 1, might: 1, name: "Bystander" }, "bystander")
      .hand(P1, CARD, "ata")
      .build();
    const sac = game.p1.option("playUnit", "ata")?.fields.find((f) => f.arg === "sacrifice")?.options;
    expect(sac).toEqual(expect.arrayContaining(["sentry", "bystander"]));
    const hand0 = game.p1.hand().length; // includes ata
    await game.p1.play("ata", { payOptional: true, sacrifice: "sentry" });
    expect(game.zoneOf("sentry")).toBe("trash");
    await game.settle();
    expect(game.zoneOf("ata")).toBe("base");
    expect(game.zoneOf("bystander")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
  });

  test("'I cost [1] less per Energy and [order] less per Power it costs' — killing a 4-energy/[order] unit should leave 4 energy + 1 order of a 10/3 pool; the full price is charged", async () => {
    // Expected (356.2.b / 356.4): total cost 10−4 = 6 energy and 3−1 = 2 order → pool 4 / 1 afterwards.
    // Actual: the sacrifice is taken but no discount is applied (pool 0 / 0).
    const game = await scenario()
      .resources(P1, { energy: 10, power: { order: 3 } })
      .unit(P1, "base", { energyCost: 4, might: 4, name: "Herald", powerCost: ["order"] }, "herald")
      .hand(P1, CARD, "ata")
      .build();
    await game.p1.play("ata", { payOptional: true, sacrifice: "herald" });
    expect(game.zoneOf("herald")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { order: 1 } });
  });

  test("the discount is what makes him castable — 6 energy + 2 order plus a 4-energy/[fury] friendly (any-domain pip counts) should be a legal play; a 10+/3+ sacrifice should make him free", async () => {
    // Expected: Fodder (4, [fury]) discounts 4 energy and one [order] → 6 + 2 order suffices; Titan (11, 4 pips)
    // discounts past the printed cost → floors at 0/0 and an empty pool suffices. Actual: neither is playable.
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 2 } })
      .unit(P1, "base", { energyCost: 4, might: 4, name: "Fodder", powerCost: ["fury"] }, "fodder")
      .hand(P1, CARD, "ata")
      .build();
    expect(game.p1.can("play", "ata")).toBe(true);
    await game.p1.play("ata", { payOptional: true, sacrifice: "fodder" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    const free = await scenario()
      .unit(P1, "base", { energyCost: 11, might: 9, name: "Titan", powerCost: ["body", "body", "body", "body"] }, "titan")
      .hand(P1, CARD, "ata")
      .build();
    expect(free.p1.can("play", "ata")).toBe(true);
  });

  test("Ganking: he may Standard-Move battlefield → battlefield; a vanilla unit beside him may not", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", CARD, "ata")
      .unit(P1, "bf1", { might: 2, name: "Plain" }, "plain")
      .build();
    expect(game.p1.can("gank", "ata")).toBe(true);
    expect(game.p1.can("gank", "plain")).toBe(false);
    await game.p1.gank("ata", "bf2");
    expect(game.locationOf("ata")).toBe("bf2");
    expect(game.state("ata").isExhausted).toBe(true);
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("When I attack with ONE enemy unit here: the trigger hits the chain, the defender's only unit here is killed before damage, Atakhan conquers untouched; their base unit is not 'here'", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "ata")
      .unit(P2, "bf1", { might: 9, name: "Colossus" }, "colossus")
      .unit(P2, "base", { might: 1, name: "Home" }, "home")
      .build();
    await game.p1.move("ata", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ata", controller: P1, triggered: true })]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    await game.settle();
    expect(game.zoneOf("colossus")).toBe("trash"); // a 9-Might wall would otherwise have killed the 7-Might attacker
    expect(game.zoneOf("ata")).toBe("battlefield-bf1");
    expect(game.state("ata").damage).toBe(0);
    expect(game.zoneOf("home")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test.failing("BUG: with two enemy units here the DEFENDER chooses which of their units dies (355.10.f 'must' — not a target); the prompt goes to the attacker instead", async () => {
    // Expected: after both pass priority, P2 is asked to pick among a / b (never their base unit).
    // Actual: P1 receives a "Choose a target" prompt.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "ata")
      .unit(P2, "bf1", { might: 2, name: "A" }, "a")
      .unit(P2, "bf1", { might: 3, name: "B" }, "b")
      .unit(P2, "base", { might: 1, name: "Home" }, "home")
      .build();
    await game.p1.move("ata", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["a", "b"]);
    await game.p2.pick("b");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
  });

  test("two enemy units here (whoever picks): exactly one dies to the trigger, then combat — 7 into the surviving 2 kills it too and he conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "ata")
      .unit(P2, "bf1", { might: 2, name: "A" }, "a")
      .unit(P2, "bf1", { might: 3, name: "B" }, "b")
      .build();
    await game.p1.move("ata", "bf1");
    expect(game.decision()?.kind).toBe("pick"); // rule 402 (finalization): the pick comes before priority
    await game.acting().pick("b");
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("a")).toBe("battlefield-bf1"); // only ONE unit is killed by the trigger
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash"); // combat: 7 vs 2
    expect(game.zoneOf("ata")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("attacking an EMPTY enemy battlefield: nothing of theirs is here, so nothing dies anywhere and he conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "ata")
      .unit(P2, "base", { might: 1, name: "Home" }, "home")
      .build();
    await game.p1.move("ata", "bf1");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      // an empty/foreign prompt would be wrong; a declinable empty prompt is tolerated
      expect((game.decision() as { options: unknown[] }).options).toEqual([]);
      await game.acting().decline();
      await game.settle();
    }
    expect(game.zoneOf("home")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("does NOT trigger when defending: an enemy moving into his battlefield puts nothing on the chain and loses nothing to the text", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ata")
      .unit(P2, "base", { might: 2, name: "Scout" }, "scout")
      .unit(P2, "base", { might: 2, name: "Other" }, "other")
      .build();
    await game.p2.move("scout", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash"); // died to 7 combat damage, not to the trigger
    expect(game.zoneOf("other")).toBe("base");
    expect(game.zoneOf("ata")).toBe("battlefield-bf1");
  });

  test("a Gank from my battlefield into theirs is an attack: the trigger fires and their lone unit there is killed", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "ata")
      .unit(P2, "bf2", { might: 8, name: "Guardian" }, "guardian")
      .build();
    await game.p1.gank("ata", "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ata", triggered: true })]);
    await game.settle();
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.locationOf("ata")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
