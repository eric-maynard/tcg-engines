/**
 * Shock Blast — ven-059-166 · Spell · Mind · 3 energy + [mind]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   This costs [2] less if you control something that's [Empowered].
 *   Deal 4 to a unit at a battlefield.
 *
 * Head-judge checklist for this card:
 *  - [Action] timing: Neutral Open on your turn, or with Focus in a showdown on EITHER player's turn;
 *    never as a reaction on somebody else's chain, never in the opponent's Neutral Open.
 *  - "a unit at a battlefield": either side's, any battlefield — units in a base are never legal, and
 *    with no unit at any battlefield the spell is unplayable. Friendly fire is legal.
 *  - 4 damage: exactly-lethal on a 4-Might unit, one short on a 5-Might unit (marked damage stays for
 *    the turn and adds up with combat damage).
 *  - The discount: [2] off the ENERGY only (the [mind] pip stays), needs something YOU control that is
 *    Empowered — a unit or a gear ("something") — and an ENEMY Empowered permanent does not count.
 *    With the discount, 1 energy + [mind] must be enough.
 *  - Deflect stacks on top: blasting an enemy Nasus, Ascended (Deflect 2) costs 2 more power.
 *  - Classic use: in your attack showdown, blast a 4-Might lone defender dead → your small attacker
 *    conquers without taking a scratch.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-059-166";
const LEGION_MARAUDER = "ven-074-166"; // Body unit 2: [Empower] — [1] or [body]; Empowered: +1 Might
const RAGE_AMPLIFIER = "ven-018-166"; // Fury gear: [Empower] [6][fury] …
const NASUS = "ven-046a-166"; // Deflect 2

/** P1: 3 energy + 1 mind, Shock Blast in hand, a 2-Might unit at bf1; P2: 4-Might + 5-Might units at bf1, a 1-Might unit at home. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Four" }, "four")
    .unit(P2, "bf1", { might: 5, name: "Five" }, "five")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "bf1", { might: 2, name: "Mine" }, "mine")
    .hand(P1, CARD, "blast");
}

const targetsOf = (game: Game, seat: "p1" | "p2" = "p1") => game[seat].option("cast", "blast")?.fields.find((f) => f.arg === "targets")?.options;

describe("Shock Blast (ven-059-166)", () => {
  test("registry payload: an [Action] spell whose instruction is 'deal 4 to a unit at a battlefield'", async () => {
    const game = await scenario().hand(P1, CARD, "blast").build();
    expect(game.state("blast")).toMatchObject({ cardType: "spell", energyCost: 3, name: "Shock Blast", powerCost: ["mind"] });
    const def = peekDefaultCardPool()?.get(CARD) as unknown as { timing?: string; abilities: Record<string, unknown>[] };
    expect(def.timing).toBe("action");
    expect(def.abilities.find((a) => a.type === "spell")).toEqual({
      effect: { amount: 4, target: { location: "battlefield", type: "unit" }, type: "damage" },
      timing: "action",
      type: "spell",
    });
  });

  test("registry payload should also carry the self cost-reduction ('[2] less if you control something Empowered') — the parser dropped that line", async () => {
    // Expected: a static { effect: { type: "cost-reduction", target: "self", … 2 … }, condition: control-something-Empowered }.
    // Actual: abilities === [the spell instruction] only.
    await scenario().build();
    const abilities = (peekDefaultCardPool()?.get(CARD)?.abilities ?? []) as { type: string; effect?: { type?: string; target?: unknown } }[];
    const reduction = abilities.find((a) => a.type === "static" && a.effect?.type === "cost-reduction");
    expect(reduction).toBeDefined();
    expect(reduction?.effect?.target).toBe("self");
    expect(JSON.stringify(reduction)).toMatch(/empower/i);
  });

  test("full cost with nothing Empowered: 3 energy + 1 mind; 2 energy, or no mind, is not enough", async () => {
    const game = await board().build();
    await game.p1.cast("blast", { targets: "five" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("blast")).toBe("chain");
    expect((await board().resources(P1, { energy: 2, power: { mind: 1 } }).build()).p1.can("cast", "blast")).toBe(false);
    expect((await board().resources(P1, { energy: 3, power: { mind: 0 } }).build()).p1.can("cast", "blast")).toBe(false);
  });

  test("targets: only units AT A BATTLEFIELD (both sides, friendly fire allowed) — the base unit is not offered; no battlefield unit at all → unplayable", async () => {
    const game = await board().build();
    expect(targetsOf(game)).toHaveLength(3);
    expect(targetsOf(game)).toEqual(expect.arrayContaining([["four"], ["five"], ["mine"]]));
    expect((await game.p1.try((p) => p.cast("blast", { targets: "home" }))).ok).toBe(false);
    const none = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).battlefield("bf1").unit(P2, "base", { might: 1 }, "home").unit(P1, "base", { might: 1 }, "mine").hand(P1, CARD, "blast").build();
    expect(none.p1.can("cast", "blast")).toBe(false);
  });

  test("deal 4: exactly lethal on the 4-Might unit; the spell goes to the trash", async () => {
    const game = await board().build();
    await game.p1.cast("blast", { targets: "four" });
    await game.settle();
    expect(game.zoneOf("four")).toBe("trash");
    expect(game.zoneOf("five")).toBe("battlefield-bf1");
    expect(game.zoneOf("blast")).toBe("trash");
  });

  test("deal 4: one short on the 5-Might unit — it stays with 4 marked damage (healed at end of turn)", async () => {
    const game = await board().build();
    await game.p1.cast("blast", { targets: "five" });
    await game.settle();
    expect(game.state("five")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    await game.advanceTurn();
    expect(game.state("five").damage).toBe(0);
  });

  test("[Action] timing: not in the opponent's Neutral Open, not as a reaction on their chain — but yes with Focus in a showdown on their turn", async () => {
    const slow = { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 0, name: "Slow Draw", timing: "action" };
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, CARD, "blast")
      .hand(P2, slow, "slow")
      .build();
    expect(game.p1.can("cast", "blast")).toBe(false); // P2's neutral open
    await game.p2.cast("slow");
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "blast")).toBe(false); // reaction window only
    await game.p1.passPriority();
    await game.settle();
    await game.p2.move("raider", "bf1"); // combat showdown, attacker (P2) has Focus first
    expect(game.p1.can("cast", "blast")).toBe(false);
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "blast")).toBe(true);
    await game.p1.cast("blast", { targets: "raider" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 4 Might, exactly lethal → the attack fizzles
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
  });

  test("classic line on your own turn: attack with a 2-Might unit, blast the lone 4-Might defender dead in the showdown, conquer unscathed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .unit(P2, "bf1", { might: 4, name: "Four" }, "four")
      .hand(P1, CARD, "blast")
      .build();
    await game.p1.move("scout", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    await game.p1.cast("blast", { targets: "four" });
    await game.settle();
    expect(game.zoneOf("four")).toBe("trash");
    expect(game.state("scout")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("marked damage adds up with combat damage: blast the 5-Might defender (4), then a 2-Might attacker finishes it (but dies to its 5)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .unit(P2, "bf1", { might: 5, name: "Five" }, "five")
      .hand(P1, CARD, "blast")
      .build();
    await game.p1.move("scout", "bf1");
    await game.p1.cast("blast", { targets: "five" });
    await game.settle();
    expect(game.zoneOf("five")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // emptied: P2 loses control in cleanup (190.4.c), nobody conquers
    expect(game.p1.points()).toBe(0);
  });

  test("Deflect stacks on top: an enemy Nasus, Ascended (Deflect 2) at a battlefield needs 2 extra power of any domain — 3 + [mind] + 2", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", NASUS, "nasus").unit(P2, "bf1", { might: 1 }, "minion").hand(P1, CARD, "blast").build();
    expect(targetsOf(game)).toEqual([["minion"]]);
    await game.p1.do("addResources", { power: { fury: 1, order: 1 } });
    expect(targetsOf(game)).toEqual(expect.arrayContaining([["nasus"], ["minion"]]));
    await game.p1.cast("blast", { targets: "nasus" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0, order: 0 } });
    await game.settle();
    expect(game.state("nasus").damage).toBe(4);
  });

  test("costs [2] less while you control an Empowered UNIT — 3 energy + mind leaves 2 energy after casting", async () => {
    // Expected: 1 energy + [mind] paid. Actual: full 3 + [mind] (the reduction line was never parsed).
    const game = await board().unit(P1, "base", LEGION_MARAUDER, "marauder", { empowered: true }).build();
    expect(game.state("marauder").isEmpowered).toBe(true);
    await game.p1.cast("blast", { targets: "five" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 0 } });
  });

  test("'something' — an Empowered GEAR you control also earns the discount, so 1 energy + [mind] is enough to cast it", async () => {
    // Expected: castable and fully paid from 1 energy + 1 mind. Actual: not castable (needs 3).
    const game = await board().resources(P1, { energy: 1, power: { mind: 1 } }).gear(P1, RAGE_AMPLIFIER, "amp", { empowered: true }).build();
    expect(game.state("amp").isEmpowered).toBe(true);
    expect(game.p1.can("cast", "blast")).toBe(true);
    await game.p1.cast("blast", { targets: "four" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("four")).toBe("trash");
  });

  test("negative space: an ENEMY Empowered permanent is not 'something you control' — still the full 3 + [mind]; and the [mind] pip is never discounted", async () => {
    const game = await board().unit(P2, "base", LEGION_MARAUDER, "theirs", { empowered: true }).build();
    await game.p1.cast("blast", { targets: "five" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    const noMind = await board().resources(P1, { energy: 3, power: { mind: 0 } }).unit(P1, "base", LEGION_MARAUDER, "marauder", { empowered: true }).build();
    expect(noMind.p1.can("cast", "blast")).toBe(false);
  });
});
