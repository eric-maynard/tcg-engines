/**
 * Onslaught — ven-081-166 · Spell · Body · 4 energy · (no timing keyword)
 *
 *   Give a unit +6 [Might] this turn.
 *   [Flow] [4] (You may play this from your trash for its Flow cost. Then banish it.)
 *
 * Rules: 355.8 (one target, "a unit" = any unit on the board, friend or foe), 317.2.b/c (Ending
 * step: units HEAL before "this turn" effects expire — simultaneously for all such effects), 829
 * (Flow: alternate cost from the TRASH only, then a delayed replacement banishes the spell instead of
 * trashing it; Flow adds no timing permission, 829.1.b.2), 310.1.a (standard-speed spell: your turn,
 * Neutral Open state only).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Heal-before-expire (317.2.b→c): a 2-Might unit pumped to 8 that is carrying 5 spell damage at
 *     end of turn must SURVIVE the turn change (heal 3c, then +6 lapses 3d) — an engine that expires
 *     first would kill it.
 *  2. Stacking in one turn: hand cast (→ trash) then Flow the same copy (→ banishment) = +12 on one
 *     unit for 8 energy total; the banished copy is not a Flow candidate a third time (155: banishment
 *     is not the trash).
 *  3. Flow cost equals base cost here ([4] both ways) but is still trash-only: a trash copy with 3
 *     energy is dead; a HAND copy is never "flowed".
 *  4. Timing: no [Action]/[Reaction] → not in a showdown even while holding Focus, not on the
 *     opponent's turn, not onto an open chain — from hand OR trash.
 *  5. Real combat: exhausted units can be targeted; +6 on a 2 makes it an 8 that kills a 7-Might
 *     defender and conquers; the same fight without Onslaught is a clean loss. On an ENEMY unit it is
 *     a real +6 for them (e.g. their defender now wins).
 *  6. "this turn" expiry across advanceTurn(): might back to printed, mightModifier 0.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-081-166";
const BOLT5 = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt 5",
  rulesText: "[Action] Deal 5 to a unit.",
  timing: "action",
} as const;

function board(energy = 4) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Brawler" }, "ally")
    .unit(P2, "bf1", { might: 7, name: "Warden" }, "foe")
    .hand(P1, CARD, "ons");
}

describe("Onslaught (ven-081-166)", () => {
  test("registry payload: Body spell, 4 energy, no power, standard timing; abilities = [spell modify-might +6 (turn) on a unit, Flow keyword {energy 4}]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "body", energyCost: 4, name: "Onslaught" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.timing ?? "standard").toBe("standard");
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ effect: { amount: 6, duration: "turn", target: { type: "unit" }, type: "modify-might" }, type: "spell" });
    expect(def?.abilities?.[1]).toMatchObject({ cost: { energy: 4 }, keyword: "Flow", type: "keyword" });
    expect((def?.abilities?.[1] as { cost?: { power?: unknown[] } }).cost?.power ?? []).toEqual([]);
  });

  test("from hand: pays exactly 4 energy, one target asked, +6 Might this turn on the chosen unit only; spell goes to the TRASH", async () => {
    const game = await board().build();
    expect(game.p1.option("cast", "ons")?.fields.filter((f) => f.arg === "targets")).toHaveLength(1);
    await game.p1.cast("ons", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ons", controller: P1, triggered: false })]);
    expect(game.state("ally").might).toBe(2); // nothing before resolution
    await game.settle();
    expect(game.state("ally")).toMatchObject({ baseMight: 2, might: 8 });
    expect(game.state("foe").might).toBe(7);
    expect(game.zoneOf("ons")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
  });

  test("cost floor & no-target: 3 energy (with body power to spare) cannot cast; no unit anywhere → not playable (355.8)", async () => {
    const short = await scenario().resources(P1, { energy: 3, power: { body: 3 } }).unit(P1, "base", { might: 1 }, "u").hand(P1, CARD, "ons").build();
    expect(short.p1.can("cast", "ons")).toBe(false);
    const empty = await scenario().resources(P1, { energy: 9 }).hand(P1, CARD, "ons").build();
    expect(empty.p1.can("cast", "ons")).toBe(false);
    expect((await empty.p1.try((p) => p.cast("ons"))).ok).toBe(false);
    expect(empty.zoneOf("ons")).toBe("hand");
  });

  test("'a unit' = friend or foe, ready or exhausted: cast on the ENEMY defender makes it a 13 and it then kills my 8-Might attacker", async () => {
    const game = await board(8).hand(P1, CARD, "ons2").build();
    expect(game.p1.option("cast", "ons")?.fields.find((f) => f.arg === "targets")?.options).toEqual(expect.arrayContaining([["ally"], ["foe"]]));
    await game.p1.cast("ons", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(13);
    await game.p1.cast("ons2", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(8);
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("real combat: the pumped 2-Might unit attacks as 8, kills the 7-Might defender, survives (7 < 8) and conquers for a point", async () => {
    const game = await board().build();
    await game.p1.cast("ons", { targets: "ally" });
    await game.settle();
    await game.p1.move("ally", "bf1");
    expect(game.state("ally")).toMatchObject({ combatRole: "attacker", might: 8 });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.state("ally").damage).toBe(0); // healed at combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("negative space: the same 2-vs-7 attack WITHOUT Onslaught is a clean loss (attacker dies, defender untouched in control)", async () => {
    const game = await board().build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.state("foe")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.points()).toBe(0);
    expect(game.zoneOf("ons")).toBe("hand");
  });

  test("'this turn': after advanceTurn() the unit is back to 2 Might with no modifier; nothing else about it changed", async () => {
    const game = await board().build();
    await game.p1.cast("ons", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(8);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("ally")).toMatchObject({ baseMight: 2, might: 2, mightModifier: 0, zone: "base" });
  });

  test("317.2.b→c heal-before-expire: an 8 (2+6) carrying 5 spell damage survives the end of turn and wakes up a healthy 2", async () => {
    const game = await board().hand(P1, BOLT5, "bolt").build();
    await game.p1.cast("ons", { targets: "ally" });
    await game.settle();
    await game.p1.cast("bolt", { targets: "ally" });
    await game.settle();
    expect(game.state("ally")).toMatchObject({ damage: 5, might: 8, zone: "base" }); // 5 < 8: alive
    await game.advanceTurn();
    expect(game.zoneOf("ally")).toBe("base"); // healed first, THEN the +6 lapsed
    expect(game.state("ally")).toMatchObject({ damage: 0, might: 2 });
  });

  test("Flow [4] from the trash: offered only as a Flow play, costs exactly 4 energy, resolves (+6), then is BANISHED and no longer castable", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).unit(P1, "base", { might: 3 }, "ally").trash(P1, CARD, "ons").build();
    expect(game.p1.can("cast", "ons")).toBe(true);
    expect(game.p1.option("cast", "ons")?.fields.find((f) => f.arg === "flow")?.options).toEqual([true]);
    await game.p1.cast("ons", { flow: true, targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.zoneOf("ons")).toBe("chain");
    await game.settle();
    expect(game.state("ally").might).toBe(9);
    expect(game.zoneOf("ons")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("ons");
    expect(game.p1.can("cast", "ons")).toBe(false);
  });

  test("Flow is trash-only and still costs 4: a trash copy with 3 energy is dead; body power does not substitute for energy", async () => {
    const poor = await scenario().resources(P1, { energy: 3, power: { body: 4 } }).unit(P1, "base", { might: 3 }, "ally").trash(P1, CARD, "ons").build();
    expect(poor.p1.can("cast", "ons")).toBe(false);
    const r = await poor.p1.try((p) => p.cast("ons", { flow: true, targets: "ally" }));
    expect(r.ok).toBe(false);
    expect(poor.zoneOf("ons")).toBe("trash");
    expect(poor.p1.energy()).toBe(3);
  });

  test("stacking in one turn: hand cast (→ trash) then Flow the same copy (→ banishment) = +12 on one unit for 8 energy; a third go is impossible", async () => {
    const game = await board(9).build();
    await game.p1.cast("ons", { targets: "ally" });
    expect(game.p1.energy()).toBe(5);
    await game.settle();
    expect(game.zoneOf("ons")).toBe("trash");
    await game.p1.cast("ons", { flow: true, targets: "ally" });
    expect(game.p1.energy()).toBe(1);
    await game.settle();
    expect(game.state("ally").might).toBe(14);
    expect(game.zoneOf("ons")).toBe("banishment");
    expect(game.p1.can("cast", "ons")).toBe(false);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2); // both +6s were "this turn"
    expect(game.violations()).toEqual([]);
  });

  test("timing (310.1.a / 829.1.b.2): not on the opponent's turn and not during a showdown while holding Focus — from hand or via Flow", async () => {
    const opp = await scenario().active(P2).resources(P1, { energy: 8 }).unit(P1, "base", { might: 3 }, "u").hand(P1, CARD, "ons").trash(P1, CARD, "onsT").build();
    expect(opp.p1.can("cast", "ons")).toBe(false);
    expect(opp.p1.can("cast", "onsT")).toBe(false);
    expect((await opp.p1.try((p) => p.cast("onsT", { flow: true, targets: "u" }))).ok).toBe(false);

    const sd = await scenario()
      .resources(P1, { energy: 8 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 3 }, "scout")
      .unit(P1, "base", { might: 3 }, "other")
      .hand(P1, CARD, "ons")
      .trash(P1, CARD, "onsT")
      .autoProcedures(false)
      .build();
    await sd.p1.move("scout", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("cast", "ons")).toBe(false);
    expect(sd.p1.can("cast", "onsT")).toBe(false);
  });

  test("timing: not in response on an open chain (opponent's spell on their turn gives P1 priority, but Onslaught is standard speed)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 8 })
      .resources(P2, { energy: 4 })
      .unit(P2, "base", { might: 3 }, "theirs")
      .unit(P1, "base", { might: 3 }, "mine")
      .hand(P2, CARD, "oppOns")
      .hand(P1, CARD, "ons")
      .trash(P1, CARD, "onsT")
      .build();
    await game.p2.cast("oppOns", { targets: "theirs" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "ons")).toBe(false);
    expect(game.p1.can("cast", "onsT")).toBe(false);
    await game.settle();
    expect(game.state("theirs").might).toBe(9); // the opponent's copy works the same for them
    expect(game.zoneOf("oppOns")).toBe("trash");
  });
});
