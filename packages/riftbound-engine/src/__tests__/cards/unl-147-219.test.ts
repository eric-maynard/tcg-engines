/**
 * Baron Nashor — unl-147-219 · Unit · Chaos · 10 energy + [chaos][chaos][chaos] · 12 Might
 *
 *   As you play me, add the Baron Pit battlefield token to the board if it's not there already. If you
 *   do, I enter there. (It has "Units can move here from anywhere.")
 *   I can't be chosen by enemy spells and abilities.
 *   Other friendly units have +2 [Might].
 *
 * Rules: 135.2.b.3 + 369.3 ("as you play me … I enter there" runs during the play; the last sentence is an
 * ENTRY replacement, not a play-location choice), 187.9 (Baron Pit = domainless token battlefield with
 * "Units can move here from anywhere"), 190.3.a.1 + 344.2 (a unit entering a battlefield it doesn't
 * control contests it; with nobody else there the next Cleanup opens a non-combat showdown → conquer,
 * 469.1), 446.2 (entering from hand is not a move), 144.4 (Standard Move is base↔battlefield only —
 * the Pit's text lifts that for moves TO the Pit, one way), 757 / 355.9.b (Untargetable by ENEMY spells
 * and abilities; friendly ones may still choose him; 355.10.d non-choosing effects still apply),
 * 364 / 108.2 ("Other friendly units": a continuous +2 to every other unit its CONTROLLER controls,
 * wherever they are, for as long as Baron is on the board).
 *
 * Head-judge checklist for THIS card:
 *  1. First Baron: the Pit appears, he is IN it (not in base, zero moves recorded), the empty Pit is
 *     contested and the Cleanup showdown hands P1 a conquer point on the spot.
 *  2. Pit already there: "if you do" fails — he lands where he was played (base), no second Pit, no point.
 *  3. "Move here from anywhere" is about the DESTINATION: a non-Ganking unit on bf1 may walk bf1 → Pit,
 *     but a unit in the Pit may still only walk home.
 *  4. Untargetable is enemy-only and choice-only: P2's Vengeance can't pick him, P1's can; P2's
 *     The Ruination ("Kill all units") chooses nothing and kills him anyway.
 *  5. The aura: +2 to other friendly units in base AND at battlefields, not to himself, not to enemies;
 *     it follows CONTROL (a stolen Baron pumps the thief's team) and switches off the moment he dies —
 *     which can make a damaged ally's wound lethal.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-147-219";
const BARON_PIT = "unl-t01";
const VENGEANCE = "ogn-229-298"; // Order spell 4 + [order][order]: Kill a unit.
const RUINATION = "unl-180-219"; // Order spell 9 + [order]×3: Kill all units.

const pitOf = (game: Game) => game.findAll({ defId: BARON_PIT, zone: "battlefieldRow" })[0];
const targetsFor = (game: Game, seat: "p1" | "p2", alias: string) =>
  (game[seat].option("cast", alias)?.fields.find((f) => f.arg === "targets")?.options ?? []).map((o) => (o as string[])[0]).sort();

/** P1's main phase with exactly Baron's cost, one ordinary battlefield each, a 2-Might Minion at home and a 3-Might Scout on bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Minion" }, "minion")
    .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout")
    .unit(P2, "bf2", { might: 3, name: "Foe" }, "foe")
    .hand(P1, CARD, "baron");
}

describe("Baron Nashor (unl-147-219)", () => {
  test("registry payload carries all three printed abilities — the Pit entry replacement, 'can't be chosen by enemy spells and abilities', and +2 Might to OTHER friendly units", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 10, might: 12, name: "Baron Nashor", powerCost: ["chaos", "chaos", "chaos"] });
    const abilities = (def?.abilities ?? []) as { type: string; effect?: Record<string, unknown> }[];
    expect(abilities).toContainEqual(
      expect.objectContaining({ effect: expect.objectContaining({ battlefield: expect.objectContaining({ defId: BARON_PIT, name: "Baron Pit" }), enterThere: true, type: "add-battlefield-token" }), type: "static" }),
    );
    expect(abilities).toContainEqual({
      effect: { amount: 2, target: { controller: "friendly", excludeSelf: true, type: "unit" }, type: "modify-might" },
      type: "static",
    });
    expect(abilities).toHaveLength(3);
    expect(JSON.stringify(abilities)).toMatch(/untargetable|cant-be-chosen|can't be chosen|cannot-be-chosen/i);
  });

  test("cost: exactly 10 energy + 3 chaos; 10 + 2 chaos, 9 + 3 chaos, or 3 fury instead of chaos cannot play him", async () => {
    const game = await board().build();
    expect(game.p1.can("play", "baron")).toBe(true);
    await game.p1.play("baron", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    for (const r of [{ energy: 10, power: { chaos: 2 } }, { energy: 9, power: { chaos: 3 } }, { energy: 10, power: { fury: 3 } }]) {
      expect((await scenario().resources(P1, r).hand(P1, CARD, "b").build()).p1.can("play", "b")).toBe(false);
    }
  });

  test("first Baron: the Baron Pit token battlefield is added, he ENTERS there exhausted (not base, not a move), the empty Pit is contested and the Cleanup showdown conquers it for P1 (+1 point)", async () => {
    const game = await board().build();
    expect(game.battlefields().sort()).toEqual(["bf1", "bf2"]);
    await game.p1.play("baron", { to: "base" });
    const pit = pitOf(game);
    expect(pit).toBeDefined();
    expect(game.battlefields()).toHaveLength(3);
    expect(game.state("baron")).toMatchObject({ baseMight: 12, isExhausted: true, might: 12, zone: `battlefield-${pit}` });
    expect(game.p1.units("base")).toEqual(["minion"]);
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0); // 446.2: entering is not moving
    expect(game.gameState.battlefields[pit as string]).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    await game.settle(); // hands back the Cleanup-begun showdown once
    await game.settle();
    expect(game.gameState.battlefields[pit as string]?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Pit already on the board: nothing is added ('if you do' fails), Baron simply enters the base exhausted, still exactly one Pit, no point", async () => {
    const game = await board().battlefield("pit", { controller: null, def: BARON_PIT, inert: false }).build();
    await game.p1.play("baron", { to: "base" });
    await game.settle();
    expect(game.state("baron")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.findAll({ defId: BARON_PIT, zone: "battlefieldRow" })).toEqual(["pit"]);
    expect(game.battlefields().sort()).toEqual(["bf1", "bf2", "pit"]);
    expect(game.cardsAt("pit")).toEqual([]);
    expect(game.p1.points()).toBe(0);
  });

  test("the Pit has 'Units can move here from anywhere' (187.9) — a ready non-Ganking Scout on bf1 is offered a Standard Move straight to the new Pit (but still not bf1 → bf2)", async () => {
    // Expected: after Baron resolves, P1's move menu includes → <pit> with scout as a legal unit, and no
    // → bf2 for scout. Actual: scout may only go to base; the token's text is not applied to movement.
    const game = await board().build();
    await game.p1.play("baron", { to: "base" });
    await game.settle();
    await game.settle();
    const pit = pitOf(game) as string;
    const unitsTo = (dest: string) => (game.p1.option(`standardMove:to:${dest}`)?.fields[0]?.options ?? []).flat();
    expect(unitsTo("bf2")).not.toContain("scout"); // 144.4: no battlefield → battlefield without Ganking
    expect(unitsTo(pit)).toContain("scout");
    await game.p1.move("scout", pit);
    expect(game.locationOf("scout")).toBe(pit);
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("one way only: a non-Ganking unit standing IN the Pit may walk home to base but not to another battlefield (144.4)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .battlefield("pit", { controller: P1, def: BARON_PIT, inert: false })
      .unit(P1, "pit", { might: 2, name: "Camper" }, "camper")
      .build();
    const moves = game.p1.legal().filter((o) => o.verb === "move" || o.verb === "gank").map((o) => o.key);
    expect(moves).toEqual(["standardMove:to:base"]);
  });

  test("'I can't be chosen by enemy spells and abilities' (757) — P2's Vengeance may pick Minion but Baron is not on its menu", async () => {
    // Expected: targets = [minion]. Actual: [baron, minion] — the untargetable clause is not implemented.
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { order: 2 } })
      .unit(P1, "base", CARD, "baron")
      .unit(P1, "base", { might: 2, name: "Minion" }, "minion")
      .hand(P2, VENGEANCE, "venge")
      .build();
    expect(targetsFor(game, "p2", "venge")).toEqual(["minion"]);
    const t = await game.p2.try((p) => p.cast("venge", { targets: "baron" }));
    expect(t.ok).toBe(false);
    expect(game.zoneOf("baron")).toBe("base");
  });

  test("enemy-only: P1's OWN Vengeance may choose Baron (and kill him)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { order: 2 } })
      .unit(P1, "base", CARD, "baron")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P1, VENGEANCE, "venge")
      .build();
    expect(targetsFor(game, "p1", "venge")).toEqual(["baron", "foe"]);
    await game.p1.cast("venge", { targets: "baron" });
    await game.settle();
    expect(game.zoneOf("baron")).toBe("trash");
  });

  test("choice-only (355.10.d): P2's The Ruination — 'Kill all units' chooses nothing — kills Baron along with everyone else", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 9, power: { order: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "baron")
      .unit(P1, "base", { might: 2, name: "Minion" }, "minion")
      .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
      .hand(P2, RUINATION, "ruin")
      .build();
    await game.p2.cast("ruin");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("baron")).toBe("trash");
    expect(game.zoneOf("minion")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
  });

  test("'Other friendly units have +2 Might': Minion in base 2→4 and Scout on bf1 3→5 the moment he lands; Baron himself stays 12; the enemy Foe stays 3; a unit played afterwards also gets it", async () => {
    const game = await board().resources(P1, { energy: 12, power: { chaos: 3 } }).hand(P1, { cardType: "unit", energyCost: 2, might: 1, name: "Latecomer" }, "late").build();
    expect(game.state("minion").might).toBe(2);
    await game.p1.play("baron", { to: "base" });
    await game.settle();
    await game.settle();
    expect(game.state("minion")).toMatchObject({ baseMight: 2, might: 4, staticMightBonus: 2 });
    expect(game.state("scout").might).toBe(5);
    expect(game.state("baron")).toMatchObject({ might: 12, staticMightBonus: 0 });
    expect(game.state("foe").might).toBe(3);
    await game.p1.play("late", { to: "base" });
    await game.settle();
    expect(game.state("late")).toMatchObject({ baseMight: 1, might: 3, zone: "base" });
  });

  test("the aura is real Might in combat: with Baron in base, the 3-Might Scout (now 5) attacks a 4-Might holder, kills it, survives and conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "baron")
      .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
      .unit(P2, "bf1", { might: 4, name: "Holder" }, "holder")
      .build();
    expect(game.state("scout").might).toBe(5);
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.state("scout")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("the aura ends when Baron leaves: P1's own Vengeance kills him → Minion drops back to 2, and an ally carrying 3 damage on a 2(+2)-Might body dies with him (3 ≥ 2)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { order: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "baron")
      .unit(P1, "base", { might: 2, name: "Minion" }, "minion")
      .unit(P1, "bf1", { might: 2, name: "Wounded" }, "wounded", { damage: 3 })
      .hand(P1, VENGEANCE, "venge")
      .build();
    expect(game.state("wounded")).toMatchObject({ damage: 3, might: 4, zone: "battlefield-bf1" });
    await game.p1.cast("venge", { targets: "baron" });
    await game.settle();
    expect(game.zoneOf("baron")).toBe("trash");
    expect(game.state("minion")).toMatchObject({ might: 2, staticMightBonus: 0 });
    expect(game.zoneOf("wounded")).toBe("trash");
  });

  test("'friendly' follows CONTROL (108.2): a Baron P1 owns but P2 controls pumps P2's unit (+2) and leaves P1's Minion at 2", async () => {
    const game = await scenario()
      .card("baron", { controller: P2, def: CARD, owner: P1, zone: "base" })
      .unit(P1, "base", { might: 2, name: "Minion" }, "minion")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .build();
    expect(game.state("baron")).toMatchObject({ controller: P2, owner: P1 });
    expect(game.state("foe").might).toBe(4);
    expect(game.state("minion").might).toBe(2);
  });
});
