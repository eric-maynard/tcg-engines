/**
 * Arena Kingpin — unl-001-219 · Unit · Fury · 5 energy (no power) · 3 Might
 *
 *   I enter ready.
 *   [Exhaust]: Give a unit +3 [Might] this turn.
 *
 * Rules: 143.4 + 369.3 ("I enter ready" replaces the default exhausted entry), 377 (activated ability:
 * cost paid on activation — he exhausts at once — effect on resolution via the chain, so the opponent
 * gets priority first), 145.2 (a unit's activated ability with no [Action]/[Reaction] may only be
 * activated in its controller's Main Phase in an Open state: not in showdowns, not with a chain open,
 * not on the opponent's turn), 355 ("a unit" = ANY unit on the board: himself, a friend, or an enemy,
 * base or battlefield), 317 ("this turn" ends in the Expiration Step), 144 (an exhausted unit cannot
 * take the Standard Move).
 *
 * Head-judge notes — trickiest situations for this card:
 *  - Entering ready is what makes the pump usable the turn he lands — and, alternatively, lets him
 *    attack immediately; but [Exhaust] is a real trade-off: pump OR move, not both.
 *  - Pre-combat pump: +3 on a 2-Might ally in the Open state, then send the ally into a 4-Might defender
 *    → the ally wins 5 vs 4. Trying the same DURING the showdown is illegal (no [Action]).
 *  - "a unit" includes enemy units and himself; +3 stacks on top of a buff.
 *  - Exhausted (already used / just moved) → cannot activate; readies at your next Awaken; the +3 is
 *    gone by then.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-001-219";

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "base", CARD, "kp");
}

const targetsOf = (game: { p1: { option: (v: string, c?: string) => { fields: readonly { arg: string; options?: readonly unknown[] }[] } | undefined } }) =>
  (game.p1.option("activate", "kp")?.fields.find((f) => f.arg === "targets")?.options ?? []).map((o) => (o as string[])[0]).sort();

describe("Arena Kingpin (unl-001-219)", () => {
  test("cost: 5 energy, no power; 3-Might unit; unaffordable at 4 energy", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "kp").build();
    await game.p1.play("kp");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("kp")).toBe("base");
    expect(game.state("kp")).toMatchObject({ baseMight: 3, might: 3 });
    const poor = await scenario().resources(P1, { energy: 4, power: { fury: 3 } }).hand(P1, CARD, "kp").build();
    expect(poor.p1.can("play", "kp")).toBe(false);
  });

  test("'I enter ready.' — played from hand to base he is ready (no trigger, nothing on the chain); also ready when played to a battlefield you control", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "kp").build();
    await game.p1.play("kp");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.state("kp").isReady).toBe(true);
    const toBf = await scenario().resources(P1, { energy: 5 }).battlefield("own", { controller: P1 }).hand(P1, CARD, "kp").build();
    await toBf.p1.play("kp", { to: "own" });
    await toBf.settle();
    expect(toBf.zoneOf("kp")).toBe("battlefield-own");
    expect(toBf.state("kp").isReady).toBe(true);
  });

  test("entering ready makes the [Exhaust] ability usable the very turn he is played: +3 on Ally (2 → 5) after the chain resolves", async () => {
    const fresh = await scenario().resources(P1, { energy: 5 }).unit(P1, "base", { might: 2, name: "Ally" }, "ally").hand(P1, CARD, "kp").build();
    await fresh.p1.play("kp");
    await fresh.settle();
    expect(fresh.p1.can("activate", "kp")).toBe(true);
    await fresh.p1.activate("kp", undefined, { targets: "ally" });
    expect(fresh.state("kp").isExhausted).toBe(true); // cost paid immediately (377)
    expect(fresh.chain()).toEqual([expect.objectContaining({ cardId: "kp", controller: P1, triggered: false })]);
    expect(fresh.state("ally").might).toBe(2); // effect waits for resolution
    await fresh.settle();
    expect(fresh.state("ally")).toMatchObject({ might: 5, mightModifier: 3 });
    expect(fresh.violations()).toEqual([]);
  });

  test("the opponent receives priority on the ability before the +3 lands", async () => {
    const game = await board().build();
    await game.p1.activate("kp", undefined, { targets: "ally" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.state("ally").might).toBe(2);
    await game.p2.passPriority();
    expect(game.state("ally").might).toBe(5);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'a unit' = ANY unit: himself, a friendly unit in base, or an ENEMY unit at a battlefield are all offered; pumping the enemy Wall really gives it +3", async () => {
    const game = await board().build();
    expect(targetsOf(game)).toEqual(["ally", "kp", "wall"]);
    await game.p1.activate("kp", undefined, { targets: "wall" });
    await game.settle();
    expect(game.state("wall").might).toBe(7);
    const self = await board().build();
    await self.p1.activate("kp", undefined, { targets: "kp" });
    await self.settle();
    expect(self.state("kp")).toMatchObject({ isExhausted: true, might: 6 });
  });

  test("'this turn': the +3 expires at end of turn; the Kingpin stays exhausted through the opponent's turn and readies at your next Awaken", async () => {
    const game = await board().build();
    await game.p1.activate("kp", undefined, { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(5);
    await game.advanceTurn(); // → P2
    expect(game.state("ally").might).toBe(2);
    expect(game.state("kp").isExhausted).toBe(true);
    await game.advanceTurn(); // → P1
    expect(game.state("kp").isReady).toBe(true);
    expect(game.p1.can("activate", "kp")).toBe(true);
  });

  test("[Exhaust] is a cost: an already-exhausted Kingpin cannot activate (once per ready), and having exhausted himself he can no longer take the Standard Move", async () => {
    const game = await board().build();
    expect((await board().build()).p1.try((p) => p.move("kp", "bf1"))).resolves.toMatchObject({ ok: true }); // control: ready → may move
    await game.p1.activate("kp", undefined, { targets: "ally" });
    await game.settle();
    expect(game.p1.can("activate", "kp")).toBe(false);
    const r = await game.p1.try((p) => p.move("kp", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("kp")).toBe("base");
    const tapped = await scenario().unit(P1, "base", { might: 2 }, "ally").unit(P1, "base", CARD, "kp", { exhausted: true }).build();
    expect(tapped.p1.can("activate", "kp")).toBe(false);
  });

  test("the trade-off the other way: moving him first (he entered ready, so he may) exhausts him and the pump is off for the turn", async () => {
    const game = await scenario().battlefield("open", { controller: null }).unit(P1, "base", CARD, "kp").unit(P1, "base", { might: 2 }, "ally").build();
    await game.p1.move("kp", "open");
    await game.settle();
    expect(game.locationOf("kp")).toBe("open");
    expect(game.state("kp").isExhausted).toBe(true);
    expect(game.p1.can("activate", "kp")).toBe(false);
  });

  test("pre-combat pump in the Open state, then attack: Ally 2+3 = 5 into the 4-Might Wall → Wall dies, Ally survives and conquers", async () => {
    const game = await board().build();
    await game.p1.activate("kp", undefined, { targets: "ally" });
    await game.settle();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("ally").damage).toBe(0); // 4 < 5, healed in the combat cleanup
  });

  test("negative space: the same attack without the pump — Ally (2) dies to the Wall (4)", async () => {
    const game = await board().build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("145.2 timing — no [Action]: NOT activatable during your own combat showdown (too late to pump once the attack is declared)", async () => {
    const game = await board().build();
    await game.p1.move("ally", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "kp")).toBe(false);
  });

  test("145.2 timing — no [Reaction]: NOT activatable while a chain is open (even your own spell's), nor on the opponent's turn (Open state or their showdown with Focus passed to you)", async () => {
    const spark = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 0, name: "Spark", timing: "action" };
    const own = await board().hand(P1, spark, "spark").build();
    await own.p1.cast("spark", { targets: "wall" });
    expect((own.decision() as ActionDecision).context).toBe("chain");
    expect(own.p1.can("activate", "kp")).toBe(false);

    const opp = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 2 }, "ally").unit(P1, "base", CARD, "kp").unit(P2, "base", { might: 4 }, "raider").build();
    expect(opp.p1.can("activate", "kp")).toBe(false);
    await opp.p2.move("raider", "bf1");
    await opp.p2.passFocus();
    expect(opp.actingSeat()).toBe(P1);
    expect(opp.p1.can("activate", "kp")).toBe(false);
  });

  test("+3 stacks with a buff: a buffed 2(+1)=3 Ally becomes 6", async () => {
    const game = await scenario().unit(P1, "base", { might: 2, name: "Ally" }, "ally", { buffed: true }).unit(P1, "base", CARD, "kp").build();
    expect(game.state("ally").might).toBe(3);
    await game.p1.activate("kp", undefined, { targets: "ally" });
    await game.settle();
    expect(game.state("ally")).toMatchObject({ isBuffed: true, might: 6 });
  });

  test("parsed abilities match the printed text: an unconditional static enter-ready + an [Exhaust]-cost activated '+3 Might to a unit this turn' (no Action/Reaction timing)", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 5, might: 3, name: "Arena Kingpin" });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ effect: { target: "self", type: "enter-ready" }, type: "static" });
    expect(abilities[0]?.condition).toBeUndefined();
    expect(abilities[1]).toMatchObject({
      cost: { exhaust: true },
      effect: { amount: 3, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      type: "activated",
    });
    expect((abilities[1]?.effect as { target: Record<string, unknown> }).target.controller).toBeUndefined(); // "a unit", either side
    expect(abilities[1]?.timing).not.toBe("action");
    expect(abilities[1]?.timing).not.toBe("reaction");
  });
});
