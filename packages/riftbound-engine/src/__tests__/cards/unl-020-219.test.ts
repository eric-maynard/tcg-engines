/**
 * Dancing Grenade — unl-020-219 · Spell · Fury · 2 energy + [fury] · (no [Action]/[Reaction] → standard speed)
 *
 *   Deal 2 to a unit. Its controller may play this spell again for [rainbow]. If they do, this
 *   deals 1 additional Bonus Damage for each time this spell has dealt damage this turn.
 *
 * Rules: 417/712–715 (Bonus Damage sums onto one Deal action; 715.4 no deal → no bonus), 809.1.c.1
 * ([rainbow] = one power of ANY domain), 155/159.2.a.1 (no timing keyword → only in your own Open
 * main phase with an empty chain), 108.2 ("its controller" is the damaged unit's CONTROLLER — which
 * may be the opponent, who then becomes the one playing the spell), 317.2.c ("this turn" counters
 * reset with the turn).
 *
 * Head-judge corner cases for THIS card:
 *   1. "Deal 2" is a flat 2 — it must not scale with the number of units on the board (the parser
 *      currently reads it as 2 × #units).
 *   2. Controller ≠ caster: hitting an ENEMY unit hands the replay offer to the opponent, who pays
 *      [rainbow] from THEIR pool and chooses the next target; hitting your own unit offers it to you.
 *   3. The replay costs exactly one power of any domain and NO energy; with an empty power pool the
 *      offer cannot be accepted and the spell simply ends in its owner's trash.
 *   4. Escalation rides only on the replay ("If they do"): 1st resolution 2, replay 3, next 4. A
 *      second printed copy cast normally the same turn still deals a plain 2.
 *   5. If the 2 damage kills the unit the spell still finishes cleanly in its OWNER's trash.
 *   6. Standard speed: not castable on the opponent's turn, nor with anything on the chain.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-020-219";

function board(p1Power: Record<string, number> = { fury: 2 }, p2Power: Record<string, number> = { calm: 1 }) {
  return scenario()
    .resources(P1, { energy: 4, power: p1Power })
    .resources(P2, { energy: 0, power: p2Power })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 5, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 5, name: "Brute" }, "brute")
    .unit(P2, "bf1", { might: 2, name: "Runt" }, "runt")
    .hand(P1, CARD, "dg");
}

/** A board with exactly one unit, so the flat-2 vs 2×#units mis-parse cannot interfere. */
function lone(p2Power: Record<string, number> = {}) {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .resources(P2, { energy: 0, power: p2Power })
    .unit(P2, "base", { might: 8, name: "Giant" }, "giant")
    .hand(P1, CARD, "dg");
}

describe("Dancing Grenade (unl-020-219)", () => {
  test("registry payload should be a flat 'deal 2 to a unit' spell (parser emits amount = 2 × count(all units) and drops the replay clause)", async () => {
    // Expected: amount 2, target any unit (+ some representation of the [rainbow] replay rider).
    // Actual: amount = { count: { type: "unit", quantity: "all" }, multiplier: 2 }, no second clause.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "fury", energyCost: 2, name: "Dancing Grenade", timing: "standard" });
    expect(def?.powerCost).toEqual(["fury"]);
    expect(def?.abilities?.[0]).toMatchObject({ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, type: "spell" });
  });

  test("cost: 2 energy + 1 fury are deducted and the spell goes on the chain; 1 energy or off-domain power → not castable", async () => {
    const game = await board().build();
    await game.p1.cast("dg", { targets: "brute" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dg", controller: P1, triggered: false })]);
    const poor = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).unit(P2, "base", { might: 5 }, "u").hand(P1, CARD, "dg").build();
    expect(poor.p1.can("cast", "dg")).toBe(false);
    const offColor = await scenario().resources(P1, { energy: 4, power: { calm: 1 } }).unit(P2, "base", { might: 5 }, "u").hand(P1, CARD, "dg").build();
    expect(offColor.p1.can("cast", "dg")).toBe(false);
  });

  test("targets any unit — friendly or enemy, base or battlefield; with no unit anywhere it is not castable", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "dg")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["mine"], ["brute"], ["runt"]]));
    const empty = await scenario().resources(P1, { energy: 4, power: { fury: 2 } }).hand(P1, CARD, "dg").build();
    expect(empty.p1.can("cast", "dg")).toBe(false);
  });

  test("'Deal 2' is a flat 2 — a 5-Might unit takes exactly 2 with three units on the board (engine deals 2 × #units = 6 and kills it)", async () => {
    // Expected: Brute has 2 damage and is still in base. Actual: the mis-parsed amount deals 6.
    const game = await board().build();
    await game.p1.cast("dg", { targets: "brute" });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("base");
    expect(game.state("brute").damage).toBe(2);
    expect(game.zoneOf("runt")).toBe("battlefield-bf1");
    expect(game.state("mine").damage).toBe(0);
  });

  test("2 damage is lethal to a 2-Might unit at a battlefield: it goes to its owner's trash, nothing else is touched", async () => {
    const game = await board().build();
    await game.p1.cast("dg", { targets: "runt" });
    await game.settle();
    expect(game.zoneOf("runt")).toBe("trash");
    expect(game.p2.trash()).toContain("runt");
    expect(game.zoneOf("brute")).toBe("base");
    expect(game.state("brute").damage).toBe(0);
    expect(game.state("mine").damage).toBe(0);
  });

  test("standard speed: not castable during the opponent's turn, and not in response while something is on the chain", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "dg")).toBe(false);
    const PING = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 0, name: "Ping", timing: "action" };
    const game = await board().hand(P1, PING, "ping").build();
    expect(game.p1.can("cast", "dg")).toBe(true);
    await game.p1.cast("ping", { targets: "brute" });
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("cast", "dg")).toBe(false);
  });

  test("hitting an ENEMY unit offers the replay to ITS controller (P2), who pays one power of any domain and no energy to put it back on the chain", async () => {
    // Expected: after resolution P2 (Giant's controller, holding 1 calm) is offered the replay;
    // accepting spends P2's calm power only and the spell is on the chain under P2's control.
    // Actual: the spell goes straight to P1's trash and P1's main phase resumes.
    const game = await lone({ calm: 1 }).build();
    await game.p1.cast("dg", { targets: "giant" });
    await game.settle();
    expect(game.state("giant").damage).toBe(2);
    const d = game.decision();
    const prompt = d?.seat === P2 && d.kind === "yes-no";
    const asPlay = game.p2.legal().some((o) => o.card === "dg" && (o.verb === "cast" || o.verb === "play"));
    expect(prompt || asPlay).toBe(true);
    if (prompt) {
      await game.p2.yes();
    } else {
      await game.p2.cast("dg", { targets: "giant" });
    }
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dg", controller: P2 })]);
  });

  test("replay escalation — the [rainbow] replay deals 3 (2 + 1 Bonus for the one prior deal this turn), so an 8-Might unit sits at 5 damage after two resolutions", async () => {
    // Expected: 2, then 3 → 5 total damage on Giant, P2 paid 1 calm. Actual: no offer; damage stays 2.
    const game = await lone({ calm: 1 }).build();
    await game.p1.cast("dg", { targets: "giant" });
    await game.settle();
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P2) {
      await game.p2.yes();
    } else if (game.p2.can("cast", "dg")) {
      await game.p2.cast("dg", { targets: "giant" });
    }
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("giant");
    }
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("giant");
      await game.settle();
    }
    expect(game.state("giant").damage).toBe(5);
    expect(game.p2.power("calm")).toBe(0);
  });

  test("controller with an EMPTY power pool cannot replay: the spell resolves once (2 damage), lands in its owner's trash, and P1's open main phase resumes", async () => {
    const game = await lone({}).build();
    await game.p1.cast("dg", { targets: "giant" });
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      expect(game.decision()).toMatchObject({ canAccept: false, seat: P2 });
      await game.p2.no();
      await game.settle();
    }
    expect(game.state("giant").damage).toBe(2);
    expect(game.zoneOf("dg")).toBe("trash");
    expect(game.p1.trash()).toContain("dg");
    expect(game.p2.trash()).not.toContain("dg");
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'If they do' — the bonus rides only on the replay: a second printed copy cast normally the same turn deals a plain 2 (Giant at 4, not 5)", async () => {
    const game = await lone({}).hand(P1, CARD, "dg2").build();
    await game.p1.cast("dg", { targets: "giant" });
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.acting().no();
      await game.settle();
    }
    expect(game.state("giant").damage).toBe(2);
    await game.p1.cast("dg2", { targets: "giant" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.acting().no();
      await game.settle();
    }
    expect(game.state("giant").damage).toBe(4);
    expect(game.zoneOf("giant")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("killing the target still finishes cleanly: spell in P1's trash, dead unit in P2's trash, damage on nothing else, no invariant violations", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .unit(P2, "base", { might: 1, name: "Wisp" }, "wisp")
      .hand(P1, CARD, "dg")
      .build();
    await game.p1.cast("dg", { targets: "wisp" });
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.acting().no();
      await game.settle();
    }
    expect(game.p2.trash()).toEqual(["wisp"]);
    expect(game.p1.trash()).toEqual(["dg"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
