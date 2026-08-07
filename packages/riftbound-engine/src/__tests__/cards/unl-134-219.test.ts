/**
 * Existential Dread — unl-134-219 · Spell · Chaos · 1 energy + [chaos] · Action
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   [Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)
 *   [Stun] an attacking enemy unit. If it's already stunned, return it to its owner's hand
 *   instead. (A stunned unit doesn't deal combat damage this turn.)
 *
 * Rules: 816 (Action: own turn in an Open state, or whenever you hold Focus in a showdown),
 * 459–461 (Attacker designation exists only inside a combat showdown; the player who moved in is
 * the attacker), 423.1 (Stunned is binary; a stunned unit contributes no combat damage but still
 * takes it; cleared at end of turn), 423.1.a.1 (a stunned unit can be chosen again but is not
 * "stunned again" — this card turns that case into a bounce), 820 (Repeat: optional extra [2] paid
 * while playing; the instruction runs one extra time on resolution; 820.2.a choices may repeat the
 * same unit; 820.3.a still one chain item), 355.8 (no attacking enemy unit → unplayable), 466
 * (attackers that fail to clear the defenders are recalled).
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. "attacking ENEMY unit" only exists while the OPPONENT attacks me — so in practice this is
 *     cast on their turn, inside their combat showdown, once Focus reaches me. On my own attack
 *     the enemy units are defenders → not legal; in an open main phase nothing is attacking.
 *  2. Repeat on the SAME attacker is the signature play: execution 1 stuns it, execution 2 finds
 *     it "already stunned" and returns it to hand — 3 energy + [chaos] answers any one attacker.
 *  3. Repeat split across two attackers stuns both; a lone stunned attacker deals 0, fails to take
 *     the battlefield and is recalled; my small defender survives untouched.
 *  4. A unit that was ALREADY stunned before the spell (e.g. arrived stunned) is bounced by a
 *     single execution — "instead" means it is not (re)stunned.
 *  5. Stun is "this turn": the recalled attacker is no longer stunned on the next turn.
 *  6. Cost edges: 1 + [chaos]; Repeat needs 3 total; repeat: 2 is never legal (one instance).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-134-219";

/** P2's turn; P1 holds bf1 with a 3-Might defender; P2 has a 5 and a 2 in base ready to attack. */
function board(energy = 1, atkMeta?: { stunned?: boolean }, sidekickMight = 2) {
  return scenario()
    .active(P2)
    .resources(P1, { energy, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Defender" }, "def")
    .unit(P2, "base", { might: 5, name: "Attacker" }, "atk", atkMeta)
    .unit(P2, "base", { might: sidekickMight, name: "Sidekick" }, "atk2")
    .unit(P2, "base", { might: 4, name: "StaysHome" }, "lazy")
    .hand(P1, CARD, "dread");
}

describe("Existential Dread (unl-134-219)", () => {
  test("timing + cost: no window in P2's open state nor while P2 holds Focus; once Focus passes P1 casts it for 1 energy + 1 chaos onto the chain", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "dread")).toBe(false); // nothing is attacking; not my turn
    await game.p2.move("atk", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("cast", "dread")).toBe(false); // P2 holds Focus first
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "dread")).toBe(true);
    await game.p1.cast("dread", { targets: "atk" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dread", controller: P1, triggered: false })]);
  });

  test("stuns the attacker: it deals no combat damage, my 3-Might defender is untouched and keeps bf1; the attacker is recalled to base still stunned", async () => {
    const game = await board().build();
    await game.p2.move("atk", "bf1");
    expect(game.state("atk").combatRole).toBe("attacker");
    await game.p2.passFocus();
    await game.p1.cast("dread", { targets: "atk" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // spell resolves inside the showdown
    expect(game.zoneOf("dread")).toBe("trash");
    expect(game.state("atk").isStunned).toBe(true);
    await game.settle(); // combat damage step
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.state("def").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("atk")).toBe("base"); // 466 — failed attackers are recalled
    expect(game.state("atk").isStunned).toBe(true); // still this turn
    expect(game.violations()).toEqual([]);
  });

  test("negative space: without the spell the 5-Might attacker kills the 3-Might defender and conquers bf1", async () => {
    const game = await board().build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf("atk")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("targets: only ATTACKING ENEMY units — both attackers are offered, my defender and the enemy unit that stayed home are not", async () => {
    const game = await board().build();
    await game.p2.move(["atk", "atk2"], "bf1");
    await game.p2.passFocus();
    const targets = game.p1.option("cast", "dread")?.fields.find((f) => f.name === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["atk"], ["atk2"]]));
    for (const bad of ["def", "lazy"]) {
      const r = await game.p1.try((p) => p.cast("dread", { targets: bad }));
      expect(r.ok).toBe(false);
    }
    expect(game.zoneOf("dread")).toBe("hand");
  });

  test("on MY attack the enemy units are defenders, not attackers → not castable in that showdown; nor in my open main phase (355.8)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "TheirDefender" }, "theirDef")
      .unit(P1, "base", { might: 5, name: "MyAttacker" }, "myAtk")
      .hand(P1, CARD, "dread")
      .build();
    expect(game.p1.can("cast", "dread")).toBe(false);
    await game.p1.move("myAtk", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("myAtk").combatRole).toBe("attacker");
    expect(game.state("theirDef").combatRole).toBe("defender");
    expect(game.p1.can("cast", "dread")).toBe(false);
  });

  test("'If it's already stunned, return it to its owner's hand instead' — an attacker that is already stunned is bounced to P2's hand, not left on the battlefield", async () => {
    // Expected: atk (arrived stunned) goes to P2's hand; the combat then has no attacker and my
    // defender keeps bf1. Actual: the conditional clause was not parsed — atk stays at bf1, stunned.
    const game = await board(1, { stunned: true }).build();
    await game.p2.move("atk", "bf1");
    expect(game.state("atk").isStunned).toBe(true);
    await game.p2.passFocus();
    await game.p1.cast("dread", { targets: "atk" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("atk")).toBe("hand");
    expect(game.state("atk").owner).toBe(P2);
    await game.settle();
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Repeat] on the SAME attacker — execution 1 stuns it, execution 2 sees it already stunned and returns it to hand (820.1.d / 820.2.a); costs 3 energy + 1 chaos, one chain item", async () => {
    // Expected: atk ends in P2's hand. Actual: Repeat is charged and the spell resolves, but the
    // second execution just "stuns" again (no-op) — atk stays on bf1.
    const game = await board(3).build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    expect(game.p1.option("cast", "dread")?.fields.find((f) => f.arg === "repeat")?.max).toBe(1);
    await game.p1.cast("dread", { repeat: 1, targets: "atk" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("dread")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("hand");
  });

  test("[Repeat] across TWO attackers (5 and 4 Might): both are stunned, neither deals damage, my 3-Might defender survives on 0 damage, bf1 stays mine, both attackers are recalled", async () => {
    const game = await board(3, undefined, 4).build();
    await game.p2.move(["atk", "atk2"], "bf1");
    await game.p2.passFocus();
    await game.p1.cast("dread", { repeat: 1, targets: ["atk", "atk2"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toHaveLength(1); // 820.3.a — played once
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("atk").isStunned).toBe(true);
    expect(game.state("atk2").isStunned).toBe(true);
    await game.settle();
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.state("def").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("atk")).toBe("base"); // 3 damage cannot kill either attacker
    expect(game.locationOf("atk2")).toBe("base");
  });

  test("a stunned unit still TAKES combat damage (423.1.c): the lone 2-Might attacker, stunned by Dread, dies to my 3-Might defender who takes nothing", async () => {
    const game = await board().build();
    await game.p2.move("atk2", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("dread", { targets: "atk2" });
    await game.settle();
    expect(game.zoneOf("atk2")).toBe("trash");
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.state("def").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Repeat] cost edges: with 2 energy Repeat is not offered and repeat:1 is refused (spell stays in hand); repeat:2 is never legal (820.1.c.3)", async () => {
    const two = await board(2).build();
    await two.p2.move("atk", "bf1");
    await two.p2.passFocus();
    expect(two.p1.option("cast", "dread")?.fields.some((f) => f.arg === "repeat")).toBe(false);
    const r = await two.p1.try((p) => p.cast("dread", { repeat: 1, targets: "atk" }));
    expect(r.ok).toBe(false);
    expect(two.zoneOf("dread")).toBe("hand");
    expect(two.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
    const rich = await board(9).build();
    await rich.p2.move("atk", "bf1");
    await rich.p2.passFocus();
    const twice = await rich.p1.try((p) => p.cast("dread", { repeat: 2, targets: "atk" }));
    expect(twice.ok).toBe(false);
    expect(rich.zoneOf("dread")).toBe("hand");
  });

  test("unaffordable: 1 energy but no chaos power → not offered even with a legal attacker", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "def")
      .unit(P2, "base", { might: 5 }, "atk")
      .hand(P1, CARD, "dread")
      .build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "dread")).toBe(false);
  });

  test("the stun is 'this turn' (423.1.a.2): after P2's turn ends the recalled attacker is no longer stunned", async () => {
    const game = await board().build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("dread", { targets: "atk" });
    await game.settle();
    expect(game.state("atk").isStunned).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("atk").isStunned).toBe(false);
    expect(game.locationOf("atk")).toBe("base");
  });

  test("registry payload should carry the conditional bounce — action spell, Repeat [2], stun an attacking enemy unit ELSE (already stunned) return it to its owner's hand", async () => {
    // Expected: the effect encodes both branches (stun / return-to-hand when already stunned).
    // Actual: only { type: "stun", target: enemy attacking unit } — the "instead" clause is dropped.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "chaos", energyCost: 1, powerCost: ["chaos"], timing: "action" });
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as { type: string; timing?: string; repeat?: unknown; effect?: unknown };
    expect(ability).toMatchObject({ repeat: { energy: 2 }, timing: "action", type: "spell" });
    const json = JSON.stringify(ability.effect);
    expect(json).toContain('"stun"');
    expect(json).toContain('"enemy"');
    expect(json).toContain('"attacking"');
    expect(json).toMatch(/return-to-hand|"hand"/);
    expect(json).toMatch(/stunned/); // the "if it's already stunned" condition
  });
});
