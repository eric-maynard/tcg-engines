/**
 * Dame the Despoiler — ven-079-166 · Unit · Body · 5 energy · 5 Might
 *
 *   [Empower] [5][body] ([5][body]: Empower me. Use only if not Empowered.)
 *   [Empowered][>] When I attack or defend, choose a unit here. Increase my Might to its Might this
 *   turn, then give me +1 [Might] this turn.
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. 827.1.c.1 — Empower is an ACTIVATED ability "[5][body]: Empower this. Play only if not
 *     Empowered": it uses the chain, costs 5 energy AND a body power, and is simply not offered once
 *     she is Empowered (441.1.b) or when either half of the cost is missing.
 *  2. 828.1.c — the attack/defend trigger is a DEPENDENT ability: un-empowered Dame attacking or
 *     defending triggers nothing at all (near-miss), however big the unit across from her is.
 *  3. 477.3.b/.e.1.b — "Increase my Might to its Might" is a snapshotted one-way increase by the
 *     difference: vs an 8 she gains +3, then +1 → 9 and wins the combat she would otherwise lose.
 *  4. 477.3.c — choosing a unit with LESS Might than her (or herself — "a unit here" does not say
 *     "another") increases by 0, never lowers her; she still gets the +1 → 6.
 *  5. Works symmetrically on defense (opponent's turn, they hold Focus first) and everything is
 *     "this turn": back to 5 after game.advanceTurn().
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-079-166";

function attacking(empowered: boolean, defenderMight: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: defenderMight, name: "Wall" }, "wall")
    .unit(P1, "base", CARD, "dame", empowered ? { empowered: true } : undefined);
}

/** Drive the trigger: expect P1 to be asked for "a unit here", pick `who`, then let combat resolve. */
async function resolveTriggerPicking(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>, who: string) {
  await game.settle();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick(who);
  await game.settle();
}

describe("Dame the Despoiler (ven-079-166)", () => {
  test("costs 5 energy (no power): enters the base as an un-empowered 5-Might unit; 4 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "dame").build();
    await game.p1.play("dame");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("dame")).toBe("base");
    expect(game.state("dame")).toMatchObject({ baseMight: 5, isEmpowered: false, might: 5 });
    const poor = await scenario().resources(P1, { energy: 4, power: { body: 3 } }).hand(P1, CARD, "dame").build();
    expect(poor.p1.can("play", "dame")).toBe(false);
  });

  test("[Empower] [5][body]: pays 5 energy + 1 body power, goes on the chain, and she is Empowered on resolution (Might unchanged)", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { body: 1 } }).unit(P1, "base", CARD, "dame").build();
    expect(game.p1.can("activate", "dame")).toBe(true);
    await game.p1.activate("dame");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dame", controller: P1, triggered: false })]);
    expect(game.state("dame").isEmpowered).toBe(false); // not until it resolves
    await game.settle();
    expect(game.state("dame")).toMatchObject({ isEmpowered: true, might: 5 });
    expect(game.violations()).toEqual([]);
  });

  test("Empower cost negative space: 5 energy but no body power, 4 energy + body, or already Empowered → not activatable", async () => {
    const noPower = await scenario().resources(P1, { energy: 5, power: { chaos: 2 } }).unit(P1, "base", CARD, "dame").build();
    expect(noPower.p1.can("activate", "dame")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 4, power: { body: 2 } }).unit(P1, "base", CARD, "dame").build();
    expect(noEnergy.p1.can("activate", "dame")).toBe(false);
    const done = await scenario().resources(P1, { energy: 9, power: { body: 2 } }).unit(P1, "base", CARD, "dame", { empowered: true }).build();
    expect(done.p1.can("activate", "dame")).toBe(false);
    expect(done.p1.legal().some((o) => o.key.startsWith("activateAbility:dame"))).toBe(false);
  });

  test("near-miss: NOT Empowered → attacking an 8-Might unit triggers nothing; the 5-Might Dame just dies", async () => {
    const game = await attacking(false, 8).build();
    await game.p1.move("dame", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.decision()?.kind).toBe("action"); // never asked to choose a unit
    expect(game.zoneOf("dame")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("near-miss: NOT Empowered → defending triggers nothing either; a 6-Might attacker kills her and conquers", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "dame")
      .unit(P2, "base", { might: 6, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("dame")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  // BUG — expected: the Empowered attack trigger asks P1 for "a unit here" (dame | wall); picking the
  // 8-Might wall raises her 5 → 8 (+3 snapshotted, 477.3.b) then +1 → 9, so she kills the wall,
  // survives with 8 damage < 9 and conquers. Actual: the trigger's effect parsed as `raw` text — no
  // prompt, no Might change, and she dies 5-into-8.
  test("[Empowered] When I attack — choose the 8-Might defender: 5 → 8 → 9, she wins the combat and conquers", async () => {
    const game = await attacking(true, 8).build();
    await game.p1.move("dame", "bf1");
    await resolveTriggerPicking(game, "wall");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("dame")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("dame").might).toBe(9); // "this turn", not "this combat"
    await game.advanceTurn();
    expect(game.state("dame").might).toBe(5); // both increases expire with the turn
  });

  // BUG — expected (477.3.c): choosing the 2-Might unit cannot LOWER her — increase by 0, then +1 → 6;
  // she kills the 2 and holds 6 Might for the rest of the turn. Actual: raw effect, stays 5.
  test("choosing a smaller unit increases by 0 (never a decrease), then +1 → 6", async () => {
    const game = await attacking(true, 2).build();
    await game.p1.move("dame", "bf1");
    await resolveTriggerPicking(game, "wall");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("dame")).toBe("bf1");
    expect(game.state("dame").might).toBe(6);
  });

  // BUG — expected: "a unit here" includes Dame herself (no "another"): picking herself is +0 then +1
  // → 6, which is exactly lethal against a 6-Might wall that in turn deals 6 ≥ 6 to her: both die.
  // Actual: no prompt; 5 into 6 → only Dame dies.
  test("she may choose herself — +0 then +1 = 6 trades evenly with a 6-Might defender", async () => {
    const game = await attacking(true, 6).build();
    await game.p1.move("dame", "bf1");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["dame", "wall"]); // only units HERE — nothing from a base or another battlefield
    await game.p1.pick("dame");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("dame")).toBe("trash");
  });

  // BUG — expected: on the opponent's turn a 7-Might raider attacks Empowered Dame; her defend
  // trigger lets P1 pick the raider → 5 → 7 → 8; 8 kills the raider, 7 damage < 8 so she survives and
  // P1 keeps bf1. Actual: raw effect; 5-Might Dame dies and P2 conquers.
  test("[Empowered] When I defend — copy the 7-Might attacker then +1 → 8: attacker dies, Dame holds", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "dame", { empowered: true })
      .unit(P2, "base", { might: 7, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // Dame's CONTROLLER chooses, even on P2's turn
    await game.p1.pick("raider");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("dame")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("dame").might).toBe(8);
  });

  test("Empower → attack in the same turn: the freshly Empowered Dame's trigger goes on the chain when she attacks (dependent ability is live immediately, 828.1.c)", async () => {
    const game = await attacking(false, 3).resources(P1, { energy: 5, power: { body: 1 } }).build();
    await game.p1.activate("dame");
    await game.settle();
    expect(game.state("dame").isEmpowered).toBe(true);
    await game.p1.move("dame", "bf1");
    // The attack trigger is hers, triggered, controlled by P1.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dame", controller: P1, triggered: true })]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("wall");
      await game.settle();
    }
    expect(game.zoneOf("wall")).toBe("trash"); // 5 (or 6) beats 3 either way
    expect(game.locationOf("dame")).toBe("bf1");
    expect(game.state("dame").isEmpowered).toBe(true); // Empowered persists across the combat
  });

  test("moving the Empowered Dame to an EMPTY enemy battlefield is not an attack (no combat) — no trigger, plain conquer at 5 Might", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "dame", { empowered: true }).build();
    await game.p1.move("dame", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("dame").might).toBe(5);
  });

  test("parsed abilities: [Empower] = activated {5 energy + body → empower self, only if not Empowered}; the trigger is attack-or-defend gated on while-empowered", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 5, might: 5, name: "Dame the Despoiler" });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({
      cost: { energy: 5, power: ["body"] },
      effect: { target: "self", type: "empower" },
      restrictions: [{ type: "not-empowered" }],
      type: "activated",
    });
    expect(def?.abilities?.[1]).toMatchObject({
      condition: { type: "while-empowered" },
      trigger: { event: "attack-or-defend", on: "self" },
      type: "triggered",
    });
  });

  // BUG — expected: the trigger's effect is structured (an increase-might-to keyed off a chosen unit
  // "here", then a +1 modify-might, both duration "turn"). Actual: `{ type: "raw", text: "…" }`.
  test("the attack/defend effect is parsed into increase-might-to + modify-might (not raw text)", async () => {
    const eff = ((await loadDefaultCardPool()).get(CARD)?.abilities?.[1] as { effect?: { type?: string } } | undefined)?.effect;
    expect(eff?.type).not.toBe("raw");
    expect(JSON.stringify(eff)).toContain("increase-might-to");
    expect(JSON.stringify(eff)).toContain("modify-might");
  });
});
