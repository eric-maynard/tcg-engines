/**
 * Eye of Twilight — ven-193-166 · Legend (Shen) · Calm/Order
 *
 *   [Action][>] [Exhaust]: Give a friendly unit [Tank] this turn.
 *
 * Head-judge checklist (the tricky spots for THIS card):
 *  1. [Action] on an ability (806.1.c.2): usable in a Neutral Open state on your turn AND during a
 *     showdown on ANY player's turn while you hold Focus — the classic use is as the DEFENDER, after
 *     the attacker passes Focus, before combat damage. It is NOT [Reaction]: never inside a Closed
 *     state (a chain is pending), and never on the opponent's turn outside a showdown (316.5.b).
 *  2. "a friendly unit": enemy units are never offered; with no friendly unit on the board there is
 *     no legal target and the ability cannot be activated. Cost is only [Exhaust] (0 energy works; an
 *     exhausted legend cannot pay).
 *  3. What Tank does (815): lethal damage must be assigned to the Tank first. Given to the BIG defender
 *     it soaks a 3-Might attacker so the 2-Might blocker beside it lives (control: without Tank the
 *     engine's default assignment kills the small one). Same on offence.
 *  4. The ability uses the chain (377.3): the legend exhausts on activation, the opponent gets
 *     priority, the keyword appears only on resolution; the showdown then continues (Focus passes) and
 *     combat resolves with Tank live.
 *  5. "this turn" — gone after the turn ends; the legend readies in its controller's Awaken step,
 *     so a defensive use on P2's turn still leaves it ready for P1's own next turn.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-193-166";
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Reaction] Deal 2 to a unit.",
  timing: "reaction",
};

/** P2 to act: a 3-Might raider in P2's base; P1 defends bf1 with Small (2) listed first and Big (4). */
function defence() {
  return scenario()
    .active(P2)
    .legend(P1, CARD, "eye")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Small" }, "small")
    .unit(P1, "bf1", { might: 4, name: "Big" }, "big")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
}

describe("Eye of Twilight (ven-193-166)", () => {
  test("registry payload: one [Action] activated ability — cost {exhaust}, grant Tank (this turn) to a FRIENDLY unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", domain: ["calm", "order"], name: "Eye of Twilight" });
    expect(def?.abilities).toEqual([
      {
        cost: { exhaust: true },
        effect: { duration: "turn", keyword: "Tank", target: { controller: "friendly", type: "unit" }, type: "grant-keyword" },
        timing: "action",
        type: "activated",
      },
    ]);
  });

  test("own turn, Neutral Open, empty pool: exhausts the legend, goes on the chain with its target, P2 gets priority, Tank lands on resolution", async () => {
    const game = await scenario().legend(P1, CARD, "eye").unit(P1, "base", { might: 2, name: "Ally" }, "ally").build();
    await game.p1.activate("eye", undefined, { targets: "ally" });
    expect(game.state("eye").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "eye", controller: P1, targets: ["ally"], triggered: false })]);
    expect(game.state("ally").keywords).not.toContain("Tank");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.state("ally").grantedKeywords).toEqual([{ duration: "turn", keyword: "Tank" }]);
    expect(game.state("ally").keywords).toContain("Tank");
  });

  test("'a friendly unit': enemy units are not offered and cannot be named; no friendly unit ⇒ not activatable", async () => {
    const game = await scenario()
      .legend(P1, CARD, "eye")
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .unit(P2, "base", { might: 1, name: "Home Foe" }, "homeFoe")
      .build();
    expect(game.p1.option("activate", "eye")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["ally"]]);
    expect((await game.p1.try((p) => p.activate("eye", undefined, { targets: "foe" }))).ok).toBe(false);
    expect(game.state("eye").isReady).toBe(true);
    const alone = await scenario().legend(P1, CARD, "eye").unit(P2, "base", { might: 1 }, "foe").build();
    expect(alone.p1.can("activate", "eye")).toBe(false);
  });

  test("control (no Tank): a 3-Might raider into {Small 2, Big 4} — the default assignment kills Small", async () => {
    const game = await defence().build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 2 + 4 ≥ 3
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.locationOf("big")).toBe("bf1");
  });

  test("[Action] as the DEFENDER on P2's turn: after the attacker passes Focus, P1 gives Big Tank; all 3 damage must go to Big (815) — Small survives, raider dies, bf1 held", async () => {
    const game = await defence().build();
    expect(game.p1.can("activate", "eye")).toBe(false); // P2's Neutral Open: only the turn player acts (316.5.b)
    await game.p2.move("raider", "bf1");
    expect(game.p1.can("activate", "eye")).toBe(false); // the attacker holds Focus first
    await game.p2.passFocus();
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("activate", "eye")).toBe(true);
    await game.p1.activate("eye", undefined, { targets: "big" });
    expect(game.state("eye").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "eye", targets: ["big"] })]);
    await game.settle(); // chain resolves, focus passes around, combat resolves
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("small")).toBe("bf1");
    expect(game.locationOf("big")).toBe("bf1");
    expect(game.state("big").damage).toBe(0); // 3 < 4, healed in the combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("[Action] on offence during your own showdown: Tank on the 4-Might attacker spares the 1-Might squire attacking beside it into a 3-Might defender", async () => {
    const game = await scenario()
      .legend(P1, CARD, "eye")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 1, name: "Squire" }, "squire")
      .unit(P1, "base", { might: 4, name: "Knight" }, "knight")
      .build();
    await game.p1.move(["squire", "knight"], "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p1.activate("eye", undefined, { targets: "knight" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("squire")).toBe("bf1");
    expect(game.locationOf("knight")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("[Action] is not [Reaction]: illegal while a chain is open — on your own turn, and when holding priority on the opponent's chain", async () => {
    const own = await scenario().legend(P1, CARD, "eye").resources(P1, { energy: 1 }).unit(P1, "base", { might: 3, name: "Ally" }, "ally").hand(P1, BOLT, "bolt").build();
    await own.p1.cast("bolt", { targets: "ally" });
    expect(own.chain()).toHaveLength(1);
    expect(own.p1.can("activate", "eye")).toBe(false);
    await own.settle();
    expect(own.p1.can("activate", "eye")).toBe(true);

    const opp = await defence().resources(P2, { energy: 1 }).hand(P2, BOLT, "bolt").build();
    await opp.p2.cast("bolt", { targets: "small" });
    await opp.p2.passPriority();
    expect(opp.actingSeat()).toBe(P1);
    expect(opp.p1.can("activate", "eye")).toBe(false);
  });

  test("cost edge: an exhausted legend cannot pay [Exhaust] — nothing offered even mid-showdown with Focus", async () => {
    const game = await scenario()
      .active(P2)
      .card("eye", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Big" }, "big")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "eye")).toBe(false);
  });

  test("'this turn' + Awaken: used defensively on P2's turn, the Tank grant is gone once P1's turn starts and the legend is ready again", async () => {
    const game = await defence().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.activate("eye", undefined, { targets: "big" });
    await game.settle();
    expect(game.state("big").keywords).toContain("Tank");
    expect(game.state("eye").isExhausted).toBe(true);
    await game.advanceTurn(); // P2 ends → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("big").grantedKeywords).toEqual([]);
    expect(game.state("big").keywords).not.toContain("Tank");
    expect(game.state("eye").isReady).toBe(true);
    expect(game.p1.can("activate", "eye")).toBe(true);
  });

  test("once per ready-cycle: after one use this turn the exhausted legend offers nothing more", async () => {
    const game = await scenario().legend(P1, CARD, "eye").unit(P1, "base", { might: 2 }, "a").unit(P1, "base", { might: 2 }, "b").build();
    await game.p1.activate("eye", undefined, { targets: "a" });
    await game.settle();
    expect(game.p1.can("activate", "eye")).toBe(false);
    expect(game.state("b").keywords).not.toContain("Tank");
  });
});
