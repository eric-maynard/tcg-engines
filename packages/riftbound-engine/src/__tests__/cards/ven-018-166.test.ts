/**
 * Rage Amplifier — ven-018-166 · Gear · Fury · 4 energy + [fury]
 *
 *   [Empower] [6][fury] ([6][fury]: Empower this. Use only if not Empowered.)
 *   Your units have +1 [Might]. If I'm [Empowered], they have +2 [Might] instead.
 *
 * Head-judge checklist for this card:
 *  - Empower (827) is an ACTIVATED ability: it uses the chain (377.3, opponents may respond), only on
 *    your turn in an Open/Neutral state (381), and "use only if not Empowered" makes a second
 *    activation illegal (441.1.b). Empowered is a binary, durationless status — it survives turn ends.
 *  - The static is continuous: +1 to EVERY unit you control (base and battlefields, tokens included),
 *    never to enemy units; "+2 instead" REPLACES the +1 (total +2, not +3).
 *  - It reads "If I'm Empowered" — how the Amplifier got there is irrelevant: Hextech Formula
 *    (ven-062-166, "[Exhaust]: Empower another gear") flips it to the +2 tier without paying [6][fury],
 *    and afterwards the Amplifier's own [Empower] is no longer usable.
 *  - The bonus lives and dies with the gear on the board: Brittle Steel (ven-003-166, "Kill a gear")
 *    removes it and every unit drops back immediately (and the trashed gear is no longer Empowered).
 *  - Costs: 4+[fury] to play (gear enters ready); 6+[fury] to Empower; short on either → illegal.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-018-166";
const HEXTECH_FORMULA = "ven-062-166"; // Gear: [Exhaust]: Empower another gear.
const BRITTLE_STEEL = "ven-003-166"; // Fury spell 2: Kill a gear.

/** P1: Amplifier on board (optionally Empowered), a 2-Might ally in base, a 3-Might ally at bf1; P2: a 2-Might unit. */
function board(ampMeta?: { empowered?: boolean }) {
  return scenario()
    .resources(P1, { energy: 6, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .gear(P1, CARD, "amp", ampMeta)
    .unit(P1, "base", { might: 2, name: "Base Ally" }, "ally")
    .unit(P1, "bf1", { might: 3, name: "Field Ally" }, "field")
    .unit(P2, "base", { might: 2, name: "Enemy" }, "foe");
}

describe("Rage Amplifier (ven-018-166)", () => {
  test("registry payload: the [Empower] [6][fury] activated ability is encoded exactly", async () => {
    const game = await scenario().hand(P1, CARD, "amp").build();
    expect(game.state("amp")).toMatchObject({ cardType: "gear", energyCost: 4, name: "Rage Amplifier", powerCost: ["fury"] });
    expect(peekDefaultCardPool()?.get(CARD)?.abilities?.[0]).toEqual({
      cost: { energy: 6, power: ["fury"] },
      effect: { target: "self", type: "empower" },
      restrictions: [{ type: "not-empowered" }],
      type: "activated",
    });
  });

  test("registry payload should also carry the static '+1 Might to your units / +2 instead while Empowered' (parser dropped the whole line)", async () => {
    // Expected: a second, static ability — modify-might over friendly units, amount 1, with an
    // Empowered tier of 2 "instead". Actual: abilities has only the Empower activation.
    await scenario().build();
    const abilities = (peekDefaultCardPool()?.get(CARD)?.abilities ?? []) as { type: string; effect?: Record<string, unknown> }[];
    expect(abilities).toHaveLength(2);
    expect(abilities[1]).toMatchObject({ effect: { target: { controller: "friendly", type: "unit" }, type: "modify-might" }, type: "static" });
    expect(JSON.stringify(abilities[1])).toMatch(/empowered/i);
  });

  test("cost to play: 4 energy + 1 fury; the gear enters the base ready; 3 energy or no fury → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "amp").build();
    await game.p1.play("amp");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("amp")).toBe("base");
    expect(game.state("amp")).toMatchObject({ isEmpowered: false, isReady: true });
    expect((await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "a").build()).p1.can("play", "a")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "a").build()).p1.can("play", "a")).toBe(false);
  });

  test("[Empower]: pays 6 energy + 1 fury, goes on the chain (P2 gets a response window), resolves → Empowered; then 'use only if not Empowered' removes the option", async () => {
    const game = await board().build();
    await game.p1.activate("amp");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "amp", controller: P1, triggered: false })]);
    expect(game.state("amp").isEmpowered).toBe(false); // not yet — it is on the chain
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // 377.3.b.2
    await game.settle();
    expect(game.state("amp")).toMatchObject({ isEmpowered: true, isReady: true }); // no exhaust in the cost
    await game.p1.do("addResources", { energy: 6, power: { fury: 1 } });
    expect(game.p1.can("activate", "amp")).toBe(false); // 441.1.b
  });

  test("[Empower] is unaffordable with 5 energy + fury, or 6 energy and no fury; and never on the opponent's turn (381)", async () => {
    expect((await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).gear(P1, CARD, "amp").build()).p1.can("activate", "amp")).toBe(false);
    expect((await scenario().resources(P1, { energy: 6 }).gear(P1, CARD, "amp").build()).p1.can("activate", "amp")).toBe(false);
    const opp = await scenario().active(P2).resources(P1, { energy: 6, power: { fury: 1 } }).gear(P1, CARD, "amp").build();
    expect(opp.p1.can("activate", "amp")).toBe(false);
    expect(opp.p2.can("activate", "amp")).toBe(false);
  });

  test("Empowered is durationless: it is still Empowered on the opponent's turn and on your next turn", async () => {
    const game = await board().build();
    await game.p1.activate("amp");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("amp").isEmpowered).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("amp").isEmpowered).toBe(true);
    expect(game.p1.can("activate", "amp")).toBe(false);
  });

  test("static — with the Amplifier on the board every unit you control (base AND battlefield) has +1 Might; the enemy unit does not", async () => {
    // Expected: ally 3, field 4, foe 2. Actual: no static exists → 2 / 3 / 2.
    const game = await board().build();
    expect(game.state("ally").might).toBe(3);
    expect(game.state("field").might).toBe(4);
    expect(game.state("foe").might).toBe(2);
  });

  test("static — while Empowered the bonus is +2 INSTEAD (not +3): ally 4, field 5, foe still 2", async () => {
    const game = await board({ empowered: true }).build();
    expect(game.state("amp").isEmpowered).toBe(true);
    expect(game.state("ally").might).toBe(4);
    expect(game.state("field").might).toBe(5);
    expect(game.state("foe").might).toBe(2);
  });

  test("the tier switches the moment [Empower] resolves: +1 before (3), still +1 while the ability is on the chain, +2 after (4)", async () => {
    const game = await board().build();
    expect(game.state("ally").might).toBe(3);
    await game.p1.activate("amp");
    expect(game.state("ally").might).toBe(3); // on the chain, not Empowered yet
    await game.settle();
    expect(game.state("ally").might).toBe(4);
  });

  test("a unit played AFTER the Amplifier also gets the bonus (continuous static, not a one-shot)", async () => {
    const game = await board({ empowered: true }).hand(P1, { energyCost: 0, might: 1, name: "Latecomer" }, "late").build();
    await game.p1.play("late", { to: "base" });
    await game.settle();
    expect(game.zoneOf("late")).toBe("base");
    expect(game.state("foe").might).toBe(2);
    expect(game.state("late").might).toBe(3);
  });

  test("Hextech Formula can Empower the Amplifier for free ([Exhaust]: Empower another gear) — afterwards the Amplifier's own [Empower] is no longer usable", async () => {
    const game = await board().gear(P1, HEXTECH_FORMULA, "formula").build();
    expect(game.p1.can("activate", "amp")).toBe(true);
    await game.p1.activate("formula");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("amp");
      await game.settle();
    }
    expect(game.state("formula").isExhausted).toBe(true);
    expect(game.state("amp").isEmpowered).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 6, power: { fury: 1 } }); // nothing paid
    expect(game.p1.can("activate", "amp")).toBe(false);
  });

  test("…and that free Empower is enough for the +2 tier ('If I'm Empowered' does not care how)", async () => {
    const game = await board().gear(P1, HEXTECH_FORMULA, "formula").build();
    await game.p1.activate("formula");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("amp");
      await game.settle();
    }
    expect(game.state("amp").isEmpowered).toBe(true);
    expect(game.state("ally").might).toBe(4);
    expect(game.state("field").might).toBe(5);
  });

  test("Brittle Steel (Kill a gear) on the opponent's turn trashes the Empowered Amplifier; in the trash it is no longer Empowered and units sit at printed Might", async () => {
    const game = await board({ empowered: true }).active(P2).resources(P2, { energy: 2, power: { fury: 1 } }).hand(P2, BRITTLE_STEEL, "steel").build();
    expect(game.p2.option("cast", "steel")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["amp"]]);
    await game.p2.cast("steel", { targets: "amp" });
    await game.settle();
    expect(game.zoneOf("amp")).toBe("trash");
    expect(game.state("amp").isEmpowered).toBe(false);
    expect(game.state("ally").might).toBe(2);
    expect(game.state("field").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("the bonus is present right up until Brittle Steel resolves (4 while the spell is on the chain, 2 after)", async () => {
    const game = await board({ empowered: true }).active(P2).resources(P2, { energy: 2, power: { fury: 1 } }).hand(P2, BRITTLE_STEEL, "steel").build();
    await game.p2.cast("steel", { targets: "amp" });
    expect(game.zoneOf("steel")).toBe("chain");
    expect(game.state("ally").might).toBe(4);
    await game.settle();
    expect(game.state("ally").might).toBe(2);
  });
});
