/**
 * Loyal Poro — unl-156-219 · Unit · Order · 3 energy (no power) · 3 Might · Poro
 *
 *   [Deathknell][>] If I didn't die alone, draw 1. (When I die, get the effect. I wasn't alone if there
 *   were other friendly units here.)
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. "alone" (740.2.a) counts only OTHER FRIENDLY UNITS at the SAME location: enemies here don't help,
 *      friends elsewhere don't help, a friendly gear or a facedown card here is not a unit.
 *   2. The base is a location too: dying in a crowded base draws.
 *   3. The check is made as it dies (323.4 / 808.1.d.3 — note location and company before it leaves):
 *      an ally that dies in the SAME combat damage step was still "here" → not alone → draw; two Loyal
 *      Poros dying together each see the other → 2 cards.
 *   4. Defending alone and dying in combat draws nothing; the killer never draws.
 *   5. It is a triggered ability: it goes on the chain (controller = the Poro's controller) and only
 *      draws on resolution.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-156-219";
const VENGEANCE = "ogn-229-298"; // Order [Action] spell, 4 energy + [order][order]: Kill a unit.

/** P2's turn holding Vengeance; P1's Loyal Poro sits on bf1 (P1-controlled). */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 4, power: { order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", CARD, "poro")
    .hand(P2, VENGEANCE, "veng");
}

describe("Loyal Poro (unl-156-219)", () => {
  test("registry payload: Poro-tagged 3/3 for 3; Deathknell keyword + a die/self trigger drawing 1 under a not-died-alone condition", async () => {
    await scenario().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 3, might: 3, name: "Loyal Poro", tags: ["Poro"] });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { condition: { type: "not-died-alone" }, effect: { amount: 1, type: "draw" }, keyword: "Deathknell", type: "keyword" },
      { condition: { type: "not-died-alone" }, effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "self" }, type: "triggered" },
    ]);
  });

  test("cost: 3 energy, no power → a 3-Might Deathknell unit in base, exhausted; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "poro").build();
    await game.p1.play("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.state("poro").keywords).toContain("Deathknell");
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "poro").build();
    expect(poor.p1.can("play", "poro")).toBe(false);
  });

  test("killed with another friendly unit here → Deathknell on the chain (P1's) → P1 draws 1, the killer draws nothing", async () => {
    const game = await board().unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy").build();
    const p1Hand0 = game.p1.hand().length;
    const p2Hand0 = game.p2.hand().length;
    await game.p2.cast("veng", { targets: "poro" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toHaveLength(p1Hand0); // not yet — only on resolution
    await game.settle();
    expect(game.p1.hand()).toHaveLength(p1Hand0 + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand0 - 1);
    expect(game.locationOf("buddy")).toBe("bf1");
  });

  test("the base is a location: dying in base next to another friendly unit draws 1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { order: 2 } })
      .unit(P1, "base", CARD, "poro")
      .unit(P1, "base", { might: 1, name: "Roommate" }, "roommate")
      .hand(P2, VENGEANCE, "veng")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("veng", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("died ALONE (nothing else friendly here) must draw no card", async () => {
    // Expected: the condition is false, the Deathknell does nothing (740.2.a).
    // Actual: the engine never evaluates `not-died-alone`, so every death draws.
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("veng", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("enemy units here do not keep it company (740.2.a: alone = no other FRIENDLY units) → must draw no card", async () => {
    const game = await board().unit(P2, "bf1", { might: 2, name: "Intruder" }, "intruder").build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("veng", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("friendly units at OTHER locations (another battlefield, the base) do not count → must draw no card", async () => {
    const game = await board().unit(P1, "bf2", { might: 1, name: "Far" }, "far").unit(P1, "base", { might: 1, name: "Home" }, "home").build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("veng", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("a friendly facedown card here is not a unit: still alone → must draw no card", async () => {
    const game = await board().facedown(P1, "bf1", VENGEANCE, "hidden").build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("veng", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("hidden")).toBe("trash"); // no units left → P1 loses bf1 at cleanup → facedown card removed (190.4.c / 107.3.d)
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("combat: defending TOGETHER with an ally and both dying to a 7-Might attacker — the ally was still here as it died → draw 1", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "poro")
      .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
      .unit(P2, "base", { might: 7, name: "Giant" }, "giant")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.move("giant", "bf1");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("buddy")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("combat — defending ALONE and dying must draw no card (the attacker conquers)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "poro")
      .unit(P2, "base", { might: 5, name: "Bruiser" }, "bruiser")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("two Loyal Poros dying in the same combat each had the other for company → 2 cards", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "poroA")
      .unit(P1, "bf1", CARD, "poroB")
      .unit(P2, "base", { might: 8, name: "Colossus" }, "colossus")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.move("colossus", "bf1");
    await game.settle();
    expect(game.zoneOf("poroA")).toBe("trash");
    expect(game.zoneOf("poroB")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
  });

  test("surviving is not dying: a 2-Might attacker bounces off the Poro + Buddy and nobody draws", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "poro")
      .unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy")
      .unit(P2, "base", { might: 2, name: "Poker" }, "poker")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.move("poker", "bf1");
    await game.settle();
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
