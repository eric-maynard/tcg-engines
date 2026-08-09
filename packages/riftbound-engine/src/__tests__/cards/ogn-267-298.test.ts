/**
 * Bounty Hunter — ogn-267-298 · Legend (Miss Fortune) · Body/Chaos
 *
 *   [Exhaust]: Give a unit [Ganking] this turn. (It can move from battlefield to battlefield.)
 *
 * Head-judge checklist (the tricky spots for THIS card):
 *  1. Timing: the ability carries NO [Action]/[Reaction] tag, so it is default speed — only on its
 *     controller's turn in a Neutral Open state (381, 310.1.a): never during a showdown (even your
 *     own attack, even holding Focus), never while a chain is open, never on the opponent's turn.
 *  2. The only cost is [Exhaust]: zero energy/power is fine; an already-exhausted legend cannot pay
 *     (403.1.a) so nothing is offered; the legend readies in its controller's next Awaken step, so it
 *     is once per turn in practice.
 *  3. "a unit" — ANY unit, friendly or enemy, at a base or a battlefield (355: the target is chosen
 *     as the ability goes on the chain, and the opponent gets priority before it resolves — 377.3.b.2).
 *     No unit anywhere ⇒ no legal target ⇒ the ability cannot be activated at all.
 *  4. What Ganking buys (810.1.b): the Standard Move gains the option battlefield → battlefield. It is
 *     still the unit's Standard Move — the unit must be READY and exhausts to move (810.1.c.3: no extra
 *     move is granted). Hopping into an enemy-held field is a real attack (combat follows); hopping
 *     onto an open field conquers it.
 *  5. "this turn": the grant expires at end of turn — after game.advanceTurn() ×2 the unit is back to
 *     a plain unit that cannot hop, while the legend is ready to do it again.
 *  6. Countered/fizzled: if the targeted unit leaves the board in response, the ability resolves doing
 *     nothing — but the [Exhaust] cost stays paid.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-267-298";
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Reaction] Deal 3 to a unit.",
  timing: "reaction",
};

/** P1: legend + a ready 3-Might ally on bf1 (P1's); bf2 is P2's with a 2-Might foe; bf3 is open. */
function board() {
  return scenario()
    .legend(P1, CARD, "bh")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
    .unit(P2, "base", { might: 1, name: "Home Foe" }, "homeFoe");
}

describe("Bounty Hunter (ogn-267-298)", () => {
  test("registry payload: one activated ability — cost {exhaust}, grant Ganking to a unit (any controller) for the turn, no timing keyword", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Miss Fortune", domain: ["body", "chaos"], name: "Bounty Hunter" });
    expect(def?.abilities).toEqual([
      {
        cost: { exhaust: true },
        effect: { duration: "turn", keyword: "Ganking", target: { type: "unit" }, type: "grant-keyword" },
        type: "activated",
      },
    ]);
    expect((def?.abilities?.[0] as { timing?: string }).timing).toBeUndefined();
  });

  test("activating with an empty pool: exhausts the legend at once (cost), puts a targeted ability on the chain, and P2 gets priority before it resolves", async () => {
    const game = await board().build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.p1.activate("bh", undefined, { targets: "ally" });
    expect(game.state("bh").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bh", controller: P1, targets: ["ally"], triggered: false })]);
    expect(game.state("ally").keywords).not.toContain("Ganking"); // nothing granted while it is pending
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("ally").grantedKeywords).toEqual([{ duration: "turn", keyword: "Ganking" }]);
    expect(game.state("ally").keywords).toContain("Ganking");
  });

  test("'a unit' = any unit anywhere: friendly at a battlefield, enemy at a battlefield, enemy in base are all legal targets; granting it to an enemy works", async () => {
    const game = await board().build();
    const targets = game.p1.option("activate", "bh")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["ally"], ["foe"], ["homeFoe"]]));
    await game.p1.activate("bh", undefined, { targets: "foe" });
    await game.settle();
    expect(game.state("foe").keywords).toContain("Ganking");
    expect(game.state("ally").keywords).not.toContain("Ganking");
  });

  test("Ganking in action: the ready ally hops bf1 → enemy bf2 with its standard move (exhausting), fights the 2-Might foe, kills it and conquers", async () => {
    const game = await board().build();
    expect(game.p1.can("gank", "ally")).toBe(false); // no Ganking yet: battlefield → battlefield is illegal
    await game.p1.activate("bh", undefined, { targets: "ally" });
    await game.settle();
    expect(game.p1.option("gank", "ally")?.fields.find((f) => f.arg === "to")?.options).toEqual(expect.arrayContaining(["bf2", "bf3"]));
    await game.p1.gank("ally", "bf2");
    expect(game.state("ally").isExhausted).toBe(true); // it is still the Standard Move (810.1.c.3)
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("hopping onto the OPEN bf3 instead conquers it without a fight; bf1 (now empty) goes uncontrolled at the cleanup (190.4.c)", async () => {
    const game = await board().build();
    await game.p1.activate("bh", undefined, { targets: "ally" });
    await game.settle();
    await game.p1.gank("ally", "bf3");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("battlefield-bf3");
    expect(game.gameState.battlefields.bf3?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.zoneOf("foe")).toBe("battlefield-bf2");
  });

  test("Ganking adds an option, not a move: an EXHAUSTED unit with Ganking still cannot go anywhere", async () => {
    const game = await scenario()
      .legend(P1, CARD, "bh")
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", { might: 3, name: "Tired" }, "tired", { exhausted: true })
      .build();
    await game.p1.activate("bh", undefined, { targets: "tired" });
    await game.settle();
    expect(game.state("tired").keywords).toContain("Ganking");
    expect(game.p1.can("gank", "tired")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "move")).toBe(false);
  });

  test("'this turn': after a full round (P2's turn, back to P1) the grant is gone and the unit can no longer hop — but the legend is ready again (Awaken) and can re-grant it", async () => {
    const game = await board().build();
    await game.p1.activate("bh", undefined, { targets: "ally" });
    await game.settle();
    expect(game.state("ally").keywords).toContain("Ganking");
    await game.advanceTurn(); // → P2
    expect(game.state("ally").grantedKeywords).toEqual([]);
    expect(game.state("bh").isExhausted).toBe(true); // only its controller's Awaken readies it
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("bh").isReady).toBe(true);
    expect(game.state("ally").keywords).not.toContain("Ganking");
    expect(game.p1.can("gank", "ally")).toBe(false);
    expect(game.p1.can("activate", "bh")).toBe(true);
  });

  test("cost edge: an already-exhausted legend offers nothing (403.1.a); once used this turn it cannot be used again", async () => {
    const spent = await scenario().card("bh", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" }).unit(P1, "base", { might: 1 }, "u").build();
    expect(spent.state("bh").isExhausted).toBe(true);
    expect(spent.p1.can("activate", "bh")).toBe(false);
    const game = await board().build();
    await game.p1.activate("bh", undefined, { targets: "ally" });
    await game.settle();
    expect(game.p1.can("activate", "bh")).toBe(false);
  });

  test("no unit anywhere ⇒ no legal target ⇒ the ability is not offered at all", async () => {
    const game = await scenario().legend(P1, CARD, "bh").battlefield("bf1", { controller: P1 }).build();
    expect(game.p1.can("activate", "bh")).toBe(false);
    expect(game.state("bh").isReady).toBe(true);
  });

  test("default speed only (381): not during your own showdown with Focus, not while a chain is open, not on the opponent's turn", async () => {
    const showdown = await board().unit(P1, "base", { might: 4, name: "Raider" }, "raider").autoProcedures(false).build();
    await showdown.p1.move("raider", "bf2");
    const d = showdown.decision() as ActionDecision;
    expect(d).toMatchObject({ context: "showdown", seat: P1 });
    expect(showdown.p1.can("activate", "bh")).toBe(false);

    const chain = await board().resources(P1, { energy: 1 }).hand(P1, BOLT, "bolt").build();
    await chain.p1.cast("bolt", { targets: "foe" });
    expect(chain.chain()).toHaveLength(1);
    expect(chain.p1.can("activate", "bh")).toBe(false);
    await chain.settle();
    expect(chain.p1.can("activate", "bh")).toBe(true); // Neutral Open again

    const oppTurn = await board().active(P2).resources(P2, { energy: 1 }).hand(P2, BOLT, "bolt").build();
    expect(oppTurn.p1.can("activate", "bh")).toBe(false);
    await oppTurn.p2.cast("bolt", { targets: "ally" });
    await oppTurn.p2.passPriority();
    expect(oppTurn.actingSeat()).toBe(P1); // P1 holds priority on P2's chain …
    expect(oppTurn.p1.can("activate", "bh")).toBe(false); // … and still may not use a default-speed ability
  });

  test("target removed in response: P2 bolts the 3-Might ally while the grant is pending — the ally dies, the ability resolves doing nothing, the legend stays exhausted", async () => {
    const game = await board().resources(P2, { energy: 1 }).hand(P2, BOLT, "bolt").build();
    await game.p1.activate("bh", undefined, { targets: "ally" });
    await game.p1.passPriority();
    await game.p2.cast("bolt", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.state("bh").isExhausted).toBe(true);
    expect(game.state("foe").keywords).not.toContain("Ganking"); // nothing was redirected
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
