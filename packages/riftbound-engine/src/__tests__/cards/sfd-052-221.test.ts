/**
 * Heart of Dark Ice — sfd-052-221 · Gear · Calm · 3 energy + [calm]
 *
 *   [Exhaust]: Give a unit +3 [Might] this turn.
 *
 * Rules: 149.1 / 359.2.d (gear enters Ready → usable the turn it is played), 151.2 / 381 (a gear's
 * activated ability: only on its controller's turn, Neutral Open state, not in showdowns — it has
 * no [Action]/[Reaction]), 377.3 (activated abilities use the chain: the [Exhaust] cost is paid on
 * activation, opponents may respond, then it resolves), 355.5/355.8 (the unit is a target chosen
 * on activation; no unit → cannot activate), 359.3.e.4-5 (target that left the board is illegal →
 * the instruction is skipped, cost stays paid), 317.2.c ("this turn" expires in the Expiration
 * Step), 515 Awaken (readies at the start of its controller's turn).
 *
 * Head-judge corner cases considered:
 *   - play (3 + calm) and activate in the same turn; the activation itself costs no resources;
 *   - the ability sits on the chain with the gear already exhausted; P2 gets priority and can Gust
 *     the chosen 2-Might unit to hand → nothing is pumped, Heart stays exhausted (no refund);
 *   - +3 is a modifier (not a buff), stacks with Feral Strength (+2) on the same unit → 2+3+2 = 7;
 *   - not activatable: while exhausted, with no unit on the board (and must not self-exhaust),
 *     during a showdown on your own turn, or on the opponent's turn inside their chain;
 *   - readies at your next Awaken and the +3 from last turn is gone by then;
 *   - real combat: a 2-Might attacker pumped to 5 beats a 4-Might defender and conquers.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-052-221";
const GUST = "ogn-169-298"; // [Reaction] 1 energy: return a unit at a battlefield with 3 Might or less to hand
const FERAL_STRENGTH = "sfd-034-221"; // [Reaction] 2 energy: give a unit +2 Might this turn
const CLEAVE = "ogn-004-298"; // [Action] 1 energy spell P2 casts to open a chain on their turn

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .gear(P1, CARD, "heart")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe");
}

describe("Heart of Dark Ice (sfd-052-221)", () => {
  test("costs 3 energy + 1 calm to play; enters the base READY (149.1) and can be activated the same turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, CARD, "heart")
      .build();
    await game.p1.play("heart");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("heart")).toBe("base");
    expect(game.p1.gear()).toContain("heart");
    expect(game.state("heart").isReady).toBe(true);
    expect(game.p1.can("activate", "heart")).toBe(true);
    await game.p1.activate("heart", 0, { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(5);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } }); // activation is free
  });

  test("unaffordable with 3 energy and no calm power, or with calm but only 2 energy", async () => {
    const noCalm = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "heart").build();
    expect(noCalm.p1.can("play", "heart")).toBe(false);
    const wrongDomain = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "heart").build();
    expect(wrongDomain.p1.can("play", "heart")).toBe(false);
    const short = await scenario().resources(P1, { energy: 2, power: { calm: 1 } }).hand(P1, CARD, "heart").build();
    expect(short.p1.can("play", "heart")).toBe(false);
  });

  test("[Exhaust]: exhausts on activation, the ability goes on the chain (377.3), then the chosen unit gets +3 (a modifier, not a buff)", async () => {
    const game = await board().build();
    await game.p1.activate("heart", 0, { targets: "ally" });
    expect(game.state("heart").isExhausted).toBe(true); // cost paid up front
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "heart", controller: P1 })]);
    expect(game.state("ally").might).toBe(2); // not resolved yet
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("ally")).toMatchObject({ baseMight: 2, isBuffed: false, might: 5, mightModifier: 3 });
    expect(game.state("foe").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("'a unit': an enemy unit is a legal choice too", async () => {
    const game = await board().build();
    await game.p1.activate("heart", 0, { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(7);
    expect(game.state("ally").might).toBe(2);
  });

  test("'this turn': the +3 expires in the Expiration Step; the gear stays exhausted through the opponent's turn and readies at your Awaken", async () => {
    const game = await board().build();
    await game.p1.activate("heart", 0, { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(5);
    await game.advanceTurn(); // → P2's turn
    expect(game.state("ally").might).toBe(2);
    expect(game.state("heart").isExhausted).toBe(true); // only YOUR Awaken readies it
    await game.advanceTurn(); // → P1's turn again
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("heart").isReady).toBe(true);
    expect(game.state("ally").might).toBe(2);
    expect(game.p1.can("activate", "heart")).toBe(true);
  });

  test("cannot be activated while exhausted; nothing changes", async () => {
    const game = await board().build();
    await game.p1.activate("heart", 0, { targets: "ally" });
    await game.settle();
    expect(game.p1.can("activate", "heart")).toBe(false);
    const r = await game.p1.try((p) => p.activate("heart", 0, { targets: "ally" }));
    expect(r.ok).toBe(false);
    expect(game.state("ally").might).toBe(5);
    const pre = await scenario().gear(P1, CARD, "heart", { exhausted: true }).unit(P1, "base", { might: 2 }, "ally").build();
    expect(pre.p1.can("activate", "heart")).toBe(false);
  });

  test("no unit anywhere → the ability cannot be activated (355.8) and the gear must not exhaust itself", async () => {
    const game = await scenario().gear(P1, CARD, "heart").build();
    expect(game.p1.can("activate", "heart")).toBe(false);
    const r = await game.p1.try((p) => p.activate("heart", 0));
    expect(r.ok).toBe(false);
    expect(game.state("heart").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("timing (151.2 / 381): not during a showdown on your own turn, not on the opponent's turn even inside their chain", async () => {
    const own = await board().unit(P1, "base", { might: 3, name: "Runner" }, "runner").build();
    await own.p1.move("runner", "bf1");
    expect((own.decision() as ActionDecision).context).toBe("showdown");
    expect(own.actingSeat()).toBe(P1); // attacker has Focus
    expect(own.p1.can("activate", "heart")).toBe(false);

    const theirs = await board().active(P2).resources(P2, { energy: 1 }).hand(P2, CLEAVE, "cleave").build();
    expect(theirs.p1.can("activate", "heart")).toBe(false); // their Neutral Open state
    await theirs.p2.cast("cleave", { targets: "foe" });
    if (theirs.actingSeat() === P2) {
      await theirs.p2.passPriority();
    }
    expect(theirs.actingSeat()).toBe(P1);
    expect((theirs.decision() as ActionDecision).context).toBe("chain");
    expect(theirs.p1.can("activate", "heart")).toBe(false); // no [Reaction]
  });

  test("uses the chain: P2 may respond — Gust returns the chosen 2-Might unit to hand, so nothing is pumped and Heart stays exhausted (359.3.e.4-5)", async () => {
    const game = await scenario()
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .gear(P1, CARD, "heart")
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
      .unit(P1, "bf1", { might: 3, name: "Buddy" }, "buddy")
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.activate("heart", 0, { targets: "ally" });
    expect(game.chain()).toHaveLength(1);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["heart", "gust"]);
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.state("ally").mightModifier).toBe(0);
    expect(game.state("buddy").might).toBe(3); // the +3 does not jump to another unit
    expect(game.state("heart").isExhausted).toBe(true); // cost is not refunded
    expect(game.chain()).toEqual([]);
  });

  test("right after activation exactly one seat should hold priority — the engine offers priority-class moves to BOTH players", async () => {
    // Expected: activating puts the ability on the chain and a single player has priority (the
    // singleDecisionCursor invariant stays clean). Actual: at seq 1 both player-1 and player-2
    // have legal priority-class moves while a P2 Reaction is in hand.
    const game = await scenario()
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .gear(P1, CARD, "heart")
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.activate("heart", 0, { targets: "ally" });
    await game.settle();
    expect(game.violations()).toEqual([]);
  });

  test("stacks with Feral Strength on the same unit: 2 base + 3 + 2 = 7, all gone next turn", async () => {
    const game = await board().resources(P1, { energy: 2 }).hand(P1, FERAL_STRENGTH, "fs").build();
    await game.p1.activate("heart", 0, { targets: "ally" });
    await game.settle();
    await game.p1.cast("fs", { targets: "ally" });
    await game.settle();
    expect(game.state("ally")).toMatchObject({ isBuffed: false, might: 7, mightModifier: 5 });
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2);
  });

  test("real combat: the 2-Might attacker pumped to 5 kills the 4-Might defender and conquers bf1", async () => {
    const game = await board().build();
    await game.p1.activate("heart", 0, { targets: "ally" });
    await game.settle();
    await game.p1.move("ally", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // 5 ≥ 4
    expect(game.zoneOf("ally")).toBe("battlefield-bf1"); // 4 damage < 5 Might
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("negative space: without the pump the same attack loses (2 < 4) and bf1 stays with P2", async () => {
    const game = await board().build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("parsed abilities: exactly one activated [Exhaust] ability, no timing keyword, +3 might this turn to a unit; cost 3 + [calm]", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "calm", energyCost: 3 });
    expect(def?.powerCost).toEqual(["calm"]);
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as Record<string, unknown>;
    expect(ability).toMatchObject({
      cost: { exhaust: true },
      effect: { amount: 3, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      type: "activated",
    });
    expect(ability.timing).toBeUndefined();
    expect((ability.cost as Record<string, unknown>).energy ?? 0).toBe(0);
  });
});
