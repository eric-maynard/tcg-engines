/**
 * Skyward Strike — unl-038-219 · Spell · Calm · 2 energy + [calm] · no [Action]/[Reaction] printed
 *
 *   Move an enemy unit.
 *   [Level 6][>] [Stun] an enemy unit. (While you have 6+ XP, get the effect. A stunned unit
 *   doesn't deal combat damage this turn.)
 *
 * Rules: 155 (a spell with no timing keyword is played only in an Open state, outside showdowns,
 * on your turn), 449/450 (an effect-move: the spell names the destination restrictions — none
 * here, so any other location; the destination becomes Contested for the MOVED UNIT's controller,
 * not the caster), 824 (Level N: the dependent text is active only while the controller has N+ XP),
 * 423 (Stun: binary; a stunned unit contributes no might to combat damage, can still die, and
 * loses the status in the end-of-turn cleanup), 355.5 (both "an enemy unit" are choices made by
 * the caster; they are independent — the stunned unit may be the moved one or another).
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. Destination is the caster's choice but must be a real move: the unit's current location is
 *     never offered; base ↔ battlefield both directions work.
 *  2. Only ENEMY units: friendly units are not legal targets; with no enemy unit on the board the
 *     spell cannot be played at all (no legal choice, 355.5).
 *  3. Level gate is exact: 5 XP → move only, no stun prompt, nobody stunned; 6 XP → move AND stun.
 *  4. The stun is a second, independent enemy-unit choice (may differ from the moved unit).
 *  5. Stun semantics end-to-end: the stunned unit deals no combat damage this turn but still takes
 *     lethal; the status is gone after the turn ends.
 *  6. Timing: not castable on the opponent's turn nor inside a showdown you have Focus in.
 *  7. Cost: 2 energy AND one calm power; either short → not legal.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-038-219";

function board(xp = 0) {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .xp(P1, xp)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, CARD, "ss");
}

const targetOptions = (game: Game) => game.p1.option("cast", "ss")?.fields.find((f) => f.arg === "targets")?.options ?? [];

/** Cast at foe, answer the destination prompt with `dest`, settle. */
async function castAndMove(game: Game, target: string, dest: string): Promise<void> {
  await game.p1.cast("ss", { targets: target });
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick(dest);
  await game.settle();
}

describe("Skyward Strike (unl-038-219)", () => {
  test("registry payload: 2 energy + [calm] spell; clause 1 = move an ENEMY unit (caster picks where); clause 2 = Level-6-gated stun of an ENEMY unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "calm", energyCost: 2, name: "Skyward Strike" });
    expect(def?.powerCost).toEqual(["calm"]);
    expect(def?.timing).toBe("standard"); // no [Action]/[Reaction] in the printed text
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ effect: { target: { controller: "enemy", type: "unit" }, to: "choose", type: "move" }, type: "spell" });
    expect(abilities[1]).toMatchObject({
      condition: { threshold: 6, type: "while-level" },
      effect: { target: { controller: "enemy", type: "unit" }, type: "stun" },
      type: "spell",
    });
  });

  test("cost: 2 energy + 1 calm are deducted on cast; the spell ends in the trash; short on either resource → not legal", async () => {
    const game = await board().build();
    await game.p1.cast("ss", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("ss")).toBe("chain");
    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("ss")).toBe("trash");
    expect((await board().resources(P1, { energy: 2, power: { calm: 0, fury: 2 } }).build()).p1.can("cast", "ss")).toBe(false);
    expect((await board().resources(P1, { energy: 1, power: { calm: 1 } }).build()).p1.can("cast", "ss")).toBe(false);
  });

  test("clause 1: moves the chosen enemy unit from its battlefield to its owner's base — it stays the opponent's unit, undamaged, not stunned", async () => {
    const game = await board().build();
    await castAndMove(game, "foe", "base");
    expect(game.locationOf("foe")).toBe("base");
    expect(game.state("foe")).toMatchObject({ controller: P2, damage: 0, isStunned: false, owner: P2 });
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("destination is a real move: the unit's current location is not offered; battlefield → other battlefield and base → battlefield both work", async () => {
    const game = await board().build();
    await game.p1.cast("ss", { targets: "foe" });
    await game.settle();
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toEqual(expect.arrayContaining(["base", "battlefield-bf2"]));
    expect(keys).not.toContain("battlefield-bf1");
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.locationOf("foe")).toBe("bf2");

    const fromBase = await board().build();
    await fromBase.p1.cast("ss", { targets: "home" });
    await fromBase.settle();
    const k2 = fromBase.decision()?.kind === "pick" ? (fromBase.decision() as { options: { key: string }[] }).options.map((o) => o.key) : [];
    expect(k2).not.toContain("base");
    await fromBase.p1.pick("battlefield-bf2");
    await fromBase.settle();
    expect(fromBase.locationOf("home")).toBe("bf2");
  });

  test("rule 450: pushing an enemy unit onto an uncontrolled battlefield contests it for ITS controller (P2), never for the caster — P2 ends up controlling bf2", async () => {
    const game = await board().build();
    await castAndMove(game, "home", "battlefield-bf2");
    await game.settle(); // the Cleanup-begun showdown is handed back once, then closes
    expect(game.gameState.battlefields.bf2?.contestedBy).not.toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("targets only ENEMY units: exactly foe + home are offered, the friendly Ally is rejected; no enemy unit at all → not castable", async () => {
    const game = await board().build();
    expect(targetOptions(game)).toHaveLength(2);
    expect(targetOptions(game)).toEqual(expect.arrayContaining([["foe"], ["home"]]));
    const r = await game.p1.try((p) => p.cast("ss", { targets: "ally" }));
    expect(!r.ok && r.error.code).toBe("ILLEGAL_ARGS");
    const lonely = await scenario().resources(P1, { energy: 2, power: { calm: 1 } }).unit(P1, "base", { might: 1 }, "a").hand(P1, CARD, "ss").build();
    expect(lonely.p1.can("cast", "ss")).toBe(false);
  });

  test("Level gate, negative side: at 5 XP only the move happens — no stun prompt, no enemy unit is stunned", async () => {
    const game = await board(5).build();
    await castAndMove(game, "foe", "base");
    expect(game.locationOf("foe")).toBe("base");
    expect(game.state("foe").isStunned).toBe(false);
    expect(game.state("home").isStunned).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("[Level 6] at 6 XP the spell ALSO stuns an enemy unit — the moved unit itself may be chosen (824.1.c, 423)", async () => {
    // Expected: with 6 XP a second enemy-unit choice exists (at cast time or on resolution) and foe ends moved AND stunned.
    // Actual: the engine resolves only the first spell ability; the Level-6 stun clause is never offered.
    const game = await board(6).build();
    const twoTargets = await game.p1.try((p) => p.cast("ss", { targets: ["foe", "foe"] }));
    if (!twoTargets.ok) {
      await game.p1.cast("ss", { targets: "foe" });
    }
    // Drain: destination → base; any further pick naming enemy units is the stun choice → foe.
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || d?.kind !== "pick" || d.seat !== P1) {
        break;
      }
      const keys = d.options.map((o) => o.card ?? o.key);
      await game.p1.pick(keys.includes("base") ? "base" : "foe");
    }
    expect(game.locationOf("foe")).toBe("base");
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.state("home").isStunned).toBe(false);
  });

  test("[Level 6] the stun is an independent choice — move Foe, stun Homebody; Homebody then deals no combat damage but still dies to lethal; stun clears at end of turn", async () => {
    // Expected: home stunned (foe not); Ally (2) attacking home (2, stunned) at bf2 takes 0 damage and kills it;
    // after the turn passes nothing is stunned any more (423.1.a.2). Actual: no stun clause at all.
    const game = await board(6).build();
    const two = await game.p1.try((p) => p.cast("ss", { targets: ["home", "home"] }));
    if (!two.ok) {
      await game.p1.cast("ss", { targets: "home" });
    }
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || d?.kind !== "pick" || d.seat !== P1) {
        break;
      }
      const keys = d.options.map((o) => o.card ?? o.key);
      await game.p1.pick(keys.includes("battlefield-bf2") ? "battlefield-bf2" : "home");
    }
    await game.settle(); // close the uncontested showdown P2's arrival opened at bf2
    expect(game.locationOf("home")).toBe("bf2");
    expect(game.state("home").isStunned).toBe(true);
    expect(game.state("foe").isStunned).toBe(false);
    // Ally attacks the stunned Homebody: 2 vs (stunned) 2 → Homebody dies, Ally unhurt, P1 conquers bf2.
    await game.p1.move("ally", "bf2");
    await game.settle();
    expect(game.zoneOf("home")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf2");
    expect(game.state("ally").damage).toBe(0);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("stun reminder text, engine semantics check (independent of the Level bug): a stunned defender deals no combat damage, still dies to lethal, and un-stuns at end of turn", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Dazed" }, "dazed", { stunned: true })
      .unit(P2, "base", { might: 1, name: "Also Dazed" }, "keep", { stunned: true })
      .unit(P1, "base", { might: 3, name: "Striker" }, "striker")
      .build();
    expect(game.state("dazed").isStunned).toBe(true);
    await game.p1.move("striker", "bf1");
    await game.settle();
    expect(game.zoneOf("dazed")).toBe("trash"); // 3 ≥ 3 (423.1.c)
    expect(game.locationOf("striker")).toBe("bf1");
    expect(game.state("striker").damage).toBe(0); // stunned unit contributed no might (423.1.b)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("keep").isStunned).toBe(true);
    await game.advanceTurn();
    expect(game.state("keep").isStunned).toBe(false); // 423.1.a.2
  });

  test("timing (155): not castable on the opponent's turn, nor while you hold Focus in a showdown", async () => {
    const opp = await board().active(P2).build();
    expect(opp.p1.can("cast", "ss")).toBe(false);
    const game = await board().unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await game.p1.move("scout", "bf2"); // empty uncontrolled battlefield → non-combat showdown, P1 has Focus
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "ss")).toBe(false);
  });

  test("chain interplay: P2 may respond before it resolves — Foe is still at bf1 while Skyward Strike sits on the chain, and only moves on resolution", async () => {
    const game = await board().build();
    await game.p1.cast("ss", { targets: "foe" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ss", controller: P1, triggered: false })]);
    expect(game.locationOf("foe")).toBe("bf1");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.locationOf("foe")).toBe("bf1");
    await game.p2.passPriority();
    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    expect(game.locationOf("foe")).toBe("base");
    expect(game.chain()).toHaveLength(0);
  });
});
