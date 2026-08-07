/**
 * Punch First — sfd-097-221 · Spell · Body · 1 energy + [body][body]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Give a unit +5 [Might] this turn.
 *
 * Head-judge checklist for this card:
 *  - [Action] timing (rule 806 / 309.1.a): own turn in an Open state, or with Focus in a
 *    showdown on ANY player's turn (defender's trick) — never onto an existing chain, never in
 *    the opponent's Neutral Open state.
 *  - "a unit": friendly OR enemy, base OR battlefield; exactly one mandatory target (355.8) —
 *    no unit anywhere ⇒ not playable.
 *  - +5 is a plain Might modifier (not Assault): visible at rest, counts for both attacker and
 *    defender, sums with a buff, and adds onto damaged units.
 *  - "this turn": expires in the Expiration Step (317.2) — AFTER "heal all units" (3c before 3d),
 *    so a 2-Might unit carrying 5 damage under Punch First survives the turn end.
 *  - Real combat: 2-Might attacker + Punch First into a 5-Might defender kills it, survives the
 *    5 return damage (7 > 5) and conquers; one short (defender 7) trades instead.
 *  - Cost: 1 energy + 2 body; a [rainbow]/wrong-domain shortfall makes it illegal.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-097-221";
/** Plain 1-energy spell: deal 5 to a unit (any unit — used on our own to load damage). */
const BOLT5 = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt 5",
  timing: "action",
} as const;

function board(energy = 1, body = 2) {
  return scenario()
    .resources(P1, { energy, power: { body } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Brawler" }, "ally")
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "foe")
    .hand(P1, CARD, "pf");
}

describe("Punch First (sfd-097-221)", () => {
  test("registry payload: an [Action] spell whose single effect is +5 Might to one unit for the turn", async () => {
    const game = await board().build();
    const s = game.state("pf");
    expect(s).toMatchObject({ cardType: "spell", energyCost: 1, name: "Punch First" });
    expect(s.powerCost).toEqual(["body", "body"]);
    // The parsed ability list is what the engine executes — it must say exactly what the card prints.
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def?.timing).toBe("action");
    expect(def?.abilities).toEqual([
      { effect: { amount: 5, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" },
    ]);
  });

  test("cost: 1 energy + [body][body] are deducted and the spell waits on the chain; short on either ⇒ illegal", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "pf")).toBe(true);
    await game.p1.cast("pf", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("pf")).toBe("chain");
    expect((await board(0, 2).build()).p1.can("cast", "pf")).toBe(false);
    expect((await board(1, 1).build()).p1.can("cast", "pf")).toBe(false);
    // Wrong-domain power does not pay a [body] pip.
    const fury = await scenario().resources(P1, { energy: 1, power: { fury: 2 } }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "pf").build();
    expect(fury.p1.can("cast", "pf")).toBe(false);
  });

  test("gives the chosen unit +5 Might (visible at rest), leaves other units alone, and goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("pf", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.state("ally").might).toBe(7);
    expect(game.state("ally").baseMight).toBe(2);
    expect(game.state("foe").might).toBe(5);
    // Not a keyword grant — nothing Assault-like was added.
    expect(game.state("ally").grantedKeywords).toEqual([]);
  });

  test("'a unit': friendly and enemy units, in base or at a battlefield, are all legal — and an enemy can be pumped", async () => {
    const game = await board().unit(P2, "base", { might: 1, name: "Homebody" }, "home").build();
    const targets = game.p1.option("cast", "pf")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["ally"], ["foe"], ["home"]]));
    await game.p1.cast("pf", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(10);
  });

  test("no unit anywhere ⇒ the mandatory target cannot be chosen and the spell is not playable (355.8)", async () => {
    const game = await scenario().resources(P1, { energy: 1, power: { body: 2 } }).hand(P1, CARD, "pf").build();
    expect(game.p1.can("cast", "pf")).toBe(false);
    expect(game.zoneOf("pf")).toBe("hand");
  });

  test("'this turn': the +5 is gone after the turn ends, and it stacks with a buff while it lasts", async () => {
    const game = await board().unit(P1, "base", { might: 3, name: "Buffed" }, "buffed", { buffed: true }).build();
    expect(game.state("buffed").might).toBe(4);
    await game.p1.cast("pf", { targets: "buffed" });
    await game.settle();
    expect(game.state("buffed").might).toBe(9);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("buffed").might).toBe(4); // buff stays, +5 expired
    expect(game.state("buffed").isBuffed).toBe(true);
  });

  test("Expiration Step order (317.2: heal 3c before expiry 3d): a 2-Might unit holding 5 damage under Punch First survives the turn end", async () => {
    const game = await board(2, 2).hand(P1, BOLT5, "bolt").build();
    await game.p1.cast("pf", { targets: "ally" });
    await game.settle();
    await game.p1.cast("bolt", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").damage).toBe(5);
    expect(game.zoneOf("ally")).toBe("base"); // 5 < 7: not lethal now
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").might).toBe(2);
  });

  test("end-of-turn heal (317.2.b) clears the __counters.damage store too, so the healed unit reads 0", async () => {
    // Expected: after the Ending Step the unit carries 0 damage in every store the engine keeps.
    // Actual: the flow clears meta.damage only; the counter bag written by the damage effect keeps 5.
    const game = await board(2, 2).hand(P1, BOLT5, "bolt").build();
    await game.p1.cast("pf", { targets: "ally" });
    await game.settle();
    await game.p1.cast("bolt", { targets: "ally" });
    await game.settle();
    await game.advanceTurn();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").damage).toBe(0);
  });

  test("combat: cast with Focus in the showdown, a 2-Might attacker (→7) kills the 5-Might defender, survives 5 damage and conquers", async () => {
    const game = await board().build();
    await game.p1.move("ally", "bf1");
    const d = game.decision() as ActionDecision;
    expect(d.context).toBe("showdown");
    expect(d.seat).toBe(P1);
    expect(game.p1.can("cast", "pf")).toBe(true);
    await game.p1.cast("pf", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("negative space: one short — into a 7-Might defender the pumped 7-Might attacker trades (both die), nobody conquers", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { body: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 7 }, "big")
      .hand(P1, CARD, "pf")
      .build();
    await game.p1.move("ally", "bf1");
    await game.p1.cast("pf", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("trash");
    // 190.4.c: an emptied battlefield is controlled by nobody — P1 did not conquer.
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test("[Action] on the OPPONENT's turn: the defender may cast it with Focus in a showdown (+5 to the defender repels the attack)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1, power: { body: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, CARD, "pf")
      .build();
    expect(game.p1.can("cast", "pf")).toBe(false); // P2's Neutral Open state: no
    await game.p2.move("raider", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "pf")).toBe(true);
    await game.p1.cast("pf", { targets: "guard" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 7 ≥ 4
    expect(game.locationOf("guard")).toBe("bf1"); // 4 < 7
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("[Action] is not [Reaction]: cannot be added to an existing chain, and not castable in the opponent's main phase", async () => {
    const game = await board(2, 4).hand(P1, CARD, "pf2").build();
    await game.p1.cast("pf", { targets: "ally" });
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.can("cast", "pf2")).toBe(false);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.settle();
    expect(game.state("ally").might).toBe(7);
    // Second copy is fine once the state is Open again.
    expect(game.p1.can("cast", "pf2")).toBe(true);
    const opp = await board().active(P2).build();
    expect(opp.p1.can("cast", "pf")).toBe(false);
    const r = await opp.p1.try((p) => p.cast("pf", { targets: "ally" }));
    expect(r.ok).toBe(false);
  });
});
